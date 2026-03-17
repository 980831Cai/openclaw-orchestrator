"""Workflow API routes."""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Any, Optional

from openclaw_orchestrator.services.audit_log_service import audit_log_service
from openclaw_orchestrator.services.team_dispatch_service import team_dispatch_service
from openclaw_orchestrator.services.workflow_engine import (
    WorkflowValidationError,
    workflow_engine,
)
from openclaw_orchestrator.services.workflow_scheduler import workflow_scheduler

router = APIRouter()
logger = logging.getLogger(__name__)


def _attach_schedule_metadata(workflow: dict[str, Any]) -> dict[str, Any]:
    schedule = workflow.get("schedule")
    if not isinstance(schedule, dict):
        return workflow

    next_run_at = workflow_scheduler.get_next_run_at(workflow)
    return {
        **workflow,
        "schedule": {
            **schedule,
            "nextRunAt": next_run_at,
        },
    }


def _request_actor(request: Request, fallback_actor: str | None = None) -> str:
    return audit_log_service.resolve_actor(
        actor_id=fallback_actor or request.headers.get("X-Actor-Id"),
        api_key=request.headers.get("X-API-Key") or request.query_params.get("api_key"),
    )


def _audit(
    request: Request,
    *,
    action: str,
    resource_type: str,
    team_id: str | None = None,
    actor: str | None = None,
    resource_id: str | None = None,
    detail: str,
    metadata: dict[str, Any] | None = None,
    ok: bool = True,
) -> None:
    try:
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
    except Exception:
        logger.exception(
            "audit log write failed",
            extra={
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "request_id": request.headers.get("X-Request-Id"),
            },
        )


def _attach_schedule_metadata(workflow: dict[str, Any]) -> dict[str, Any]:
    schedule = workflow.get("schedule")
    if not isinstance(schedule, dict):
        return workflow

    next_run_at = workflow_scheduler.get_next_run_at(workflow)
    return {
        **workflow,
        "schedule": {
            **schedule,
            "nextRunAt": next_run_at,
        },
    }


class CreateWorkflowRequest(BaseModel):
    teamId: str
    name: str
    nodes: Optional[dict[str, Any]] = None
    edges: Optional[list[dict[str, Any]]] = None
    schedule: Optional[dict[str, Any]] = None


class UpdateWorkflowRequest(BaseModel):
    name: Optional[str] = None
    nodes: Optional[dict[str, Any]] = None
    edges: Optional[list[dict[str, Any]]] = None
    schedule: Optional[dict[str, Any]] = None


class StopExecutionRequest(BaseModel):
    executionId: str


class ExecuteWorkflowRequest(BaseModel):
    content: Optional[str] = None
    source: str = "manual"
    actorId: str = "api"
    sessionId: str = ""
    idempotencyKey: Optional[str] = None
    title: Optional[str] = None
    plannedBy: Optional[str] = None
    autoDrain: bool = True


@router.get("/workflows")
def list_workflows(teamId: Optional[str] = None):
    return [
        _attach_schedule_metadata(workflow)
        for workflow in workflow_engine.list_workflows(teamId)
    ]


@router.get("/workflows/active-executions")
def list_active_executions():
    return workflow_engine.list_active_execution_signals()


