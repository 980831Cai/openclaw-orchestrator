"""Schedule Executor — maps team schedules to OpenClaw capabilities.

Translates the four schedule modes into real actions:
- round-robin: Maintains a turn pointer; assigns tasks via Webhook in order
- priority: Assigns to highest-priority idle agent via Webhook
- time-based: Converts start/end times to cron expressions → writes jobs.json
- custom: Writes user-defined cron rules directly to jobs.json

Lifecycle:
- start(): Called during app startup to load all team schedules and register cron jobs
- stop(): Called during app shutdown to clean up
- sync_schedule(): Called when a team saves/updates their schedule
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
from openclaw_orchestrator.utils.time import utc_now_iso


class ScheduleExecutor:
    """Manages team schedule execution via OpenClaw capabilities."""

    def __init__(self) -> None:
        # Round-robin state: team_id -> current index
        self._round_robin_pointers: dict[str, int] = {}
        # Track which teams have active schedules
        self._active_schedules: dict[str, dict[str, Any]] = {}
        self._started = False

    # ════════════════════════════════════════════════════════════
    # Lifecycle
    # ════════════════════════════════════════════════════════════

    def start(self) -> None:
        """Load all team schedules from DB and sync to OpenClaw.

        Called during FastAPI lifespan startup.
        Includes crash recovery: restores round_robin_pointers from DB.
        """
        if self._started:
            return

        db = get_db()

        # Ensure the scheduler_state table exists (for crash recovery)
        db.execute("""
            CREATE TABLE IF NOT EXISTS scheduler_state (
                team_id TEXT PRIMARY KEY,
                round_robin_pointer INTEGER DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        db.commit()

        # Restore round-robin pointers from persistent state
        try:
            state_rows = db.execute(
                "SELECT team_id, round_robin_pointer FROM scheduler_state"
            ).fetchall()
            for sr in state_rows:
                self._round_robin_pointers[sr["team_id"]] = sr["round_robin_pointer"]
            if state_rows:
                print(f"  ↳ Recovered {len(state_rows)} round-robin pointer(s) from DB")
        except Exception as e:
            print(f"  ⚠ Failed to recover scheduler state: {e}")

        # Load active schedules
        rows = db.execute(
            "SELECT id, schedule_config FROM teams WHERE schedule_config IS NOT NULL AND schedule_config != '{}'"
        ).fetchall()

        count = 0
        for row in rows:
            team_id = row["id"]
            try:
                schedule = json.loads(row["schedule_config"])
                if schedule and schedule.get("entries"):
                    self._active_schedules[team_id] = schedule
                    self._sync_to_openclaw(team_id, schedule)
                    count += 1
            except (json.JSONDecodeError, KeyError):
                continue

        self._started = True
        print(f"[schedule] executor started: {count} active schedules loaded")

    def stop(self) -> None:
        """Clean up on shutdown. Persist round-robin state to DB."""
        self._persist_round_robin_state()
        self._started = False
        self._active_schedules.clear()
        self._round_robin_pointers.clear()
        print("[schedule] executor stopped")

    # ════════════════════════════════════════════════════════════
    # Core: sync_schedule
    # ════════════════════════════════════════════════════════════

    def sync_schedule(self, team_id: str, schedule: dict[str, Any]) -> dict[str, Any]:
        """Sync a team's schedule configuration to OpenClaw.

        Called when the user saves a schedule via the API.

        Args:
            team_id: Team identifier.
            schedule: Full schedule config (type/mode, entries, interval).

        Returns:
            dict with sync status, generated jobs count, next trigger info.
        """
        mode = schedule.get("type") or schedule.get("mode") or "round-robin"
        entries = schedule.get("entries", [])

        if not entries:
            # No entries → remove all cron jobs for this team
            openclaw_bridge.upsert_cron_jobs_for_team(team_id, [])
            self._active_schedules.pop(team_id, None)
            return {
                "synced": True,
                "mode": mode,
                "jobCount": 0,
                "syncedAt": utc_now_iso(),
            }

        self._active_schedules[team_id] = schedule
        result = self._sync_to_openclaw(team_id, schedule)
        return result

    def _sync_to_openclaw(self, team_id: str, schedule: dict[str, Any]) -> dict[str, Any]:
        """Internal: map schedule config to OpenClaw cron/heartbeat actions."""
        mode = schedule.get("type") or schedule.get("mode") or "round-robin"
        entries = schedule.get("entries", [])

        if mode == "round-robin":
            return self._sync_round_robin(team_id, entries, schedule)
        elif mode == "priority":
            return self._sync_priority(team_id, entries, schedule)
        elif mode == "time-based":
            return self._sync_time_based(team_id, entries, schedule)
        elif mode == "custom":
            return self._sync_custom(team_id, entries, schedule)
        else:
            return {
                "synced": False,
                "mode": mode,
                "error": f"Unknown schedule mode: {mode}",
                "syncedAt": utc_now_iso(),
            }

    # ════════════════════════════════════════════════════════════
    # Mode: Round-Robin
    # ════════════════════════════════════════════════════════════

    def _sync_round_robin(
        self, team_id: str, entries: list[dict[str, Any]], schedule: dict[str, Any]
    ) -> dict[str, Any]:
        """Round-robin: no cron needed; we just maintain turn order.

        The actual assignment happens in get_next_agent() when a task is created.
        We write a heartbeat checklist for each agent so they stay active.
        """
        # Sort by order field
        sorted_entries = sorted(entries, key=lambda e: e.get("order", 0))

        # Initialize round-robin pointer
        if team_id not in self._round_robin_pointers:
            self._round_robin_pointers[team_id] = 0

        # Write heartbeat checklists for all agents in rotation
        for entry in sorted_entries:
            agent_id = entry.get("agentId")
            if agent_id:
                openclaw_bridge.write_heartbeat(agent_id, [
                    f"轮询排班 — 团队 {team_id} 中的待命成员",
                    "检查是否有新任务分配",
                ])

        # No cron jobs needed for round-robin (it's event-driven)
        openclaw_bridge.upsert_cron_jobs_for_team(team_id, [])

        return {
            "synced": True,
            "mode": "round-robin",
            "jobCount": 0,
            "agentCount": len(sorted_entries),
            "currentPointer": self._round_robin_pointers.get(team_id, 0),
            "syncedAt": utc_now_iso(),
        }

    # ════════════════════════════════════════════════════════════
    # Mode: Priority
    # ════════════════════════════════════════════════════════════

    def _sync_priority(
        self, team_id: str, entries: list[dict[str, Any]], schedule: dict[str, Any]
    ) -> dict[str, Any]:
        """Priority: similar to round-robin but picks highest-priority idle agent.

        No cron jobs needed. Selection logic is in get_next_agent().
        """
        sorted_entries = sorted(entries, key=lambda e: e.get("priority", 99))

        for entry in sorted_entries:
            agent_id = entry.get("agentId")
            priority = entry.get("priority", 99)
            if agent_id:
                openclaw_bridge.write_heartbeat(agent_id, [
                    f"优先级排班 — 优先级 {priority}",
                    "保持待命状态，等待高优任务分配",
                ])

        openclaw_bridge.upsert_cron_jobs_for_team(team_id, [])

        return {
            "synced": True,
            "mode": "priority",
            "jobCount": 0,
            "agentCount": len(sorted_entries),
            "syncedAt": utc_now_iso(),
        }

    # ════════════════════════════════════════════════════════════
    # Mode: Time-Based → Cron
    # ════════════════════════════════════════════════════════════

    def _sync_time_based(
        self, team_id: str, entries: list[dict[str, Any]], schedule: dict[str, Any]
    ) -> dict[str, Any]:
        """Time-based: convert startTime/endTime to cron expressions.

        For each agent with a time slot:
        - Creates a 'start' cron job at startTime to wake the agent
        - Creates a 'stop' heartbeat update at endTime to mark end of shift

        Example: startTime=09:00, endTime=18:00
        → cron "0 9 * * *" to wake agent at 9am daily
        """
        cron_jobs: list[dict[str, Any]] = []
        next_triggers: list[dict[str, Any]] = []

        for entry in entries:
            agent_id = entry.get("agentId")
            start_time = entry.get("startTime", "09:00")
            end_time = entry.get("endTime", "18:00")

            if not agent_id:
                continue

            # Parse HH:MM
            start_h, start_m = self._parse_time(start_time)
            end_h, end_m = self._parse_time(end_time)

            # Start-of-shift cron job
            start_cron = f"{start_m} {start_h} * * *"
            cron_jobs.append({
                "agent": agent_id,
                "schedule": start_cron,
                "task": f"开始今日工作班次 ({start_time}-{end_time})",
                "session": "isolated",
                "tag": f"schedule-start-{agent_id}",
            })

            # End-of-shift cron job (optional: notify agent to wrap up)
            end_cron = f"{end_m} {end_h} * * *"
            cron_jobs.append({
                "agent": agent_id,
                "schedule": end_cron,
                "task": f"今日工作班次结束，整理并归档当前工作",
                "session": "isolated",
                "tag": f"schedule-end-{agent_id}",
            })

            # Write heartbeat with shift info
            openclaw_bridge.write_heartbeat(agent_id, [
                f"时段排班: {start_time} - {end_time}",
                "班次内保持活跃，检查任务队列",
            ])

            next_triggers.append({
                "agentId": agent_id,
                "startTime": start_time,
                "endTime": end_time,
                "startCron": start_cron,
            })

        # Write cron jobs for this team
        success = openclaw_bridge.upsert_cron_jobs_for_team(team_id, cron_jobs)

        return {
            "synced": success,
            "mode": "time-based",
            "jobCount": len(cron_jobs),
            "agents": next_triggers,
            "syncedAt": utc_now_iso(),
        }

    # ════════════════════════════════════════════════════════════
    # Mode: Custom → Direct Cron
    # ════════════════════════════════════════════════════════════

    def _sync_custom(
        self, team_id: str, entries: list[dict[str, Any]], schedule: dict[str, Any]
    ) -> dict[str, Any]:
        """Custom: user provides custom cron rules directly.

        The customRule field is expected to be a cron expression (e.g., "*/30 * * * *")
        or a natural language description that we try to parse.
        """
        cron_jobs: list[dict[str, Any]] = []

        for entry in entries:
            agent_id = entry.get("agentId")
            custom_rule = entry.get("customRule", "").strip()

            if not agent_id or not custom_rule:
                continue

            # Try to use as-is if it looks like a cron expression
            cron_expr = self._parse_custom_rule(custom_rule)

            if cron_expr:
                cron_jobs.append({
                    "agent": agent_id,
                    "schedule": cron_expr,
                    "task": f"自定义排班规则触发: {custom_rule[:50]}",
                    "session": "isolated",
                    "tag": f"schedule-custom-{agent_id}",
                })

                openclaw_bridge.write_heartbeat(agent_id, [
                    f"自定义排班: {custom_rule}",
                    "按照自定义规则定期检查任务",
                ])

        success = openclaw_bridge.upsert_cron_jobs_for_team(team_id, cron_jobs)

        return {
            "synced": success,
            "mode": "custom",
            "jobCount": len(cron_jobs),
            "syncedAt": utc_now_iso(),
        }

    # ════════════════════════════════════════════════════════════
    # Task Assignment (called by task_service)
    # ════════════════════════════════════════════════════════════

    def get_next_agent(self, team_id: str) -> Optional[str]:
        """Get the next agent to assign a task to, based on schedule mode.

        For round-robin: returns next agent in rotation order.
        For priority: returns highest-priority agent.
        For time-based: returns agent currently in their time slot.
        For custom: returns first available agent.

        Returns:
            Agent ID, or None if no agent is available.
        """
        schedule = self._active_schedules.get(team_id)
        if not schedule:
            return None

        mode = schedule.get("type") or schedule.get("mode") or "round-robin"
        entries = schedule.get("entries", [])

        if not entries:
            return None

        if mode == "round-robin":
            return self._next_round_robin(team_id, entries)
        elif mode == "priority":
            return self._next_priority(entries)
        elif mode == "time-based":
            return self._next_time_based(entries)
        else:
            # Custom or unknown: return first agent
            return entries[0].get("agentId") if entries else None

    def _next_round_robin(self, team_id: str, entries: list[dict[str, Any]]) -> Optional[str]:
        """Round-robin: pick next agent and advance pointer."""
        sorted_entries = sorted(entries, key=lambda e: e.get("order", 0))
        if not sorted_entries:
            return None

        idx = self._round_robin_pointers.get(team_id, 0) % len(sorted_entries)
        agent_id = sorted_entries[idx].get("agentId")

        # Advance pointer and persist
        new_idx = (idx + 1) % len(sorted_entries)
        self._round_robin_pointers[team_id] = new_idx
        self._persist_round_robin_pointer(team_id, new_idx)

        return agent_id

    def _next_priority(self, entries: list[dict[str, Any]]) -> Optional[str]:
        """Priority: return highest-priority (lowest number) agent."""
        sorted_entries = sorted(entries, key=lambda e: e.get("priority", 99))
        return sorted_entries[0].get("agentId") if sorted_entries else None

    def _next_time_based(self, entries: list[dict[str, Any]]) -> Optional[str]:
        """Time-based: return agent currently in their work time slot."""
        now = datetime.now()
        current_minutes = now.hour * 60 + now.minute

        for entry in entries:
            start_time = entry.get("startTime", "09:00")
            end_time = entry.get("endTime", "18:00")

            start_h, start_m = self._parse_time(start_time)
            end_h, end_m = self._parse_time(end_time)

            start_minutes = start_h * 60 + start_m
            end_minutes = end_h * 60 + end_m

            if start_minutes <= current_minutes <= end_minutes:
                return entry.get("agentId")

        return None

    # ════════════════════════════════════════════════════════════
    # Persistence helpers (crash recovery)
    # ════════════════════════════════════════════════════════════

    def _persist_round_robin_pointer(self, team_id: str, pointer: int) -> None:
        """Persist a single team's round-robin pointer to DB."""
        try:
            db = get_db()
            db.execute(
                """INSERT INTO scheduler_state (team_id, round_robin_pointer, updated_at)
                   VALUES (?, ?, datetime('now'))
                   ON CONFLICT(team_id) DO UPDATE SET
                     round_robin_pointer = excluded.round_robin_pointer,
                     updated_at = datetime('now')""",
                (team_id, pointer),
            )
            db.commit()
        except Exception as e:
            print(f"  ⚠ Failed to persist round-robin pointer for {team_id}: {e}")

    def _persist_round_robin_state(self) -> None:
        """Persist all round-robin pointers to DB (called on shutdown)."""
        if not self._round_robin_pointers:
            return
        try:
            db = get_db()
            for team_id, pointer in self._round_robin_pointers.items():
                db.execute(
                    """INSERT INTO scheduler_state (team_id, round_robin_pointer, updated_at)
                       VALUES (?, ?, datetime('now'))
                       ON CONFLICT(team_id) DO UPDATE SET
                         round_robin_pointer = excluded.round_robin_pointer,
                         updated_at = datetime('now')""",
                    (team_id, pointer),
                )
            db.commit()
            print(f"  ↳ Persisted {len(self._round_robin_pointers)} round-robin pointer(s)")
        except Exception as e:
            print(f"  ⚠ Failed to persist scheduler state: {e}")

    # ════════════════════════════════════════════════════════════
    # Helpers
    # ════════════════════════════════════════════════════════════

    @staticmethod
    def _parse_time(time_str: str) -> tuple[int, int]:
        """Parse 'HH:MM' string to (hour, minute) tuple."""
        try:
            parts = time_str.strip().split(":")
            return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        except (ValueError, IndexError):
            return 9, 0  # Default to 09:00

    @staticmethod
    def _parse_custom_rule(rule: str) -> Optional[str]:
        """Try to parse a custom rule into a cron expression.

        Accepts:
        - Direct cron expressions: "*/30 * * * *"
        - Simple patterns: "every 30 minutes", "every 2 hours"
        - Chinese patterns: "每30分钟", "每2小时"

        Returns:
            A cron expression string, or None if unparseable.
        """
        rule = rule.strip()

        # Direct cron expression (5 fields)
        if re.match(r"^[\d*/,-]+ [\d*/,-]+ [\d*/,-]+ [\d*/,-]+ [\d*/,-]+$", rule):
            return rule

        # "every N minutes" / "每N分钟"
        m = re.search(r"(?:every\s+)?(\d+)\s*(?:minutes?|分钟)", rule, re.IGNORECASE)
        if m:
            minutes = int(m.group(1))
            if 1 <= minutes <= 59:
                return f"*/{minutes} * * * *"

        # "every N hours" / "每N小时"
        m = re.search(r"(?:every\s+)?(\d+)\s*(?:hours?|小时)", rule, re.IGNORECASE)
        if m:
            hours = int(m.group(1))
            if 1 <= hours <= 23:
                return f"0 */{hours} * * *"

        # "daily at HH:MM" / "每天 HH:MM"
        m = re.search(r"(?:daily\s+(?:at\s+)?|每天\s*)(\d{1,2}):(\d{2})", rule, re.IGNORECASE)
        if m:
            h, mi = int(m.group(1)), int(m.group(2))
            return f"{mi} {h} * * *"

        return None

    def is_agent_on_duty(self, agent_id: str) -> bool:
        """Check if an agent is currently on duty according to any active schedule.

        Returns True if:
        - round-robin/priority: the agent is in an active schedule's entry list
        - time-based: the agent is in their active time slot right now
        - custom: the agent has an active cron rule
        """
        for team_id, schedule in self._active_schedules.items():
            mode = schedule.get("type") or schedule.get("mode") or "round-robin"
            entries = schedule.get("entries", [])

            agent_entries = [e for e in entries if e.get("agentId") == agent_id]
            if not agent_entries:
                continue

            if mode in ("round-robin", "priority", "custom"):
                # These modes treat all listed agents as "on duty"
                return True

            if mode == "time-based":
                now = datetime.now()
                current_minutes = now.hour * 60 + now.minute
                for entry in agent_entries:
                    start_h, start_m = self._parse_time(entry.get("startTime", "09:00"))
                    end_h, end_m = self._parse_time(entry.get("endTime", "18:00"))
                    if start_h * 60 + start_m <= current_minutes <= end_h * 60 + end_m:
                        return True

        return False

    def get_schedule_status(self, team_id: str) -> dict[str, Any]:
        """Get the current schedule execution status for a team."""
        schedule = self._active_schedules.get(team_id)
        if not schedule:
            return {"active": False, "mode": None}

        mode = schedule.get("type") or schedule.get("mode")
        entries = schedule.get("entries", [])

        return {
            "active": True,
            "mode": mode,
            "agentCount": len(entries),
            "roundRobinPointer": self._round_robin_pointers.get(team_id),
        }


# Singleton instance
schedule_executor = ScheduleExecutor()
