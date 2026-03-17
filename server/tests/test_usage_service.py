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
from openclaw_orchestrator.services.team_usage_service import team_usage_service


class TeamUsageServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "usage.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)
        self._seed_data()

    def _seed_data(self) -> None:
        db = get_db()
        db.execute(
            "INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir) VALUES (?, ?, '', '', 'default', '{}', ?)",
            ("team-1", "增长团队", self._temp_dir.name),
        )
        db.execute(
            "INSERT INTO workflows (id, team_id, name, definition_json, status) VALUES (?, ?, ?, '{}', 'draft')",
            ("wf-1", "team-1", "发布流程"),
        )
        db.execute(
            "INSERT INTO workflows (id, team_id, name, definition_json, status) VALUES (?, ?, ?, '{}', 'draft')",
            ("wf-2", "team-1", "复盘流程"),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (
                id, workflow_id, status, logs, started_at, completed_at,
                prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
                usage_metrics_count, usage_samples_count, usage_coverage_ratio, model_summary_json
            ) VALUES (?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            """,
            (
                "exec-1",
                "wf-1",
                "completed",
                "2026-03-17 10:00:00",
                "2026-03-17 10:05:00",
                120,
                80,
                200,
                0.24,
                1,
                1,
                1.0,
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (
                id, workflow_id, status, logs, started_at, completed_at,
                prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
                usage_metrics_count, usage_samples_count, usage_coverage_ratio, model_summary_json
            ) VALUES (?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, ?, '')
            """,
            (
                "exec-2",
                "wf-2",
                "failed",
                "2026-03-18 11:00:00",
                "2026-03-18 11:03:00",
                50,
                0,
                50,
                0.0,
                1,
                0,
                0.0,
            ),
        )
        db.execute(
            """
            INSERT INTO execution_usage_metrics (
                execution_id, workflow_id, team_id, node_id, agent_id, model, channel,
                prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
                duration_ms, has_usage, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "exec-1",
                "wf-1",
                "team-1",
                "node-1",
                "agent-a",
                "claude-3-7-sonnet",
                "gateway",
                120,
                80,
                200,
                0.24,
                300000,
                1,
                "2026-03-17 10:04:00",
            ),
        )
        db.execute(
            """
            INSERT INTO execution_usage_metrics (
                execution_id, workflow_id, team_id, node_id, agent_id, model, channel,
                prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
                duration_ms, has_usage, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "exec-2",
                "wf-2",
                "team-1",
                "node-2",
                "agent-b",
                "gpt-4.1",
                "webhook+jsonl",
                50,
                0,
                50,
                0.0,
                180000,
                0,
                "2026-03-18 11:02:00",
            ),
        )
        db.commit()

    def test_summary_aggregates_execution_and_coverage(self) -> None:
        with patch("openclaw_orchestrator.services.team_usage_service.utc_now") as mocked_now:
            from datetime import datetime, timezone

            mocked_now.return_value = datetime(2026, 3, 18, 12, 0, 0, tzinfo=timezone.utc)
            summary = team_usage_service.get_summary("team-1", days=7)

        self.assertEqual(summary["executionCount"], 2)
        self.assertEqual(summary["successCount"], 1)
        self.assertEqual(summary["promptTokens"], 170)
        self.assertEqual(summary["totalTokens"], 250)
        self.assertAlmostEqual(summary["successRate"], 0.5)
        self.assertAlmostEqual(summary["coverageRate"], 1.0)

    def test_breakdowns_return_model_agent_and_workflow_rankings(self) -> None:
        with patch("openclaw_orchestrator.services.team_usage_service.utc_now") as mocked_now:
            from datetime import datetime, timezone

            mocked_now.return_value = datetime(2026, 3, 18, 12, 0, 0, tzinfo=timezone.utc)
            models = team_usage_service.get_model_breakdown("team-1", days=7)
            agents = team_usage_service.get_agent_breakdown("team-1", days=7)
            workflows = team_usage_service.get_workflow_breakdown("team-1", days=7)

        self.assertEqual(models[0]["model"], "claude-3-7-sonnet")
        self.assertEqual(agents[0]["agentId"], "agent-a")
        self.assertEqual(workflows[0]["workflowId"], "wf-1")
        self.assertEqual(workflows[0]["workflowName"], "发布流程")


if __name__ == "__main__":
    unittest.main()
