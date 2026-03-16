"""Team API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.lead_governance_service import lead_governance_service
from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
from openclaw_orchestrator.services.team_dispatch_service import team_dispatch_service
from openclaw_orchestrator.services.team_service import team_service

router = APIRouter()


class CreateTeamRequest(BaseModel):
    name: str
    description: str = ""
    goal: Optional[str] = None
    theme: Optional[str] = None
    leadMode: Optional[str] = None
    leadAgentId: Optional[str] = None


class UpdateTeamRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    goal: Optional[str] = None
    theme: Optional[str] = None


class AddMemberRequest(BaseModel):
    agentId: str
    role: str = "member"


class SetLeadRequest(BaseModel):
    agentId: str


class UpdateExecutionConfigRequest(BaseModel):
    defaultWorkflowId: Optional[str] = None
    leadMode: Optional[str] = None


class UpdateContentRequest(BaseModel):
    content: str


class DispatchRequest(BaseModel):
    content: str
    source: str = "manual"
    actorId: str = "api"
    sessionId: str = ""
    workflowId: Optional[str] = None
    idempotencyKey: Optional[str] = None
    title: Optional[str] = None
    plannedBy: Optional[str] = None
    autoDrain: bool = True


@router.get("/teams")
def list_teams():
    return team_service.list_teams()


@router.post("/teams", status_code=201)
def create_team(req: CreateTeamRequest):
    if not req.name:
        raise HTTPException(status_code=400, detail="Team name is required")
    return team_service.create_team(
        req.name,
        req.description,
        req.goal,
        req.theme,
        req.leadMode,
        req.leadAgentId,
    )


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


@router.put("/teams/{team_id}/lead")
def set_team_lead(team_id: str, req: SetLeadRequest):
    """Set a specific agent as Team Lead."""
    if not req.agentId:
        raise HTTPException(status_code=400, detail="agentId is required")
    try:
        return team_service.set_lead(team_id, req.agentId)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/teams/{team_id}/schedule")
def update_schedule(team_id: str, schedule: dict[str, Any]):
    try:
        sync_result = team_service.update_schedule(team_id, schedule)
        team = team_service.get_team(team_id)
        # Merge sync metadata into team response
        team["scheduleSyncResult"] = sync_result
        return team
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/teams/{team_id}/execution-config")
def update_execution_config(team_id: str, req: UpdateExecutionConfigRequest):
    try:
        return team_service.set_execution_config(
            team_id,
            default_workflow_id=req.defaultWorkflowId,
            lead_mode=req.leadMode,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/teams/{team_id}/shared")
def get_team_md(team_id: str):
    content = team_service.get_team_md(team_id)
    return {"content": content}


@router.put("/teams/{team_id}/shared")
def update_team_md(team_id: str, req: UpdateContentRequest):
    team_service.update_team_md(team_id, req.content)
    return {"message": "team.md updated"}


@router.get("/teams/{team_id}/trace")
def get_team_trace(team_id: str, limit: int = 50):
    normalized_limit = max(1, min(int(limit), 200))
    db = get_db()
    rows = db.execute(
        """
        SELECT
            te.id AS trigger_event_id,
            te.workflow_id,
            te.source,
            te.actor_id,
            te.session_id,
            te.idempotency_key,
            te.status AS trigger_status,
            te.linked_task_id,
            te.linked_execution_id,
            te.created_at,
            te.updated_at,
            t.queue_status,
            t.retry_count,
            t.last_error,
            t.last_heartbeat_at,
            t.started_at AS task_started_at,
            t.finished_at AS task_finished_at,
            we.status AS execution_status,
            we.current_node_id,
            we.started_at AS execution_started_at,
            we.completed_at AS execution_completed_at,
            (
                SELECT a.status
                FROM approvals a
                WHERE a.execution_id = te.linked_execution_id
                ORDER BY a.created_at DESC
                LIMIT 1
            ) AS latest_approval_status
        FROM trigger_events te
        LEFT JOIN tasks t ON t.id = te.linked_task_id
        LEFT JOIN workflow_executions we ON we.id = te.linked_execution_id
        WHERE te.team_id = ?
        ORDER BY te.created_at DESC
        LIMIT ?
        """,
        (team_id, normalized_limit),
    ).fetchall()
    lead_agent_id = team_service.get_lead(team_id)
    lead_heartbeat = (
        openclaw_bridge.read_heartbeat_status(lead_agent_id)
        if lead_agent_id
        else None
    )
    governance_snapshot = lead_governance_service.get_latest_team_governance_snapshot(team_id)

    return {
        "teamId": team_id,
        "items": [dict(row) for row in rows],
        "leadAgentId": lead_agent_id,
        "leadHeartbeat": lead_heartbeat,
        "governanceSnapshot": governance_snapshot,
    }


@router.post("/teams/{team_id}/dispatch")
async def dispatch_to_team(team_id: str, req: DispatchRequest):
    if not req.content or not str(req.content).strip():
        raise HTTPException(status_code=400, detail="content is required")
    try:
        return await team_dispatch_service.dispatch(
            team_id=team_id,
            content=req.content,
            source=req.source,
            actor_id=req.actorId,
            session_id=req.sessionId,
            workflow_id=req.workflowId,
            idempotency_key=req.idempotencyKey,
            title=req.title,
            planned_by=req.plannedBy,
            auto_drain=req.autoDrain,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/teams/{team_id}/queue/drain")
async def drain_team_queue(team_id: str):
    try:
        return await team_dispatch_service.drain_once(team_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
