import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.database.db import close_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.live_feed_service import LiveFeedService


class LiveFeedPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tempdir.name) / "orchestrator.db")
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self.tempdir.name,
                "DB_PATH": self.db_path,
            },
            clear=False,
        )
        self._env_patch.start()
        close_db()
        init_database()

    def tearDown(self) -> None:
        close_db()
        self._env_patch.stop()
        self.tempdir.cleanup()

    def test_messages_and_events_survive_service_recreation(self) -> None:
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

        close_db()
        restored = LiveFeedService()
        snapshot = restored.get_snapshot(limit=20)

        self.assertEqual(snapshot["messages"][0]["id"], "msg-1")
        self.assertEqual(snapshot["events"][0]["id"], "evt-1")

    def test_record_message_upserts_by_id(self) -> None:
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
        service.record_message(
            {
                "id": "msg-1",
                "agentId": "agent-a",
                "sessionId": "main",
                "role": "assistant",
                "content": "hello updated",
                "timestamp": "2026-03-12T10:00:02Z",
            }
        )
        snapshot = service.get_snapshot(limit=20)

        self.assertEqual(len(snapshot["messages"]), 1)
        self.assertEqual(snapshot["messages"][0]["content"], "hello updated")


if __name__ == "__main__":
    unittest.main()
