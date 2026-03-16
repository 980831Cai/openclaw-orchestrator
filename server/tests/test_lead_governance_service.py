import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.database.db import close_db, get_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.lead_governance_service import LeadGovernanceService


class LeadGovernanceServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "lead-governance.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)

        close_db()
        init_database()
        self.addCleanup(close_db)

        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir, lead_agent_id, lead_mode)
            VALUES (?, ?, '', '', 'default', '{}', ?, ?, 'agent')
            """,
            ("team-1", "团队一", self._temp_dir.name, "lead-team-1"),
        )
        db.execute(
            """
            INSERT INTO tasks (id, team_id, title, description, status, queue_status, task_file_path, participant_agent_ids, artifact_count)
            VALUES (?, ?, ?, ?, 'active', 'blocked', ?, '[]', 0)
            """,
            ("task-1", "team-1", "阻塞任务", "等待输入", self._temp_dir.name),
        )
        db.commit()

    def test_maybe_run_generates_report_and_snapshot(self) -> None:
        service = LeadGovernanceService()

        with patch(
            "openclaw_orchestrator.services.lead_governance_service.openclaw_bridge.read_heartbeat_status",
            return_value={"alive": True, "lastCheck": "2026-03-16T00:00:00Z", "ageMinutes": 1.5, "checklistItems": 2},
        ), patch(
            "openclaw_orchestrator.services.lead_governance_service.openclaw_bridge.report_team_governance_summary",
            return_value=True,
        ) as mocked_report:
            result = service.maybe_run(force=True)

        self.assertTrue(result["ran"])
        self.assertEqual(result["teamCount"], 1)
        self.assertEqual(result["reports"][0]["teamId"], "team-1")
        self.assertEqual(result["reports"][0]["leadHealth"]["alive"], True)
        mocked_report.assert_called_once()

    def test_maybe_run_respects_interval(self) -> None:
        service = LeadGovernanceService()

        with patch(
            "openclaw_orchestrator.services.lead_governance_service.openclaw_bridge.read_heartbeat_status",
            return_value={"alive": True, "lastCheck": None, "ageMinutes": 0.0, "checklistItems": 0},
        ), patch(
            "openclaw_orchestrator.services.lead_governance_service.openclaw_bridge.report_team_governance_summary",
            return_value=True,
        ):
            first = service.maybe_run(force=True)
            second = service.maybe_run(force=False)

        self.assertTrue(first["ran"])
        self.assertFalse(second["ran"])
        self.assertEqual(second["reason"], "interval_not_reached")


if __name__ == "__main__":
    unittest.main()
