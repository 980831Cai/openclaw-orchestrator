"""Team management service."""

from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.file_manager import file_manager

logger = logging.getLogger(__name__)

TEAM_MD_TEMPLATE = """# {name}

## 团队目标
{goal}

## 成员特长总结
<!-- 任务完成后自动追加 -->

## 协作规则
<!-- 在实践中逐渐沉淀 -->

## 历史教训与最佳实践
<!-- 每次任务完成后自动提炼追加 -->
"""


def _parse_schedule_value(raw_value: Any) -> Optional[dict[str, Any]]:
    if not raw_value or raw_value == "{}":
        return None
    try:
        return json.loads(raw_value)
    except (TypeError, json.JSONDecodeError):
        return None


class TeamService:
    """Service for managing teams."""

    def create_team(
        self,
        name: str,
        description: str,
        goal: Optional[str] = None,
        theme: Optional[str] = None,
        lead_agent_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new team with directory structure."""
        db = get_db()
        team_id = str(uuid.uuid4())
        team_dir = os.path.join("teams", team_id)

        file_manager.ensure_dir(team_dir)
        file_manager.ensure_dir(os.path.join(team_dir, "active"))
        file_manager.ensure_dir(os.path.join(team_dir, "archive"))
        file_manager.ensure_dir(os.path.join(team_dir, "knowledge"))
        file_manager.ensure_dir(os.path.join(team_dir, "meetings"))

        file_manager.write_file(
            os.path.join(team_dir, "team.md"),
            TEAM_MD_TEMPLATE.format(name=name, goal=goal or "待定义"),
        )

        db.execute(
            "INSERT INTO teams (id, name, description, goal, theme, team_dir, lead_agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                team_id,
                name,
                description,
                goal or "",
                theme or "default",
                file_manager.get_full_path(team_dir),
                lead_agent_id,
            ),
        )
        db.commit()
        return self.get_team(team_id)

    def get_team(self, team_id: str) -> dict[str, Any]:
        """Get team details including members."""
        db = get_db()
        row = db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
        if not row:
            raise ValueError(f"Team not found: {team_id}")

        members = self._get_team_members(team_id)
        schedule = _parse_schedule_value(row["schedule_config"] if "schedule_config" in row.keys() else None)
        if schedule is None and "schedule_json" in row.keys():
            schedule = _parse_schedule_value(row["schedule_json"])

        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "goal": row["goal"],
            "members": members,
            "schedule": schedule,
            "teamDir": row["team_dir"],
            "theme": row["theme"],
            "leadAgentId": row["lead_agent_id"] if "lead_agent_id" in row.keys() else None,
            "createdAt": row["created_at"],
        }

    def list_teams(self) -> list[dict[str, Any]]:
        """List all teams with summary info."""
        db = get_db()
        rows = db.execute("SELECT * FROM teams ORDER BY created_at DESC").fetchall()

        result = []
        for row in rows:
            member_count = db.execute(
                "SELECT COUNT(*) as c FROM team_members WHERE team_id = ?",
                (row["id"],),
            ).fetchone()["c"]

            active_task_count = db.execute(
                "SELECT COUNT(*) as c FROM tasks WHERE team_id = ? AND status = 'active'",
                (row["id"],),
            ).fetchone()["c"]

            members = db.execute(
                "SELECT agent_id FROM team_members WHERE team_id = ?",
                (row["id"],),
            ).fetchall()

            result.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "description": row["description"],
                    "memberCount": member_count,
                    "activeTaskCount": active_task_count,
                    "theme": row["theme"],
                    "members": [
                        {"agentId": m["agent_id"], "emoji": "🤖", "name": m["agent_id"]}
                        for m in members
                    ],
                }
            )
        return result

    def update_team(self, team_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        """Update team fields."""
        db = get_db()
        sets: list[str] = []
        values: list[Any] = []

        for field in ("name", "description", "goal", "theme"):
            if field in updates and updates[field] is not None:
                sets.append(f"{field} = ?")
                values.append(updates[field])

        if sets:
            values.append(team_id)
            db.execute(
                f"UPDATE teams SET {', '.join(sets)} WHERE id = ?", values
            )
            db.commit()

        return self.get_team(team_id)

    def delete_team(self, team_id: str) -> None:
        """Delete a team."""
        db = get_db()
        db.execute("DELETE FROM teams WHERE id = ?", (team_id,))
        db.commit()

    def add_member(self, team_id: str, agent_id: str, role: str = "member") -> None:
        """Add a member to a team. First member auto-promotes to Lead if no Lead exists."""
        db = get_db()
        max_order_row = db.execute(
            "SELECT MAX(join_order) as m FROM team_members WHERE team_id = ?",
            (team_id,),
        ).fetchone()
        max_order = max_order_row["m"] or 0

        # Auto-promote first member to Lead if team has no Lead
        team_row = db.execute("SELECT lead_agent_id FROM teams WHERE id = ?", (team_id,)).fetchone()
        if team_row and not team_row["lead_agent_id"]:
            role = "lead"
            db.execute(
                "UPDATE teams SET lead_agent_id = ? WHERE id = ?",
                (agent_id, team_id),
            )

        db.execute(
            "INSERT OR REPLACE INTO team_members (team_id, agent_id, role, join_order) VALUES (?, ?, ?, ?)",
            (team_id, agent_id, role, max_order + 1),
        )
        db.commit()
        self._update_agent_to_agent_config(team_id)

    def set_lead(self, team_id: str, agent_id: str) -> dict[str, Any]:
        """Set a specific agent as Team Lead."""
        db = get_db()
        # Verify agent is a member
        member = db.execute(
            "SELECT * FROM team_members WHERE team_id = ? AND agent_id = ?",
            (team_id, agent_id),
        ).fetchone()
        if not member:
            raise ValueError(f"Agent {agent_id} is not a member of team {team_id}")

        # Demote old Lead
        old_lead = db.execute(
            "SELECT lead_agent_id FROM teams WHERE id = ?", (team_id,)
        ).fetchone()
        if old_lead and old_lead["lead_agent_id"]:
            db.execute(
                "UPDATE team_members SET role = 'member' WHERE team_id = ? AND agent_id = ?",
                (team_id, old_lead["lead_agent_id"]),
            )

        # Promote new Lead
        db.execute(
            "UPDATE teams SET lead_agent_id = ? WHERE id = ?",
            (agent_id, team_id),
        )
        db.execute(
            "UPDATE team_members SET role = 'lead' WHERE team_id = ? AND agent_id = ?",
            (team_id, agent_id),
        )
        db.commit()

        logger.info("Team %s Lead changed to %s", team_id, agent_id)
        return self.get_team(team_id)

    def get_lead(self, team_id: str) -> Optional[str]:
        """Get the Team Lead agent ID."""
        db = get_db()
        row = db.execute(
            "SELECT lead_agent_id FROM teams WHERE id = ?", (team_id,)
        ).fetchone()
        return row["lead_agent_id"] if row else None

    def remove_member(self, team_id: str, agent_id: str) -> None:
        """Remove a member from a team."""
        db = get_db()
        db.execute(
            "DELETE FROM team_members WHERE team_id = ? AND agent_id = ?",
            (team_id, agent_id),
        )
        db.commit()
        self._update_agent_to_agent_config(team_id)

    def update_schedule(self, team_id: str, schedule: dict[str, Any]) -> dict[str, Any]:
        """Update team schedule configuration and sync to OpenClaw runtime.

        Returns a dict with sync status information.
        """
        db = get_db()
        db.execute(
            "UPDATE teams SET schedule_config = ?, schedule_json = ? WHERE id = ?",
            (json.dumps(schedule), json.dumps(schedule), team_id),
        )
        db.commit()

        # Sync schedule to OpenClaw runtime (cron/jobs.json, heartbeat, etc.)
        sync_result: dict[str, Any] = {"saved": True, "synced": False}
        try:
            from openclaw_orchestrator.services.schedule_executor import schedule_executor
            sync_result = schedule_executor.sync_schedule(team_id, schedule)
            sync_result["saved"] = True
            logger.info("Schedule for team %s synced: %s", team_id, sync_result)
        except Exception as exc:
            logger.error("Failed to sync schedule for team %s: %s", team_id, exc)
            sync_result["syncError"] = str(exc)

        return sync_result

    def get_team_md(self, team_id: str) -> str:
        """Get team.md content."""
        md_path = os.path.join("teams", team_id, "team.md")
        if not file_manager.file_exists(md_path):
            return ""
        return file_manager.read_file(md_path)

    def update_team_md(self, team_id: str, content: str) -> None:
        """Update team.md content."""
        file_manager.write_file(os.path.join("teams", team_id, "team.md"), content)

    # ─── Private helpers ───

    def _get_team_members(self, team_id: str) -> list[dict[str, Any]]:
        db = get_db()
        rows = db.execute(
            "SELECT * FROM team_members WHERE team_id = ? ORDER BY join_order",
            (team_id,),
        ).fetchall()
        return [
            {"agentId": r["agent_id"], "role": r["role"], "joinOrder": r["join_order"]}
            for r in rows
        ]

    def _update_agent_to_agent_config(self, team_id: str) -> None:
        members = self._get_team_members(team_id)
        agent_ids = [m["agentId"] for m in members]

        if not file_manager.file_exists("openclaw.json"):
            return

        oc_config = file_manager.read_json("openclaw.json")
        if "agentToAgent" not in oc_config:
            oc_config["agentToAgent"] = {}
        if "allow" not in oc_config["agentToAgent"]:
            oc_config["agentToAgent"]["allow"] = []

        for aid in agent_ids:
            for other in agent_ids:
                if aid != other:
                    pair = f"{aid}:{other}"
                    if pair not in oc_config["agentToAgent"]["allow"]:
                        oc_config["agentToAgent"]["allow"].append(pair)

        file_manager.write_json("openclaw.json", oc_config)


# Singleton instance
team_service = TeamService()
