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


class TeamService:
    """Service for managing teams."""

    @staticmethod
    def _normalize_lead_mode(value: Optional[str]) -> str:
        mode = str(value or "agent").strip().lower()
        return mode if mode in {"agent", "manual"} else "agent"

    @staticmethod
    def _normalize_schedule(row: Any) -> dict[str, Any] | None:
        schedule_config = row["schedule_config"] if "schedule_config" in row.keys() else None
        if schedule_config and schedule_config != "{}":
            try:
                parsed = json.loads(schedule_config)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass

        # 兼容历史字段 schedule_json
        schedule_json = row["schedule_json"] if "schedule_json" in row.keys() else None
        if schedule_json and schedule_json != "{}":
            try:
                parsed = json.loads(schedule_json)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass
        return None

    @staticmethod
    def _generate_default_lead_agent_id(team_id: str) -> str:
        return f"lead-{team_id[:8]}"

    def _ensure_lead_member(self, team_id: str, agent_id: str) -> None:
        db = get_db()
        member = db.execute(
            "SELECT 1 FROM team_members WHERE team_id = ? AND agent_id = ?",
            (team_id, agent_id),
        ).fetchone()
        if member:
            db.execute(
                "UPDATE team_members SET role = 'lead' WHERE team_id = ? AND agent_id = ?",
                (team_id, agent_id),
            )
        else:
            max_order_row = db.execute(
                "SELECT MAX(join_order) as m FROM team_members WHERE team_id = ?",
                (team_id,),
            ).fetchone()
            max_order = max_order_row["m"] or 0
            db.execute(
                "INSERT INTO team_members (team_id, agent_id, role, join_order) VALUES (?, ?, 'lead', ?)",
                (team_id, agent_id, max_order + 1),
            )

    def _bootstrap_lead_agent_profile(
        self,
        *,
        agent_id: str,
        team_name: str,
        team_description: Optional[str] = None,
        team_goal: Optional[str] = None,
    ) -> None:
        """Ensure lead agent profile exists with default governance prompt."""
        from openclaw_orchestrator.services.agent_service import agent_service

        agent_service.bootstrap_team_lead(
            agent_id=agent_id,
            team_name=team_name,
            team_description=team_description,
            team_goal=team_goal,
        )

    def create_team(
        self,
        name: str,
        description: str,
        goal: Optional[str] = None,
        theme: Optional[str] = None,
        lead_mode: Optional[str] = None,
        lead_agent_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new team with directory structure."""
        db = get_db()
        team_id = str(uuid.uuid4())
        team_dir = os.path.join("teams", team_id)
        normalized_mode = self._normalize_lead_mode(lead_mode)

        resolved_lead_agent_id = str(lead_agent_id or "").strip() or self._generate_default_lead_agent_id(team_id)

        file_manager.ensure_dir(team_dir)
        file_manager.ensure_dir(os.path.join(team_dir, "active"))
        file_manager.ensure_dir(os.path.join(team_dir, "archive"))
        file_manager.ensure_dir(os.path.join(team_dir, "knowledge"))
        file_manager.ensure_dir(os.path.join(team_dir, "meetings"))

        file_manager.write_file(
            os.path.join(team_dir, "team.md"),
            TEAM_MD_TEMPLATE.format(name=name, goal=goal or "待定义"),
        )

        if resolved_lead_agent_id:
            self._bootstrap_lead_agent_profile(
                agent_id=resolved_lead_agent_id,
                team_name=name,
                team_description=description,
                team_goal=goal,
            )

        db.execute(
            """
            INSERT INTO teams (
                id, name, description, goal, theme, team_dir,
                lead_agent_id, lead_mode, default_workflow_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                team_id,
                name,
                description,
                goal or "",
                theme or "default",
                file_manager.get_full_path(team_dir),
                resolved_lead_agent_id,
                normalized_mode,
            ),
        )

        if resolved_lead_agent_id:
            db.execute(
                "INSERT INTO team_members (team_id, agent_id, role, join_order) VALUES (?, ?, 'lead', 1)",
                (team_id, resolved_lead_agent_id),
            )

        db.commit()
        self._update_agent_to_agent_config(team_id)
        return self.get_team(team_id)

    def get_team(self, team_id: str) -> dict[str, Any]:
        """Get team details including members."""
        db = get_db()
        row = db.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()
        if not row:
            raise ValueError(f"Team not found: {team_id}")

        members = self._get_team_members(team_id)
        schedule = self._normalize_schedule(row)

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
            "defaultWorkflowId": row["default_workflow_id"] if "default_workflow_id" in row.keys() else None,
            "leadMode": row["lead_mode"] if "lead_mode" in row.keys() else "agent",
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
        """Remove a member from a team.

        If the removed member is current lead, auto-assign the earliest remaining
        member as new lead.
        """
        db = get_db()
        old_lead = db.execute(
            "SELECT lead_agent_id FROM teams WHERE id = ?",
            (team_id,),
        ).fetchone()
        removed_was_lead = bool(old_lead and old_lead["lead_agent_id"] == agent_id)

        db.execute(
            "DELETE FROM team_members WHERE team_id = ? AND agent_id = ?",
            (team_id, agent_id),
        )

        if removed_was_lead:
            next_member = db.execute(
                "SELECT agent_id FROM team_members WHERE team_id = ? ORDER BY join_order ASC LIMIT 1",
                (team_id,),
            ).fetchone()
            next_lead = next_member["agent_id"] if next_member else self._generate_default_lead_agent_id(team_id)
            team_row = db.execute(
                "SELECT name, description, goal FROM teams WHERE id = ?",
                (team_id,),
            ).fetchone()
            team_name = str(team_row["name"] if team_row and team_row["name"] else team_id)
            team_description = str(team_row["description"] if team_row and team_row["description"] else "")
            team_goal = str(team_row["goal"] if team_row and team_row["goal"] else "")
            self._bootstrap_lead_agent_profile(
                agent_id=next_lead,
                team_name=team_name,
                team_description=team_description,
                team_goal=team_goal,
            )
            db.execute(
                "UPDATE teams SET lead_agent_id = ? WHERE id = ?",
                (next_lead, team_id),
            )
            self._ensure_lead_member(team_id, next_lead)

        db.commit()
        self._update_agent_to_agent_config(team_id)

    def set_execution_config(
        self,
        team_id: str,
        *,
        default_workflow_id: Optional[str] = None,
        lead_mode: Optional[str] = None,
    ) -> dict[str, Any]:
        """Set default workflow + lead mode for team execution."""
        db = get_db()

        current = db.execute(
            "SELECT id, lead_agent_id, lead_mode, default_workflow_id FROM teams WHERE id = ?",
            (team_id,),
        ).fetchone()
        if not current:
            raise ValueError(f"Team not found: {team_id}")

        updates: list[str] = []
        values: list[Any] = []

        if default_workflow_id is not None:
            normalized_wf = str(default_workflow_id).strip() or None
            updates.append("default_workflow_id = ?")
            values.append(normalized_wf)

        normalized_mode = None
        if lead_mode is not None:
            normalized_mode = self._normalize_lead_mode(lead_mode)
            updates.append("lead_mode = ?")
            values.append(normalized_mode)

        if updates:
            values.append(team_id)
            db.execute(f"UPDATE teams SET {', '.join(updates)} WHERE id = ?", values)

        # 任意模式下都不允许团队长期处于无 lead 状态
        final_lead = current["lead_agent_id"] if "lead_agent_id" in current.keys() else None
        if not final_lead:
            bootstrap_lead = self._generate_default_lead_agent_id(team_id)
            team_row = db.execute(
                "SELECT name, description, goal FROM teams WHERE id = ?",
                (team_id,),
            ).fetchone()
            team_name = str(team_row["name"] if team_row and team_row["name"] else team_id)
            team_description = str(team_row["description"] if team_row and team_row["description"] else "")
            team_goal = str(team_row["goal"] if team_row and team_row["goal"] else "")
            self._bootstrap_lead_agent_profile(
                agent_id=bootstrap_lead,
                team_name=team_name,
                team_description=team_description,
                team_goal=team_goal,
            )
            db.execute(
                "UPDATE teams SET lead_agent_id = ? WHERE id = ?",
                (bootstrap_lead, team_id),
            )
            self._ensure_lead_member(team_id, bootstrap_lead)

        db.commit()
        self._update_agent_to_agent_config(team_id)
        return self.get_team(team_id)

    def update_schedule(self, team_id: str, schedule: dict[str, Any]) -> dict[str, Any]:
        """Update team schedule configuration and sync to OpenClaw runtime.

        Returns a dict with sync status information.
        """
        db = get_db()
        db.execute(
            "UPDATE teams SET schedule_config = ? WHERE id = ?",
            (json.dumps(schedule), team_id),
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

        # Bridge: when team has default workflow, derive workflow scheduler cron from team roster schedule
        workflow_sync = self._sync_default_workflow_schedule(team_id, schedule)
        if workflow_sync is not None:
            sync_result["defaultWorkflowSync"] = workflow_sync

        return sync_result

    def _derive_workflow_schedule_from_team_schedule(
        self, schedule: dict[str, Any]
    ) -> dict[str, Any] | None:
        mode = str(schedule.get("type") or schedule.get("mode") or "").strip().lower()
        timezone_name = str(schedule.get("timezone") or "UTC").strip() or "UTC"
        entries = schedule.get("entries")
        if not isinstance(entries, list) or not entries:
            return None

        if mode == "time-based":
            first = entries[0] if isinstance(entries[0], dict) else {}
            start_time = str(first.get("startTime") or "09:00").strip()
            if ":" not in start_time:
                return None
            hour_text, minute_text = start_time.split(":", 1)
            try:
                hour = max(0, min(23, int(hour_text)))
                minute = max(0, min(59, int(minute_text)))
            except ValueError:
                return None
            return {
                "enabled": True,
                "cron": f"{minute} {hour} * * *",
                "timezone": timezone_name,
            }

        if mode == "custom":
            first = entries[0] if isinstance(entries[0], dict) else {}
            custom_rule = str(first.get("customRule") or "").strip()
            if not custom_rule:
                return None
            return {
                "enabled": True,
                "cron": custom_rule,
                "timezone": timezone_name,
            }

        return None

    def _sync_default_workflow_schedule(
        self,
        team_id: str,
        schedule: dict[str, Any],
    ) -> dict[str, Any] | None:
        db = get_db()
        row = db.execute(
            "SELECT default_workflow_id FROM teams WHERE id = ?",
            (team_id,),
        ).fetchone()
        if not row:
            return {"synced": False, "reason": f"team_not_found:{team_id}"}

        default_workflow_id = str(row["default_workflow_id"] or "").strip()
        if not default_workflow_id:
            return None

        workflow = db.execute(
            "SELECT id FROM workflows WHERE id = ? AND team_id = ?",
            (default_workflow_id, team_id),
        ).fetchone()
        if not workflow:
            return {
                "synced": False,
                "workflowId": default_workflow_id,
                "reason": "workflow_not_in_team",
            }

        derived = self._derive_workflow_schedule_from_team_schedule(schedule)
        if derived is None:
            return {
                "synced": False,
                "workflowId": default_workflow_id,
                "reason": "schedule_mode_not_mappable",
            }

        try:
            from openclaw_orchestrator.services.workflow_engine import workflow_engine

            workflow_engine.update_workflow(default_workflow_id, {"schedule": derived})
            return {
                "synced": True,
                "workflowId": default_workflow_id,
                "schedule": derived,
            }
        except Exception as exc:
            logger.warning(
                "Failed to sync default workflow schedule for team %s: %s",
                team_id,
                exc,
            )
            return {
                "synced": False,
                "workflowId": default_workflow_id,
                "reason": str(exc),
            }

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
        tools = oc_config.get("tools")
        if not isinstance(tools, dict):
            tools = {}
            oc_config["tools"] = tools

        agent_to_agent = tools.get("agentToAgent")
        if not isinstance(agent_to_agent, dict):
            agent_to_agent = {}
            tools["agentToAgent"] = agent_to_agent

        allow = agent_to_agent.get("allow")
        if not isinstance(allow, list):
            allow = []
            agent_to_agent["allow"] = allow

        for aid in agent_ids:
            for other in agent_ids:
                if aid != other:
                    pair = f"{aid}:{other}"
                    if pair not in allow:
                        allow.append(pair)

        file_manager.write_json("openclaw.json", oc_config)


# Singleton instance
team_service = TeamService()
