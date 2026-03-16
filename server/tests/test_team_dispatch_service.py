import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.database.db import close_db, get_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.task_service import task_service
from openclaw_orchestrator.services.team_dispatch_service import team_dispatch_service


class TeamDispatchServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "dispatch.sqlite"),
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
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-1", "测试团队", self._temp_dir.name),
        )
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            ("wf-1", "team-1", "测试工作流", '{"nodes": {}, "edges": []}'),
        )
        db.commit()

    def test_idempotency_window_deduplicates_within_24h(self) -> None:
        payload = {"content": "hello"}
        first, first_created = team_dispatch_service._create_or_get_trigger_event(
            team_id="team-1",
            workflow_id="wf-1",
            source="manual",
            actor_id="tester",
            session_id="s1",
            idempotency_key="dup-key",
            request_payload=payload,
        )
        second, second_created = team_dispatch_service._create_or_get_trigger_event(
            team_id="team-1",
            workflow_id="wf-1",
            source="manual",
            actor_id="tester",
            session_id="s2",
            idempotency_key="dup-key",
            request_payload=payload,
        )

        self.assertTrue(first_created)
        self.assertFalse(second_created)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(second["status"], "deduplicated")

    def test_idempotency_window_allows_after_expired(self) -> None:
        payload = {"content": "hello"}
        first, _ = team_dispatch_service._create_or_get_trigger_event(
            team_id="team-1",
            workflow_id="wf-1",
            source="manual",
            actor_id="tester",
            session_id="s1",
            idempotency_key="expired-key",
            request_payload=payload,
            dedupe_window_hours=1,
        )

        db = get_db()
        db.execute(
            "UPDATE trigger_events SET created_at = datetime('now', '-2 hours') WHERE id = ?",
            (first["id"],),
        )
        db.commit()

        second, second_created = team_dispatch_service._create_or_get_trigger_event(
            team_id="team-1",
            workflow_id="wf-1",
            source="manual",
            actor_id="tester",
            session_id="s2",
            idempotency_key="expired-key",
            request_payload=payload,
            dedupe_window_hours=1,
        )

        self.assertTrue(second_created)
        self.assertNotEqual(first["id"], second["id"])

    def test_drain_once_reports_recovery_result(self) -> None:
        task = task_service.create_task(
            team_id="team-1",
            title="队列任务",
            description="测试",
            participant_agent_ids=["agent-1"],
            queue_status="ready",
            workflow_id="wf-1",
        )

        with patch(
            "openclaw_orchestrator.services.team_dispatch_service.workflow_engine.has_active_execution",
            return_value=False,
        ), patch(
            "openclaw_orchestrator.services.team_dispatch_service.workflow_engine.execute_workflow",
            new=AsyncMock(return_value={"id": "exec-1"}),
        ), patch(
            "openclaw_orchestrator.services.team_dispatch_service.task_service.recover_stale_running_tasks",
            return_value={"scanned": 0, "recovered": 0, "blocked": 0},
        ):
            result = asyncio.run(team_dispatch_service.drain_once("team-1"))

        self.assertTrue(result["started"])
        self.assertEqual(result["taskId"], task["id"])
        self.assertEqual(result["executionId"], "exec-1")
        self.assertIn("recovery", result)


if __name__ == "__main__":
    unittest.main()
