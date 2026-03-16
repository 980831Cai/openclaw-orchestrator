from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.task_service import task_service
from openclaw_orchestrator.services.team_service import team_service
from openclaw_orchestrator.services.workflow_engine import workflow_engine


class TeamDispatchService:
    """Dispatch demands into team tasks and queue-driven workflow execution."""

    @staticmethod
    def _utc_now_iso() -> str:
        return datetime.now(UTC).isoformat()

    @staticmethod
    def _derive_task_title(content: str) -> str:
        text = str(content or "").strip()
        if not text:
            return "团队任务"
        first_line = text.splitlines()[0].strip()
        if len(first_line) <= 64:
            return first_line
        return first_line[:64].rstrip() + "..."

    @staticmethod
    def _build_idempotency_key(
        *,
        team_id: str,
        workflow_id: str,
        source: str,
        actor_id: str,
        session_id: str,
        content: str,
        explicit: str | None,
    ) -> str:
        normalized_explicit = str(explicit or "").strip()
        if normalized_explicit:
            return normalized_explicit

        digest_src = "|".join(
            [
                str(team_id or "").strip(),
                str(workflow_id or "").strip(),
                str(source or "").strip(),
                str(actor_id or "").strip(),
                str(session_id or "").strip(),
                str(content or "").strip(),
            ]
        )
        return hashlib.sha256(digest_src.encode("utf-8")).hexdigest()

    @staticmethod
    def _resolve_team_workflow(team_id: str, workflow_id: str | None) -> str:
        db = get_db()
        requested = str(workflow_id or "").strip()
        if requested:
            row = db.execute(
                "SELECT id, team_id FROM workflows WHERE id = ?",
                (requested,),
            ).fetchone()
            if not row:
                raise ValueError(f"Workflow not found: {requested}")
            if str(row["team_id"] or "") != team_id:
                raise ValueError("workflow.team_id and task.team_id mismatch")
            return requested

        team = team_service.get_team(team_id)
        default_workflow_id = str(team.get("defaultWorkflowId") or "").strip()
        if not default_workflow_id:
            raise ValueError("Team default workflow is not configured")

        row = db.execute(
            "SELECT id, team_id FROM workflows WHERE id = ?",
            (default_workflow_id,),
        ).fetchone()
        if not row:
            raise ValueError(f"Default workflow not found: {default_workflow_id}")
        if str(row["team_id"] or "") != team_id:
            raise ValueError("workflow.team_id and task.team_id mismatch")
        return default_workflow_id

    def _create_or_get_trigger_event(
        self,
        *,
        team_id: str,
        workflow_id: str,
        source: str,
        actor_id: str,
        session_id: str,
        idempotency_key: str,
        request_payload: dict[str, Any],
        dedupe_window_hours: int = 24,
    ) -> tuple[dict[str, Any], bool]:
        db = get_db()
        event_id = str(uuid.uuid4())
        now = self._utc_now_iso()
        window_hours = max(int(dedupe_window_hours), 1)

        existing = db.execute(
            """
            SELECT *
            FROM trigger_events
            WHERE team_id = ?
              AND workflow_id = ?
              AND idempotency_key = ?
              AND created_at >= datetime('now', ?)
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (team_id, workflow_id, idempotency_key, f"-{window_hours} hours"),
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE trigger_events SET status = 'deduplicated', updated_at = ? WHERE id = ?",
                (now, existing["id"]),
            )
            db.commit()
            latest = db.execute(
                "SELECT * FROM trigger_events WHERE id = ?",
                (existing["id"],),
            ).fetchone()
            return dict(latest), False

        db.execute(
            """
            INSERT INTO trigger_events (
                id, team_id, workflow_id, source, actor_id, session_id,
                idempotency_key, request_payload_json, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?)
            """,
            (
                event_id,
                team_id,
                workflow_id,
                source,
                actor_id,
                session_id,
                idempotency_key,
                json.dumps(request_payload, ensure_ascii=False),
                now,
                now,
            ),
        )
        db.commit()
        row = db.execute(
            "SELECT * FROM trigger_events WHERE id = ?",
            (event_id,),
        ).fetchone()
        return dict(row), True

    async def dispatch(
        self,
        *,
        team_id: str,
        content: str,
        source: str,
        actor_id: str,
        session_id: str = "",
        workflow_id: str | None = None,
        idempotency_key: str | None = None,
        title: str | None = None,
        planned_by: str | None = None,
        auto_drain: bool = True,
    ) -> dict[str, Any]:
        normalized_team_id = str(team_id or "").strip()
        if not normalized_team_id:
            raise ValueError("team_id is required")
        normalized_content = str(content or "").strip()
        if not normalized_content:
            raise ValueError("content is required")

        resolved_workflow_id = self._resolve_team_workflow(normalized_team_id, workflow_id)
        dedupe_key = self._build_idempotency_key(
            team_id=normalized_team_id,
            workflow_id=resolved_workflow_id,
            source=source,
            actor_id=actor_id,
            session_id=session_id,
            content=normalized_content,
            explicit=idempotency_key,
        )

        trigger_event, created = self._create_or_get_trigger_event(
            team_id=normalized_team_id,
            workflow_id=resolved_workflow_id,
            source=source,
            actor_id=actor_id,
            session_id=session_id,
            idempotency_key=dedupe_key,
            request_payload={
                "teamId": normalized_team_id,
                "workflowId": resolved_workflow_id,
                "source": source,
                "actorId": actor_id,
                "sessionId": session_id,
                "content": normalized_content,
            },
        )

        if not created:
            linked_task_id = str(trigger_event.get("linked_task_id") or "").strip()
            if linked_task_id:
                task = task_service.get_task(linked_task_id)
                drain_result = await self.drain_once(normalized_team_id) if auto_drain else None
                return {
                    "deduplicated": True,
                    "triggerEventId": trigger_event["id"],
                    "task": task,
                    "drain": drain_result,
                }

        team = team_service.get_team(normalized_team_id)
        members = team.get("members") if isinstance(team.get("members"), list) else []
        participant_agent_ids = [
            str(member.get("agentId"))
            for member in members
            if isinstance(member, dict) and str(member.get("agentId") or "").strip()
        ]

        task = task_service.create_task(
            team_id=normalized_team_id,
            title=title or self._derive_task_title(normalized_content),
            description=normalized_content,
            participant_agent_ids=participant_agent_ids,
            queue_status="ready",
            planned_by=planned_by or actor_id,
            workflow_id=resolved_workflow_id,
            trigger_event_id=trigger_event["id"],
        )

        db = get_db()
        db.execute(
            """
            UPDATE trigger_events
            SET status = 'dispatched',
                linked_task_id = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (task["id"], self._utc_now_iso(), trigger_event["id"]),
        )
        db.commit()

        drain_result = await self.drain_once(normalized_team_id) if auto_drain else None
        return {
            "deduplicated": False,
            "triggerEventId": trigger_event["id"],
            "task": task,
            "drain": drain_result,
        }

    async def drain_once(self, team_id: str) -> dict[str, Any]:
        normalized_team_id = str(team_id or "").strip()
        if not normalized_team_id:
            raise ValueError("team_id is required")

        recovery = task_service.recover_stale_running_tasks(normalized_team_id)

        next_task = task_service.get_next_ready_task(normalized_team_id)
        if not next_task:
            return {
                "started": False,
                "reason": "queue_empty",
                "recovery": recovery,
            }

        task_id = str(next_task.get("id") or "").strip()
        workflow_id = str(next_task.get("workflowId") or "").strip()
        trigger_event_id = str(next_task.get("triggerEventId") or "").strip() or None
        if not workflow_id:
            raise ValueError("task.workflow_id is required for queue execution")

        if workflow_engine.has_active_execution(workflow_id):
            return {
                "started": False,
                "reason": "workflow_active",
                "taskId": task_id,
                "workflowId": workflow_id,
                "recovery": recovery,
            }

        execution = await workflow_engine.execute_workflow(
            workflow_id,
            trigger_source="queue",
            expected_team_id=normalized_team_id,
            linked_task_id=task_id,
            trigger_event_id=trigger_event_id,
        )

        execution_id = str(execution.get("id") or "").strip()
        task_service.attach_execution(
            task_id,
            execution_id=execution_id,
            workflow_id=workflow_id,
        )
        task_service.set_queue_status(
            task_id,
            "running",
            execution_id=execution_id,
        )

        if trigger_event_id:
            db = get_db()
            db.execute(
                """
                UPDATE trigger_events
                SET linked_execution_id = ?, status = 'dispatched', updated_at = ?
                WHERE id = ?
                """,
                (execution_id, self._utc_now_iso(), trigger_event_id),
            )
            db.commit()

        return {
            "started": True,
            "taskId": task_id,
            "workflowId": workflow_id,
            "executionId": execution_id,
            "triggerEventId": trigger_event_id,
            "recovery": recovery,
        }


team_dispatch_service = TeamDispatchService()
