import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


from openclaw_orchestrator.routes.team_routes import router


class TeamRouteDispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(router, prefix="/api")
        self.client = TestClient(app)

    def test_dispatch_route_calls_team_dispatch_service(self) -> None:
        mocked_response = {
            "deduplicated": False,
            "triggerEventId": "evt-1",
            "task": {"id": "task-1", "workflowId": "wf-1"},
            "drain": {"started": True, "executionId": "exec-1"},
        }

        with patch(
            "openclaw_orchestrator.routes.team_routes.team_dispatch_service.dispatch",
            new=AsyncMock(return_value=mocked_response),
        ) as mocked_dispatch, patch(
            "openclaw_orchestrator.routes.team_routes.audit_log_service.log_event"
        ):
            response = self.client.post(
                "/api/teams/team-1/dispatch",
                json={
                    "content": "执行需求A",
                    "source": "manual",
                    "actorId": "tester",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), mocked_response)
        mocked_dispatch.assert_awaited_once()

    def test_queue_drain_route_calls_team_dispatch_service(self) -> None:
        mocked_response = {
            "started": True,
            "taskId": "task-1",
            "workflowId": "wf-1",
            "executionId": "exec-1",
        }
        with patch(
            "openclaw_orchestrator.routes.team_routes.team_dispatch_service.drain_once",
            new=AsyncMock(return_value=mocked_response),
        ) as mocked_drain, patch(
            "openclaw_orchestrator.routes.team_routes.audit_log_service.log_event"
        ):
            response = self.client.post("/api/teams/team-1/queue/drain")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), mocked_response)
        mocked_drain.assert_awaited_once_with("team-1")

    def test_team_trace_route_returns_trace_items(self) -> None:
        trace_rows = [
            {
                "trigger_event_id": "evt-1",
                "workflow_id": "wf-1",
                "source": "manual",
                "actor_id": "tester",
                "session_id": "",
                "idempotency_key": "k1",
                "trigger_status": "completed",
                "linked_task_id": "task-1",
                "linked_execution_id": "exec-1",
                "created_at": "2026-03-16 10:00:00",
                "updated_at": "2026-03-16 10:01:00",
                "queue_status": "done",
                "retry_count": 0,
                "last_error": "",
                "last_heartbeat_at": None,
                "task_started_at": "2026-03-16 10:00:10",
                "task_finished_at": "2026-03-16 10:00:59",
                "execution_status": "completed",
                "current_node_id": "node-1",
                "execution_started_at": "2026-03-16 10:00:11",
                "execution_completed_at": "2026-03-16 10:00:58",
                "latest_approval_status": "approved",
            }
        ]
        fake_db = unittest.mock.Mock()
        fake_db.execute.return_value.fetchall.return_value = trace_rows

        with patch(
            "openclaw_orchestrator.routes.team_routes.get_db",
            return_value=fake_db,
        ), patch(
            "openclaw_orchestrator.routes.team_routes.team_service.get_lead",
            return_value="lead-team-1",
        ), patch(
            "openclaw_orchestrator.routes.team_routes.openclaw_bridge.read_heartbeat_status",
            return_value={"alive": True, "lastCheck": "2026-03-16T10:00:00Z", "ageMinutes": 2.0, "checklistItems": 3},
        ), patch(
            "openclaw_orchestrator.routes.team_routes.lead_governance_service.get_latest_team_governance_snapshot",
            return_value={"status": "healthy", "teamId": "team-1"},
        ):
            response = self.client.get("/api/teams/team-1/trace?limit=10")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["teamId"], "team-1")
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["trigger_event_id"], "evt-1")
        self.assertEqual(payload["leadAgentId"], "lead-team-1")
        self.assertEqual(payload["leadHeartbeat"]["alive"], True)
        self.assertEqual(payload["governanceSnapshot"]["status"], "healthy")

    def test_team_usage_summary_route_delegates_to_usage_service(self) -> None:
        summary_payload = {
            "teamId": "team-1",
            "executionCount": 3,
            "successRate": 0.67,
            "totalTokens": 1024,
        }
        with patch(
            "openclaw_orchestrator.routes.team_routes.team_usage_service.get_summary",
            return_value=summary_payload,
        ) as mocked_summary:
            response = self.client.get("/api/teams/team-1/usage/summary?days=30")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), summary_payload)
        mocked_summary.assert_called_once_with("team-1", 30)

    def test_team_audit_route_delegates_to_audit_service(self) -> None:
        audit_payload = {
            "items": [{"id": "log-1", "action": "workflow.execute", "ok": True}],
            "total": 1,
            "limit": 20,
            "offset": 0,
        }
        with patch(
            "openclaw_orchestrator.routes.team_routes.audit_log_service.list_logs",
            return_value=audit_payload,
        ) as mocked_list:
            response = self.client.get("/api/teams/team-1/audit?action=workflow.execute&limit=20")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["teamId"], "team-1")
        self.assertEqual(response.json()["items"][0]["id"], "log-1")
        mocked_list.assert_called_once_with(
            team_id="team-1",
            action="workflow.execute",
            resource_type=None,
            ok=None,
            query=None,
            start_at=None,
            end_at=None,
            limit=20,
            offset=0,
        )


if __name__ == "__main__":
    unittest.main()