@router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: str):
    try:
        return _attach_schedule_metadata(workflow_engine.get_workflow(workflow_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows", status_code=201)
def create_workflow(request: Request, req: CreateWorkflowRequest):
    if not req.teamId or not req.name:
        raise HTTPException(
            status_code=400, detail="teamId and name are required"
        )
    try:
        workflow = _attach_schedule_metadata(
            workflow_engine.create_workflow(
                req.teamId,
                req.name,
                {
                    "nodes": req.nodes or {},
                    "edges": req.edges or [],
                    "schedule": req.schedule,
                },
            )
        )
        _audit(
            request,
            action="workflow.create",
            resource_type="workflow",
            team_id=req.teamId,
            resource_id=workflow["id"],
            detail=f"创建工作流 {workflow['name']}",
            metadata={"name": req.name, "hasSchedule": bool(req.schedule)},
        )
        return workflow
    except WorkflowValidationError as e:
        _audit(
            request,
            action="workflow.create",
            resource_type="workflow",
            team_id=req.teamId,
            detail=f"创建工作流失败: {e}",
            metadata={"name": req.name},
            ok=False,
        )
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/workflows/{workflow_id}")
def update_workflow(workflow_id: str, request: Request, req: UpdateWorkflowRequest):
    existing = None
    try:
        existing = workflow_engine.get_workflow(workflow_id)
        workflow = _attach_schedule_metadata(
            workflow_engine.update_workflow(
                workflow_id, req.model_dump(exclude_none=True)
            )
        )
        _audit(
            request,
            action="workflow.update",
            resource_type="workflow",
            team_id=str(workflow.get("teamId") or "").strip() or str(existing.get("teamId") or "").strip() or None,
            resource_id=workflow_id,
            detail=f"更新工作流 {workflow.get('name') or workflow_id}",
            metadata=req.model_dump(exclude_none=True),
        )
        return workflow
    except WorkflowValidationError as e:
        _audit(
            request,
            action="workflow.update",
            resource_type="workflow",
            team_id=str(existing.get("teamId") or "").strip() or None if existing else None,
            resource_id=workflow_id,
            detail=f"更新工作流失败: {e}",
            metadata=req.model_dump(exclude_none=True),
            ok=False,
        )
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        _audit(
            request,
            action="workflow.update",
            resource_type="workflow",
            team_id=str(existing.get("teamId") or "").strip() or None if existing else None,
            resource_id=workflow_id,
            detail=f"更新工作流失败: {e}",
            metadata=req.model_dump(exclude_none=True),
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: str, request: Request):
    existing = None
    try:
        existing = workflow_engine.get_workflow(workflow_id)
        workflow_engine.delete_workflow(workflow_id)
        _audit(
            request,
            action="workflow.delete",
            resource_type="workflow",
            team_id=str(existing.get("teamId") or "").strip() or None,
            resource_id=workflow_id,
            detail=f"删除工作流 {existing.get('name') or workflow_id}",
        )
        return {"message": "Workflow deleted"}
    except ValueError as e:
        _audit(
            request,
            action="workflow.delete",
            resource_type="workflow",
            team_id=str(existing.get("teamId") or "").strip() or None if existing else None,
            resource_id=workflow_id,
            detail=f"删除工作流失败: {e}",
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, request: Request, req: Optional[ExecuteWorkflowRequest] = None):
    workflow = None
    request_model = req or ExecuteWorkflowRequest()
    try:
        workflow = workflow_engine.get_workflow(workflow_id)
        dispatch_content = request_model.content or f"手动触发工作流 {workflow.get('name') or workflow_id}"
        result = await team_dispatch_service.dispatch(
            team_id=str(workflow.get("teamId") or "").strip(),
            workflow_id=workflow_id,
            content=dispatch_content,
            source=request_model.source,
            actor_id=request_model.actorId,
            session_id=request_model.sessionId,
            idempotency_key=request_model.idempotencyKey,
            title=request_model.title or f"手动执行: {workflow.get('name') or workflow_id}",
            planned_by=request_model.plannedBy,
            auto_drain=request_model.autoDrain,
        )
        _audit(
            request,
            actor=request_model.actorId,
            action="workflow.execute",
            resource_type="workflow",
            team_id=str(workflow.get("teamId") or "").strip() or None,
            resource_id=workflow_id,
            detail=f"触发工作流执行 {workflow.get('name') or workflow_id}",
            metadata={
                "source": request_model.source,
                "sessionId": request_model.sessionId,
                "autoDrain": request_model.autoDrain,
                "triggerEventId": result.get("triggerEventId"),
            },
        )
        return result
    except WorkflowValidationError as e:
        _audit(
            request,
            actor=request_model.actorId,
            action="workflow.execute",
            resource_type="workflow",
            team_id=str(workflow.get("teamId") or "").strip() or None if workflow else None,
            resource_id=workflow_id,
            detail=f"触发工作流执行失败: {e}",
            metadata={"source": request_model.source},
            ok=False,
        )
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        _audit(
            request,
            actor=request_model.actorId,
            action="workflow.execute",
            resource_type="workflow",
            team_id=str(workflow.get("teamId") or "").strip() or None if workflow else None,
            resource_id=workflow_id,
            detail=f"触发工作流执行失败: {e}",
            metadata={"source": request_model.source},
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows/{workflow_id}/stop")
def stop_workflow(workflow_id: str, request: Request, req: StopExecutionRequest):
    if not req.executionId:
        raise HTTPException(status_code=400, detail="executionId is required")
    workflow = None
    try:
        execution = workflow_engine.get_execution(req.executionId)
    except ValueError as e:
        _audit(
            request,
            action="workflow.stop",
            resource_type="workflow_execution",
            resource_id=req.executionId,
            detail=f"停止执行失败: {e}",
            ok=False,
        )
        raise HTTPException(status_code=404, detail=str(e))

    if execution.get("workflowId") != workflow_id:
        _audit(
            request,
            action="workflow.stop",
            resource_type="workflow_execution",
            resource_id=req.executionId,
            detail="停止执行失败: executionId does not belong to the requested workflow",
            ok=False,
        )
        raise HTTPException(
            status_code=400,
            detail="executionId does not belong to the requested workflow",
        )

    workflow = workflow_engine.get_workflow(workflow_id)
    workflow_engine.stop_execution(req.executionId)
    _audit(
        request,
        action="workflow.stop",
        resource_type="workflow_execution",
        team_id=str(workflow.get("teamId") or "").strip() or None,
        resource_id=req.executionId,
        detail=f"停止工作流执行 {req.executionId}",
        metadata={"workflowId": workflow_id},
    )
    return {"message": "Execution stopped"}


@router.get("/workflows/{workflow_id}/executions")
def get_executions(workflow_id: str):
    return workflow_engine.get_executions_by_workflow(workflow_id)


@router.get("/executions/{execution_id}")
def get_execution(execution_id: str):
    try:
        return workflow_engine.get_execution(execution_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
