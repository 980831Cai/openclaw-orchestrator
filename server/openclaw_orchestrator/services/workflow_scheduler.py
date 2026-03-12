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

from openclaw_orchestrator.services.workflow_engine import workflow_engine

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

            if not self._is_now_within_window(schedule, now_utc):
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
            await workflow_engine.execute_workflow(
                workflow_id,
                trigger_source="schedule",
                scheduled_for=next_run_at.isoformat(),
            )
            state["next_run_at"] = self._advance_to_future(schedule, next_run_at, now_utc)

        for workflow_id in list(self._states):
            if workflow_id not in active_workflow_ids:
                self._states.pop(workflow_id, None)

    async def _run_loop(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Workflow scheduler tick failed")
            await asyncio.sleep(DEFAULT_POLL_SECONDS)

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

        base_local = base_utc.astimezone(tz) - timedelta(seconds=1)
        next_local = croniter(str(schedule["cron"]), base_local).get_next(datetime)
        if next_local.tzinfo is None:
            next_local = next_local.replace(tzinfo=tz)
        next_utc = next_local.astimezone(timezone.utc)
        if active_until and next_utc > active_until:
            return None
        return next_utc

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
            if candidate > now_utc:
                return candidate
        return None

    def _is_now_within_window(self, schedule: dict[str, Any], now_utc: datetime) -> bool:
        active_from = self._parse_iso_datetime(schedule.get("activeFrom"))
        active_until = self._parse_iso_datetime(schedule.get("activeUntil"))
        if active_from and now_utc < active_from:
            return False
        if active_until and now_utc > active_until:
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
        local_now = now_utc.astimezone(tz)
        current_minutes = local_now.hour * 60 + local_now.minute
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
