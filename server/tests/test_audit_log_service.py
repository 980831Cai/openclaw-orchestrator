import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.database.db import close_db, get_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.audit_log_service import audit_log_service


class AuditLogServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "audit.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        db = get_db()
        db.execute(
            "INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir) VALUES (?, ?, '', '', 'default', '{}', ?)",
            ("team-1", "审计团队", self._temp_dir.name),
        )
        db.commit()
        self.addCleanup(close_db)

    def test_log_event_persists_and_returns_camel_case_payload(self) -> None:
        item = audit_log_service.log_event(
            team_id="team-1",
            actor="tester",
            action="workflow.execute",
            resource_type="workflow",
            resource_id="wf-1",
            detail="执行工作流",
            metadata={"workflowId": "wf-1"},
            ok=True,
            request_id="req-1",
        )

        self.assertEqual(item["teamId"], "team-1")
        self.assertEqual(item["actor"], "tester")
        self.assertEqual(item["metadata"]["workflowId"], "wf-1")
        self.assertTrue(item["ok"])

    def test_list_logs_supports_action_and_query_filters(self) -> None:
        audit_log_service.log_event(
            team_id="team-1",
            actor="tester",
            action="workflow.execute",
            resource_type="workflow",
            resource_id="wf-1",
            detail="执行工作流",
            metadata={"workflowId": "wf-1"},
        )
        audit_log_service.log_event(
            team_id="team-1",
            actor="tester",
            action="team.update",
            resource_type="team",
            resource_id="team-1",
            detail="更新团队名称",
            metadata={"field": "name"},
            ok=False,
        )

        filtered = audit_log_service.list_logs(team_id="team-1", action="workflow.execute")
        searched = audit_log_service.list_logs(team_id="team-1", query="团队名称", ok=False)

        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["items"][0]["action"], "workflow.execute")
        self.assertEqual(searched["total"], 1)
        self.assertEqual(searched["items"][0]["resourceType"], "team")

    def test_resolve_actor_prefers_explicit_actor_then_api_key_hash(self) -> None:
        self.assertEqual(audit_log_service.resolve_actor(actor_id="alice", api_key="secret"), "alice")
        hashed_actor = audit_log_service.resolve_actor(api_key="secret")
        self.assertTrue(hashed_actor.startswith("api-key:"))
        self.assertEqual(audit_log_service.resolve_actor(), "api")


if __name__ == "__main__":
    unittest.main()
