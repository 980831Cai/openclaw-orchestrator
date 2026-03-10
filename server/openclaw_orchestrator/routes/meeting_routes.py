"""Meeting API routes."""

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from openclaw_orchestrator.services.meeting_service import meeting_service

router = APIRouter()


class CreateMeetingRequest(BaseModel):
    type: str
    topic: str
    participants: list[str]
    topicDescription: Optional[str] = ""
    leadAgentId: Optional[str] = None
    maxRounds: Optional[int] = 3


@router.post("/teams/{team_id}/meetings", status_code=201)
def create_meeting(team_id: str, req: CreateMeetingRequest):
    """Create a new meeting."""
    if not req.topic:
        raise HTTPException(status_code=400, detail="Topic is required")
    if not req.participants or len(req.participants) < 1:
        raise HTTPException(status_code=400, detail="At least 1 participant is required")

    try:
        return meeting_service.create_meeting(
            team_id=team_id,
            meeting_type=req.type,
            topic=req.topic,
            participants=req.participants,
            topic_description=req.topicDescription or "",
            lead_agent_id=req.leadAgentId,
            max_rounds=req.maxRounds or 3,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/teams/{team_id}/meetings")
def list_meetings(team_id: str, status: Optional[str] = None):
    """List meetings for a team."""
    return meeting_service.list_meetings(team_id, status)


@router.get("/meetings/{meeting_id}")
def get_meeting(meeting_id: str):
    """Get meeting details."""
    try:
        return meeting_service.get_meeting(meeting_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/meetings/{meeting_id}/content")
def get_meeting_content(meeting_id: str):
    """Get meeting markdown content."""
    try:
        content = meeting_service.get_meeting_content(meeting_id)
        return {"content": content}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/meetings/{meeting_id}/start")
async def start_meeting(meeting_id: str):
    """Start executing a meeting (async — returns immediately, runs in background)."""
    try:
        meeting = meeting_service.get_meeting(meeting_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if meeting["status"] != "preparing":
        raise HTTPException(status_code=400, detail=f"Meeting is not in 'preparing' status (current: {meeting['status']})")

    # Run meeting in background
    asyncio.ensure_future(meeting_service.run_meeting(meeting_id))

    return {
        "meetingId": meeting_id,
        "status": "in_progress",
        "message": "Meeting started in background",
    }


@router.post("/meetings/{meeting_id}/conclude")
async def conclude_meeting(meeting_id: str):
    """Manually conclude a meeting (stop further speeches and generate summary)."""
    try:
        meeting = meeting_service.get_meeting(meeting_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if meeting["status"] not in ("in_progress",):
        raise HTTPException(status_code=400, detail="Meeting is not in progress")

    # Force conclude
    result = await meeting_service._conclude_meeting(meeting)
    return {
        "meetingId": meeting_id,
        "status": "concluded",
        "summary": result,
    }


@router.post("/meetings/{meeting_id}/cancel")
def cancel_meeting(meeting_id: str):
    """Cancel a meeting."""
    try:
        return meeting_service.cancel_meeting(meeting_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
