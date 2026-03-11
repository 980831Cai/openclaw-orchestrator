"""OpenClaw Gateway Connector — direct WebSocket connection to Gateway control plane.

OpenClaw Gateway uses a custom frame protocol rather than JSON-RPC:

- request: ``{"type":"req","id":"...","method":"...","params":...}``
- response: ``{"type":"res","id":"...","ok":true|false,...}``
- event: ``{"type":"event","event":"...","payload":...}``

The first request must be ``connect`` with a valid ``ConnectParams`` payload.
This module keeps a persistent connection for low-latency RPC calls and forwards
Gateway status/events to the orchestrator WebSocket hub.
"""

from __future__ import annotations

import asyncio
import json
import logging
import platform
import uuid
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.websocket.ws_handler import broadcast

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = 3
GATEWAY_CLIENT_ID = "gateway-client"
GATEWAY_CLIENT_MODE = "backend"
DEFAULT_OPERATOR_ROLE = "operator"
DEFAULT_OPERATOR_SCOPES = [
    "operator.admin",
    "operator.approvals",
    "operator.pairing",
]


class GatewayConnector:
    """Direct WebSocket connection to OpenClaw Gateway."""

    def __init__(self) -> None:
        self._ws: Any = None
        self._connected = False
        self._task: Optional[asyncio.Task[None]] = None
        self._pending_requests: dict[str, asyncio.Future[Any]] = {}
        self._reconnect_delay = 2.0
        self._max_reconnect_delay = 30.0
        self._event_handlers: dict[str, list[Callable[..., Any]]] = {}
        self._auth_token: Optional[str] = None
        self._instance_id = str(uuid.uuid4())
        self._hello_payload: dict[str, Any] | None = None

    @property
    def gateway_url(self) -> str:
        return getattr(settings, "gateway_url", None) or getattr(
            settings, "openclaw_gateway_url", "ws://localhost:18789"
        )

    @property
    def connected(self) -> bool:
        return self._connected and self._ws is not None

    def _next_request_id(self) -> str:
        return str(uuid.uuid4())

    def _is_local_connection(self) -> bool:
        try:
            parsed = urlparse(self.gateway_url)
            host = parsed.hostname or ""
            return host in ("localhost", "127.0.0.1", "::1", "0.0.0.0")
        except Exception:
            return False

    def _resolve_auth_token(self) -> Optional[str]:
        if self._auth_token:
            return self._auth_token

        config_token = getattr(settings, "gateway_token", None) or getattr(
            settings, "openclaw_gateway_token", ""
        )
        if isinstance(config_token, str) and config_token.strip():
            self._auth_token = config_token.strip()
            logger.info("Using Gateway auth token from config/env")
            return self._auth_token

        openclaw_json_path = Path(settings.openclaw_home) / "openclaw.json"
        if openclaw_json_path.exists():
            try:
                config = json.loads(openclaw_json_path.read_text(encoding="utf-8"))
                token = None

                gateway_config = config.get("gateway", {})
                if isinstance(gateway_config, dict):
                    auth = gateway_config.get("auth", {})
                    if isinstance(auth, dict):
                        token = auth.get("token")

                if not token:
                    connect = config.get("connect", {})
                    if isinstance(connect, dict):
                        params = connect.get("params", {})
                        if isinstance(params, dict):
                            auth = params.get("auth", {})
                            if isinstance(auth, dict):
                                token = auth.get("token")

                if not token:
                    auth = config.get("auth", {})
                    if isinstance(auth, dict):
                        token = auth.get("token")

                if isinstance(token, str) and token.strip():
                    self._auth_token = token.strip()
                    logger.info("Using Gateway auth token from openclaw.json")
                    return self._auth_token
            except (json.JSONDecodeError, OSError) as exc:
                logger.debug("Could not read openclaw.json for auth token: %s", exc)

        if self._is_local_connection():
            logger.info("No Gateway auth token found; local connection may rely on loopback policy")
        else:
            logger.warning(
                "No Gateway auth token found for remote connection %s",
                self.gateway_url,
            )
        return None

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._connection_loop())
        logger.info("Gateway connector started (target: %s)", self.gateway_url)

    async def stop(self) -> None:
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
        self._hello_payload = None
        self._reject_all_pending(GatewayNotConnectedError("Gateway connector stopped"))
        logger.info("Gateway connector stopped")

    async def _connection_loop(self) -> None:
        while True:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
            except GatewayAuthError as exc:
                self._connected = False
                self._hello_payload = None
                logger.error(
                    "Gateway authentication error: %s; retrying in 60s",
                    exc,
                )
                broadcast(
                    {
                        "type": "gateway_status",
                        "payload": {
                            "connected": False,
                            "error": f"Auth failed: {exc}",
                            "authRequired": True,
                        },
                        "timestamp": _now(),
                    }
                )
                await asyncio.sleep(60.0)
            except Exception as exc:
                self._connected = False
                self._hello_payload = None
                logger.warning(
                    "Gateway connection lost: %s; reconnecting in %.0fs",
                    exc,
                    self._reconnect_delay,
                )
                broadcast(
                    {
                        "type": "gateway_status",
                        "payload": {"connected": False, "error": str(exc)},
                        "timestamp": _now(),
                    }
                )
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(
                    self._reconnect_delay * 1.5, self._max_reconnect_delay
                )

    async def _connect_and_listen(self) -> None:
        try:
            import websockets
        except ImportError:
            logger.warning(
                "websockets package not installed; Gateway connector disabled"
            )
            await asyncio.sleep(999999)
            return

        auth_token = self._resolve_auth_token()
        connect_kwargs: dict[str, Any] = {
            "ping_interval": 20,
            "ping_timeout": 10,
            "close_timeout": 5,
            "max_size": 25 * 1024 * 1024,
        }

        async with websockets.connect(self.gateway_url, **connect_kwargs) as ws:
            self._ws = ws
            try:
                hello_payload = await self._perform_handshake(ws, auth_token)
                self._connected = True
                self._hello_payload = hello_payload
                self._reconnect_delay = 2.0

                logger.info("Connected to OpenClaw Gateway at %s", self.gateway_url)
                broadcast(
                    {
                        "type": "gateway_status",
                        "payload": {
                            "connected": True,
                            "features": hello_payload.get("features", {}),
                        },
                        "timestamp": _now(),
                    }
                )

                async for raw in ws:
                    await self._handle_gateway_raw_message(raw)

                raise GatewayNotConnectedError("Gateway connection closed")
            finally:
                self._connected = False
                self._ws = None
                self._hello_payload = None
                self._reject_all_pending(
                    GatewayNotConnectedError("Gateway connection closed")
                )

    async def _perform_handshake(self, ws: Any, auth_token: Optional[str]) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        challenge_deadline = loop.time() + 0.75
        while True:
            remaining = challenge_deadline - loop.time()
            if remaining <= 0:
                break
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
            except asyncio.TimeoutError:
                break
            frame = self._decode_frame(raw)
            frame_type = frame.get("type")
            if frame_type == "event":
                event_name = str(frame.get("event") or "")
                payload = frame.get("payload")
                if event_name == "connect.challenge":
                    logger.debug("Received Gateway connect.challenge before connect")
                    break
                self._dispatch_event(event_name, self._normalize_payload(payload))
                continue
            await self._handle_gateway_message(frame)

        request_id = self._next_request_id()
        params: dict[str, Any] = {
            "minProtocol": PROTOCOL_VERSION,
            "maxProtocol": PROTOCOL_VERSION,
            "client": {
                "id": GATEWAY_CLIENT_ID,
                "displayName": "openclaw-orchestrator",
                "version": "1.0.0",
                "platform": f"python/{platform.system().lower()}",
                "mode": GATEWAY_CLIENT_MODE,
                "instanceId": self._instance_id,
            },
            "caps": [],
            "role": DEFAULT_OPERATOR_ROLE,
            "scopes": list(DEFAULT_OPERATOR_SCOPES),
            "userAgent": "openclaw-orchestrator",
            "locale": "zh-CN",
        }
        if auth_token:
            params["auth"] = {"token": auth_token}

        connect_frame = {
            "type": "req",
            "id": request_id,
            "method": "connect",
            "params": params,
        }
        await ws.send(json.dumps(connect_frame, ensure_ascii=False))

        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=10.0)
            frame = self._decode_frame(raw)
            frame_type = frame.get("type")

            if frame_type == "event":
                event_name = str(frame.get("event") or "")
                payload = frame.get("payload")
                if event_name == "connect.challenge":
                    logger.debug("Gateway sent connect.challenge; nonce-based auth is ignored for local operator mode")
                    continue
                self._dispatch_event(event_name, self._normalize_payload(payload))
                continue

            if frame_type != "res":
                raise GatewayRPCError(f"Unexpected handshake frame: {frame}")

            if str(frame.get("id") or "") != request_id:
                await self._handle_gateway_message(frame)
                continue

            if frame.get("ok") is True:
                payload = frame.get("payload")
                return payload if isinstance(payload, dict) else {}

            error_message = self._extract_error_message(frame)
            lowered = error_message.lower()
            if any(token in lowered for token in ("unauthorized", "token", "password", "paired")):
                raise GatewayAuthError(error_message)
            raise GatewayRPCError(error_message)

    async def _handle_gateway_raw_message(self, raw: Any) -> None:
        frame = self._decode_frame(raw)
        await self._handle_gateway_message(frame)

    def _decode_frame(self, raw: Any) -> dict[str, Any]:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="replace")
        frame = json.loads(raw)
        if not isinstance(frame, dict):
            raise GatewayRPCError("Gateway frame is not an object")
        return frame

    def _normalize_payload(self, payload: Any) -> dict[str, Any]:
        if isinstance(payload, dict):
            return payload
        if payload is None:
            return {}
        return {"value": payload}

    def _extract_error_message(self, frame: dict[str, Any]) -> str:
        error = frame.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        return "Unknown Gateway error"

    async def _handle_gateway_message(self, msg: dict[str, Any]) -> None:
        frame_type = msg.get("type")

        if frame_type == "res":
            request_id = str(msg.get("id") or "")
            future = self._pending_requests.pop(request_id, None)
            if future is None:
                return
            if msg.get("ok") is True:
                future.set_result(msg.get("payload"))
            else:
                future.set_exception(GatewayRPCError(self._extract_error_message(msg)))
            return

        if frame_type == "event":
            event_name = str(msg.get("event") or "")
            payload = self._normalize_payload(msg.get("payload"))
            if event_name == "tick":
                return
            self._dispatch_event(event_name, payload)
            return

        logger.debug("Ignoring unknown Gateway frame: %s", msg)

    # Event names that carry a message ID which may also appear in JSONL files.
    # When Gateway pushes these events, we register the ID with SessionWatcher
    # so the file-based watcher won't broadcast the same message a second time.
    _MESSAGE_EVENTS = frozenset({
        "message",
        "chat.message",
        "agent.message",
        "agent.output",
        "session.message",
    })

    def _dispatch_event(self, event_name: str, payload: dict[str, Any]) -> None:
        timestamp = payload.get("timestamp", _now())

        # ── Dedup: register message IDs so SessionWatcher skips duplicates ──
        self._try_mark_seen(event_name, payload)
        if event_name == "chat" or event_name in self._MESSAGE_EVENTS:
            try:
                from openclaw_orchestrator.services.session_watcher import session_watcher

                session_watcher.mark_gateway_activity(payload)
            except Exception as exc:
                logger.debug(
                    "Failed to project gateway event onto status chain: %s", exc
                )

        broadcast(
            {
                "type": "gateway_event",
                "payload": {
                    "event": event_name,
                    "data": payload,
                },
                "timestamp": timestamp,
            }
        )

        handlers = self._event_handlers.get(event_name, [])
        for handler in handlers:
            try:
                handler(event_name, payload)
            except Exception as exc:
                logger.error("Event handler error for %s: %s", event_name, exc)

    def _try_mark_seen(self, event_name: str, payload: dict[str, Any]) -> None:
        """Extract message ID from Gateway event and register it with SessionWatcher.

        This prevents the file-based SessionWatcher from broadcasting the same
        message again when it detects the corresponding JSONL write.

        ID extraction order (matches SessionWatcher._parse_line logic):
        1. payload["id"]
        2. payload["messageId"]
        3. payload["message"]["id"]
        """
        if event_name not in self._MESSAGE_EVENTS:
            return

        msg_id = payload.get("id") or payload.get("messageId")
        if not msg_id:
            message = payload.get("message")
            if isinstance(message, dict):
                msg_id = message.get("id")

        if not msg_id or not isinstance(msg_id, str):
            return

        try:
            from openclaw_orchestrator.services.session_watcher import session_watcher
            session_watcher.mark_seen_from_gateway(msg_id)
        except Exception:
            # SessionWatcher may not be initialized yet; silently ignore.
            pass

    def _reject_all_pending(self, error: Exception) -> None:
        for future in self._pending_requests.values():
            if not future.done():
                future.set_exception(error)
        self._pending_requests.clear()

    async def call_rpc(
        self,
        method: str,
        params: Optional[dict[str, Any]] = None,
        timeout: float = 10.0,
    ) -> Any:
        if not self.connected or not self._ws:
            raise GatewayNotConnectedError("Not connected to OpenClaw Gateway")

        request_id = self._next_request_id()
        request: dict[str, Any] = {
            "type": "req",
            "id": request_id,
            "method": method,
        }
        if params is not None:
            request["params"] = params

        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending_requests[request_id] = future

        try:
            await self._ws.send(json.dumps(request, ensure_ascii=False))
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(request_id, None)
            raise
        except Exception:
            self._pending_requests.pop(request_id, None)
            raise

    async def list_active_sessions(self, agent_id: str) -> list[dict[str, Any]]:
        if not self.connected:
            return []
        try:
            result = await self.call_rpc(
                "sessions.list",
                {
                    "agentId": agent_id,
                    "includeGlobal": False,
                    "includeUnknown": False,
                },
                timeout=5.0,
            )
            if isinstance(result, dict):
                sessions = result.get("sessions")
                if isinstance(sessions, list):
                    return [s for s in sessions if isinstance(s, dict)]
            return []
        except Exception as exc:
            logger.debug("Failed to query sessions for %s: %s", agent_id, exc)
            return []

    async def resolve_session_key(
        self,
        *,
        key: str | None = None,
        session_id: str | None = None,
        label: str | None = None,
        agent_id: str | None = None,
    ) -> str | None:
        if not self.connected:
            return None
        params: dict[str, Any] = {}
        if key:
            params["key"] = key
        if session_id:
            params["sessionId"] = session_id
        if label:
            params["label"] = label
        if agent_id:
            params["agentId"] = agent_id
        if not params:
            return None
        try:
            result = await self.call_rpc("sessions.resolve", params, timeout=5.0)
            if isinstance(result, dict):
                resolved_key = result.get("key")
                if isinstance(resolved_key, str) and resolved_key.strip():
                    return resolved_key.strip()
            return None
        except Exception:
            return None

    async def get_session_info(self, session_id: str) -> dict[str, Any]:
        session_key = await self.resolve_session_key(session_id=session_id)
        if not session_key:
            return {}
        sessions = await self.list_active_sessions(session_key.split(":", 2)[1] if session_key.startswith("agent:") else "main")
        for session in sessions:
            if session.get("key") == session_key or session.get("sessionId") == session_id:
                return session
        return {}

    async def interrupt_agent(self, agent_id: str) -> bool:
        logger.debug("interrupt_agent is not implemented for OpenClaw Gateway agent_id=%s", agent_id)
        return False

    async def send_chat(
        self,
        *,
        session_key: str,
        message: str,
        idempotency_key: str,
    ) -> dict[str, Any]:
        result = await self.call_rpc(
            "chat.send",
            {
                "sessionKey": session_key,
                "message": message,
                "idempotencyKey": idempotency_key,
            },
            timeout=10.0,
        )
        return result if isinstance(result, dict) else {}

    async def get_chat_history(
        self,
        *,
        session_key: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        result = await self.call_rpc(
            "chat.history",
            {
                "sessionKey": session_key,
                "limit": max(1, min(limit, 1000)),
            },
            timeout=10.0,
        )
        if isinstance(result, dict):
            messages = result.get("messages")
            if isinstance(messages, list):
                return [message for message in messages if isinstance(message, dict)]
        return []

    def on_event(self, event_type: str, handler: Callable[..., Any]) -> Callable[[], None]:
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)

        def unsubscribe() -> None:
            handlers = self._event_handlers.get(event_type, [])
            if handler in handlers:
                handlers.remove(handler)

        return unsubscribe


class GatewayNotConnectedError(Exception):
    """Raised when trying to call Gateway RPC while not connected."""


class GatewayRPCError(Exception):
    """Raised when Gateway returns an error response."""


class GatewayAuthError(Exception):
    """Raised when Gateway rejects connection due to authentication failure."""


def _now() -> str:
    from datetime import datetime

    return datetime.utcnow().isoformat()


gateway_connector = GatewayConnector()
