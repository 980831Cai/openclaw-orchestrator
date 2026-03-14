import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.database.db import close_db, get_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.file_manager import file_manager
from openclaw_orchestrator.services.task_service import task_service
from openclaw_orchestrator.services.team_context_service import team_context_service


class TeamContextServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "team-context.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)

        # keep original budget settings
        self._original_budgets = (
            settings.context_budget_total_chars,
            settings.context_budget_team_chars,
            settings.context_budget_task_chars,
            settings.context_budget_meeting_chars,
            settings.context_budget_meeting_items,
        )
        self.addCleanup(self._restore_budgets)

        close_db()
        init_database()
        self.addCleanup(close_db)

    def _restore_budgets(self) -> None:
        (
            settings.context_budget_total_chars,
            settings.context_budget_team_chars,
            settings.context_budget_task_chars,
            settings.context_budget_meeting_chars,
            settings.context_budget_meeting_items,
        ) = self._original_budgets

    def _create_team(self, team_id: str, name: str) -> dict[str, str]:
        db = get_db()
        team_dir = file_manager.get_full_path(f"teams/{team_id}")
        file_manager.ensure_dir(f"teams/{team_id}/active")
        file_manager.ensure_dir(f"teams/{team_id}/archive")
        file_manager.ensure_dir(f"teams/{team_id}/knowledge")
        file_manager.ensure_dir(f"teams/{team_id}/meetings")
        file_manager.write_file(
            f"teams/{team_id}/team.md",
            f"# {name}\n\n## 团队目标\n稳定交付\n\n## 协作规则\n严格评审\n",
        )
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            (team_id, name, team_dir),
        )
        db.commit()
        return {"id": team_id, "name": name}

    def test_build_context_includes_layered_task_and_authorized_decision_sources(self) -> None:
        team = self._create_team("team-a", "团队A")
        task = task_service.create_task(team["id"], "任务A", "实现并验证", ["agent-a"])
        task_service.append_handoff_record(
            task_id=task["id"],
            node_id="task-1",
            from_agent_id="agent-a",
            raw_output="summary: 已完成接口定义\nto: agent-b\nblocked: no",
        )
        task_service.append_authorized_decision_summary(
            task_id=task["id"],
            meeting_id="meeting-demo",
            summary="统一采用规范模板。",
            participants=["agent-a", "agent-b"],
        )

        context = team_context_service.build_context(
            team_id=team["id"],
            task_id=task["id"],
            scene="workflow_task",
            read_level="L3",
            include_authorized_decision=True,
        )

        self.assertEqual(context["teamId"], team["id"])
        self.assertIn("团队规则与长期共识", context["content"])
        self.assertIn("当前任务目标", context["content"])
        self.assertIn("最近可执行交接（L3）", context["content"])
        self.assertIn("已授权决议摘要", context["content"])

        kinds = {item["kind"] for item in context["sources"]}
        self.assertIn("team_md", kinds)
        self.assertIn("task_goal", kinds)
        self.assertIn("task_handoff", kinds)
        self.assertIn("authorized_decision", kinds)

    def test_build_context_rejects_cross_team_task(self) -> None:
        team_a = self._create_team("team-a", "团队A")
        team_b = self._create_team("team-b", "团队B")
        task_b = task_service.create_task(team_b["id"], "任务B", "只属于B", ["agent-b"])

        with self.assertRaises(ValueError):
            team_context_service.build_context(
                team_id=team_a["id"],
                task_id=task_b["id"],
                scene="workflow_task",
            )

    def test_build_context_marks_truncated_when_budget_is_tight(self) -> None:
        settings.context_budget_total_chars = 120
        settings.context_budget_team_chars = 120
        settings.context_budget_task_chars = 120
        settings.context_budget_meeting_chars = 120
        settings.context_budget_meeting_items = 1

        team = self._create_team("team-a", "团队A")
        task = task_service.create_task(team["id"], "任务A", "描述" + "Y" * 500, ["agent-a"])

        context = team_context_service.build_context(
            team_id=team["id"],
            task_id=task["id"],
            scene="workflow_task",
        )

        self.assertTrue(context["truncated"])
        self.assertLessEqual(context["budget"]["used"], settings.context_budget_total_chars)


if __name__ == "__main__":
    unittest.main()
