"""Knowledge API routes (agent + team knowledge endpoints)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

from openclaw_orchestrator.services.knowledge_service import knowledge_service

router = APIRouter()


class AddKnowledgeRequest(BaseModel):
    sourceType: str
    sourcePath: str
    title: str


class SearchRequest(BaseModel):
    query: str


# ────── Agent knowledge ──────

@router.get("/agents/{agent_id}/knowledge")
def list_agent_knowledge(agent_id: str):
    return knowledge_service.list_entries("agent", agent_id)


@router.post("/agents/{agent_id}/knowledge", status_code=201)
def add_agent_knowledge(agent_id: str, req: AddKnowledgeRequest):
    if not req.sourceType or not req.sourcePath or not req.title:
        raise HTTPException(
            status_code=400,
            detail="sourceType, sourcePath and title are required",
        )
    return knowledge_service.add_entry(
        "agent", agent_id, req.sourceType, req.sourcePath, req.title
    )


@router.delete("/agents/{agent_id}/knowledge/{entry_id}")
def delete_agent_knowledge(agent_id: str, entry_id: str):
    knowledge_service.delete_entry(entry_id)
    return {"message": "Knowledge entry deleted"}


@router.post("/agents/{agent_id}/knowledge/search")
def search_agent_knowledge(agent_id: str, req: SearchRequest):
    if not req.query:
        raise HTTPException(status_code=400, detail="query is required")
    return knowledge_service.search("agent", agent_id, req.query)


@router.get("/agents/{agent_id}/knowledge/stats")
def agent_knowledge_stats(agent_id: str):
    return knowledge_service.get_stats("agent", agent_id)


# ────── Team knowledge ──────

@router.get("/teams/{team_id}/knowledge")
def list_team_knowledge(team_id: str):
    return knowledge_service.list_entries("team", team_id)


@router.post("/teams/{team_id}/knowledge", status_code=201)
def add_team_knowledge(team_id: str, req: AddKnowledgeRequest):
    if not req.sourceType or not req.sourcePath or not req.title:
        raise HTTPException(
            status_code=400,
            detail="sourceType, sourcePath and title are required",
        )
    return knowledge_service.add_entry(
        "team", team_id, req.sourceType, req.sourcePath, req.title
    )


@router.delete("/teams/{team_id}/knowledge/{entry_id}")
def delete_team_knowledge(team_id: str, entry_id: str):
    knowledge_service.delete_entry(entry_id)
    return {"message": "Knowledge entry deleted"}


@router.post("/teams/{team_id}/knowledge/search")
def search_team_knowledge(team_id: str, req: SearchRequest):
    if not req.query:
        raise HTTPException(status_code=400, detail="query is required")
    return knowledge_service.search("team", team_id, req.query)


@router.get("/teams/{team_id}/knowledge/stats")
def team_knowledge_stats(team_id: str):
    return knowledge_service.get_stats("team", team_id)
