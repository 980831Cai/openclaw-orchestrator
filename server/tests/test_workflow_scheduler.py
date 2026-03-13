import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.services.workflow_engine import WorkflowValidationError
from openclaw_orchestrator.services.workflow_scheduler import WorkflowScheduler


def build_invalid_scheduled_workflow() -> dict:
    return {
        "id": "wf-invalid-scheduled",
        "name": "invalid scheduled workflow",
        "nodes": {
            "cond": {
                "type": "condition",
                "label": "condition",
                "expression": "true",
                "branches": {},
            }
        },
        "edges": [],
        "schedule": {
            "enabled": True,
            "cron": "* * * * *",
            "timezone": "UTC",
            "window": None,
            "activeFrom": None,
            "activeUntil": None,
        },
    }


class WorkflowSchedulerTests(unittest.IsolatedAsyncioTestCase):
    def test_get_next_run_at_returns_none_for_invalid_scheduled_workflow(self) -> None:
        scheduler = WorkflowScheduler()
        workflow = build_invalid_scheduled_workflow()

        with patch("openclaw_orchestrator.services.workflow_scheduler.workflow_engine") as mock_engine:
            mock_engine._validate_workflow_definition.side_effect = WorkflowValidationError("invalid definition")

            next_run_at = scheduler.get_next_run_at(
                workflow,
                now_utc=datetime(2026, 3, 12, 4, 0, tzinfo=timezone.utc),
            )

        self.assertIsNone(next_run_at)

    async def test_tick_disables_invalid_schedule_instead_of_retrying(self) -> None:
        scheduler = WorkflowScheduler()
        workflow = build_invalid_scheduled_workflow()

        with patch("openclaw_orchestrator.services.workflow_scheduler.workflow_engine") as mock_engine:
            mock_engine.list_workflows.return_value = [workflow]
            mock_engine._validate_workflow_definition.side_effect = WorkflowValidationError("invalid definition")
            mock_engine.update_workflow = Mock(return_value=None)
            mock_engine.has_active_execution.return_value = False
            mock_engine.execute_workflow = AsyncMock()

            await scheduler.tick()

        mock_engine.execute_workflow.assert_not_called()
        mock_engine.update_workflow.assert_called_once()
        workflow_id, updates = mock_engine.update_workflow.call_args.args
        self.assertEqual(workflow_id, workflow["id"])
        self.assertFalse(updates["schedule"]["enabled"])
        self.assertEqual(updates["schedule"]["disabledReason"], "invalid definition")


if __name__ == "__main__":
    unittest.main()
