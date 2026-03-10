"""OpenClaw Gateway Connector — direct WebSocket connection to Gateway control plane.

Connects to OpenClaw Gateway at ws://localhost:18789 using JSON-RPC 2.0 protocol.
This is the primary channel for:
- Real-time agent event subscriptions (messages, status, tool calls)
- Agent-to-Agent communication events
- Active queries (agent state, session list, etc.)

Falls back gracefully to file-system monitoring (session_watcher) if Gateway
is unreachable.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Optional

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
    2. Forward Gateway events to our WebSocket hub (broadcast)
    3. Provide JSON-RPC 2.0 call interface for active queries
    4. Detect and broadcast Agent-to-Agent communication events
    """

    def __init__(self) -> None:
        self._ws: Any = None  # websockets.WebSocketClientProtocol
        self._connected = False
        self._task: Optional[asyncio.Task[None]] = None
        self._pending_requests: dict[int, asyncio.Future[Any]] = {}
        self._reconnect_delay = 2.0  # seconds, increases on repeated failures
        self._max_reconnect_delay = 30.0
        self._event_handlers: dict[str, list[Callable[..., Any]]] = {}

    @property
    def gateway_url(self) -> str:
        return getattr(settings, "openclaw_gateway_url", "ws://localhost:18789")

    @property
    def connected(self) -> bool:
        return self._connected

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
        """Persistent connection loop with exponential backoff reconnect."""
        while True:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
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
        """Establish connection and process incoming messages."""
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

        async with websockets.connect(
            self.gateway_url,
            ping_interval=20,
            ping_timeout=10,
            close_timeout=5,
        ) as ws:
            self._ws = ws
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


def _now() -> str:
    from datetime import datetime
    return datetime.utcnow().isoformat()


# Singleton instance
gateway_connector = GatewayConnector()
