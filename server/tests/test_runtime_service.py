import json
import os
import socketserver
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from websockets.sync.server import serve


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.config import settings
from openclaw_orchestrator.services.runtime_service import RuntimeService, RuntimeServiceError


class _PlainTcpHandler(socketserver.BaseRequestHandler):
    def handle(self) -> None:
        try:
            self.request.recv(1024)
        except OSError:
            return


class _PlainTcpListener:
    def __init__(self) -> None:
        self._server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), _PlainTcpHandler)
        self._server.daemon_threads = True
        self.port = int(self._server.server_address[1])
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def __enter__(self) -> "_PlainTcpListener":
        self._thread.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=1)


class _FakeGatewayServer:
    def __init__(self, *, health_ok: bool = True) -> None:
        self._health_ok = health_ok
        self._server = serve(self._handle_connection, "127.0.0.1", 0)
        self.port = int(self._server.socket.getsockname()[1])
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def __enter__(self) -> "_FakeGatewayServer":
        self._thread.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self._server.shutdown()
        self._thread.join(timeout=1)

    def _handle_connection(self, websocket) -> None:
        connect_frame = json.loads(websocket.recv())
        websocket.send(
            json.dumps(
                {
                    "type": "res",
                    "id": connect_frame["id"],
                    "ok": True,
                    "payload": {"features": {}},
                }
            )
        )

        health_frame = json.loads(websocket.recv())
        if self._health_ok:
            websocket.send(
                json.dumps(
                    {
                        "type": "res",
                        "id": health_frame["id"],
                        "ok": True,
                        "payload": {"status": "ok"},
                    }
                )
            )
            return

        websocket.send(
            json.dumps(
                {
                    "type": "res",
                    "id": health_frame["id"],
                    "ok": False,
                    "error": {"message": "gateway health failed"},
                }
            )
        )


class RuntimeServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_openclaw_home = settings.openclaw_home
        self._original_gateway_port = os.environ.get("OPENCLAW_GATEWAY_PORT")

    def tearDown(self) -> None:
        settings.openclaw_home = self._original_openclaw_home
        if self._original_gateway_port is None:
            os.environ.pop("OPENCLAW_GATEWAY_PORT", None)
        else:
            os.environ["OPENCLAW_GATEWAY_PORT"] = self._original_gateway_port

    def test_status_uses_local_runtime_port_even_when_remote_gateway_url_configured(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            config_path = Path(temp_dir) / "openclaw.json"
            config_path.write_text(
                json.dumps(
                    {
                        "gateway": {
                            "port": 24567,
                            "remote": {"url": "wss://remote.example/ws"},
                        }
                    }
                ),
                encoding="utf-8",
            )
            service = RuntimeService()

            with patch.object(service, "_probe_gateway", return_value=True), patch.object(
                service, "_is_cli_installed", return_value=True
            ):
                status = service.get_gateway_status()

        self.assertEqual(status["host"], "127.0.0.1")
        self.assertEqual(status["port"], 24567)
        self.assertTrue(status["manageable"])
        self.assertEqual(status["gatewayUrl"], "ws://127.0.0.1:24567")

    def test_status_prefers_env_port_for_runtime_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            os.environ["OPENCLAW_GATEWAY_PORT"] = "29999"
            service = RuntimeService()

            with patch.object(service, "_probe_gateway", return_value=False), patch.object(
                service, "_is_cli_installed", return_value=False
            ):
                status = service.get_gateway_status()

        self.assertEqual(status["host"], "127.0.0.1")
        self.assertEqual(status["port"], 29999)
        self.assertEqual(status["gatewayUrl"], "ws://127.0.0.1:29999")

    def test_status_self_heals_legacy_gateway_mode_and_agent_to_agent_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            config_path = Path(temp_dir) / "openclaw.json"
            config_path.write_text(
                json.dumps(
                    {
                        "mode": "local",
                        "agentToAgent": {"allow": ["alpha:beta"]},
                        "gateway": {"port": 18789},
                        "tools": {"profile": "full"},
                    }
                ),
                encoding="utf-8",
            )
            service = RuntimeService()

            with patch.object(service, "_probe_gateway", return_value=False), patch.object(
                service, "_is_cli_installed", return_value=True
            ):
                status = service.get_gateway_status()

            healed = json.loads(config_path.read_text(encoding="utf-8"))

        self.assertEqual(status["gatewayUrl"], "ws://127.0.0.1:18789")
        self.assertNotIn("mode", healed)
        self.assertNotIn("agentToAgent", healed)
        self.assertEqual(healed["gateway"]["mode"], "local")
        self.assertEqual(healed["tools"]["agentToAgent"]["allow"], ["alpha:beta"])

    def test_status_creates_default_openclaw_config_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            service = RuntimeService()
            config_path = service._openclaw_home / "openclaw.json"

            with patch.object(service, "_probe_gateway", return_value=False), patch.object(
                service, "_is_cli_installed", return_value=False
            ):
                status = service.get_gateway_status()

            created = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertTrue(config_path.exists())

        self.assertEqual(status["port"], 18789)
        self.assertEqual(created["gateway"]["mode"], "local")
        self.assertIn("http://127.0.0.1:5174", created["gateway"]["controlUi"]["allowedOrigins"])
        self.assertEqual(created["tools"]["profile"], "full")

    def test_probe_gateway_returns_false_for_plain_tcp_listener(self) -> None:
        service = RuntimeService()
        with _PlainTcpListener() as listener:
            self.assertFalse(service._probe_gateway("127.0.0.1", listener.port))

    def test_probe_gateway_returns_true_for_gateway_health_rpc(self) -> None:
        service = RuntimeService()
        with _FakeGatewayServer(health_ok=True) as server:
            self.assertTrue(service._probe_gateway("127.0.0.1", server.port))

    def test_probe_gateway_returns_false_when_gateway_health_rpc_fails(self) -> None:
        service = RuntimeService()
        with _FakeGatewayServer(health_ok=False) as server:
            self.assertFalse(service._probe_gateway("127.0.0.1", server.port))

    def test_windows_process_detection_uses_netstat_when_port_is_listening(self) -> None:
        service = RuntimeService()
        netstat_result = MagicMock(
            returncode=0,
            stdout="  TCP    127.0.0.1:18789        0.0.0.0:0              LISTENING       16372",
            stderr="",
        )

        with patch.object(service, "_probe_tcp_port", return_value=False), patch(
            "openclaw_orchestrator.services.runtime_service.subprocess.run",
            return_value=netstat_result,
        ):
            status = service._check_gateway_process("127.0.0.1", 18789)

        self.assertTrue(status["running"])
        self.assertEqual(status["pid"], 16372)
        self.assertEqual(status["source"], "netstat")

    def test_start_gateway_raises_timeout_when_probe_never_turns_green(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            service = RuntimeService()
            log_dir = Path(temp_dir) / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            (log_dir / "gateway.err.log").write_text("fatal: invalid config", encoding="utf-8")

            with patch.object(service, "_is_cli_installed", return_value=True), patch.object(
                service, "_probe_gateway", return_value=False
            ), patch.object(service, "_spawn_gateway"), patch(
                "openclaw_orchestrator.services.runtime_service.time.sleep", return_value=None
            ):
                with self.assertRaises(RuntimeServiceError) as exc_info:
                    service.start_gateway()

        self.assertIn("fatal: invalid config", str(exc_info.exception))

    def test_start_gateway_refuses_to_spawn_when_port_is_already_occupied(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            service = RuntimeService()

            with patch.object(service, "_is_cli_installed", return_value=True), patch.object(
                service,
                "_check_gateway_process",
                return_value={"running": True, "pid": 16372, "source": "netstat"},
            ), patch.object(service, "_probe_gateway", return_value=False), patch.object(
                service,
                "_spawn_gateway",
            ) as mocked_spawn:
                with self.assertRaises(RuntimeServiceError) as exc_info:
                    service.start_gateway()

        mocked_spawn.assert_not_called()
        self.assertIn("占用", str(exc_info.exception))

    def test_status_exposes_error_log_tail_when_gateway_not_running(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            service = RuntimeService()
            log_dir = Path(temp_dir) / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            (log_dir / "gateway.err.log").write_text(
                "first line\nsecond line\nfatal: invalid config",
                encoding="utf-8",
            )

            with patch.object(service, "_probe_gateway", return_value=False), patch.object(
                service, "_is_cli_installed", return_value=True
            ):
                status = service.get_gateway_status()

        self.assertEqual(status["errorLogTail"], "first line\nsecond line\nfatal: invalid config")

    def test_status_exposes_stdout_log_tail_when_gateway_not_running(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            service = RuntimeService()
            log_dir = Path(temp_dir) / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            (log_dir / "gateway.log").write_text(
                "gateway starting\nPort 18789 is already in use",
                encoding="utf-8",
            )

            with patch.object(service, "_probe_gateway", return_value=False), patch.object(
                service, "_is_cli_installed", return_value=True
            ):
                status = service.get_gateway_status()

        self.assertEqual(status["logTail"], "gateway starting\nPort 18789 is already in use")

    def test_stop_gateway_runs_openclaw_stop_and_returns_stopped_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings.openclaw_home = temp_dir
            service = RuntimeService()
            stop_result = MagicMock(returncode=0, stderr="")

            probe_states = iter([True, False, False])

            with patch.object(service, "_is_cli_installed", return_value=True), patch.object(
                service, "_probe_gateway", side_effect=lambda host, port: next(probe_states)
            ), patch.object(service, "_run_openclaw_command", return_value=stop_result) as mocked, patch(
                "openclaw_orchestrator.services.runtime_service.time.sleep", return_value=None
            ):
                status = service.stop_gateway()

        mocked.assert_called_once()
        args, kwargs = mocked.call_args
        self.assertEqual(args, ("gateway", "stop"))
        self.assertTrue(kwargs.get("capture_output"))
        self.assertTrue(kwargs.get("cli_path"))
        self.assertFalse(status["running"])
        self.assertEqual(status["message"], "Gateway 已停止")


if __name__ == "__main__":
    unittest.main()
