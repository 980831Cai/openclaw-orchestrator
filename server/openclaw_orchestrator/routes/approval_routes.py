"""Approval API routes.

Endpoints for managing workflow approval nodes:
- Approve / reject an approval
- List approvals (with optional execution_id filter)
- List pending approvals
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.workflow_engine import workflow_engine
from openclaw_orchestrator.services.notification_service import notification_service
from openclaw_orchestrator.websocket.ws_handler import broadcast

router = APIRouter(prefix="/approvals", tags=["approvals"])


# ── Request models ──

class ApproveRequest(BaseModel):
    pass  # No body needed for approve


class RejectRequest(BaseModel):
    reject_reason: str = ""


# ── Approve ──

@router.post("/{approval_id}/approve")
async def approve(approval_id: str):
    """Approve a pending approval and resume the workflow."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM approvals WHERE id = ?", (approval_id,)
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Approval is already {row['status']}",
        )

    # Update approval record
    db.execute(
        "UPDATE approvals SET status = 'approved', resolved_at = datetime('now') WHERE id = ?",
        (approval_id,),
    )
    db.commit()

    # Broadcast approval status change
    broadcast({
        "type": "approval_update",
        "payload": {
            "id": approval_id,
            "executionId": row["execution_id"],
            "nodeId": row["node_id"],
            "status": "approved",
        },
        "timestamp": datetime.utcnow().isoformat(),
    })

    # Resume workflow execution
    execution = await workflow_engine.resume_execution(
        execution_id=row["execution_id"],
        approved=True,
    )

    return {
        "success": True,
        "approval": _row_to_dict(
            db.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
        ),
        "execution": execution,
    }


# ── Reject ──

@router.post("/{approval_id}/reject")
async def reject(approval_id: str, body: RejectRequest):
    """Reject a pending approval and stop the workflow."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM approvals WHERE id = ?", (approval_id,)
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Approval is already {row['status']}",
        )

    # Update approval record
    db.execute(
        "UPDATE approvals SET status = 'rejected', reject_reason = ?, resolved_at = datetime('now') WHERE id = ?",
        (body.reject_reason, approval_id),
    )
    db.commit()

    # Broadcast approval status change
    broadcast({
        "type": "approval_update",
        "payload": {
            "id": approval_id,
            "executionId": row["execution_id"],
            "nodeId": row["node_id"],
            "status": "rejected",
            "rejectReason": body.reject_reason,
        },
        "timestamp": datetime.utcnow().isoformat(),
    })

    # Resume (reject) workflow execution
    execution = await workflow_engine.resume_execution(
        execution_id=row["execution_id"],
        approved=False,
        reject_reason=body.reject_reason,
    )

    return {
        "success": True,
        "approval": _row_to_dict(
            db.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
        ),
        "execution": execution,
    }


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
