"""Workflow scheduler runtime.

Polls workflow definitions with cron-based schedules and triggers executions
when the current time matches the configured schedule window.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.workflow_engine import workflow_engine


POLL_INTERVAL_SECONDS = 15


@dataclass(slots=True)
class ParsedCronField:
    any_value: bool
    allowed: set[int]

    def matches(self, value: int) -> bool:
        return self.any_value or value in self.allowed


class WorkflowScheduler:
    """Minute-level workflow scheduler with simple cron parsing."""

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop_event: asyncio.Event | None = None
        self._last_triggered_minute: dict[str, str] = {}

    async def start(self) -> None:
        if self._task and not self._task.done():
            return

        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_loop(), name="workflow-scheduler")
        print("⏰ Workflow scheduler started")

    async def stop(self) -> None:
        if self._stop_event is not None:
            self._stop_event.set()

        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

        self._task = None
        self._stop_event = None
        print("⏰ Workflow scheduler stopped")

    async def _run_loop(self) -> None:
        assert self._stop_event is not None

        while not self._stop_event.is_set():
            try:
                await self._poll_due_workflows()
            except Exception as exc:  # noqa: BLE001
                print(f"⚠️ Workflow scheduler poll failed: {exc}")

            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=POLL_INTERVAL_SECONDS
                )
            except TimeoutError:
                continue

    async def _poll_due_workflows(self) -> None:
        workflows = self._load_scheduled_workflows()
        if not workflows:
            return

        for workflow in workflows:
            workflow_id = str(workflow["id"])
            schedule = workflow.get("schedule")
            if not isinstance(schedule, dict):
                continue

            if not self._should_trigger_now(schedule):
                continue

            minute_key = self._current_minute_key(schedule)
            if self._last_triggered_minute.get(workflow_id) == minute_key:
                continue

            if workflow_engine.has_active_execution(workflow_id):
                continue

            self._last_triggered_minute[workflow_id] = minute_key
            try:
                await workflow_engine.execute_workflow(
                    workflow_id,
                    trigger_source="schedule",
                    scheduled_for=minute_key,
                )
                print(f"⏰ Triggered scheduled workflow: {workflow_id} @ {minute_key}")
            except Exception as exc:  # noqa: BLE001
                print(
                    f"⚠️ Failed to trigger scheduled workflow {workflow_id}: {exc}"
                )

    def _load_scheduled_workflows(self) -> list[dict[str, Any]]:
        db = get_db()
        rows = db.execute("SELECT * FROM workflows ORDER BY created_at DESC").fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            try:
                definition = json.loads(row["definition_json"] or "{}")
            except json.JSONDecodeError:
                continue

            schedule = definition.get("schedule")
            if not isinstance(schedule, dict) or not schedule.get("enabled"):
                continue
            if not str(schedule.get("cron") or "").strip():
                continue

            items.append(
                {
                    "id": row["id"],
                    "teamId": row["team_id"],
                    "name": row["name"],
                    "schedule": schedule,
                }
            )
        return items

    def _current_minute_key(self, schedule: dict[str, Any]) -> str:
        tz = self._resolve_timezone(schedule)
        now = datetime.now(tz).replace(second=0, microsecond=0)
        return now.isoformat()

    def _should_trigger_now(self, schedule: dict[str, Any]) -> bool:
        cron = str(schedule.get("cron") or "").strip()
        if not cron:
            return False

        tz = self._resolve_timezone(schedule)
        now = datetime.now(tz).replace(second=0, microsecond=0)

        if not self._within_active_range(schedule, now):
            return False
        if not self._within_daily_window(schedule, now):
            return False

        return self._cron_matches(cron, now)

    def _within_active_range(self, schedule: dict[str, Any], now: datetime) -> bool:
        active_from = self._parse_datetime(schedule.get("activeFrom"))
        active_until = self._parse_datetime(schedule.get("activeUntil"))

        if active_from and now.astimezone(UTC) < active_from:
            return False
        if active_until and now.astimezone(UTC) > active_until:
            return False
        return True

    def _within_daily_window(self, schedule: dict[str, Any], now: datetime) -> bool:
        window = schedule.get("window")
        if not isinstance(window, dict):
            return True

        start = str(window.get("start") or "").strip()
        end = str(window.get("end") or "").strip()
        if not start or not end:
            return True

        window_tz = self._resolve_timezone(window, fallback=schedule.get("timezone"))
        local_now = now.astimezone(window_tz)
        current_minutes = local_now.hour * 60 + local_now.minute

        start_minutes = self._parse_clock_minutes(start)
        end_minutes = self._parse_clock_minutes(end)
        if start_minutes is None or end_minutes is None:
            return True

        if start_minutes <= end_minutes:
            return start_minutes <= current_minutes <= end_minutes
        return current_minutes >= start_minutes or current_minutes <= end_minutes

    def _cron_matches(self, cron: str, now: datetime) -> bool:
        fields = cron.split()
        if len(fields) != 5:
            return False

        try:
            minute = self._parse_cron_field(fields[0], 0, 59)
            hour = self._parse_cron_field(fields[1], 0, 23)
            day = self._parse_cron_field(fields[2], 1, 31)
            month = self._parse_cron_field(fields[3], 1, 12)
            weekday = self._parse_cron_field(fields[4], 0, 6, sunday_alias=True)
        except ValueError:
            return False

        cron_weekday = (now.weekday() + 1) % 7
        return (
            minute.matches(now.minute)
            and hour.matches(now.hour)
            and day.matches(now.day)
            and month.matches(now.month)
            and weekday.matches(cron_weekday)
        )

    def _parse_cron_field(
        self,
        field: str,
        min_value: int,
        max_value: int,
        *,
        sunday_alias: bool = False,
    ) -> ParsedCronField:
        field = field.strip()
        if field == "*":
            return ParsedCronField(any_value=True, allowed=set())

        allowed: set[int] = set()
        for part in field.split(","):
            token = part.strip()
            if not token:
                continue

            step = 1
            base = token
            if "/" in token:
                base, step_raw = token.split("/", 1)
                step = int(step_raw)
                if step <= 0:
                    raise ValueError("invalid cron step")

            if base in {"*", ""}:
                start = min_value
                end = max_value
            elif "-" in base:
                start_raw, end_raw = base.split("-", 1)
                start = int(start_raw)
                end = int(end_raw)
            else:
                value = int(base)
                if sunday_alias and value == 7:
                    value = 0
                if not min_value <= value <= max_value:
                    raise ValueError("cron field out of range")
                allowed.add(value)
                continue

            if sunday_alias:
                if start == 7:
                    start = 0
                if end == 7:
                    end = 0
                if start > end and end == 0:
                    end = max_value

            if start < min_value or end > max_value or start > end:
                raise ValueError("cron range out of bounds")

            for value in range(start, end + 1, step):
                normalized = 0 if sunday_alias and value == 7 else value
                allowed.add(normalized)

        if not allowed:
            raise ValueError("empty cron field")
        return ParsedCronField(any_value=False, allowed=allowed)

    @staticmethod
    def _parse_clock_minutes(value: str) -> int | None:
        try:
            hour_raw, minute_raw = value.split(":", 1)
            hour = int(hour_raw)
            minute = int(minute_raw)
        except (ValueError, AttributeError):
            return None

        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        return hour * 60 + minute

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if not value or not isinstance(value, str):
            return None

        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"

        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None

        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)

    @staticmethod
    def _resolve_timezone(
        payload: dict[str, Any], fallback: Any = "Asia/Shanghai"
    ) -> ZoneInfo:
        timezone_name = str(
            payload.get("timezone") or payload.get("tz") or fallback or "Asia/Shanghai"
        ).strip()
        try:
            return ZoneInfo(timezone_name)
        except Exception:  # noqa: BLE001
            return ZoneInfo("Asia/Shanghai")

    def next_run_at(self, schedule: dict[str, Any]) -> str | None:
        """Best-effort next-run calculation for UI display."""
        cron = str(schedule.get("cron") or "").strip()
        if not schedule.get("enabled") or not cron:
            return None

        tz = self._resolve_timezone(schedule)
        candidate = datetime.now(tz).replace(second=0, microsecond=0) + timedelta(
            minutes=1
        )
        for _ in range(60 * 24 * 30):
            if self._within_active_range(schedule, candidate) and self._within_daily_window(
                schedule, candidate
            ) and self._cron_matches(cron, candidate):
                return candidate.isoformat()
            candidate += timedelta(minutes=1)
        return None


workflow_scheduler = WorkflowScheduler()
