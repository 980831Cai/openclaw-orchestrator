"""WebSocket handler for real-time event broadcasting.

Uses FastAPI's WebSocket support. Clients connect to /ws endpoint.
The broadcast() function sends events to all connected clients.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket

# Connected WebSocket clients
_clients: set[WebSocket] = set()


async def handle_ws_connection(websocket: WebSocket) -> None:
    """Handle a new WebSocket connection."""
    await websocket.accept()
    _clients.add(websocket)
    print("🔌 WebSocket client connected")

    # Send welcome message
    await websocket.send_json(
        {
            "type": "connected",
            "payload": {"message": "Welcome to OpenClaw Orchestrator"},
            "timestamp": _now(),
        }
    )

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
        print("🔌 WebSocket client disconnected")


def _handle_client_message(ws: WebSocket, message: Any) -> None:
    """Handle incoming client messages."""
    print(f"Received client message: {message}")


def broadcast(event: dict[str, Any]) -> None:
    """Broadcast an event to all connected WebSocket clients.

    This is a sync function that schedules the async sends.
    Safe to call from synchronous code (e.g., services).
    """
    import asyncio

    data = json.dumps(event, default=str)

    # Try to get the running event loop; if none, skip (no clients to send to)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No event loop running - we're in a sync context outside of async
        # This can happen during startup; just skip the broadcast
        return

    dead_clients: set[WebSocket] = set()

    async def _do_broadcast() -> None:
        for client in _clients.copy():
            try:
                await client.send_text(data)
            except Exception:
                dead_clients.add(client)
        _clients.difference_update(dead_clients)

    # Schedule the broadcast coroutine
    asyncio.ensure_future(_do_broadcast())


def _now() -> str:
    from datetime import datetime

    return datetime.utcnow().isoformat()
