"""Live feed snapshot service.

Provides a unified snapshot for dashboard/monitor refresh so recent
messages, agent-to-agent communication, workflow signals, and notifications
can be restored without waiting for new WebSocket events.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from sqlite3 import Error as SQLiteError
from typing import Any

from openclaw_orchestrator.database.db import get_db

try:
    from openclaw_orchestrator.services.workflow_scheduler import workflow_scheduler
except Exception:  # pragma: no cover - optional dependency fallback
    class _WorkflowSchedulerFallback:
        @staticmethod
        def get_next_run_at(_workflow: dict[str, Any]) -> None:
            return None

    workflow_scheduler = _WorkflowSchedulerFallback()


_MESSAGE_TABLE = "live_feed_messages"
_EVENT_TABLE = "live_feed_events"


class LiveFeedService:
    """Keep bounded recent live-feed buffers and build unified snapshots."""

    def __init__(self) -> None:
        self._recent_messages: list[dict[str, Any]] = []
        self._recent_events: list[dict[str, Any]] = []
        self._message_ids: set[str] = set()
        self._event_ids: set[str] = set()
        self._max_messages = 300
        self._max_events = 300
        self._hydrate_from_db()

    def record_message(self, message: dict[str, Any]) -> None:
        self._record_item(
            table=_MESSAGE_TABLE,
            payload=message,
            cache=self._recent_messages,
            id_cache=self._message_ids,
            max_items=self._max_messages,
        )

    def record_event(self, event: dict[str, Any]) -> None:
        self._record_item(
            table=_EVENT_TABLE,
            payload=event,
            cache=self._recent_events,
            id_cache=self._event_ids,
            max_items=self._max_events,
        )

    def get_recent_messages(self, limit: int = 50) -> list[dict[str, Any]]:
        normalized_limit = max(1, min(limit, self._max_messages))
        items = self._recent_messages[-normalized_limit:]
        return list(reversed(items))

    def get_recent_events(self, limit: int = 50) -> list[dict[str, Any]]:
        normalized_limit = max(1, min(limit, self._max_events))
        items = self._recent_events[-normalized_limit:]
        return list(reversed(items))

    def get_snapshot(self, limit: int = 50) -> dict[str, Any]:
        normalized_limit = max(1, min(limit, 200))

        from openclaw_orchestrator.services.notification_service import notification_service
        from openclaw_orchestrator.services.workflow_engine import workflow_engine

        scheduled_workflows: list[dict[str, Any]] = []
        for workflow in workflow_engine.list_workflows():
            schedule = workflow.get("schedule")
            if not isinstance(schedule, dict):
                continue
            scheduled_workflows.append(
                {
                    **workflow,
                    "schedule": {
                        **schedule,
                        "nextRunAt": workflow_scheduler.get_next_run_at(workflow),
                    },
                }
            )

        return {
            "events": self.get_recent_events(normalized_limit),
            "messages": self.get_recent_messages(normalized_limit),
            "workflowSignals": workflow_engine.list_active_execution_signals(),
            "scheduledWorkflows": scheduled_workflows,
            "notifications": notification_service.get_notifications(limit=normalized_limit),
            "unreadCount": notification_service.get_unread_count(),
        }

    def _record_item(
        self,
        *,
        table: str,
        payload: dict[str, Any],
        cache: list[dict[str, Any]],
        id_cache: set[str],
        max_items: int,
    ) -> None:
        record = dict(payload)
        record_id = self._resolve_record_id(table, record)
        record["id"] = record_id
        recorded_at = self._now_iso()

        self._upsert_cache_item(cache, id_cache, record, record_id, max_items)
        self._persist_record(table, record_id, record, recorded_at, max_items)

    def _hydrate_from_db(self) -> None:
        self._recent_messages = self._load_records(_MESSAGE_TABLE, self._max_messages)
        self._message_ids = {
            str(item.get("id") or "").strip()
            for item in self._recent_messages
            if str(item.get("id") or "").strip()
        }
        self._recent_events = self._load_records(_EVENT_TABLE, self._max_events)
        self._event_ids = {
            str(item.get("id") or "").strip()
            for item in self._recent_events
            if str(item.get("id") or "").strip()
        }

    def _load_records(self, table: str, limit: int) -> list[dict[str, Any]]:
        try:
            db = get_db()
            rows = db.execute(
                f"""
                SELECT payload_json
                FROM (
                    SELECT payload_json, recorded_at
                    FROM {table}
                    ORDER BY recorded_at DESC
                    LIMIT ?
                ) recent
                ORDER BY recorded_at ASC
                """,
                (limit,),
            ).fetchall()
        except SQLiteError:
            return []

        items: list[dict[str, Any]] = []
        for row in rows:
            payload_json = row[0] if not isinstance(row, dict) else row.get("payload_json")
            if not isinstance(payload_json, str):
                continue
            try:
                payload = json.loads(payload_json)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                items.append(payload)
        return items

    def _persist_record(
        self,
        table: str,
        record_id: str,
        payload: dict[str, Any],
        recorded_at: str,
        max_items: int,
    ) -> None:
        try:
            db = get_db()
            db.execute(
                f"""
                INSERT INTO {table} (id, payload_json, recorded_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    recorded_at = excluded.recorded_at
                """,
                (record_id, json.dumps(payload, ensure_ascii=False), recorded_at),
            )
            db.execute(
                f"""
                DELETE FROM {table}
                WHERE id NOT IN (
                    SELECT id
                    FROM {table}
                    ORDER BY recorded_at DESC
                    LIMIT ?
                )
                """,
                (max_items,),
            )
            db.commit()
        except SQLiteError:
            return

    def _upsert_cache_item(
        self,
        cache: list[dict[str, Any]],
        id_cache: set[str],
        record: dict[str, Any],
        record_id: str,
        max_items: int,
    ) -> None:
        existing_index = next(
            (
                index
                for index, item in enumerate(cache)
                if str(item.get("id") or "").strip() == record_id
            ),
            None,
        )
        if existing_index is not None:
            cache.pop(existing_index)
        else:
            id_cache.add(record_id)

        cache.append(record)
        overflow = len(cache) - max_items
        if overflow <= 0:
            return

        removed = cache[:overflow]
        del cache[:overflow]
        for item in removed:
            removed_id = str(item.get("id") or "").strip()
            if not removed_id:
                continue
            if any(str(remaining.get("id") or "").strip() == removed_id for remaining in cache):
                continue
            id_cache.discard(removed_id)

    def _resolve_record_id(self, table: str, payload: dict[str, Any]) -> str:
        raw_id = str(payload.get("id") or "").strip()
        if raw_id:
            return raw_id

        serialized = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
        prefix = "msg" if table == _MESSAGE_TABLE else "evt"
        digest = hashlib.sha1(serialized.encode("utf-8")).hexdigest()
        return f"{prefix}-{digest}"

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


live_feed_service = LiveFeedService()
