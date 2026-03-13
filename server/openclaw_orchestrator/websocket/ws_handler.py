"""WebSocket handler for real-time event broadcasting.

Uses FastAPI's WebSocket support. Clients connect to /ws endpoint.
The broadcast() function sends events to all connected clients.
"""

from __future__ import annotations

import asyncio
import json
from concurrent.futures import Future
from typing import Any

from fastapi import WebSocket

# Connected WebSocket clients
_clients: set[WebSocket] = set()
_main_loop: asyncio.AbstractEventLoop | None = None


async def handle_ws_connection(websocket: WebSocket) -> None:
    """Handle a new WebSocket connection."""
    global _main_loop

    await websocket.accept()
    _main_loop = asyncio.get_running_loop()
    _clients.add(websocket)
    print("WebSocket client connected")

    # Send welcome message
    await websocket.send_json(
        {
            "type": "connected",
            "payload": {"message": "Welcome to OpenClaw Orchestrator"},
            "timestamp": _now(),
        }
    )

    try:
        from openclaw_orchestrator.services.gateway_connector import gateway_connector
        gateway_payload = gateway_connector._build_gateway_status_payload(
            connected=gateway_connector.connected,
            error=gateway_connector.last_error,
        )

        await websocket.send_json(
            {
                "type": "gateway_status",
                "payload": gateway_payload,
                "timestamp": _now(),
            }
        )
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                _handle_client_message(websocket, message)
            except json.JSONDecodeError:
                pass
    except Exception:
        pass
    finally:
        _clients.discard(websocket)
        print("WebSocket client disconnected")


def _handle_client_message(ws: WebSocket, message: Any) -> None:
    """Handle incoming client messages."""
    print(f"Received client message: {message}")


def broadcast(event: dict[str, Any]) -> None:
    """Broadcast an event to all connected WebSocket clients.

    Safe to call from both asyncio tasks and worker threads.
    """
    data = json.dumps(event, default=str)
    target_loop = _main_loop
    if target_loop is None or target_loop.is_closed():
        try:
            target_loop = asyncio.get_running_loop()
        except RuntimeError:
            return

    async def _do_broadcast() -> None:
        dead_clients: set[WebSocket] = set()
        for client in _clients.copy():
            try:
                await client.send_text(data)
            except Exception:
                dead_clients.add(client)
        _clients.difference_update(dead_clients)

    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    if running_loop is target_loop:
        target_loop.create_task(_do_broadcast())
        return

    future: Future[None] = asyncio.run_coroutine_threadsafe(_do_broadcast(), target_loop)
    future.add_done_callback(_consume_future_exception)


def _consume_future_exception(future: Future[None]) -> None:
    try:
        future.exception()
    except Exception:
        pass


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()
