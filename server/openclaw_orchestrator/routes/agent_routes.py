"""Agent API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional

from openclaw_orchestrator.services.agent_service import agent_service

router = APIRouter()


class CreateAgentRequest(BaseModel):
    name: str


class UpdateAgentRequest(BaseModel):
    identity: Optional[dict[str, Any]] = None
    soul: Optional[dict[str, Any]] = None
    rules: Optional[dict[str, Any]] = None
    skills: Optional[list[str]] = None
    model: Optional[str] = None


class UpdateSkillsRequest(BaseModel):
    skills: list[str]


@router.get("/agents")
def list_agents():
    return agent_service.list_agents()


@router.get("/agents/{agent_id}")
def get_agent(agent_id: str):
    try:
        return agent_service.get_agent(agent_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/agents", status_code=201)
def create_agent(req: CreateAgentRequest):
    if not req.name:
        raise HTTPException(status_code=400, detail="Agent name is required")
    try:
        return agent_service.create_agent(req.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/agents/{agent_id}")
def update_agent(agent_id: str, req: UpdateAgentRequest):
    try:
        return agent_service.update_agent(agent_id, req.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str):
    try:
        agent_service.delete_agent(agent_id)
        return {"message": "Agent deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/agents/{agent_id}/skills")
def get_skills(agent_id: str):
    try:
        agent = agent_service.get_agent(agent_id)
        return agent["skills"]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/agents/{agent_id}/skills")
def update_skills(agent_id: str, req: UpdateSkillsRequest):
    try:
        agent = agent_service.update_agent(agent_id, {"skills": req.skills})
        return agent["skills"]
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
