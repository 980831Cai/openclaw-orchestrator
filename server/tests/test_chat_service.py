import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.services.chat_service import ChatDeliveryError, ChatService


class ChatServiceGatewayTests(IsolatedAsyncioTestCase):
    def test_extract_text_content_ignores_metadata_only_dict_payload(self) -> None:
        self.assertEqual(
            ChatService._extract_text_content(
                {
                    "results": [],
                    "provider": "none",
                    "citations": "auto",
                    "mode": "fts-only",
                }
            ),
            "",
        )
        self.assertEqual(
            ChatService._extract_text_content(
                {
                    "summary": "这是给用户看的摘要",
                    "provider": "demo",
                }
            ),
            "这是给用户看的摘要",
        )

    async def test_list_sessions_prefers_gateway_and_filters_internal_workflow_sessions(self) -> None:
        service = ChatService()
        fake_connector = SimpleNamespace(
            connected=True,
            list_active_sessions=AsyncMock(
                return_value=[
                    {
                        "key": "agent:demo:main",
                        "sessionId": "main",
                        "updatedAt": 1773307210858,
                    },
                    {
                        "key": "agent:demo:wf-abc12345",
                        "sessionId": "uuid-wf-session",
                        "updatedAt": 1773307210857,
                    },
                ]
            ),
        )

        with patch(
            "openclaw_orchestrator.services.gateway_connector.gateway_connector",
            fake_connector,
        ):
            sessions = await service.list_sessions("demo")

        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["id"], "main")

    async def test_get_messages_prefers_gateway_history(self) -> None:
        service = ChatService()
        fake_connector = SimpleNamespace(
            connected=True,
            get_chat_history=AsyncMock(
                return_value=[
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": "ping"}],
                        "timestamp": 1773307200847,
                    },
                    {
                        "role": "assistant",
                        "content": [{"type": "text", "text": "pong"}],
                        "timestamp": 1773307200848,
                    },
                ]
            ),
        )
        fake_bridge = SimpleNamespace(
            _resolve_gateway_session_key=AsyncMock(return_value="agent:demo:main")
        )

        with patch(
            "openclaw_orchestrator.services.gateway_connector.gateway_connector",
            fake_connector,
        ), patch(
            "openclaw_orchestrator.services.openclaw_bridge.openclaw_bridge",
            fake_bridge,
        ):
            messages = await service.get_messages("demo", "main", limit=20, offset=0)

        self.assertEqual([message["role"] for message in messages], ["user", "assistant"])
        self.assertEqual(messages[-1]["content"], "pong")

    async def test_send_message_raises_delivery_error_when_bridge_send_fails(self) -> None:
        service = ChatService()
        fake_bridge = SimpleNamespace(
            send_agent_message=AsyncMock(side_effect=RuntimeError("gateway offline"))
        )

        with patch(
            "openclaw_orchestrator.services.openclaw_bridge.openclaw_bridge",
            fake_bridge,
        ):
            with self.assertRaisesRegex(ChatDeliveryError, "gateway offline"):
                await service.send_message("demo", "main", "ping")
