import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.routes.runtime_routes import router
from openclaw_orchestrator.services.runtime_service import RuntimeServiceError


class RuntimeRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(router, prefix="/api")
        self.client = TestClient(app)

    def test_get_gateway_runtime_status_returns_service_payload(self) -> None:
        payload = {
            "manageable": True,
            "cliInstalled": True,
            "running": True,
            "host": "127.0.0.1",
            "port": 18789,
            "gatewayUrl": "ws://127.0.0.1:18789",
            "rpcGatewayUrl": "wss://remote.example/ws",
            "logFile": "C:/Users/Administrator/.openclaw/logs/gateway.log",
            "errorLogFile": "C:/Users/Administrator/.openclaw/logs/gateway.err.log",
            "message": "当前 RPC 目标为 wss://remote.example/ws，但运行时控制仍使用本机 Gateway。",
        }

        with patch(
            "openclaw_orchestrator.routes.runtime_routes.runtime_service.get_gateway_status",
            return_value=payload,
        ) as mocked:
            response = self.client.get("/api/runtime/gateway")

        mocked.assert_called_once_with()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), payload)

    def test_start_gateway_runtime_maps_runtime_error_to_http_400(self) -> None:
        with patch(
            "openclaw_orchestrator.routes.runtime_routes.runtime_service.start_gateway",
            side_effect=RuntimeServiceError("gateway start failed"),
        ):
            response = self.client.post("/api/runtime/gateway/start")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"detail": "gateway start failed"})


if __name__ == "__main__":
    unittest.main()
