import json
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, Mock, patch


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.config import settings
from openclaw_orchestrator.services.openclaw_bridge import OpenClawBridge


class OpenClawBridgeTimestampTests(IsolatedAsyncioTestCase):
    async def test_utcnow_helpers_return_utc_zulu_timestamp(self) -> None:
        bridge = OpenClawBridge()

        moment = bridge._utcnow()
        stamp = bridge._utcnow_iso()

        self.assertIs(moment.tzinfo, timezone.utc)
        self.assertTrue(stamp.endswith("Z"))
        self.assertTrue(stamp.startswith(str(moment.year)))


class OpenClawBridgeGovernanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._original_home = settings.openclaw_home
        settings.openclaw_home = self._temp_dir.name
        self.addCleanup(self._restore_home)

    def _restore_home(self) -> None:
        settings.openclaw_home = self._original_home

    def test_report_team_governance_summary_persists_latest_and_history(self) -> None:
        bridge = OpenClawBridge()
        ok = bridge.report_team_governance_summary(
            "team-a",
            {
                "status": "yellow",
                "risks": "风险上升",
                "blockers": "等待审批",
                "nextSteps": "继续灰度",
                "owner": "lead-a",
            },
        )

        self.assertTrue(ok)
        latest = Path(self._temp_dir.name) / "teams" / "team-a" / "governance" / "latest-report.json"
        history = Path(self._temp_dir.name) / "teams" / "team-a" / "governance" / "reports.jsonl"
        self.assertTrue(latest.exists())
        self.assertTrue(history.exists())

        latest_payload = json.loads(latest.read_text(encoding="utf-8"))
        self.assertEqual(latest_payload["teamId"], "team-a")
        self.assertEqual(latest_payload["owner"], "lead-a")
        self.assertIn("reportedAt", latest_payload)

        history_lines = [line.strip() for line in history.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(history_lines), 1)


class OpenClawBridgeTransientSessionTests(IsolatedAsyncioTestCase):
    async def test_invoke_agent_does_not_send_transient_label_when_reusing_main_session(self) -> None:
        bridge = OpenClawBridge()
        bridge._get_file_size = Mock(return_value=0)
        bridge._fetch_gateway_reply = AsyncMock(return_value="done")
        bridge._cleanup_transient_session = AsyncMock()

        fake_connector = SimpleNamespace(
            connected=True,
            resolve_session_key=AsyncMock(return_value="agent:demo:main"),
            get_chat_history=AsyncMock(return_value=[]),
            call_rpc=AsyncMock(side_effect=[{"runId": "run-1"}, {"status": "ok"}]),
        )

        with patch("openclaw_orchestrator.services.gateway_connector.gateway_connector", fake_connector):
            result = await bridge.invoke_agent(
                agent_id="demo",
                message="hello",
                session_id="wf-12345678",
                timeout_seconds=5,
                correlation_id="corr-1",
            )

        self.assertTrue(result["success"])
        agent_call = fake_connector.call_rpc.await_args_list[0]
        self.assertEqual(agent_call.args[0], "agent")
        self.assertNotIn("label", agent_call.args[1])

    async def test_cleanup_transient_session_retries_resolve_before_delete(self) -> None:
        bridge = OpenClawBridge()
        bridge._cleanup_session_file = Mock()

        fake_connector = SimpleNamespace(
            connected=True,
            resolve_session_key=AsyncMock(
                side_effect=[None, "agent:demo:wf-12345678"]
            ),
            delete_session=AsyncMock(return_value=True),
        )

        with patch("openclaw_orchestrator.services.gateway_connector.gateway_connector", fake_connector):
            await bridge._cleanup_transient_session(
                agent_id="demo",
                session_id="wf-12345678",
                session_key="agent:demo:main",
            )

        self.assertEqual(fake_connector.resolve_session_key.await_count, 2)
        fake_connector.delete_session.assert_awaited_once_with(
            session_key="agent:demo:wf-12345678",
            delete_transcript=True,
        )
        bridge._cleanup_session_file.assert_called_once_with("demo", "wf-12345678")

    async def test_cleanup_transient_session_falls_back_to_list_active_sessions(self) -> None:
        bridge = OpenClawBridge()
        bridge._cleanup_session_file = Mock(return_value=True)

        fake_connector = SimpleNamespace(
            connected=True,
            resolve_session_key=AsyncMock(return_value=None),
            list_active_sessions=AsyncMock(
                return_value=[
                    {
                        "sessionId": "wf-12345678",
                        "key": "agent:demo:wf-12345678",
                    }
                ]
            ),
            delete_session=AsyncMock(return_value=True),
        )

        with patch("openclaw_orchestrator.services.gateway_connector.gateway_connector", fake_connector):
            cleaned = await bridge._cleanup_transient_session(
                agent_id="demo",
                session_id="wf-12345678",
                session_key="agent:demo:main",
                expect_gateway_session=True,
            )

        self.assertTrue(cleaned)
        fake_connector.list_active_sessions.assert_awaited_once_with("demo")
        fake_connector.delete_session.assert_awaited_once_with(
            session_key="agent:demo:wf-12345678",
            delete_transcript=True,
        )

    async def test_invoke_agent_schedules_deferred_cleanup_when_immediate_cleanup_is_inconclusive(self) -> None:
        bridge = OpenClawBridge()
        bridge._get_file_size = Mock(return_value=0)
        bridge._fetch_gateway_reply = AsyncMock(return_value="done")
        bridge._cleanup_transient_session = AsyncMock(return_value=False)
        bridge._schedule_transient_cleanup_retry = Mock()

        fake_connector = SimpleNamespace(
            connected=True,
            resolve_session_key=AsyncMock(return_value="agent:demo:wf-12345678"),
            get_chat_history=AsyncMock(return_value=[]),
            call_rpc=AsyncMock(side_effect=[{"runId": "run-1"}, {"status": "ok"}]),
        )

        with patch("openclaw_orchestrator.services.gateway_connector.gateway_connector", fake_connector):
            result = await bridge.invoke_agent(
                agent_id="demo",
                message="hello",
                session_id="wf-12345678",
                timeout_seconds=5,
                correlation_id="corr-1",
            )

        self.assertTrue(result["success"])
        bridge._schedule_transient_cleanup_retry.assert_called_once_with(
            agent_id="demo",
            session_id="wf-12345678",
            session_key="agent:demo:wf-12345678",
            expect_gateway_session=True,
        )
