"""Notification service for creating, querying, and managing notifications.

Notifications are persisted in SQLite and pushed to connected clients
via WebSocket broadcast in real-time.
"""

from __future__ import annotations

import uuid
from typing import Any

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.utils.time import utc_now_iso
from openclaw_orchestrator.websocket.ws_handler import broadcast


class NotificationService:
    """Handles notification CRUD and real-time push via WebSocket."""

    # ── Create ──────────────────────────────────────────────

    def create_notification(
        self,
        type: str,
        title: str,
        message: str = "",
        execution_id: str | None = None,
        node_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a notification, persist it, and broadcast via WebSocket.

        Args:
            type: One of 'approval_required', 'node_completed',
                  'workflow_completed', 'workflow_error'.
            title: Short notification title.
            message: Detailed notification body.
            execution_id: Related workflow execution ID (optional).
            node_id: Related workflow node ID (optional).

        Returns:
            The created notification as a dict.
        """
        notification_id = str(uuid.uuid4())
        now = utc_now_iso()

        db = get_db()
        db.execute(
            """
            INSERT INTO notifications (id, type, title, message, execution_id, node_id, read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (notification_id, type, title, message, execution_id, node_id, now),
        )
        db.commit()

        notification = {
            "id": notification_id,
            "type": type,
            "title": title,
            "message": message,
            "executionId": execution_id,
            "nodeId": node_id,
            "read": False,
            "createdAt": now,
        }

        # Push to all connected WebSocket clients
        broadcast({
            "type": "notification",
            "payload": notification,
            "timestamp": now,
        })

        return notification

    # ── Query ───────────────────────────────────────────────

    def get_notifications(
        self,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get notifications ordered by creation time (newest first).

        Args:
            limit: Max number of notifications to return.
            offset: Number of notifications to skip.

        Returns:
            List of notification dicts.
        """
        db = get_db()
        rows = db.execute(
            """
            SELECT id, type, title, message, execution_id, node_id, read, created_at
            FROM notifications
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()

        return [self._row_to_dict(row) for row in rows]

    def get_unread_count(self) -> int:
        """Return the number of unread notifications."""
        db = get_db()
        row = db.execute(
            "SELECT COUNT(*) FROM notifications WHERE read = 0"
        ).fetchone()
        return row[0] if row else 0

    # ── Update ──────────────────────────────────────────────

    def mark_as_read(self, notification_id: str) -> bool:
        """Mark a single notification as read.

        Returns:
            True if a row was updated, False if the id was not found.
        """
        db = get_db()
        cursor = db.execute(
            "UPDATE notifications SET read = 1 WHERE id = ?",
            (notification_id,),
        )
        db.commit()
        return cursor.rowcount > 0

    def mark_all_as_read(self) -> int:
        """Mark all unread notifications as read.

        Returns:
            Number of notifications marked as read.
        """
        db = get_db()
        cursor = db.execute("UPDATE notifications SET read = 1 WHERE read = 0")
        db.commit()
        return cursor.rowcount

    # ── Helpers ─────────────────────────────────────────────

    @staticmethod
    def _row_to_dict(row) -> dict[str, Any]:
        """Convert a sqlite3.Row to a camelCase dict for the frontend."""
        return {
            "id": row["id"],
            "type": row["type"],
            "title": row["title"],
            "message": row["message"],
            "executionId": row["execution_id"],
            "nodeId": row["node_id"],
            "read": bool(row["read"]),
            "createdAt": row["created_at"],
        }


# Singleton instance
notification_service = NotificationService()
