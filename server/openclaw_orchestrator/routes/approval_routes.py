"""Approval API routes.

Endpoints for managing workflow approval nodes:
- Approve / reject an approval
- List approvals (with optional execution_id filter)
- List pending approvals
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.audit_log_service import audit_log_service
from openclaw_orchestrator.services.workflow_engine import workflow_engine

router = APIRouter(prefix="/approvals", tags=["approvals"])


class RejectRequest(BaseModel):
    reject_reason: str = ""


def _request_actor(request: Request) -> str:
    return audit_log_service.resolve_actor(
        actor_id=request.headers.get("X-Actor-Id"),
        api_key=request.headers.get("X-API-Key") or request.query_params.get("api_key"),
    )


def _approval_context(approval_id: str) -> dict[str, str | None]:
    db = get_db()
    row = db.execute(
        """
        SELECT a.id, a.execution_id, a.node_id, we.workflow_id, w.team_id
        FROM approvals a
        LEFT JOIN workflow_executions we ON we.id = a.execution_id
        LEFT JOIN workflows w ON w.id = we.workflow_id
        WHERE a.id = ?
        """,
        (approval_id,),
    ).fetchone()
    if not row:
        return {
            "approvalId": approval_id,
            "executionId": None,
            "nodeId": None,
            "workflowId": None,
            "teamId": None,
        }
    return {
        "approvalId": row["id"],
        "executionId": row["execution_id"],
        "nodeId": row["node_id"],
        "workflowId": row["workflow_id"],
        "teamId": row["team_id"],
    }


def _audit(
    request: Request,
    *,
    action: str,
    detail: str,
    approval_ctx: dict[str, str | None],
    ok: bool = True,
    metadata: dict | None = None,
) -> None:
    audit_log_service.log_event(
        team_id=approval_ctx.get("teamId"),
        actor=_request_actor(request),
        action=action,
        resource_type="approval",
        resource_id=approval_ctx.get("approvalId"),
        detail=detail,
        metadata={
            "executionId": approval_ctx.get("executionId"),
            "workflowId": approval_ctx.get("workflowId"),
            "nodeId": approval_ctx.get("nodeId"),
            **(metadata or {}),
        },
        ok=ok,
        request_id=request.headers.get("X-Request-Id"),
    )


@router.post("/{approval_id}/approve")
async def approve(approval_id: str, request: Request):
    """Approve a pending approval and resume the workflow."""
    approval_ctx = _approval_context(approval_id)
    try:
        result = await workflow_engine.resolve_approval(
            approval_id,
            approved=True,
            resolved_by="human",
        )
        _audit(
            request,
            action="approval.approve",
            detail=f"通过审批 {approval_id}",
            approval_ctx=approval_ctx,
        )
        return result
    except ValueError as exc:
        detail = str(exc)
        _audit(
            request,
            action="approval.approve",
            detail=f"通过审批失败: {detail}",
            approval_ctx=approval_ctx,
            ok=False,
        )
        if "not found" in detail.lower():
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=400, detail=detail)


@router.post("/{approval_id}/reject")
async def reject(approval_id: str, request: Request, body: RejectRequest):
    """Reject a pending approval and stop the workflow."""
    approval_ctx = _approval_context(approval_id)
    try:
        result = await workflow_engine.resolve_approval(
            approval_id,
            approved=False,
            reject_reason=body.reject_reason,
            resolved_by="human",
        )
        _audit(
            request,
            action="approval.reject",
            detail=f"驳回审批 {approval_id}",
            approval_ctx=approval_ctx,
            metadata={"rejectReason": body.reject_reason},
        )
        return result
    except ValueError as exc:
        detail = str(exc)
        _audit(
            request,
            action="approval.reject",
            detail=f"驳回审批失败: {detail}",
            approval_ctx=approval_ctx,
            metadata={"rejectReason": body.reject_reason},
            ok=False,
        )
        if "not found" in detail.lower():
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=400, detail=detail)


@router.get("")
def list_approvals(execution_id: Optional[str] = None):
    """List approvals, optionally filtered by execution_id."""
    db = get_db()
    if execution_id:
        rows = db.execute(
            "SELECT * FROM approvals WHERE execution_id = ? ORDER BY created_at DESC",
            (execution_id,),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM approvals ORDER BY created_at DESC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.get("/pending")
def list_pending_approvals():
    """List all pending approvals."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def _row_to_dict(row) -> dict:
    """Convert a sqlite3.Row to a camelCase dict."""
    return {
        "id": row["id"],
        "executionId": row["execution_id"],
        "nodeId": row["node_id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "rejectReason": row["reject_reason"],
        "createdAt": row["created_at"],
        "resolvedAt": row["resolved_at"],
    }
