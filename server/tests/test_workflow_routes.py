import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.routes.workflow_routes import list_active_executions, router


class WorkflowRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(router, prefix="/api")
        self.client = TestClient(app)

    def test_list_active_executions_returns_engine_snapshot(self) -> None:
        snapshot = [
            {
                "executionId": "exec-1",
                "workflowId": "wf-1",
                "workflowName": "演示工作流",
                "status": "running",
            }
        ]

        with patch(
            "openclaw_orchestrator.routes.workflow_routes.workflow_engine.list_active_execution_signals",
            return_value=snapshot,
        ) as mocked:
            result = list_active_executions()

        mocked.assert_called_once_with()
        self.assertEqual(result, snapshot)

    def test_execute_route_dispatches_via_team_dispatch_service(self) -> None:
        workflow = {
            "id": "wf-1",
            "teamId": "team-1",
            "name": "演示工作流",
        }
        dispatch_result = {
            "deduplicated": False,
            "triggerEventId": "evt-1",
            "task": {"id": "task-1"},
            "drain": {"started": True, "executionId": "exec-1"},
        }

        with patch(
            "openclaw_orchestrator.routes.workflow_routes.workflow_engine.get_workflow",
            return_value=workflow,
        ), patch(
            "openclaw_orchestrator.routes.workflow_routes.team_dispatch_service.dispatch",
            new=AsyncMock(return_value=dispatch_result),
        ) as mocked_dispatch:
            response = self.client.post(
                "/api/workflows/wf-1/execute",
                json={"actorId": "tester", "source": "manual"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), dispatch_result)
        mocked_dispatch.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
