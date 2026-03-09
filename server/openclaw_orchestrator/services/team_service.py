"""Team management service."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.file_manager import file_manager

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


class TeamService:
    """Service for managing teams."""

    def create_team(
        self,
        name: str,
        description: str,
        goal: Optional[str] = None,
        theme: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new team with directory structure."""
        db = get_db()
        team_id = str(uuid.uuid4())
        team_dir = os.path.join("teams", team_id)

        file_manager.ensure_dir(team_dir)
        file_manager.ensure_dir(os.path.join(team_dir, "active"))
        file_manager.ensure_dir(os.path.join(team_dir, "archive"))
        file_manager.ensure_dir(os.path.join(team_dir, "knowledge"))

        file_manager.write_file(
            os.path.join(team_dir, "team.md"),
            TEAM_MD_TEMPLATE.format(name=name, goal=goal or "待定义"),
        )

        db.execute(
            "INSERT INTO teams (id, name, description, goal, theme, team_dir) VALUES (?, ?, ?, ?, ?, ?)",
            (
                team_id,
                name,
                description,
                goal or "",
                theme or "default",
                file_manager.get_full_path(team_dir),
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
        schedule = json.loads(row["schedule_config"]) if row["schedule_config"] and row["schedule_config"] != "{}" else None

        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "goal": row["goal"],
            "members": members,
            "schedule": schedule,
            "teamDir": row["team_dir"],
            "theme": row["theme"],
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
        """Add a member to a team."""
        db = get_db()
        max_order_row = db.execute(
            "SELECT MAX(join_order) as m FROM team_members WHERE team_id = ?",
            (team_id,),
        ).fetchone()
        max_order = max_order_row["m"] or 0

        db.execute(
            "INSERT OR REPLACE INTO team_members (team_id, agent_id, role, join_order) VALUES (?, ?, ?, ?)",
            (team_id, agent_id, role, max_order + 1),
        )
        db.commit()
        self._update_agent_to_agent_config(team_id)

    def remove_member(self, team_id: str, agent_id: str) -> None:
        """Remove a member from a team."""
        db = get_db()
        db.execute(
            "DELETE FROM team_members WHERE team_id = ? AND agent_id = ?",
            (team_id, agent_id),
        )
        db.commit()
        self._update_agent_to_agent_config(team_id)

    def update_schedule(self, team_id: str, schedule: dict[str, Any]) -> None:
        """Update team schedule configuration."""
        db = get_db()
        db.execute(
            "UPDATE teams SET schedule_config = ? WHERE id = ?",
            (json.dumps(schedule), team_id),
        )
        db.commit()

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
