import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.routes.workflow_routes import list_active_executions


class WorkflowRouteTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
