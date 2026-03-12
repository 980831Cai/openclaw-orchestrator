"""Chat / session API routes."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.services.chat_service import chat_service
from openclaw_orchestrator.services.session_watcher import session_watcher

router = APIRouter()


class SendMessageRequest(BaseModel):
    content: str


@router.get("/agents/{agent_id}/sessions")
def list_sessions(agent_id: str):
    return chat_service.list_sessions(agent_id)


@router.get("/agents/{agent_id}/sessions/{session_id}/messages")
def get_messages(
    agent_id: str,
    session_id: str,
    limit: int = 100,
    offset: int = 0,
):
    return chat_service.get_messages(agent_id, session_id, limit, offset)


@router.post("/agents/{agent_id}/sessions/{session_id}/send")
async def send_message(agent_id: str, session_id: str, req: SendMessageRequest):
    if not req.content:
        raise HTTPException(status_code=400, detail="content is required")
    return await chat_service.send_message(agent_id, session_id, req.content)


@router.get("/monitor/statuses")
def get_statuses():
    statuses = session_watcher.get_all_statuses()
    agents_dir = Path(settings.openclaw_home) / "agents"
    if agents_dir.exists():
        for entry in agents_dir.iterdir():
            if not entry.is_dir():
                continue
            agent_id = entry.name.strip()
            if not agent_id:
                continue
            statuses[agent_id] = session_watcher.get_enriched_status(agent_id)["status"]
    return statuses
