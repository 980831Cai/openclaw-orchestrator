"""OpenClaw Gateway connector.

Uses the same request-frame protocol as OpenClaw's official gateway client:
- request frame: {"type":"req","id":"...","method":"...","params":{...}}
- response frame: {"type":"res","id":"...","ok":true|false,...}
- event frame: {"type":"event","event":"...","payload":{...}}

This connector keeps a persistent WebSocket connection and exposes a small async
RPC surface for the orchestrator backend.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.parse import urlparse

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.websocket.ws_handler import broadcast

logger = logging.getLogger(__name__)


class GatewayConnector:
    def __init__(self) -> None:
        self._ws: Any = None
        self._connected = False
        self._task: Optional[asyncio.Task[None]] = None
        self._pending_requests: dict[str, asyncio.Future[Any]] = {}
        self._event_handlers: dict[str, list[Callable[..., Any]]] = {}
        self._reconnect_delay = 2.0
        self._max_reconnect_delay = 30.0
        self._auth_token: Optional[str] = None
        self._connect_nonce: Optional[str] = None
        self._protocol_version = 3
        self._active_gateway_url: Optional[str] = None

    @property
    def gateway_url(self) -> str:
        return self._active_gateway_url or settings.gateway_url

    @property
    def connected(self) -> bool:
        return self._connected

    def _is_local_connection(self) -> bool:
        try:
            host = urlparse(self.gateway_url).hostname or ""
        except Exception:
            return False
        return host in {"127.0.0.1", "localhost", "::1", "0.0.0.0"}

    def _resolve_auth_token(self) -> Optional[str]:
        if self._auth_token:
            return self._auth_token

        config_token = settings.gateway_token or ""
        if isinstance(config_token, str) and config_token.strip():
            self._auth_token = config_token.strip()
            return self._auth_token

        openclaw_json_path = Path(settings.openclaw_home) / "openclaw.json"
        if openclaw_json_path.exists():
            try:
                payload = json.loads(openclaw_json_path.read_text(encoding="utf-8"))
                gateway_cfg = payload.get("gateway", {}) if isinstance(payload, dict) else {}
                auth_cfg = gateway_cfg.get("auth", {}) if isinstance(gateway_cfg, dict) else {}
                token = auth_cfg.get("token") if isinstance(auth_cfg, dict) else None
                if isinstance(token, str) and token.strip():
                    self._auth_token = token.strip()
                    return self._auth_token
            except Exception as exc:
                logger.debug("Failed to read gateway token from openclaw.json: %s", exc)

        return None

    def _candidate_gateway_urls(self) -> list[str]:
        candidates: list[str] = []
        for value in (
            os.environ.get("OPENCLAW_GATEWAY_URL"),
            settings.gateway_url,
            settings.openclaw_gateway_url,
            "ws://127.0.0.1:18789",
        ):
            if not isinstance(value, str):
                continue
            normalized = value.strip()
            if normalized and normalized not in candidates:
                candidates.append(normalized)
        return candidates

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._connection_loop())
        logger.info(
            "Gateway connector started, candidates: %s",
            ", ".join(self._candidate_gateway_urls()),
        )

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await self._close_ws()
        self._connected = False

    async def _close_ws(self) -> None:
        ws = self._ws
        self._ws = None
        self._active_gateway_url = None
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass

    async def _connection_loop(self) -> None:
        while True:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
            except GatewayAuthError as exc:
                self._connected = False
                logger.error("Gateway auth failed: %s", exc)
                broadcast(
                    {
                        "type": "gateway_status",
                        "payload": {"connected": False, "error": str(exc), "authRequired": True},
                        "timestamp": _now(),
                    }
                )
                await asyncio.sleep(30.0)
            except Exception as exc:
                self._connected = False
                logger.warning("Gateway disconnected: %s", exc)
                broadcast(
                    {
                        "type": "gateway_status",
                        "payload": {"connected": False, "error": str(exc)},
                        "timestamp": _now(),
                    }
                )
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 1.5, self._max_reconnect_delay)

    async def _connect_and_listen(self) -> None:
        try:
            import websockets
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("websockets package is required for Gateway support") from exc

        token = self._resolve_auth_token()
        self._connect_nonce = None
        last_error: Exception | None = None

        for candidate_url in self._candidate_gateway_urls():
            try:
                async with websockets.connect(
                    candidate_url,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                    open_timeout=5,
                    max_size=25 * 1024 * 1024,
                ) as ws:
                    self._ws = ws
                    self._active_gateway_url = candidate_url

                    # Match the official client behavior: wait briefly for optional
                    # connect.challenge, then send connect anyway.
                    await asyncio.sleep(0.75)
                    await self._send_connect(token)

                    self._connected = True
                    self._reconnect_delay = 2.0
                    logger.info("Connected to OpenClaw Gateway: %s", self.gateway_url)
                    broadcast(
                        {
                            "type": "gateway_status",
                            "payload": {"connected": True, "gatewayUrl": self.gateway_url},
                            "timestamp": _now(),
                        }
                    )

                    async for raw in ws:
                        await self._handle_gateway_message(raw)
                    return
            except GatewayAuthError:
                raise
            except Exception as exc:
                last_error = exc
                self._ws = None
                self._active_gateway_url = None
                logger.debug("Gateway candidate %s failed: %s", candidate_url, exc)

        if last_error is not None:
            raise last_error
        raise RuntimeError("no gateway candidates available")

    async def _send_connect(self, token: Optional[str]) -> None:
        client = {
            "id": "gateway-client",
            "displayName": "OpenClaw Orchestrator",
            "version": "1.0.0",
            "platform": "python",
            "mode": "backend",
            "instanceId": "openclaw-orchestrator",
        }
        params: dict[str, Any] = {
            "minProtocol": self._protocol_version,
            "maxProtocol": self._protocol_version,
            "client": client,
            "caps": [],
            "role": "operator",
            "scopes": ["operator.admin"],
        }
        if token:
            params["auth"] = {"token": token}

        try:
            await self.call_rpc("connect", params, timeout=10.0)
        except GatewayRPCError as exc:
            if "unauthorized" in str(exc).lower() or "token" in str(exc).lower():
                raise GatewayAuthError(str(exc)) from exc
            raise
        except asyncio.TimeoutError:
            if not self._is_local_connection() and not token:
                raise GatewayAuthError("gateway connect timed out without auth token")

    async def _handle_gateway_message(self, raw: Any) -> None:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="ignore")
        try:
            msg = json.loads(raw)
        except Exception:
            logger.debug("Gateway sent non-JSON frame: %s", str(raw)[:120])
            return

        msg_type = msg.get("type")
        if msg_type == "event":
            event = str(msg.get("event") or "")
            payload = msg.get("payload") or {}
            if event == "connect.challenge":
                nonce = payload.get("nonce") if isinstance(payload, dict) else None
                if isinstance(nonce, str) and nonce:
                    self._connect_nonce = nonce
                return
            self._dispatch_event(event, payload if isinstance(payload, dict) else {})
            return

        response_id = str(msg.get("id") or "")
        if response_id and response_id in self._pending_requests:
            future = self._pending_requests.pop(response_id)
            ok = bool(msg.get("ok"))
            if ok:
                future.set_result(msg.get("payload"))
            else:
                error = msg.get("error") or {}
                message = error.get("message") if isinstance(error, dict) else None
                future.set_exception(GatewayRPCError(str(message or "unknown gateway error")))
            return

    def _dispatch_event(self, event: str, payload: dict[str, Any]) -> None:
        timestamp = payload.get("timestamp", _now())

        if event == "chat":
            broadcast({"type": "gateway_chat", "payload": payload, "timestamp": timestamp})

        handlers = self._event_handlers.get(event, [])
        for handler in handlers:
            try:
                handler(event, payload)
            except Exception as exc:
                logger.error("Gateway event handler failed for %s: %s", event, exc)

    async def call_rpc(
        self,
        method: str,
        params: Optional[dict[str, Any]] = None,
        timeout: float = 10.0,
    ) -> Any:
        if self._ws is None:
            raise GatewayNotConnectedError("gateway not connected")

        rpc_id = str(uuid.uuid4())
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending_requests[rpc_id] = future
        request = {
            "type": "req",
            "id": rpc_id,
            "method": method,
            "params": params or {},
        }

        try:
            await self._ws.send(json.dumps(request, ensure_ascii=False))
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_requests.pop(rpc_id, None)
            raise
        except Exception:
            self._pending_requests.pop(rpc_id, None)
            raise

    async def get_chat_history(self, session_key: str, limit: int = 20) -> list[dict[str, Any]]:
        payload = await self.call_rpc(
            "chat.history",
            {"sessionKey": session_key, "limit": limit},
            timeout=8.0,
        )
        if isinstance(payload, dict):
            messages = payload.get("messages")
            if isinstance(messages, list):
                return [item for item in messages if isinstance(item, dict)]
        return []

    async def send_chat(
        self,
        session_key: str,
        message: str,
        *,
        timeout_ms: int = 120_000,
        thinking: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "sessionKey": session_key,
            "message": message,
            "timeoutMs": timeout_ms,
            "idempotencyKey": idempotency_key or str(uuid.uuid4()),
        }
        if thinking:
            params["thinking"] = thinking
        payload = await self.call_rpc("chat.send", params, timeout=10.0)
        return payload if isinstance(payload, dict) else {"status": "started"}

    async def list_sessions(self) -> list[dict[str, Any]]:
        payload = await self.call_rpc("sessions.list", {}, timeout=8.0)
        if isinstance(payload, dict):
            sessions = payload.get("sessions")
            if isinstance(sessions, list):
                return [item for item in sessions if isinstance(item, dict)]
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        return []

    def on_event(self, event_type: str, handler: Callable[..., Any]) -> Callable[[], None]:
        self._event_handlers.setdefault(event_type, []).append(handler)

        def unsubscribe() -> None:
            handlers = self._event_handlers.get(event_type, [])
            if handler in handlers:
                handlers.remove(handler)

        return unsubscribe


class GatewayNotConnectedError(Exception):
    pass


class GatewayRPCError(Exception):
    pass


class GatewayAuthError(Exception):
    pass


def _now() -> str:
    from datetime import datetime

    return datetime.utcnow().isoformat()


gateway_connector = GatewayConnector()
