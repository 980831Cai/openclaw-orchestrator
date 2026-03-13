import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.services.gateway_connector import GatewayConnector


class GatewayConnectorLiveFeedTests(unittest.TestCase):
    def test_build_gateway_status_payload_includes_runtime_snapshot(self) -> None:
        connector = GatewayConnector()

        with patch(
            "openclaw_orchestrator.services.runtime_service.runtime_service.get_gateway_status",
            return_value={
                "running": True,
                "manageable": True,
                "cliInstalled": True,
                "host": "127.0.0.1",
                "port": 18789,
                "gatewayUrl": "ws://127.0.0.1:18789",
            },
        ):
            payload = connector._build_gateway_status_payload(connected=True, error=None)

        self.assertEqual(
            payload,
            {
                "connected": True,
                "error": None,
                "runtimeRunning": True,
                "manageable": True,
                "cliInstalled": True,
                "host": "127.0.0.1",
                "port": 18789,
                "gatewayUrl": "ws://127.0.0.1:18789",
            },
        )

    def test_broadcast_gateway_status_emits_runtime_fields(self) -> None:
        connector = GatewayConnector()

        with patch(
            "openclaw_orchestrator.services.runtime_service.runtime_service.get_gateway_status",
            return_value={
                "running": False,
                "manageable": True,
                "cliInstalled": False,
                "host": "127.0.0.1",
                "port": 29999,
                "gatewayUrl": "ws://127.0.0.1:29999",
            },
        ), patch(
            "openclaw_orchestrator.services.gateway_connector.broadcast"
        ) as broadcast:
            connector._broadcast_gateway_status(connected=False, error="offline")

        broadcast.assert_called_once()
        event = broadcast.call_args.args[0]
        self.assertEqual(event["type"], "gateway_status")
        self.assertEqual(
            event["payload"],
            {
                "connected": False,
                "error": "offline",
                "runtimeRunning": False,
                "manageable": True,
                "cliInstalled": False,
                "host": "127.0.0.1",
                "port": 29999,
                "gatewayUrl": "ws://127.0.0.1:29999",
            },
        )

    def test_dispatch_event_records_non_message_gateway_events_into_live_feed(self) -> None:
        connector = GatewayConnector()
        payload = {
            "agentId": "worker-a",
            "status": "busy",
            "timestamp": "2026-03-13T10:00:00Z",
        }

        with patch(
            "openclaw_orchestrator.services.gateway_connector.live_feed_service.record_event"
        ) as record_event, patch(
            "openclaw_orchestrator.services.gateway_connector.broadcast"
        ) as broadcast:
            connector._dispatch_event("agent.status", payload)

        record_event.assert_called_once()
        normalized = record_event.call_args.args[0]
        self.assertEqual(normalized["fromAgentId"], "worker-a")
        self.assertEqual(normalized["toAgentId"], "agent.status")
        self.assertEqual(normalized["eventType"], "agent.status")
        self.assertEqual(normalized["type"], "broadcast")
        self.assertIn("busy", normalized["message"])
        communication_broadcasts = [
            call.args[0] for call in broadcast.call_args_list if call.args and call.args[0].get("type") == "communication"
        ]
        self.assertEqual(len(communication_broadcasts), 1)

    def test_dispatch_event_does_not_duplicate_message_events_as_communication(self) -> None:
        connector = GatewayConnector()
        payload = {
            "id": "msg-1",
            "agentId": "worker-a",
            "sessionKey": "agent:worker-a:main",
            "content": [{"type": "text", "text": "hello"}],
            "timestamp": "2026-03-13T10:00:01Z",
        }

        with patch(
            "openclaw_orchestrator.services.gateway_connector.live_feed_service.record_event"
        ) as record_event, patch(
            "openclaw_orchestrator.services.gateway_connector.live_feed_service.record_message"
        ) as record_message, patch(
            "openclaw_orchestrator.services.gateway_connector.broadcast"
        ) as broadcast:
            connector._dispatch_event("chat.message", payload)

        record_message.assert_called_once()
        record_event.assert_not_called()
        communication_broadcasts = [
            call.args[0] for call in broadcast.call_args_list if call.args and call.args[0].get("type") == "communication"
        ]
        self.assertEqual(communication_broadcasts, [])


if __name__ == "__main__":
    unittest.main()
