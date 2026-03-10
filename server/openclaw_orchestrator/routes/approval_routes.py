"""Approval API routes.

Endpoints for managing workflow approval nodes:
- Approve / reject an approval
- List approvals (with optional execution_id filter)
- List pending approvals
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.workflow_engine import workflow_engine

router = APIRouter(prefix="/approvals", tags=["approvals"])


# ── Request models ──

class RejectRequest(BaseModel):
    reject_reason: str = ""


# ── Approve ──

@router.post("/{approval_id}/approve")
async def approve(approval_id: str):
    """Approve a pending approval and resume the workflow."""
    try:
        return await workflow_engine.resolve_approval(
            approval_id,
            approved=True,
            resolved_by="human",
        )
    except ValueError as exc:
        detail = str(exc)
        if "not found" in detail.lower():
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=400, detail=detail)


# ── Reject ──

@router.post("/{approval_id}/reject")
async def reject(approval_id: str, body: RejectRequest):
    """Reject a pending approval and stop the workflow."""
    try:
        return await workflow_engine.resolve_approval(
            approval_id,
            approved=False,
            reject_reason=body.reject_reason,
            resolved_by="human",
        )
    except ValueError as exc:
        detail = str(exc)
        if "not found" in detail.lower():
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=400, detail=detail)


# ── List approvals ──

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


# ── Pending approvals ──

@router.get("/pending")
def list_pending_approvals():
    """List all pending approvals."""
    db = get_db()
    rows = db.execute(
        "SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


# ── Helpers ──

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
