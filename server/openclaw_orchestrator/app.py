"""FastAPI application entry point.

Replaces the original Express/Node.js server with a Python FastAPI application.
Serves both the API and the pre-built React frontend as static files.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.database import init_database
from openclaw_orchestrator.routes.agent_routes import router as agent_router
from openclaw_orchestrator.routes.approval_routes import router as approval_router
from openclaw_orchestrator.routes.chat_routes import router as chat_router
from openclaw_orchestrator.routes.knowledge_routes import router as knowledge_router
from openclaw_orchestrator.routes.notification_routes import router as notification_router
from openclaw_orchestrator.routes.task_routes import router as task_router
from openclaw_orchestrator.routes.team_routes import router as team_router
from openclaw_orchestrator.routes.workflow_routes import router as workflow_router
from openclaw_orchestrator.websocket.ws_handler import handle_ws_connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks."""
    # ─── Startup ───
    os.makedirs(settings.openclaw_home, exist_ok=True)
    init_database()

    # Start session watcher
    from openclaw_orchestrator.services.session_watcher import session_watcher

    session_watcher.start()

    print(f"🚀 OpenClaw Orchestrator server running")
    print(f"📁 OpenClaw home: {settings.openclaw_home}")

    yield

    # ─── Shutdown ───
    session_watcher.stop()

    from openclaw_orchestrator.database.db import close_db

    close_db()
    print("👋 Server shut down")


# ─── Create FastAPI app ───
app = FastAPI(
    title="OpenClaw Orchestrator",
    description="Multi-Agent Visual Orchestration Plugin for OpenClaw",
    version="0.1.0",
    lifespan=lifespan,
)

# ─── CORS ───
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin, "http://localhost:5173", "http://localhost:3721"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API routes (all under /api prefix) ───
app.include_router(agent_router, prefix="/api")
app.include_router(approval_router, prefix="/api")
app.include_router(team_router, prefix="/api")
app.include_router(task_router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(notification_router, prefix="/api")
app.include_router(workflow_router, prefix="/api")


# ─── Health check ───
@app.get("/api/health")
def health_check():
    from datetime import datetime

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "openclawHome": settings.openclaw_home,
    }


# ─── WebSocket ───
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await handle_ws_connection(websocket)


# ─── Static frontend files ───
# Serve pre-built React frontend from static/ directory
# This enables single-port deployment: API + WebSocket + Frontend all on port 3721
_static_dir = Path(__file__).parent / "static"
if _static_dir.exists() and (_static_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")
