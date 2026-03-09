"""Team API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional

from openclaw_orchestrator.services.team_service import team_service

router = APIRouter()


class CreateTeamRequest(BaseModel):
    name: str
    description: str = ""
    goal: Optional[str] = None
    theme: Optional[str] = None


class UpdateTeamRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    goal: Optional[str] = None
    theme: Optional[str] = None


class AddMemberRequest(BaseModel):
    agentId: str
    role: str = "member"


class UpdateContentRequest(BaseModel):
    content: str


@router.get("/teams")
def list_teams():
    return team_service.list_teams()


@router.post("/teams", status_code=201)
def create_team(req: CreateTeamRequest):
    if not req.name:
        raise HTTPException(status_code=400, detail="Team name is required")
    return team_service.create_team(req.name, req.description, req.goal, req.theme)


@router.get("/teams/{team_id}")
def get_team(team_id: str):
    try:
        return team_service.get_team(team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/teams/{team_id}")
def update_team(team_id: str, req: UpdateTeamRequest):
    try:
        return team_service.update_team(team_id, req.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/teams/{team_id}")
def delete_team(team_id: str):
    try:
        team_service.delete_team(team_id)
        return {"message": "Team deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/teams/{team_id}/members")
def add_member(team_id: str, req: AddMemberRequest):
    if not req.agentId:
        raise HTTPException(status_code=400, detail="agentId is required")
    try:
        team_service.add_member(team_id, req.agentId, req.role)
        return team_service.get_team(team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/teams/{team_id}/members/{agent_id}")
def remove_member(team_id: str, agent_id: str):
    try:
        team_service.remove_member(team_id, agent_id)
        return team_service.get_team(team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/teams/{team_id}/schedule")
def update_schedule(team_id: str, schedule: dict[str, Any]):
    try:
        team_service.update_schedule(team_id, schedule)
        return team_service.get_team(team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/teams/{team_id}/shared")
def get_team_md(team_id: str):
    content = team_service.get_team_md(team_id)
    return {"content": content}


@router.put("/teams/{team_id}/shared")
def update_team_md(team_id: str, req: UpdateContentRequest):
    team_service.update_team_md(team_id, req.content)
    return {"message": "team.md updated"}
