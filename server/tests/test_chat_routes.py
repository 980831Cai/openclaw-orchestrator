import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.routes.chat_routes import router


class ChatRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(router, prefix="/api")
        self.client = TestClient(app)

    def test_send_message_returns_502_when_delivery_fails(self) -> None:
        with patch(
            "openclaw_orchestrator.routes.chat_routes.chat_service.send_message",
            new=AsyncMock(side_effect=RuntimeError("gateway unavailable")),
        ):
            response = self.client.post(
                "/api/agents/agent-1/sessions/main/send",
                json={"content": "hello"},
            )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "gateway unavailable"})

    def test_send_message_returns_service_payload_on_success(self) -> None:
        with patch(
            "openclaw_orchestrator.routes.chat_routes.chat_service.send_message",
            new=AsyncMock(
                return_value={
                    "success": True,
                    "message": "Message sent",
                    "method": "gateway",
                }
            ),
        ):
            response = self.client.post(
                "/api/agents/agent-1/sessions/main/send",
                json={"content": "hello"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"success": True, "message": "Message sent", "method": "gateway"},
        )
