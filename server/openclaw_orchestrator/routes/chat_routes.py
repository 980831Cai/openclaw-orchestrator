"""Chat / session API routes."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from openclaw_orchestrator.services.chat_service import ChatDeliveryError, chat_service
from openclaw_orchestrator.services.live_feed_service import live_feed_service
from openclaw_orchestrator.services.session_watcher import session_watcher

router = APIRouter()


class SendMessageRequest(BaseModel):
    content: str
    teamId: Optional[str] = None
    autoDispatch: bool = False


@router.get("/agents/{agent_id}/sessions")
async def list_sessions(agent_id: str):
    return await chat_service.list_sessions(agent_id)


@router.get("/agents/{agent_id}/sessions/{session_id}/messages")
async def get_messages(
    agent_id: str,
    session_id: str,
    limit: int = 100,
    offset: int = 0,
):
    return await chat_service.get_messages(agent_id, session_id, limit, offset)


@router.post("/agents/{agent_id}/sessions/{session_id}/send")
async def send_message(agent_id: str, session_id: str, req: SendMessageRequest):
    if not req.content:
        raise HTTPException(status_code=400, detail="content is required")
    try:
        result = await chat_service.send_message(agent_id, session_id, req.content)
        if req.autoDispatch and req.teamId:
            dispatch_result = await chat_service.dispatch_team_intent(
                req.teamId,
                req.content,
                requested_by=f"chat:{agent_id}:{session_id}",
            )
            result["dispatch"] = dispatch_result
        return result
    except (ChatDeliveryError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/monitor/statuses")
def get_statuses():
    return session_watcher.get_all_statuses()


@router.get("/monitor/live-feed-snapshot")
def get_live_feed_snapshot(limit: int = 50):
    normalized_limit = max(1, min(limit, 200))
    return live_feed_service.get_snapshot(limit=normalized_limit)
