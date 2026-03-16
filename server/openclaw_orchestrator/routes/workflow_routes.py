"""Workflow API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional

from openclaw_orchestrator.services.team_dispatch_service import team_dispatch_service
from openclaw_orchestrator.services.workflow_engine import (
    WorkflowValidationError,
    workflow_engine,
)
from openclaw_orchestrator.services.workflow_scheduler import workflow_scheduler

router = APIRouter()


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
def create_workflow(req: CreateWorkflowRequest):
    if not req.teamId or not req.name:
        raise HTTPException(
            status_code=400, detail="teamId and name are required"
        )
    try:
        return _attach_schedule_metadata(
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
    except WorkflowValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/workflows/{workflow_id}")
def update_workflow(workflow_id: str, req: UpdateWorkflowRequest):
    try:
        return _attach_schedule_metadata(
            workflow_engine.update_workflow(
                workflow_id, req.model_dump(exclude_none=True)
            )
        )
    except WorkflowValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: str):
    try:
        workflow_engine.delete_workflow(workflow_id)
        return {"message": "Workflow deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, req: Optional[ExecuteWorkflowRequest] = None):
    try:
        workflow = workflow_engine.get_workflow(workflow_id)
        request = req or ExecuteWorkflowRequest()
        dispatch_content = request.content or f"手动触发工作流 {workflow.get('name') or workflow_id}"
        return await team_dispatch_service.dispatch(
            team_id=str(workflow.get("teamId") or "").strip(),
            workflow_id=workflow_id,
            content=dispatch_content,
            source=request.source,
            actor_id=request.actorId,
            session_id=request.sessionId,
            idempotency_key=request.idempotencyKey,
            title=request.title or f"手动执行: {workflow.get('name') or workflow_id}",
            planned_by=request.plannedBy,
            auto_drain=request.autoDrain,
        )
    except WorkflowValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows/{workflow_id}/stop")
def stop_workflow(workflow_id: str, req: StopExecutionRequest):
    if not req.executionId:
        raise HTTPException(status_code=400, detail="executionId is required")
    try:
        execution = workflow_engine.get_execution(req.executionId)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if execution.get("workflowId") != workflow_id:
        raise HTTPException(
            status_code=400,
            detail="executionId does not belong to the requested workflow",
        )

    workflow_engine.stop_execution(req.executionId)
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
