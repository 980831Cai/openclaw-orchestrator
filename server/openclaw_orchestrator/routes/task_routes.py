"""Task API routes (including artifact endpoints)."""

import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from openclaw_orchestrator.services.task_service import task_service

router = APIRouter()

# Safe filename/ext pattern: alphanumeric, hyphens, underscores, dots (no path separators or ..)
_SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")
_SAFE_EXT_RE = re.compile(r"^[a-zA-Z0-9]+$")


class CreateTaskRequest(BaseModel):
    title: str
    description: str = ""
    participantAgentIds: list[str] = []


class UpdateTaskStatusRequest(BaseModel):
    status: str
    summary: Optional[str] = None


class CreateArtifactRequest(BaseModel):
    agentId: str
    name: str
    ext: str
    content: str
    description: Optional[str] = None


# ────── Task CRUD ──────

@router.post("/teams/{team_id}/tasks", status_code=201)
def create_task(team_id: str, req: CreateTaskRequest):
    if not req.title:
        raise HTTPException(status_code=400, detail="Task title is required")
    return task_service.create_task(
        team_id, req.title, req.description, req.participantAgentIds
    )


@router.get("/teams/{team_id}/tasks")
def list_tasks(team_id: str, status: Optional[str] = None):
    return task_service.list_tasks(team_id, status)


@router.get("/tasks/{task_id}")
def get_task(task_id: str):
    try:
        return task_service.get_task(task_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/tasks/{task_id}/status")
def update_task_status(task_id: str, req: UpdateTaskStatusRequest):
    try:
        if req.status == "completed":
            return task_service.complete_task(task_id, req.summary)
        return task_service.update_task_status(task_id, req.status)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/tasks/{task_id}/content")
def get_task_content(task_id: str):
    try:
        content = task_service.get_task_content(task_id)
        return {"content": content}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ────── Artifact endpoints ──────

@router.post("/tasks/{task_id}/artifacts", status_code=201)
def create_artifact(task_id: str, req: CreateArtifactRequest):
    if not req.agentId or not req.name or not req.ext:
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: agentId, name, ext, content",
        )

    # Security: ext must be a simple extension (alphanumeric only, no dots/slashes/..)
    if not _SAFE_EXT_RE.match(req.ext):
        raise HTTPException(status_code=400, detail="Invalid extension: must be alphanumeric only")

    # Security: name must also be safe
    if not _SAFE_FILENAME_RE.match(req.name):
        raise HTTPException(status_code=400, detail="Invalid artifact name")

    try:
        return task_service.add_artifact(
            task_id, req.agentId, req.name, req.ext, req.content, req.description
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/{task_id}/artifacts")
def list_artifacts(task_id: str):
    try:
        return task_service.get_artifacts(task_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/{task_id}/artifacts/{filename}/content")
def get_artifact_content(task_id: str, filename: str):
    # Security: filename must match safe pattern (no path traversal)
    if not _SAFE_FILENAME_RE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    try:
        content = task_service.get_artifact_content(task_id, filename)
        return {"content": content, "filename": filename}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tasks/{task_id}/artifacts/{filename}")
def delete_artifact(task_id: str, filename: str):
    # Security: filename must match safe pattern
    if not _SAFE_FILENAME_RE.match(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    try:
        task_service.delete_artifact(task_id, filename)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
