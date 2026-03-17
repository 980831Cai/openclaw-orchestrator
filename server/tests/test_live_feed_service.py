import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.database import close_db, init_database
from openclaw_orchestrator.services.live_feed_service import LiveFeedService


class LiveFeedServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "test.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)

    def test_get_snapshot_combines_persisted_feed_with_backend_snapshots(self) -> None:
        service = LiveFeedService()
        service.record_message(
            {
                "id": "msg-1",
                "agentId": "agent-a",
                "sessionId": "main",
                "role": "assistant",
                "content": "hello",
                "timestamp": "2026-03-12T10:00:00Z",
            }
        )
        service.record_event(
            {
                "id": "evt-1",
                "fromAgentId": "agent-a",
                "toAgentId": "agent-b",
                "type": "message",
                "content": "ping",
                "timestamp": "2026-03-12T10:00:01Z",
            }
        )

        workflow_signals = [{"executionId": "exec-1", "status": "running"}]
        scheduled_workflows = [
            {
                "id": "workflow-scheduled",
                "name": "Scheduled workflow",
                "teamId": "team-1",
                "nodes": {},
                "edges": [],
                "schedule": {
                    "enabled": True,
                    "cron": "*/5 * * * *",
                    "timezone": "Asia/Shanghai",
                },
            }
        ]
        notifications = [
            {
                "id": "notif-1",
                "title": "审批",
                "message": "待处理",
                "read": False,
                "createdAt": "2026-03-12T10:00:02Z",
                "type": "approval_required",
            }
        ]

        with patch(
            "openclaw_orchestrator.services.workflow_engine.workflow_engine.list_active_execution_signals",
            return_value=workflow_signals,
        ) as workflow_signals_mock, patch(
            "openclaw_orchestrator.services.workflow_engine.workflow_engine.list_workflows",
            return_value=scheduled_workflows,
        ) as workflow_list_mock, patch(
            "openclaw_orchestrator.services.live_feed_service.workflow_scheduler.get_next_run_at",
            return_value="2026-03-12T10:05:00Z",
        ) as next_run_mock, patch(
            "openclaw_orchestrator.services.notification_service.notification_service.get_notifications",
            return_value=notifications,
        ) as notifications_mock, patch(
            "openclaw_orchestrator.services.notification_service.notification_service.get_unread_count",
            return_value=3,
        ) as unread_mock:
            snapshot = service.get_snapshot(limit=20)

        workflow_signals_mock.assert_called_once_with()
        workflow_list_mock.assert_called_once_with()
        next_run_mock.assert_called_once_with(scheduled_workflows[0])
        notifications_mock.assert_called_once_with(limit=20)
        unread_mock.assert_called_once_with()
        self.assertEqual(snapshot["messages"][0]["id"], "msg-1")
        self.assertEqual(snapshot["events"][0]["id"], "evt-1")
        self.assertEqual(snapshot["workflowSignals"], workflow_signals)
        self.assertEqual(
            snapshot["scheduledWorkflows"],
            [
                {
                    **scheduled_workflows[0],
                    "schedule": {
                        **scheduled_workflows[0]["schedule"],
                        "nextRunAt": "2026-03-12T10:05:00Z",
                    },
                }
            ],
        )
        self.assertEqual(snapshot["notifications"], notifications)
        self.assertEqual(snapshot["unreadCount"], 3)

    def test_record_message_persists_across_service_instances(self) -> None:
        service = LiveFeedService()
        message = {
            "id": "msg-persisted-1",
            "agentId": "agent-a",
            "sessionId": "main",
            "role": "assistant",
            "content": "hello from disk",
            "timestamp": "2026-03-12T10:00:00Z",
        }

        service.record_message(message)
        close_db()

        restarted_service = LiveFeedService()
        messages = restarted_service.get_recent_messages(limit=10)

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["id"], "msg-persisted-1")
        self.assertEqual(messages[0]["content"], "hello from disk")

    def test_record_message_deduplicates_by_id(self) -> None:
        service = LiveFeedService()
        message = {
            "id": "msg-1",
            "agentId": "agent-a",
            "sessionId": "main",
            "role": "assistant",
            "content": "hello",
            "timestamp": "2026-03-12T10:00:00Z",
        }

        service.record_message(message)
        service.record_message(message)

        self.assertEqual(len(service.get_recent_messages()), 1)


if __name__ == "__main__":
    unittest.main()
