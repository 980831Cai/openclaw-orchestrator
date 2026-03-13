"""Collaboration API routes — for automatic meeting triggers."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from openclaw_orchestrator.services.collaboration_service import collaboration_service

router = APIRouter()


class MeetingRequest(BaseModel):
    requesterAgentId: str
    situation: str
    suggestedType: str = "decision"
    topic: str = "团队协作会议"


class MeetingRequestResponse(BaseModel):
    success: bool
    approved: Optional[bool] = None
    requestId: Optional[str] = None
    meeting: Optional[dict] = None
    reason: Optional[str] = None
    error: Optional[str] = None


@router.post("/teams/{team_id}/collaboration/request-meeting", response_model=MeetingRequestResponse)
async def request_meeting(team_id: str, req: MeetingRequest):
    """Agent requests a meeting. Lead will evaluate and decide.

    This is the entry point for automatic meeting triggers when:
    - An agent needs input from other members
    - Decision-making is required
    - Task exceeds agent's capabilities
    """
    result = await collaboration_service.request_meeting(
        team_id=team_id,
        requester_agent_id=req.requesterAgentId,
        situation=req.situation,
        suggested_type=req.suggestedType,
        topic=req.topic,
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))

    return MeetingRequestResponse(
        success=True,
        approved=result.get("approved"),
        requestId=result.get("request_id"),
        meeting=result.get("meeting"),
        reason=result.get("reason"),
    )


@router.get("/teams/{team_id}/collaboration/pending-requests")
def get_pending_requests(team_id: str):
    """Get pending meeting requests for a team."""
    requests = collaboration_service.get_pending_requests(team_id=team_id)
    return {"requests": requests}


@router.get("/collaboration/requests/{request_id}")
def get_request(request_id: str):
    """Get a specific meeting request."""
    request = collaboration_service.get_request(request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return request
