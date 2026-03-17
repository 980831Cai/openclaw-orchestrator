"""Lead governance巡检服务。"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.file_manager import file_manager
from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
from openclaw_orchestrator.services.task_service import task_service

logger = logging.getLogger(__name__)

DEFAULT_GOVERNANCE_INTERVAL_SECONDS = 120


class LeadGovernanceService:
    """Periodic governance inspector for all teams."""

    def __init__(self) -> None:
        self._last_run_at: datetime | None = None

    def maybe_run(self, *, now_utc: datetime | None = None, force: bool = False) -> dict[str, Any]:
        current_time = now_utc or datetime.now(timezone.utc)
        if not force and self._last_run_at:
            elapsed = (current_time - self._last_run_at).total_seconds()
            if elapsed < DEFAULT_GOVERNANCE_INTERVAL_SECONDS:
                return {
                    "ran": False,
                    "reason": "interval_not_reached",
                    "elapsedSeconds": round(elapsed, 1),
                }

        db = get_db()
        try:
            rows = db.execute(
                """
                SELECT id, name, lead_agent_id
                FROM teams
                ORDER BY created_at DESC
                """
            ).fetchall()
        except sqlite3.OperationalError as exc:
            if "no such table" in str(exc).lower():
                logger.debug("Skip lead governance run because teams table is unavailable")
                return {"ran": False, "reason": "teams_table_unavailable"}
            raise

        reports: list[dict[str, Any]] = []
        for row in rows:
            team_id = str(row["id"])
            team_name = str(row["name"] or team_id)
            lead_agent_id = str(row["lead_agent_id"] or "").strip()

            lead_heartbeat = (
                openclaw_bridge.read_heartbeat_status(lead_agent_id)
                if lead_agent_id
                else {"alive": False, "lastCheck": None, "ageMinutes": None, "checklistItems": 0}
            )
            recovery = task_service.recover_stale_running_tasks(team_id)
            queue_snapshot = self._read_queue_snapshot(team_id)
            status = self._evaluate_status(lead_heartbeat, recovery, queue_snapshot)

            report = {
                "teamId": team_id,
                "teamName": team_name,
                "source": "lead_governance_loop",
                "status": status,
                "leadAgentId": lead_agent_id,
                "leadHealth": {
                    "alive": bool(lead_heartbeat.get("alive")),
                    "lastCheck": lead_heartbeat.get("lastCheck"),
                    "ageMinutes": lead_heartbeat.get("ageMinutes"),
                    "checklistItems": lead_heartbeat.get("checklistItems", 0),
                },
                "recovery": recovery,
                "queueSnapshot": queue_snapshot,
                "reportedAt": current_time.isoformat(),
            }
            openclaw_bridge.report_team_governance_summary(team_id, report)
            reports.append(report)

        self._last_run_at = current_time
        return {
            "ran": True,
            "teamCount": len(reports),
            "reports": reports,
            "ranAt": current_time.isoformat(),
            "nextRunAfter": (current_time + timedelta(seconds=DEFAULT_GOVERNANCE_INTERVAL_SECONDS)).isoformat(),
        }

    def get_latest_team_governance_snapshot(self, team_id: str) -> dict[str, Any] | None:
        normalized_team_id = str(team_id or "").strip()
        if not normalized_team_id:
            return None
        report_path = os.path.join("teams", normalized_team_id, "governance", "latest-report.json")
        if not file_manager.file_exists(report_path):
            return None
        try:
            payload = file_manager.read_json(report_path)
            return payload if isinstance(payload, dict) else None
        except Exception:
            logger.exception("Failed to read governance snapshot for team %s", normalized_team_id)
            return None

    @staticmethod
    def _read_queue_snapshot(team_id: str) -> dict[str, Any]:
        db = get_db()
        try:
            rows = db.execute(
                """
                SELECT queue_status, COUNT(*) AS c
                FROM tasks
                WHERE team_id = ?
                GROUP BY queue_status
                """,
                (team_id,),
            ).fetchall()
        except sqlite3.OperationalError as exc:
            if "no such table" in str(exc).lower():
                return {
                    "backlog": 0,
                    "ready": 0,
                    "running": 0,
                    "blocked": 0,
                    "done": 0,
                    "cancelled": 0,
                }
            raise
        counts = {str(row["queue_status"] or "unknown"): int(row["c"] or 0) for row in rows}
        return {
            "backlog": counts.get("backlog", 0),
            "ready": counts.get("ready", 0),
            "running": counts.get("running", 0),
            "blocked": counts.get("blocked", 0),
            "done": counts.get("done", 0),
            "cancelled": counts.get("cancelled", 0),
        }

    @staticmethod
    def _evaluate_status(
        lead_heartbeat: dict[str, Any],
        recovery: dict[str, Any],
        queue_snapshot: dict[str, Any],
    ) -> str:
        blocked = int(queue_snapshot.get("blocked", 0) or 0)
        recovered = int(recovery.get("recovered", 0) or 0)
        lead_alive = bool(lead_heartbeat.get("alive"))
        if not lead_alive and (blocked > 0 or recovered > 0):
            return "critical"
        if not lead_alive or blocked > 0 or recovered > 0:
            return "warning"
        return "healthy"


lead_governance_service = LeadGovernanceService()
