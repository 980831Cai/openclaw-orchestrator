"""WebSocket handler for real-time event broadcasting.

Uses FastAPI's WebSocket support. Clients connect to /ws endpoint.
The broadcast() function sends events to all connected clients.
Includes ping/pong heartbeat to detect and clean up dead connections.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Heartbeat configuration
HEARTBEAT_INTERVAL = 30  # seconds between pings
HEARTBEAT_TIMEOUT = 60   # seconds to wait for pong before disconnecting

# Connected WebSocket clients with their last pong timestamp
_clients: dict[WebSocket, float] = {}


async def handle_ws_connection(websocket: WebSocket) -> None:
    """Handle a new WebSocket connection with heartbeat support."""
    await websocket.accept()
    _clients[websocket] = asyncio.get_event_loop().time()
    logger.info("WebSocket client connected (total: %d)", len(_clients))

    # Send welcome message
    await websocket.send_json(
        {
            "type": "connected",
            "payload": {"message": "Welcome to OpenClaw Orchestrator"},
            "timestamp": _now(),
        }
    )

    # Start heartbeat task for this connection
    heartbeat_task = asyncio.create_task(_heartbeat_loop(websocket))

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await _handle_client_message(websocket, message)
            except json.JSONDecodeError:
                pass
    except Exception:
        pass
    finally:
        heartbeat_task.cancel()
        _clients.pop(websocket, None)
        logger.info("WebSocket client disconnected (total: %d)", len(_clients))


async def _heartbeat_loop(websocket: WebSocket) -> None:
    """Periodically send ping messages and check for pong responses."""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL)

            # Check if client responded to last ping
            last_pong = _clients.get(websocket)
            if last_pong is not None:
                elapsed = asyncio.get_event_loop().time() - last_pong
                if elapsed > HEARTBEAT_TIMEOUT:
                    logger.warning(
                        "WebSocket client heartbeat timeout (%.1fs), closing",
                        elapsed,
                    )
                    try:
                        await websocket.close(code=1000, reason="Heartbeat timeout")
                    except Exception:
                        pass
                    return

            # Send ping
            try:
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": _now(),
                })
            except Exception:
                return
    except asyncio.CancelledError:
        pass


async def _handle_client_message(ws: WebSocket, message: Any) -> None:
    """Handle incoming client messages, including pong responses."""
    msg_type = message.get("type") if isinstance(message, dict) else None

    if msg_type == "pong":
        # Update last pong timestamp
        _clients[ws] = asyncio.get_event_loop().time()
        return

    logger.debug("Received client message: %s", message)


def broadcast(event: dict[str, Any]) -> None:
    """Broadcast an event to all connected WebSocket clients.

    This is a sync function that schedules the async sends.
    Safe to call from synchronous code (e.g., services).
    """
    data = json.dumps(event, default=str)

    # Try to get the running event loop; if none, skip (no clients to send to)
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No event loop running - we're in a sync context outside of async
        return

    dead_clients: set[WebSocket] = set()

    async def _do_broadcast() -> None:
        for client in list(_clients.keys()):
            try:
                await client.send_text(data)
            except Exception:
                dead_clients.add(client)
        for dc in dead_clients:
            _clients.pop(dc, None)

    # Schedule the broadcast coroutine
    asyncio.ensure_future(_do_broadcast())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
