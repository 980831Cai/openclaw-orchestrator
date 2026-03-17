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
from openclaw_orchestrator.services.team_service import TeamService


class TeamServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._original_openclaw_home = settings.openclaw_home
        settings.openclaw_home = self._temp_dir.name

        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "team-service.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)

        close_db()
        init_database()
        self.addCleanup(close_db)
        self.addCleanup(self._restore_home)

        self.service = TeamService()

    def _restore_home(self) -> None:
        settings.openclaw_home = self._original_openclaw_home

    def test_create_team_auto_bootstrap_default_lead(self) -> None:
        team = self.service.create_team(
            name="平台团队",
            description="负责平台治理与协作编排",
            goal="让关键任务稳定推进并及时汇报风险",
            lead_mode="agent",
        )

        self.assertIsNotNone(team["leadAgentId"])
        self.assertEqual(team["leadMode"], "agent")
        self.assertTrue(
            any(member["role"] == "lead" and member["agentId"] == team["leadAgentId"] for member in team["members"])
        )
        self.assertTrue(file_manager.is_directory(f"agents/{team['leadAgentId']}"))

        identity_content = file_manager.read_file(f"agents/{team['leadAgentId']}/IDENTITY.md")
        soul_content = file_manager.read_file(f"agents/{team['leadAgentId']}/SOUL.md")
        rules_content = file_manager.read_file(f"agents/{team['leadAgentId']}/AGENTS.md")

        self.assertIn("平台团队 Lead", identity_content)
        self.assertIn("我是 平台团队 的负责人", identity_content)
        self.assertIn("负责平台治理与协作编排", identity_content)
        self.assertIn("让关键任务稳定推进并及时汇报风险", identity_content)
        self.assertIn("我的管理范围包括：负责平台治理与协作编排", soul_content)
        self.assertIn("先确认 平台团队 当前目标", rules_content)

    def test_remove_lead_reassigns_first_member(self) -> None:
        team = self.service.create_team(
            name="稳定性团队",
            description="负责稳定性保障",
            goal="持续识别风险并推动系统恢复",
            lead_mode="agent",
        )
        old_lead = team["leadAgentId"]
        self.service.add_member(team["id"], "member-agent-1")

        self.service.remove_member(team["id"], old_lead)
        updated = self.service.get_team(team["id"])

        self.assertEqual(updated["leadAgentId"], "member-agent-1")
        self.assertTrue(
            any(member["agentId"] == "member-agent-1" and member["role"] == "lead" for member in updated["members"])
        )

        reassigned_identity = file_manager.read_file("agents/member-agent-1/IDENTITY.md")
        self.assertIn("稳定性团队 Lead", reassigned_identity)
        self.assertIn("持续识别风险并推动系统恢复", reassigned_identity)

    def test_create_team_manual_mode_still_bootstraps_lead(self) -> None:
        team = self.service.create_team(
            name="研发团队",
            description="负责功能迭代",
            lead_mode="manual",
        )

        self.assertEqual(team["leadMode"], "manual")
        self.assertTrue(team["leadAgentId"])
        self.assertTrue(any(m["role"] == "lead" for m in team["members"]))

        identity_path = f"agents/{team['leadAgentId']}/IDENTITY.md"
        rules_path = f"agents/{team['leadAgentId']}/AGENTS.md"
        self.assertTrue(file_manager.file_exists(identity_path))
        self.assertTrue(file_manager.file_exists(rules_path))

    def test_set_execution_config_updates_workflow_and_mode(self) -> None:
        team = self.service.create_team(
            name="研发团队",
            description="负责功能迭代",
            lead_mode="manual",
        )

        updated = self.service.set_execution_config(
            team["id"],
            default_workflow_id="wf-main",
            lead_mode="agent",
        )

        self.assertEqual(updated["defaultWorkflowId"], "wf-main")
        self.assertEqual(updated["leadMode"], "agent")
        self.assertTrue(updated["leadAgentId"])

    def test_get_team_falls_back_to_legacy_schedule_json(self) -> None:
        db = get_db()
        team_id = "legacy-team"
        team_dir = file_manager.get_full_path(f"teams/{team_id}")
        file_manager.ensure_dir(f"teams/{team_id}/active")
        file_manager.ensure_dir(f"teams/{team_id}/archive")
        file_manager.ensure_dir(f"teams/{team_id}/knowledge")
        file_manager.ensure_dir(f"teams/{team_id}/meetings")

        db.execute(
            """
            INSERT INTO teams (
                id, name, description, goal, theme,
                schedule_json, schedule_config, team_dir
            ) VALUES (?, ?, '', '', 'default', ?, ?, ?)
            """,
            (team_id, "历史团队", '{"rotation":"daily"}', '{}', team_dir),
        )
        db.commit()

        team = self.service.get_team(team_id)
        self.assertEqual(team["schedule"], {"rotation": "daily"})


if __name__ == "__main__":
    unittest.main()
