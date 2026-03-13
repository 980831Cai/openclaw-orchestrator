"""Workflow scheduler service.

Minimal backend scheduler for workflow timed execution.

Why this exists:
- OpenClaw Orchestrator currently does not register tools/callbacks inside
  OpenClaw, so OpenClaw's built-in cron runtime cannot directly call back into
  the orchestrator to start a workflow.
- We still reuse the same cron expression + timezone semantics as OpenClaw,
  making the schedule payload forward-compatible with a future direct bridge.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from croniter import croniter

from openclaw_orchestrator.services.workflow_engine import (
    WorkflowValidationError,
    workflow_engine,
)

logger = logging.getLogger(__name__)

DEFAULT_POLL_SECONDS = 30
MAX_ADVANCE_ATTEMPTS = 512


class WorkflowScheduler:
    """Background poller that launches scheduled workflows."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._states: dict[str, dict[str, Any]] = {}

    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Workflow scheduler started")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
        self._states.clear()
        logger.info("Workflow scheduler stopped")

    async def tick(self) -> None:
        """Run one scheduling pass.

        Exposed mainly for smoke validation and future tests.
        """
        now_utc = datetime.now(timezone.utc)
        active_workflow_ids: set[str] = set()

        for workflow in workflow_engine.list_workflows():
            schedule = self._normalize_schedule(workflow.get("schedule"))
            workflow_id = str(workflow.get("id") or "")
            if not workflow_id or not schedule or not schedule["enabled"]:
                continue

            validation_error = self._get_schedule_validation_error(workflow)
            if validation_error:
                logger.warning(
                    "Workflow %s schedule disabled because definition is invalid: %s",
                    workflow_id,
                    validation_error,
                )
                self._disable_schedule(workflow, validation_error)
                self._states.pop(workflow_id, None)
                continue

            active_workflow_ids.add(workflow_id)
            signature = json.dumps(schedule, ensure_ascii=False, sort_keys=True)
            state = self._states.get(workflow_id)
            if state is None or state.get("signature") != signature:
                self._states[workflow_id] = {
                    "signature": signature,
                    "next_run_at": self._compute_next_run_at(schedule, now_utc),
                }
                state = self._states[workflow_id]

            next_run_at = state.get("next_run_at")
            if not isinstance(next_run_at, datetime):
                continue
            if next_run_at > now_utc:
                continue

            if workflow_engine.has_active_execution(workflow_id):
                logger.info(
                    "Workflow %s skipped scheduled trigger at %s because an execution is already active",
                    workflow_id,
                    next_run_at.isoformat(),
                )
                state["next_run_at"] = self._advance_to_future(schedule, next_run_at, now_utc)
                continue

            if not self._is_run_time_allowed(schedule, next_run_at):
                logger.info(
                    "Workflow %s skipped scheduled trigger at %s because it is outside the allowed window",
                    workflow_id,
                    next_run_at.isoformat(),
                )
                state["next_run_at"] = self._advance_to_future(schedule, next_run_at, now_utc)
                continue

            logger.info(
                "Launching scheduled workflow %s for slot %s",
                workflow_id,
                next_run_at.isoformat(),
            )
            try:
                await workflow_engine.execute_workflow(
                    workflow_id,
                    trigger_source="schedule",
                    scheduled_for=next_run_at.isoformat(),
                )
            except WorkflowValidationError as exc:
                logger.warning(
                    "Workflow %s skipped scheduled trigger because definition is invalid: %s",
                    workflow_id,
                    exc,
                )
                self._disable_schedule(workflow, str(exc))
                self._states.pop(workflow_id, None)
                continue
            state["next_run_at"] = self._advance_to_future(schedule, next_run_at, now_utc)

        for workflow_id in list(self._states):
            if workflow_id not in active_workflow_ids:
                self._states.pop(workflow_id, None)

    def get_next_run_at(
        self,
        workflow: dict[str, Any],
        *,
        now_utc: datetime | None = None,
    ) -> str | None:
        workflow_id = str(workflow.get("id") or "")
        schedule = self._normalize_schedule(workflow.get("schedule"))
        if not workflow_id or not schedule or not schedule["enabled"]:
            return None

        validation_error = self._get_schedule_validation_error(workflow)
        if validation_error:
            return None

        current_time = now_utc or datetime.now(timezone.utc)
        signature = json.dumps(schedule, ensure_ascii=False, sort_keys=True)
        state = self._states.get(workflow_id)
        candidate = (
            state.get("next_run_at")
            if state and state.get("signature") == signature
            else self._compute_next_run_at(schedule, current_time)
        )
        if not isinstance(candidate, datetime):
            return None
        return candidate.isoformat()

    async def _run_loop(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Workflow scheduler tick failed")
            await asyncio.sleep(DEFAULT_POLL_SECONDS)

    def _get_schedule_validation_error(self, workflow: dict[str, Any]) -> str | None:
        try:
            workflow_engine._validate_workflow_definition(
                workflow,
                require_runnable=True,
            )
        except WorkflowValidationError as exc:
            return str(exc)
        return None

    def _disable_schedule(self, workflow: dict[str, Any], reason: str) -> None:
        workflow_id = str(workflow.get("id") or "")
        schedule = workflow.get("schedule")
        if not workflow_id or not isinstance(schedule, dict) or not schedule.get("enabled"):
            return

        disabled_schedule = {
            **schedule,
            "enabled": False,
            "disabledReason": reason,
        }
        try:
            workflow_engine.update_workflow(
                workflow_id,
                {"schedule": disabled_schedule},
            )
        except Exception:
            logger.exception(
                "Failed to disable invalid schedule for workflow %s",
                workflow_id,
            )

    def _normalize_schedule(self, raw: Any) -> dict[str, Any] | None:
        if not isinstance(raw, dict):
            return None

        expr = str(raw.get("cron") or raw.get("expression") or "").strip()
        if not expr:
            return None

        timezone_name = str(raw.get("timezone") or raw.get("tz") or "UTC").strip() or "UTC"
        window = raw.get("window") or raw.get("timeWindow") or None

        return {
            "enabled": raw.get("enabled", True) is not False,
            "cron": expr,
            "timezone": timezone_name,
            "window": window if isinstance(window, dict) else None,
            "activeFrom": raw.get("activeFrom"),
            "activeUntil": raw.get("activeUntil"),
        }

    def _compute_next_run_at(
        self,
        schedule: dict[str, Any],
        now_utc: datetime,
    ) -> datetime | None:
        tz = self._resolve_zoneinfo(schedule.get("timezone"))
        active_from = self._parse_iso_datetime(schedule.get("activeFrom"))
        active_until = self._parse_iso_datetime(schedule.get("activeUntil"))
        if active_until and now_utc >= active_until:
            return None

        base_utc = now_utc
        if active_from and active_from > base_utc:
            base_utc = active_from

        candidate_local = base_utc.astimezone(tz) - timedelta(seconds=1)
        for _ in range(MAX_ADVANCE_ATTEMPTS):
            next_local = croniter(str(schedule["cron"]), candidate_local).get_next(datetime)
            if next_local.tzinfo is None:
                next_local = next_local.replace(tzinfo=tz)
            next_utc = next_local.astimezone(timezone.utc)
            if active_until and next_utc > active_until:
                return None
            if self._is_run_time_allowed(schedule, next_utc):
                return next_utc
            candidate_local = next_local
        return None

    def _advance_to_future(
        self,
        schedule: dict[str, Any],
        current_run_at: datetime,
        now_utc: datetime,
    ) -> datetime | None:
        tz = self._resolve_zoneinfo(schedule.get("timezone"))
        active_until = self._parse_iso_datetime(schedule.get("activeUntil"))
        candidate = current_run_at

        for _ in range(MAX_ADVANCE_ATTEMPTS):
            base_local = candidate.astimezone(tz)
            next_local = croniter(str(schedule["cron"]), base_local).get_next(datetime)
            if next_local.tzinfo is None:
                next_local = next_local.replace(tzinfo=tz)
            candidate = next_local.astimezone(timezone.utc)
            if active_until and candidate > active_until:
                return None
            if candidate > now_utc and self._is_run_time_allowed(schedule, candidate):
                return candidate
        return None

    def _is_run_time_allowed(
        self, schedule: dict[str, Any], candidate_utc: datetime
    ) -> bool:
        active_from = self._parse_iso_datetime(schedule.get("activeFrom"))
        active_until = self._parse_iso_datetime(schedule.get("activeUntil"))
        if active_from and candidate_utc < active_from:
            return False
        if active_until and candidate_utc > active_until:
            return False

        window = schedule.get("window")
        if not isinstance(window, dict):
            return True

        start_raw = str(window.get("start") or "").strip()
        end_raw = str(window.get("end") or "").strip()
        if not start_raw or not end_raw:
            return True

        tz = self._resolve_zoneinfo(
            window.get("timezone") or window.get("tz") or schedule.get("timezone")
        )
        local_candidate = candidate_utc.astimezone(tz)
        current_minutes = local_candidate.hour * 60 + local_candidate.minute
        start_minutes = self._parse_hhmm(start_raw)
        end_minutes = self._parse_hhmm(end_raw)

        if start_minutes == end_minutes:
            return True
        if start_minutes < end_minutes:
            return start_minutes <= current_minutes <= end_minutes
        return current_minutes >= start_minutes or current_minutes <= end_minutes

    @staticmethod
    def _parse_hhmm(value: str) -> int:
        hour_text, minute_text = value.split(":", 1)
        hour = max(0, min(23, int(hour_text)))
        minute = max(0, min(59, int(minute_text)))
        return hour * 60 + minute

    @staticmethod
    def _parse_iso_datetime(value: Any) -> datetime | None:
        if not isinstance(value, str) or not value.strip():
            return None
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _resolve_zoneinfo(value: Any) -> ZoneInfo:
        name = str(value or "UTC").strip() or "UTC"
        try:
            return ZoneInfo(name)
        except Exception:
            return ZoneInfo("UTC")


workflow_scheduler = WorkflowScheduler()
