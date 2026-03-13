import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.routes.chat_routes import get_live_feed_snapshot


class MonitorRouteTests(unittest.TestCase):
    def test_get_live_feed_snapshot_clamps_limit_and_returns_service_payload(self) -> None:
        snapshot = {
            "events": [],
            "messages": [],
            "workflowSignals": [],
            "scheduledWorkflows": [],
            "notifications": [],
            "unreadCount": 0,
        }

        with patch(
            "openclaw_orchestrator.routes.chat_routes.live_feed_service.get_snapshot",
            return_value=snapshot,
        ) as mocked:
            result = get_live_feed_snapshot(limit=999)

        mocked.assert_called_once_with(limit=200)
        self.assertEqual(result, snapshot)


if __name__ == "__main__":
    unittest.main()
