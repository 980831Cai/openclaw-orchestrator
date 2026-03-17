"""Team API routes."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.audit_log_service import audit_log_service
from openclaw_orchestrator.services.lead_governance_service import lead_governance_service
from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
from openclaw_orchestrator.services.team_dispatch_service import team_dispatch_service
from openclaw_orchestrator.services.team_service import team_service
from openclaw_orchestrator.services.team_usage_service import team_usage_service

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


def _request_actor(request: Request, fallback_actor: str | None = None) -> str:
    return audit_log_service.resolve_actor(
        actor_id=fallback_actor or request.headers.get("X-Actor-Id"),
        api_key=request.headers.get("X-API-Key") or request.query_params.get("api_key"),
    )


def _audit(
    request: Request,
    *,
    action: str,
    team_id: str | None,
    resource_type: str,
    resource_id: str | None,
    detail: str,
    metadata: dict[str, Any] | None = None,
    ok: bool = True,
    actor: str | None = None,
) -> None:
    audit_log_service.log_event(
        team_id=team_id,
        actor=_request_actor(request, actor),
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        metadata=metadata,
        ok=ok,
        request_id=request.headers.get("X-Request-Id"),
    )


@router.get("/teams")
def list_teams():
    return team_service.list_teams()


@router.post("/teams", status_code=201)
def create_team(request: Request, req: CreateTeamRequest):
    if not req.name:
        raise HTTPException(status_code=400, detail="Team name is required")
    team = team_service.create_team(
        req.name,
        req.description,
        req.goal,
        req.theme,
        req.leadMode,
        req.leadAgentId,
    )
    _audit(
        request,
        action="team.create",
        team_id=team["id"],
        resource_type="team",
        resource_id=team["id"],
        detail=f"创建团队 {team['name']}",
        metadata={"leadMode": req.leadMode, "leadAgentId": req.leadAgentId},
    )
    return team


@router.get("/teams/{team_id}")
def get_team(team_id: str):
    try:
        return team_service.get_team(team_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/teams/{team_id}")
def update_team(team_id: str, request: Request, req: UpdateTeamRequest):
    try:
        team = team_service.update_team(team_id, req.model_dump(exclude_none=True))
        _audit(
            request,
            action="team.update",
            team_id=team_id,
            resource_type="team",
            resource_id=team_id,
            detail=f"更新团队 {team.get('name') or team_id}",
            metadata=req.model_dump(exclude_none=True),
        )
        return team
    except ValueError as e:
        _audit(
            request,
            action="team.update",
            team_id=team_id,
            resource_type="team",
            resource_id=team_id,
            detail=f"更新团队失败: {e}",
            metadata=req.model_dump(exclude_none=True),
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/teams/{team_id}")
def delete_team(team_id: str, request: Request):
    try:
        team = team_service.get_team(team_id)
        team_service.delete_team(team_id)
        _audit(
            request,
            action="team.delete",
            team_id=team_id,
            resource_type="team",
            resource_id=team_id,
            detail=f"删除团队 {team.get('name') or team_id}",
        )
        return {"message": "Team deleted"}
    except ValueError as e:
        _audit(
            request,
            action="team.delete",
            team_id=team_id,
            resource_type="team",
            resource_id=team_id,
            detail=f"删除团队失败: {e}",
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/teams/{team_id}/members")
def add_member(team_id: str, request: Request, req: AddMemberRequest):
    if not req.agentId:
        raise HTTPException(status_code=400, detail="agentId is required")
    try:
        team_service.add_member(team_id, req.agentId, req.role)
        team = team_service.get_team(team_id)
        _audit(
            request,
            action="team.member.add",
            team_id=team_id,
            resource_type="team_member",
            resource_id=req.agentId,
            detail=f"向团队 {team_id} 添加成员 {req.agentId}",
            metadata={"role": req.role},
        )
        return team
    except ValueError as e:
        _audit(
            request,
            action="team.member.add",
            team_id=team_id,
            resource_type="team_member",
            resource_id=req.agentId,
            detail=f"添加成员失败: {e}",
            metadata={"role": req.role},
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/teams/{team_id}/members/{agent_id}")
def remove_member(team_id: str, agent_id: str, request: Request):
    try:
        team_service.remove_member(team_id, agent_id)
        team = team_service.get_team(team_id)
        _audit(
            request,
            action="team.member.remove",
            team_id=team_id,
            resource_type="team_member",
            resource_id=agent_id,
            detail=f"从团队 {team_id} 移除成员 {agent_id}",
        )
        return team
    except ValueError as e:
        _audit(
            request,
            action="team.member.remove",
            team_id=team_id,
            resource_type="team_member",
            resource_id=agent_id,
            detail=f"移除成员失败: {e}",
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/teams/{team_id}/lead")
def set_team_lead(team_id: str, request: Request, req: SetLeadRequest):
    if not req.agentId:
        raise HTTPException(status_code=400, detail="agentId is required")
    try:
        team = team_service.set_lead(team_id, req.agentId)
        _audit(
            request,
            action="team.lead.set",
            team_id=team_id,
            resource_type="team",
            resource_id=team_id,
            detail=f"设置团队负责人为 {req.agentId}",
            metadata={"agentId": req.agentId},
        )
        return team
    except ValueError as e:
        _audit(
            request,
            action="team.lead.set",
            team_id=team_id,
            resource_type="team",
            resource_id=team_id,
            detail=f"设置团队负责人失败: {e}",
            metadata={"agentId": req.agentId},
            ok=False,
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/teams/{team_id}/schedule")
def update_schedule(team_id: str, request: Request, schedule: dict[str, Any]):
    try:
        sync_result = team_service.update_schedule(team_id, schedule)
        team = team_service.get_team(team_id)
        team["scheduleSyncResult"] = sync_result
        _audit(
            request,
            action="team.schedule.update",
            team_id=team_id,
            resource_type="team_schedule",
            resource_id=team_id,
            detail=f"更新团队排班配置 {team_id}",
            metadata={"schedule": schedule},
        )
        return team
    except ValueError as e:
        _audit(
            request,
            action="team.schedule.update",
            team_id=team_id,
            resource_type="team_schedule",
            resource_id=team_id,
            detail=f"更新排班失败: {e}",
            metadata={"schedule": schedule},
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/teams/{team_id}/execution-config")
def update_execution_config(team_id: str, request: Request, req: UpdateExecutionConfigRequest):
    try:
        team = team_service.set_execution_config(
            team_id,
            default_workflow_id=req.defaultWorkflowId,
            lead_mode=req.leadMode,
        )
        _audit(
            request,
            action="team.execution_config.update",
            team_id=team_id,
            resource_type="team_execution_config",
            resource_id=team_id,
            detail=f"更新团队执行配置 {team_id}",
            metadata=req.model_dump(exclude_none=True),
        )
        return team
    except ValueError as e:
        _audit(
            request,
            action="team.execution_config.update",
            team_id=team_id,
            resource_type="team_execution_config",
            resource_id=team_id,
            detail=f"更新执行配置失败: {e}",
            metadata=req.model_dump(exclude_none=True),
            ok=False,
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/teams/{team_id}/shared")
def get_team_md(team_id: str):
    content = team_service.get_team_md(team_id)
    return {"content": content}


@router.put("/teams/{team_id}/shared")
def update_team_md(team_id: str, request: Request, req: UpdateContentRequest):
    team_service.update_team_md(team_id, req.content)
    _audit(
        request,
        action="team.shared.update",
        team_id=team_id,
        resource_type="team_shared",
        resource_id=team_id,
        detail=f"更新团队共享文档 {team_id}",
        metadata={"contentLength": len(req.content or "")},
    )
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


@router.get("/teams/{team_id}/usage/summary")
def get_team_usage_summary(team_id: str, days: int = 7):
    return team_usage_service.get_summary(team_id, days)


@router.get("/teams/{team_id}/usage/trend")
def get_team_usage_trend(team_id: str, days: int = 7):
    return {
        "teamId": team_id,
        "rangeDays": max(1, min(int(days), 90)),
        "items": team_usage_service.get_trend(team_id, days),
    }


@router.get("/teams/{team_id}/usage/breakdown")
def get_team_usage_breakdown(team_id: str, dimension: str = "model", days: int = 7, limit: int = 10):
    normalized_dimension = str(dimension or "model").strip().lower()
    if normalized_dimension == "model":
        items = team_usage_service.get_model_breakdown(team_id, days, limit)
    elif normalized_dimension == "agent":
        items = team_usage_service.get_agent_breakdown(team_id, days, limit)
    elif normalized_dimension == "workflow":
        items = team_usage_service.get_workflow_breakdown(team_id, days, limit)
    else:
        raise HTTPException(status_code=400, detail="dimension must be one of: model, agent, workflow")
    return {
        "teamId": team_id,
        "dimension": normalized_dimension,
        "rangeDays": max(1, min(int(days), 90)),
        "items": items,
    }


@router.get("/teams/{team_id}/audit")
def get_team_audit_logs(
    team_id: str,
    action: Optional[str] = None,
    resourceType: Optional[str] = None,
    ok: Optional[bool] = None,
    query: Optional[str] = None,
    startAt: Optional[str] = None,
    endAt: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    result = audit_log_service.list_logs(
        team_id=team_id,
        action=action,
        resource_type=resourceType,
        ok=ok,
        query=query,
        start_at=startAt,
        end_at=endAt,
        limit=limit,
        offset=offset,
    )
    return {
        "teamId": team_id,
        **result,
    }


@router.post("/teams/{team_id}/dispatch")
async def dispatch_to_team(team_id: str, request: Request, req: DispatchRequest):
    if not req.content or not str(req.content).strip():
        raise HTTPException(status_code=400, detail="content is required")
    try:
        result = await team_dispatch_service.dispatch(
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
        _audit(
            request,
            action="team.dispatch",
            team_id=team_id,
            resource_type="team_dispatch",
            resource_id=team_id,
            detail=f"向团队 {team_id} 分发任务",
            metadata={
                "workflowId": req.workflowId,
                "source": req.source,
                "sessionId": req.sessionId,
                "autoDrain": req.autoDrain,
                "triggerEventId": result.get("triggerEventId"),
            },
            actor=req.actorId,
        )
        return result
    except ValueError as e:
        _audit(
            request,
            action="team.dispatch",
            team_id=team_id,
            resource_type="team_dispatch",
            resource_id=team_id,
            detail=f"团队分发失败: {e}",
            metadata={"workflowId": req.workflowId, "source": req.source},
            ok=False,
            actor=req.actorId,
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/teams/{team_id}/queue/drain")
async def drain_team_queue(team_id: str, request: Request):
    try:
        result = await team_dispatch_service.drain_once(team_id)
        _audit(
            request,
            action="team.queue.drain",
            team_id=team_id,
            resource_type="team_queue",
            resource_id=team_id,
            detail=f"触发团队队列消费 {team_id}",
            metadata={
                "workflowId": result.get("workflowId"),
                "executionId": result.get("executionId"),
                "taskId": result.get("taskId"),
            },
        )
        return result
    except ValueError as e:
        _audit(
            request,
            action="team.queue.drain",
            team_id=team_id,
            resource_type="team_queue",
            resource_id=team_id,
            detail=f"队列消费失败: {e}",
            ok=False,
        )
        raise HTTPException(status_code=400, detail=str(e))
