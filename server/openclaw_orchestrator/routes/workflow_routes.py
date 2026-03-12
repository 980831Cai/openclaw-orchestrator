"""Workflow API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional

from openclaw_orchestrator.services.workflow_engine import workflow_engine

router = APIRouter()


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


@router.get("/workflows")
def list_workflows(teamId: Optional[str] = None):
    return workflow_engine.list_workflows(teamId)


@router.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: str):
    try:
        return workflow_engine.get_workflow(workflow_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows", status_code=201)
def create_workflow(req: CreateWorkflowRequest):
    if not req.teamId or not req.name:
        raise HTTPException(
            status_code=400, detail="teamId and name are required"
        )
    return workflow_engine.create_workflow(
        req.teamId,
        req.name,
        {
            "nodes": req.nodes or {},
            "edges": req.edges or [],
            "schedule": req.schedule,
        },
    )


@router.put("/workflows/{workflow_id}")
def update_workflow(workflow_id: str, req: UpdateWorkflowRequest):
    try:
        return workflow_engine.update_workflow(
            workflow_id, req.model_dump(exclude_none=True)
        )
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
async def execute_workflow(workflow_id: str):
    try:
        return await workflow_engine.execute_workflow(workflow_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/workflows/{workflow_id}/stop")
def stop_workflow(workflow_id: str, req: StopExecutionRequest):
    if not req.executionId:
        raise HTTPException(status_code=400, detail="executionId is required")
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
