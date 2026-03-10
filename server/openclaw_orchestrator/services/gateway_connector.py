"""OpenClaw Gateway Connector — direct WebSocket connection to Gateway control plane.

Connects to OpenClaw Gateway at ws://localhost:18789 using JSON-RPC 2.0 protocol.
This is the primary channel for:
- Real-time agent event subscriptions (messages, status, tool calls)
- Agent-to-Agent communication events
- Active queries (agent state, session list, etc.)

Authentication:
- Gateway requires ``connect.params.auth.token`` during WebSocket handshake.
- Local connections (127.0.0.1) are auto-approved by Gateway without a token.
- For remote connections, token is read from config or ``~/.openclaw/openclaw.json``.
- New devices may require one-time pairing: ``openclaw devices approve <requestId>``.

Falls back gracefully to file-system monitoring (session_watcher) if Gateway
is unreachable or authentication fails.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.websocket.ws_handler import broadcast

logger = logging.getLogger(__name__)

# JSON-RPC 2.0 request ID counter
_rpc_id_counter = 0


def _next_rpc_id() -> int:
    global _rpc_id_counter
    _rpc_id_counter += 1
    return _rpc_id_counter


class GatewayConnector:
    """Direct WebSocket connection to OpenClaw Gateway (ws://localhost:18789).

    Responsibilities:
    1. Maintain persistent WebSocket connection with auto-reconnect
    2. Authenticate via ``connect.params.auth.token`` (auto-read from config/openclaw.json)
    3. Forward Gateway events to our WebSocket hub (broadcast)
    4. Provide JSON-RPC 2.0 call interface for active queries
    5. Detect and broadcast Agent-to-Agent communication events
    """

    def __init__(self) -> None:
        self._ws: Any = None  # websockets.WebSocketClientProtocol
        self._connected = False
        self._task: Optional[asyncio.Task[None]] = None
        self._pending_requests: dict[int, asyncio.Future[Any]] = {}
        self._reconnect_delay = 2.0  # seconds, increases on repeated failures
        self._max_reconnect_delay = 30.0
        self._event_handlers: dict[str, list[Callable[..., Any]]] = {}
        self._auth_token: Optional[str] = None  # Cached auth token

    @property
    def gateway_url(self) -> str:
        return getattr(settings, "openclaw_gateway_url", "ws://localhost:18789")

    @property
    def connected(self) -> bool:
        return self._connected

    def _is_local_connection(self) -> bool:
        """Check if the Gateway URL points to localhost (auto-approved, no auth needed)."""
        try:
            parsed = urlparse(self.gateway_url)
            host = parsed.hostname or ""
            return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0")
        except Exception:
            return False

    def _resolve_auth_token(self) -> Optional[str]:
        """Resolve the Gateway authentication token.

        Priority:
        1. Config setting ``openclaw_gateway_token`` (from env var or settings)
        2. Auto-read from ``~/.openclaw/openclaw.json`` → ``gateway.auth.token``
        3. None (local connections are auto-approved by Gateway)

        Returns:
            The auth token string, or None if not available.
        """
        # Use cached token if available
        if self._auth_token:
            return self._auth_token

        # ① Config / environment variable
        config_token = getattr(settings, "openclaw_gateway_token", "")
        if config_token:
            self._auth_token = config_token
            logger.info("🔑 Using Gateway auth token from config/env")
            return self._auth_token

        # ② Auto-read from openclaw.json
        openclaw_json_path = Path(settings.openclaw_home) / "openclaw.json"
        if openclaw_json_path.exists():
            try:
                with open(openclaw_json_path, "r", encoding="utf-8") as f:
                    config = json.load(f)

                # Try multiple possible paths where token might be stored
                token = None

                # Path A: gateway.auth.token
                gateway_config = config.get("gateway", {})
                if isinstance(gateway_config, dict):
                    auth = gateway_config.get("auth", {})
                    if isinstance(auth, dict):
                        token = auth.get("token")

                # Path B: connect.params.auth.token
                if not token:
                    connect = config.get("connect", {})
                    if isinstance(connect, dict):
                        params = connect.get("params", {})
                        if isinstance(params, dict):
                            auth = params.get("auth", {})
                            if isinstance(auth, dict):
                                token = auth.get("token")

                # Path C: auth.token (top-level)
                if not token:
                    auth = config.get("auth", {})
                    if isinstance(auth, dict):
                        token = auth.get("token")

                if token and isinstance(token, str) and token.strip():
                    self._auth_token = token.strip()
                    logger.info("🔑 Using Gateway auth token from openclaw.json")
                    return self._auth_token

            except (json.JSONDecodeError, OSError) as e:
                logger.debug("Could not read openclaw.json for auth token: %s", e)

        # ③ No token found
        if self._is_local_connection():
            logger.info("🔑 No auth token found — local connection should be auto-approved")
        else:
            logger.warning(
                "⚠️ No Gateway auth token found for remote connection %s. "
                "Set OPENCLAW_GATEWAY_TOKEN env var, or ensure token is in "
                "~/.openclaw/openclaw.json. Connection may fail with 1008.",
                self.gateway_url,
            )
        return None

    # ════════════════════════════════════════════════════════════
    # Lifecycle
    # ════════════════════════════════════════════════════════════

    async def start(self) -> None:
        """Start the Gateway connection in background."""
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._connection_loop())
        logger.info("🔌 Gateway connector started (target: %s)", self.gateway_url)

    async def stop(self) -> None:
        """Stop the Gateway connection."""
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._ws:
            await self._ws.close()
            self._ws = None
        self._connected = False
        logger.info("🔌 Gateway connector stopped")

    # ════════════════════════════════════════════════════════════
    # Connection loop with auto-reconnect
    # ════════════════════════════════════════════════════════════

    async def _connection_loop(self) -> None:
        """Persistent connection loop with exponential backoff reconnect.

        Auth failures use a longer delay (60s) to avoid hammering Gateway
        with unauthenticated connections.
        """
        while True:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
            except GatewayAuthError as e:
                self._connected = False
                logger.error(
                    "🔒 Gateway authentication error: %s — retrying in 60s. "
                    "Fix: set OPENCLAW_GATEWAY_TOKEN env var or add token to "
                    "~/.openclaw/openclaw.json",
                    e,
                )
                broadcast({
                    "type": "gateway_status",
                    "payload": {
                        "connected": False,
                        "error": f"Auth failed: {e}",
                        "authRequired": True,
                    },
                    "timestamp": _now(),
                })
                # Longer delay for auth errors — token won't magically appear
                await asyncio.sleep(60.0)
            except Exception as e:
                self._connected = False
                logger.warning(
                    "🔌 Gateway connection lost: %s — reconnecting in %.0fs",
                    e,
                    self._reconnect_delay,
                )
                broadcast({
                    "type": "gateway_status",
                    "payload": {"connected": False, "error": str(e)},
                    "timestamp": _now(),
                })
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(
                    self._reconnect_delay * 1.5, self._max_reconnect_delay
                )

    async def _connect_and_listen(self) -> None:
        """Establish authenticated connection and process incoming messages.

        Authentication flow:
        1. Resolve auth token (config → openclaw.json → None for local)
        2. Connect with token in ``additional_headers`` (Bearer scheme)
        3. Send ``connect`` JSON-RPC handshake with ``auth.token`` in params
        4. Gateway responds with connect result or 1008 policy violation
        """
        try:
            import websockets
        except ImportError:
            logger.warning(
                "🔌 websockets package not installed — Gateway connector disabled. "
                "Install with: pip install websockets"
            )
            # Sleep forever to avoid tight reconnect loop
            await asyncio.sleep(999999)
            return

        # Resolve auth token
        auth_token = self._resolve_auth_token()

        # Build connection kwargs
        connect_kwargs: dict[str, Any] = {
            "ping_interval": 20,
            "ping_timeout": 10,
            "close_timeout": 5,
        }

        # Pass token as Bearer header (websockets library accepts additional_headers)
        if auth_token:
            connect_kwargs["additional_headers"] = {
                "Authorization": f"Bearer {auth_token}",
            }

        async with websockets.connect(
            self.gateway_url,
            **connect_kwargs,
        ) as ws:
            self._ws = ws

            # Send JSON-RPC connect handshake with auth params
            # This is the protocol-level authentication that OpenClaw Gateway expects
            connect_request: dict[str, Any] = {
                "jsonrpc": "2.0",
                "id": _next_rpc_id(),
                "method": "connect",
                "params": {
                    "client": "openclaw-orchestrator",
                    "version": "1.0.0",
                },
            }
            if auth_token:
                connect_request["params"]["auth"] = {
                    "token": auth_token,
                }

            await ws.send(json.dumps(connect_request))

            # Wait for connect response (with short timeout)
            try:
                raw_response = await asyncio.wait_for(ws.recv(), timeout=10.0)
                response = json.loads(raw_response)

                if "error" in response:
                    error_msg = response["error"].get("message", "Unknown error")
                    error_code = response["error"].get("code", 0)
                    if error_code == 1008 or "policy" in error_msg.lower():
                        logger.error(
                            "🔒 Gateway authentication failed (1008 policy violation). "
                            "Set OPENCLAW_GATEWAY_TOKEN env var or configure token in "
                            "~/.openclaw/openclaw.json. Error: %s",
                            error_msg,
                        )
                        raise GatewayAuthError(
                            f"Gateway auth failed: {error_msg}. "
                            "Set OPENCLAW_GATEWAY_TOKEN or ensure token in openclaw.json."
                        )
                    else:
                        logger.warning("Gateway connect returned error: %s", error_msg)
                        # Non-auth error — still try to proceed (some Gateways don't require connect)
                elif "result" in response:
                    logger.info("✅ Gateway connect handshake accepted")
                else:
                    # Response without result or error — treat as event, re-process below
                    logger.debug("Gateway connect response (unusual format): %s", response)

            except asyncio.TimeoutError:
                # Some Gateway versions don't respond to connect — proceed anyway
                logger.debug("Gateway did not respond to connect handshake (proceeding)")
            except json.JSONDecodeError:
                logger.debug("Gateway sent non-JSON connect response (proceeding)")

            self._connected = True
            self._reconnect_delay = 2.0  # reset backoff on successful connect

            logger.info("✅ Connected to OpenClaw Gateway at %s", self.gateway_url)
            broadcast({
                "type": "gateway_status",
                "payload": {"connected": True},
                "timestamp": _now(),
            })

            # Subscribe to Gateway event streams
            await self._subscribe_events()

            # Listen for incoming messages
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    await self._handle_gateway_message(msg)
                except json.JSONDecodeError:
                    logger.debug("Gateway sent non-JSON: %s", raw[:100])
                except Exception as e:
                    logger.error("Error handling Gateway message: %s", e)

    async def _subscribe_events(self) -> None:
        """Subscribe to relevant Gateway event streams after connecting."""
        # Subscribe to all agent events
        try:
            await self.call_rpc("event.subscribe", {
                "events": [
                    "agent.message",        # Agent 消息（发送/接收）
                    "agent.status",         # Agent 状态变化
                    "agent.communicate",    # Agent-to-Agent 通信
                    "agent.toolCall",       # Agent 工具调用
                    "agent.error",          # Agent 错误
                    "session.created",      # 会话创建
                    "session.message",      # 会话消息
                ],
            }, timeout=5.0)
            logger.info("📡 Subscribed to Gateway event streams")
        except Exception as e:
            # Subscription may not be supported in all Gateway versions
            # Fall back to receiving whatever events Gateway pushes by default
            logger.debug("Gateway event subscription failed (may be unsupported): %s", e)

    # ════════════════════════════════════════════════════════════
    # Message handling
    # ════════════════════════════════════════════════════════════

    async def _handle_gateway_message(self, msg: dict[str, Any]) -> None:
        """Route incoming Gateway JSON-RPC messages.

        Messages fall into two categories:
        1. RPC Responses: have "id" field, resolve pending Future
        2. Event Notifications: have "method" but no "id", forwarded to broadcast
        """
        # RPC response (has id)
        if "id" in msg and msg["id"] in self._pending_requests:
            future = self._pending_requests.pop(msg["id"])
            if "error" in msg:
                future.set_exception(
                    GatewayRPCError(msg["error"].get("message", "Unknown error"))
                )
            else:
                future.set_result(msg.get("result"))
            return

        # Event notification (has method, no id)
        method = msg.get("method", "")
        params = msg.get("params", {})

        if method.startswith("event.") or method.startswith("agent.") or method.startswith("session."):
            self._dispatch_event(method, params)

    def _dispatch_event(self, method: str, params: dict[str, Any]) -> None:
        """Translate Gateway events into our WebSocket event types and broadcast."""
        timestamp = params.get("timestamp", _now())

        # ── Agent message events → new_message ──
        if method in ("agent.message", "session.message", "event.message"):
            msg_id = params.get("id", f"gw-{_next_rpc_id()}")
            broadcast({
                "type": "new_message",
                "payload": {
                    "id": msg_id,
                    "sessionId": params.get("sessionId", ""),
                    "agentId": params.get("agentId", ""),
                    "role": params.get("role", "assistant"),
                    "content": params.get("content", ""),
                    "timestamp": timestamp,
                    "metadata": params.get("metadata"),
                    "source": "gateway",  # Mark as from Gateway (for dedup)
                },
                "timestamp": timestamp,
            })
            # Bridge: mark this ID in session_watcher so file-based monitoring
            # won't broadcast the same message again (dual-source dedup)
            try:
                from openclaw_orchestrator.services.session_watcher import session_watcher
                session_watcher.mark_seen_from_gateway(msg_id)
            except Exception:
                pass  # Best-effort, don't let dedup failure break event flow

        # ── Agent status events → agent_status ──
        elif method in ("agent.status", "event.status"):
            broadcast({
                "type": "agent_status",
                "payload": {
                    "agentId": params.get("agentId", ""),
                    "status": params.get("status", "idle"),
                    "timestamp": timestamp,
                    "currentTask": params.get("currentTask"),
                },
                "timestamp": timestamp,
            })

        # ── Agent-to-Agent communication → communication ──
        elif method in ("agent.communicate", "event.communicate"):
            comm_id = params.get("id", f"comm-gw-{_next_rpc_id()}")
            broadcast({
                "type": "communication",
                "payload": {
                    "id": comm_id,
                    "fromAgentId": params.get("fromAgentId", params.get("sourceAgent", "")),
                    "toAgentId": params.get("toAgentId", params.get("targetAgent", "")),
                    "type": "message",
                    "eventType": params.get("eventType", "message"),
                    "content": (params.get("content", "") or "")[:200],
                    "message": (params.get("content", "") or "")[:200],
                    "timestamp": timestamp,
                },
                "timestamp": timestamp,
            })
            # Bridge dedup for communication source message
            try:
                from openclaw_orchestrator.services.session_watcher import session_watcher
                session_watcher.mark_seen_from_gateway(comm_id)
            except Exception:
                pass

        # ── Tool call events → tool_call (new event type) ──
        elif method in ("agent.toolCall", "event.toolCall"):
            broadcast({
                "type": "tool_call",
                "payload": {
                    "agentId": params.get("agentId", ""),
                    "tool": params.get("tool", ""),
                    "args": params.get("args", {}),
                    "status": params.get("status", "started"),  # started/completed/error
                    "result": params.get("result"),
                    "timestamp": timestamp,
                },
                "timestamp": timestamp,
            })

        # ── Agent error events → agent_status (error) ──
        elif method in ("agent.error", "event.error"):
            broadcast({
                "type": "agent_status",
                "payload": {
                    "agentId": params.get("agentId", ""),
                    "status": "error",
                    "error": params.get("error", "Unknown error"),
                    "timestamp": timestamp,
                },
                "timestamp": timestamp,
            })

        # Call registered handlers
        handlers = self._event_handlers.get(method, [])
        for handler in handlers:
            try:
                handler(method, params)
            except Exception as e:
                logger.error("Event handler error for %s: %s", method, e)

    # ════════════════════════════════════════════════════════════
    # JSON-RPC 2.0 call interface
    # ════════════════════════════════════════════════════════════

    async def call_rpc(
        self,
        method: str,
        params: Optional[dict[str, Any]] = None,
        timeout: float = 10.0,
    ) -> Any:
        """Send a JSON-RPC 2.0 request and wait for response.

        Args:
            method: RPC method name (e.g., "agent.getState", "session.list")
            params: Method parameters
            timeout: Max wait time in seconds

        Returns:
            The "result" field from the RPC response

        Raises:
            GatewayNotConnectedError: If not connected to Gateway
            GatewayRPCError: If Gateway returns an error
            asyncio.TimeoutError: If response doesn't arrive within timeout
        """
        if not self._connected or not self._ws:
            raise GatewayNotConnectedError("Not connected to OpenClaw Gateway")

        rpc_id = _next_rpc_id()
        request = {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "method": method,
        }
        if params:
            request["params"] = params

        # Create a future for the response
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending_requests[rpc_id] = future

        try:
            await self._ws.send(json.dumps(request))
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(rpc_id, None)
            raise
        except Exception:
            self._pending_requests.pop(rpc_id, None)
            raise

    # ════════════════════════════════════════════════════════════
    # Convenience query methods
    # ════════════════════════════════════════════════════════════

    async def get_agent_state(self, agent_id: str) -> dict[str, Any]:
        """Query the current state of an agent via Gateway.

        Returns agent's current status, active session, model info, etc.
        Falls back to empty dict if Gateway is not connected.
        """
        if not self._connected:
            return {}
        try:
            result = await self.call_rpc("agent.getState", {"agentId": agent_id}, timeout=5.0)
            return result or {}
        except Exception as e:
            logger.debug("Failed to query agent state for %s: %s", agent_id, e)
            return {}

    async def list_active_sessions(self, agent_id: str) -> list[dict[str, Any]]:
        """Query active sessions for an agent via Gateway."""
        if not self._connected:
            return []
        try:
            result = await self.call_rpc("session.list", {"agentId": agent_id}, timeout=5.0)
            return result if isinstance(result, list) else []
        except Exception:
            return []

    async def get_session_info(self, session_id: str) -> dict[str, Any]:
        """Query session metadata via Gateway."""
        if not self._connected:
            return {}
        try:
            result = await self.call_rpc("session.getInfo", {"sessionId": session_id}, timeout=5.0)
            return result or {}
        except Exception:
            return {}

    async def interrupt_agent(self, agent_id: str) -> bool:
        """Request agent to interrupt current execution."""
        if not self._connected:
            return False
        try:
            await self.call_rpc("agent.interrupt", {"agentId": agent_id}, timeout=5.0)
            return True
        except Exception as e:
            logger.warning("Failed to interrupt agent %s: %s", agent_id, e)
            return False

    async def spawn_session(
        self,
        agent_id: str,
        session_id: str,
        message: str,
        model: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Spawn a new session and send the first message to an agent.

        This is the correct way to invoke an agent via Gateway.
        Gateway does NOT support 'agent.invoke' — it is a communication bus,
        not an execution engine. Use sessions.spawn instead.

        Args:
            agent_id: Target agent ID.
            session_id: Session identifier to create.
            message: First message content.
            model: Optional model override.
            metadata: Optional metadata dict.

        Returns:
            Gateway RPC result dict.

        Raises:
            GatewayNotConnectedError: If not connected.
            GatewayRPCError: If Gateway returns error.
        """
        params: dict[str, Any] = {
            "agentId": agent_id,
            "sessionId": session_id,
            "message": message,
        }
        if model:
            params["model"] = model
        if metadata:
            params["metadata"] = metadata

        result = await self.call_rpc("sessions.spawn", params, timeout=10.0)
        return result or {}

    async def send_to_session(
        self,
        agent_id: str,
        session_id: str,
        message: str,
        model: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Send a message to an existing agent session.

        Use sessions.send (not agent.sendMessage) — this is the correct
        Gateway RPC method for sending messages.

        Args:
            agent_id: Target agent ID.
            session_id: Existing session identifier.
            message: Message content.
            model: Optional model override.
            metadata: Optional metadata dict.

        Returns:
            Gateway RPC result dict.
        """
        params: dict[str, Any] = {
            "agentId": agent_id,
            "sessionId": session_id,
            "message": message,
        }
        if model:
            params["model"] = model
        if metadata:
            params["metadata"] = metadata

        result = await self.call_rpc("sessions.send", params, timeout=5.0)
        return result or {}

    # ════════════════════════════════════════════════════════════
    # Event handler registration
    # ════════════════════════════════════════════════════════════

    def on_event(self, event_type: str, handler: Callable[..., Any]) -> Callable[[], None]:
        """Register a handler for a specific Gateway event type.

        Returns an unsubscribe function.
        """
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)

        def unsubscribe() -> None:
            self._event_handlers.get(event_type, []).remove(handler)

        return unsubscribe


class GatewayNotConnectedError(Exception):
    """Raised when trying to call Gateway RPC while not connected."""
    pass


class GatewayRPCError(Exception):
    """Raised when Gateway returns a JSON-RPC error response."""
    pass


class GatewayAuthError(Exception):
    """Raised when Gateway rejects connection due to authentication failure (1008)."""
    pass


def _now() -> str:
    from datetime import datetime
    return datetime.utcnow().isoformat()


# Singleton instance
gateway_connector = GatewayConnector()
