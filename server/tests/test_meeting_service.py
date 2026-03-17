import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.database.db import close_db, get_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.file_manager import file_manager
from openclaw_orchestrator.services.meeting_service import MeetingService


class MeetingServiceGovernanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "meeting.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)

        db = get_db()
        self.team_id = "team-meeting"
        team_dir = file_manager.get_full_path(f"teams/{self.team_id}")
        file_manager.ensure_dir(f"teams/{self.team_id}/active")
        file_manager.ensure_dir(f"teams/{self.team_id}/archive")
        file_manager.ensure_dir(f"teams/{self.team_id}/knowledge")
        file_manager.ensure_dir(f"teams/{self.team_id}/meetings")
        file_manager.write_file(f"teams/{self.team_id}/team.md", "# 团队\n")
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            (self.team_id, "会议团队", team_dir),
        )
        db.commit()

        self.service = MeetingService()

    def test_build_governance_report_extracts_structured_fields(self) -> None:
        report = self.service._build_governance_report(
            meeting={
                "id": "mtg-1",
                "meetingType": "review",
                "topic": "发布评审",
                "leadAgentId": "lead-a",
            },
            summary="状态: yellow\n风险: 测试覆盖不足\n阻塞: 等待审批\n下一步: 完成补测\n责任人: lead-a",
        )

        self.assertEqual(report["status"], "yellow")
        self.assertEqual(report["risks"], "测试覆盖不足")
        self.assertEqual(report["blockers"], "等待审批")
        self.assertEqual(report["nextSteps"], "完成补测")
        self.assertEqual(report["owner"], "lead-a")

    def test_conclude_meeting_reports_governance_and_live_feed(self) -> None:
        with patch("openclaw_orchestrator.services.meeting_service.broadcast"):
            meeting = self.service.create_meeting(
                team_id=self.team_id,
                meeting_type="review",
                topic="发布评审",
                participants=["lead-a", "agent-b"],
                lead_agent_id="lead-a",
            )

        summary_text = "状态: yellow\n风险: 发布窗口紧张\n阻塞: 等待运维确认\n下一步: 明早灰度\n责任人: lead-a"
        with patch(
            "openclaw_orchestrator.services.openclaw_bridge.openclaw_bridge.invoke_agent",
            new=AsyncMock(return_value={"success": True, "content": summary_text}),
        ), patch(
            "openclaw_orchestrator.services.openclaw_bridge.openclaw_bridge.report_team_governance_summary",
            new=Mock(return_value=True),
        ) as report_mock, patch(
            "openclaw_orchestrator.services.live_feed_service.live_feed_service.record_event",
            new=Mock(),
        ) as feed_mock, patch(
            "openclaw_orchestrator.services.meeting_service.notification_service.create_notification"
        ), patch(
            "openclaw_orchestrator.services.meeting_service.broadcast"
        ) as broadcast_mock:
            summary = asyncio.run(self.service._conclude_meeting(meeting))

        self.assertEqual(summary, summary_text)
        report_mock.assert_called_once()
        call_args = report_mock.call_args.args
        self.assertEqual(call_args[0], self.team_id)
        self.assertEqual(call_args[1]["owner"], "lead-a")

        feed_mock.assert_called_once()
        payload = feed_mock.call_args.args[0]["payload"]
        self.assertEqual(payload["meetingId"], meeting["id"])
        self.assertEqual(payload["governance"]["status"], "yellow")

        broadcast_mock.assert_called()
        updated = self.service.get_meeting(meeting["id"])
        self.assertEqual(updated["status"], "concluded")
        self.assertIn("发布窗口紧张", updated["summary"])


if __name__ == "__main__":
    unittest.main()
