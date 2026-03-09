"""Notification API routes.

Endpoints for managing notifications:
- List notifications (paginated)
- Mark single notification as read
- Mark all notifications as read
- Get unread count
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from openclaw_orchestrator.services.notification_service import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ── List notifications ──

@router.get("")
def list_notifications(limit: int = 50, offset: int = 0):
    """Get notifications ordered by creation time (newest first)."""
    notifications = notification_service.get_notifications(limit=limit, offset=offset)
    return notifications


# ── Unread count ──

@router.get("/unread-count")
def get_unread_count():
    """Get the number of unread notifications."""
    count = notification_service.get_unread_count()
    return {"unreadCount": count}


# ── Mark single as read ──

@router.put("/{notification_id}/read")
def mark_as_read(notification_id: str):
    """Mark a single notification as read."""
    updated = notification_service.mark_as_read(notification_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


# ── Mark all as read ──

@router.put("/read-all")
def mark_all_as_read():
    """Mark all unread notifications as read."""
    count = notification_service.mark_all_as_read()
    return {"success": True, "count": count}
