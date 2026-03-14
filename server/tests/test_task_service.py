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
from openclaw_orchestrator.services.task_service import task_service


class TaskServiceHandoffTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "task.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)

        self.team_id = "team-task-test"
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            (self.team_id, "测试团队", self._temp_dir.name),
        )
        db.commit()

        task = task_service.create_task(
            team_id=self.team_id,
            title="任务A",
            description="实现A",
            participant_agent_ids=["agent-a", "agent-b"],
        )
        self.task_id = task["id"]

    def test_append_handoff_record_and_read_recent(self) -> None:
        handoff = task_service.append_handoff_record(
            task_id=self.task_id,
            node_id="task-1",
            from_agent_id="agent-a",
            raw_output="""summary: 完成接口定义\nto: agent-b\ndependencies: schema-review\nrisk: medium\nblocked: no""",
        )

        self.assertEqual(handoff["fromAgentId"], "agent-a")
        self.assertIn("agent-b", handoff["toAgentIds"])

        recent = task_service.get_recent_handoffs(self.task_id, limit=3)
        self.assertGreaterEqual(len(recent), 1)
        self.assertEqual(recent[-1]["nodeId"], "task-1")

        ok, reason = task_service.validate_handoff(
            recent[-1],
            mode="strict",
            expected_from_agent="agent-a",
        )
        self.assertTrue(ok, reason)

    def test_authorized_decision_excerpt_reads_task_digest_only(self) -> None:
        task_service.append_authorized_decision_summary(
            task_id=self.task_id,
            meeting_id="meeting-123456",
            summary="会议决定先发布灰度版本",
            participants=["agent-a", "agent-b"],
        )

        excerpt = task_service.get_authorized_decision_excerpt(self.task_id, max_chars=500)
        self.assertIn("灰度版本", excerpt)


class TaskServiceQueueStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "task-queue.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)

        self.team_id = "team-task-queue"
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            (self.team_id, "队列团队", self._temp_dir.name),
        )
        db.commit()

    def test_create_task_sets_queue_metadata(self) -> None:
        task = task_service.create_task(
            team_id=self.team_id,
            title="任务Q",
            description="队列测试",
            participant_agent_ids=["agent-q"],
            queue_status="ready",
            parent_task_id="parent-1",
            planned_by="lead-agent",
        )

        self.assertEqual(task["queueStatus"], "ready")
        self.assertEqual(task["parentTaskId"], "parent-1")
        self.assertEqual(task["plannedBy"], "lead-agent")
        self.assertIsNotNone(task["queuedAt"])

    def test_set_queue_status_updates_runtime_fields(self) -> None:
        task = task_service.create_task(
            team_id=self.team_id,
            title="任务R",
            description="运行态测试",
            participant_agent_ids=["agent-r"],
        )

        running = task_service.set_queue_status(
            task["id"],
            "running",
            execution_id="exec-1",
            node_id="node-1",
        )
        self.assertEqual(running["queueStatus"], "running")
        self.assertEqual(running["executionId"], "exec-1")
        self.assertEqual(running["lastNodeId"], "node-1")
        self.assertIsNotNone(running["startedAt"])

        blocked = task_service.set_queue_status(
            task["id"],
            "blocked",
            blocked_reason="等待上游产物",
            last_error="timeout",
        )
        self.assertEqual(blocked["queueStatus"], "blocked")
        self.assertEqual(blocked["blockedReason"], "等待上游产物")
        self.assertEqual(blocked["lastError"], "timeout")
        self.assertEqual(blocked["retryCount"], 1)

        done = task_service.set_queue_status(task["id"], "done")
        self.assertEqual(done["queueStatus"], "done")
        self.assertEqual(done["status"], "completed")
        self.assertIsNotNone(done["finishedAt"])


if __name__ == "__main__":
    unittest.main()
