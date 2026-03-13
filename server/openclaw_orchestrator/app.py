"""FastAPI application entry point.

Replaces the original Express/Node.js server with a Python FastAPI application.
Serves both the API and the pre-built React frontend as static files.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
from openclaw_orchestrator.routes.settings_routes import router as settings_router
from openclaw_orchestrator.routes.meeting_routes import router as meeting_router
from openclaw_orchestrator.routes.runtime_routes import router as runtime_router
from openclaw_orchestrator.websocket.ws_handler import handle_ws_connection


def resolve_frontend_dir(package_dir: Path) -> Path | None:
    static_dir = package_dir / "static"
    if (static_dir / "index.html").exists():
        return static_dir

    repo_root = package_dir.parents[1]
    dist_dir = repo_root / "packages" / "web" / "dist"
    if (dist_dir / "index.html").exists():
        return dist_dir

    return None


def mount_frontend(app: FastAPI, frontend_dir: Path) -> None:
    assets_dir = frontend_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    async def frontend_index() -> FileResponse:
        return FileResponse(frontend_dir / "index.html")

    @app.get("/{frontend_path:path}", include_in_schema=False)
    async def frontend_spa(frontend_path: str) -> FileResponse:
        candidate = (frontend_dir / frontend_path).resolve()
        try:
            candidate.relative_to(frontend_dir.resolve())
        except ValueError:
            return FileResponse(frontend_dir / "index.html")

        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)

        return FileResponse(frontend_dir / "index.html")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks."""
    # ─── Startup ───
    os.makedirs(settings.openclaw_home, exist_ok=True)
    init_database()

    # Start session watcher
    from openclaw_orchestrator.services.session_watcher import session_watcher

    session_watcher.start()

    # Start schedule executor (loads saved schedules from DB)
    from openclaw_orchestrator.services.schedule_executor import schedule_executor

    schedule_executor.start()

    # Start workflow scheduler (polls workflow cron definitions)
    from openclaw_orchestrator.services.workflow_scheduler import workflow_scheduler

    await workflow_scheduler.start()

    # Initialize OpenClaw bridge (tests Webhook connectivity)
    from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

    await openclaw_bridge.check_connectivity()

    # Start Gateway connector (direct WebSocket to OpenClaw Gateway)
    from openclaw_orchestrator.services.gateway_connector import gateway_connector

    await gateway_connector.start()

    print("OpenClaw Orchestrator server running")
    print(f"OpenClaw home: {settings.openclaw_home}")
    print(f"OpenClaw Webhook: {settings.openclaw_webhook_url}")
    print(f"OpenClaw Gateway: {settings.gateway_url}")

    yield

    # ─── Shutdown ───
    await gateway_connector.stop()
    await workflow_scheduler.stop()
    schedule_executor.stop()
    session_watcher.stop()

    # Close OpenClaw bridge HTTP client
    await openclaw_bridge.close()

    from openclaw_orchestrator.database.db import close_db

    close_db()
    print("Server shut down")


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
app.include_router(settings_router, prefix="/api")
app.include_router(meeting_router, prefix="/api")
app.include_router(runtime_router, prefix="/api")


# ─── Health check ───
@app.get("/api/health")
def health_check():
    from openclaw_orchestrator.services.gateway_connector import gateway_connector
    from openclaw_orchestrator.services.runtime_service import runtime_service
    from openclaw_orchestrator.services.session_watcher import session_watcher

    gateway_runtime = runtime_service.get_gateway_status()
    gateway_snapshot = gateway_connector._build_gateway_status_payload(
        connected=gateway_connector.connected,
        error=gateway_connector.last_error,
    )

    return {
        "status": "ok",
        "timestamp": datetime.now(UTC).isoformat(),
        "openclawHome": settings.openclaw_home,
        "gatewayConnected": gateway_snapshot["connected"],
        "gatewayRuntime": gateway_runtime,
        "gateway": gateway_snapshot,
        "gatewayUrl": settings.gateway_url,
        "webhookUrl": settings.openclaw_webhook_url,
        "activeAgents": len(session_watcher.get_all_statuses()),
    }


# ─── WebSocket ───
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await handle_ws_connection(websocket)


# ─── Static frontend files ───
# Serve pre-built React frontend from either packaged static/ or repo-local packages/web/dist
# This enables single-port deployment: API + WebSocket + Frontend all on port 3721
_frontend_dir = resolve_frontend_dir(Path(__file__).parent)
if _frontend_dir is not None:
    mount_frontend(app, _frontend_dir)
