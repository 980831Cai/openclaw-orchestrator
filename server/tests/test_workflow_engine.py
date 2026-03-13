import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import timezone
from unittest.mock import patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.database.db import close_db, get_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.workflow_engine import (
    WorkflowEngine,
    WorkflowValidationError,
)


class WorkflowEngineTimestampTests(unittest.TestCase):
    def test_utcnow_helpers_return_utc_zulu_timestamp(self) -> None:
        moment = WorkflowEngine._utcnow()
        stamp = WorkflowEngine._utcnow_iso()

        self.assertIs(moment.tzinfo, timezone.utc)
        self.assertTrue(stamp.endswith("Z"))
        self.assertTrue(stamp.startswith(str(moment.year)))


class WorkflowEngineArtifactTests(unittest.TestCase):
    def test_agent_response_counts_as_materialized_output(self) -> None:
        artifacts = [
            {
                "type": "agent_response",
                "content": "任务执行完成，输出如下。",
            }
        ]

        self.assertTrue(WorkflowEngine._has_materialized_artifacts(artifacts))
        self.assertEqual(
            WorkflowEngine._count_materialized_artifacts({"task-1": artifacts}),
            1,
        )

    def test_validate_workflow_requires_meeting_participants(self) -> None:
        workflow = {
            "nodes": {
                "meeting-1": {
                    "type": "meeting",
                    "label": "评审会",
                    "participants": [],
                }
            },
            "edges": [],
            "schedule": None,
        }

        with self.assertRaises(WorkflowValidationError):
            WorkflowEngine._validate_workflow_definition(
                workflow,
                require_runnable=True,
            )

    def test_validate_workflow_requires_debate_participants(self) -> None:
        workflow = {
            "nodes": {
                "debate-1": {
                    "type": "debate",
                    "label": "辩论",
                    "participants": [],
                }
            },
            "edges": [],
            "schedule": None,
        }

        with self.assertRaises(WorkflowValidationError):
            WorkflowEngine._validate_workflow_definition(
                workflow,
                require_runnable=True,
            )

    def test_empty_agent_response_does_not_count_as_materialized_output(self) -> None:
        artifacts = [
            {
                "type": "agent_response",
                "content": "   ",
            }
        ]

        self.assertFalse(WorkflowEngine._has_materialized_artifacts(artifacts))
        self.assertEqual(
            WorkflowEngine._count_materialized_artifacts({"task-1": artifacts}),
            0,
        )

    def test_validate_workflow_requires_reachable_actionable_path_from_start(self) -> None:
        workflow = {
            "nodes": {
                "condition-1": {
                    "type": "condition",
                    "label": "入口判断",
                    "expression": "contains:ready",
                    "branches": {"yes": "task-1"},
                },
                "task-1": {
                    "type": "task",
                    "label": "执行任务",
                    "agentId": "agent-1",
                },
            },
            "edges": [
                {
                    "from": "task-1",
                    "to": "condition-1",
                }
            ],
            "schedule": {
                "enabled": True,
                "cron": "* * * * *",
                "timezone": "UTC",
            },
        }

        with self.assertRaises(WorkflowValidationError):
            WorkflowEngine._validate_workflow_definition(
                workflow,
                require_runnable=True,
            )

    def test_non_response_artifact_still_counts(self) -> None:
        artifacts = [
            {
                "type": "agent_artifact",
                "content": "structured artifact",
            }
        ]

        self.assertTrue(WorkflowEngine._has_materialized_artifacts(artifacts))
        self.assertEqual(
            WorkflowEngine._count_materialized_artifacts({"task-1": artifacts}),
            1,
        )


class WorkflowEngineApprovalSignalTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "workflow.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)

    def test_rejected_approval_broadcasts_full_workflow_signal(self) -> None:
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-1", "测试团队", self._temp_dir.name),
        )
        workflow_definition = {
            "nodes": {
                "approval-1": {
                    "type": "approval",
                    "label": "人工审批",
                    "description": "需要负责人确认",
                }
            },
            "edges": [],
            "maxIterations": 100,
            "schedule": None,
        }
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            (
                "workflow-1",
                "team-1",
                "审批工作流",
                json.dumps(workflow_definition, ensure_ascii=False),
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'waiting_approval', ?, '[]', '{}')
            """,
            ("execution-1", "workflow-1", "approval-1"),
        )
        db.commit()

        engine = WorkflowEngine()
        with patch(
            "openclaw_orchestrator.services.workflow_engine.broadcast"
        ) as broadcast_mock, patch(
            "openclaw_orchestrator.services.workflow_engine.notification_service.create_notification"
        ):
            execution = asyncio.run(
                engine.resume_execution(
                    "execution-1",
                    approved=False,
                    reject_reason="不满足发布条件",
                )
            )

        self.assertEqual(execution["status"], "failed")
        broadcast_mock.assert_called_once()
        event = broadcast_mock.call_args.args[0]
        self.assertEqual(event["type"], "workflow_update")
        self.assertEqual(event["payload"]["executionId"], "execution-1")
        self.assertEqual(event["payload"]["status"], "failed")
        self.assertEqual(event["payload"]["workflowId"], "workflow-1")
        self.assertEqual(event["payload"]["workflowName"], "审批工作流")
        self.assertEqual(event["payload"]["currentNodeId"], "approval-1")
        self.assertEqual(event["payload"]["nodeType"], "approval")
        self.assertEqual(event["payload"]["nodeLabel"], "人工审批")
        self.assertEqual(event["payload"]["approvalMode"], "human")

    def test_approved_approval_broadcasts_running_signal_before_resume(self) -> None:
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-2", "测试团队二", self._temp_dir.name),
        )
        workflow_definition = {
            "nodes": {
                "approval-1": {
                    "type": "approval",
                    "label": "人工审批",
                    "description": "需要负责人确认",
                },
                "task-1": {
                    "type": "task",
                    "label": "继续执行",
                    "agentId": "agent-1",
                },
            },
            "edges": [{"from": "approval-1", "to": "task-1"}],
            "maxIterations": 100,
            "schedule": None,
        }
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            (
                "workflow-2",
                "team-2",
                "审批通过工作流",
                json.dumps(workflow_definition, ensure_ascii=False),
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'waiting_approval', ?, '[]', ?)
            """,
            (
                "execution-2",
                "workflow-2",
                "approval-1",
                json.dumps({"node_artifacts": {}, "control": {}}, ensure_ascii=False),
            ),
        )
        db.commit()

        engine = WorkflowEngine()
        with patch(
            "openclaw_orchestrator.services.workflow_engine.broadcast"
        ) as broadcast_mock, patch(
            "openclaw_orchestrator.services.workflow_engine.asyncio.ensure_future",
            side_effect=lambda coro: coro.close(),
        ) as ensure_future_mock:
            execution = asyncio.run(
                engine.resume_execution(
                    "execution-2",
                    approved=True,
                )
            )

        self.assertEqual(execution["status"], "running")
        ensure_future_mock.assert_called_once()
        broadcast_mock.assert_called_once()
        event = broadcast_mock.call_args.args[0]
        self.assertEqual(event["type"], "workflow_update")
        self.assertEqual(event["payload"]["executionId"], "execution-2")
        self.assertEqual(event["payload"]["status"], "running")
        self.assertEqual(event["payload"]["workflowId"], "workflow-2")
        self.assertEqual(event["payload"]["workflowName"], "审批通过工作流")
        self.assertEqual(event["payload"]["currentNodeId"], "approval-1")
        self.assertEqual(event["payload"]["nodeType"], "approval")
        self.assertEqual(event["payload"]["nodeLabel"], "人工审批")
        self.assertEqual(event["payload"]["approvalMode"], "human")

    def test_stop_execution_closes_pending_approvals_before_broadcast(self) -> None:
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-stop", "停止测试团队", self._temp_dir.name),
        )
        workflow_definition = {
            "nodes": {
                "approval-1": {
                    "type": "approval",
                    "label": "人工审批",
                    "description": "等待确认",
                }
            },
            "edges": [],
            "maxIterations": 100,
            "schedule": None,
        }
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            (
                "workflow-stop",
                "team-stop",
                "停止审批工作流",
                json.dumps(workflow_definition, ensure_ascii=False),
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'waiting_approval', ?, '[]', '{}')
            """,
            ("execution-stop", "workflow-stop", "approval-1"),
        )
        db.execute(
            """
            INSERT INTO approvals (id, execution_id, node_id, title, description, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            ("approval-stop", "execution-stop", "approval-1", "人工审批", "等待确认"),
        )
        db.commit()

        engine = WorkflowEngine()
        with patch("openclaw_orchestrator.services.workflow_engine.broadcast") as broadcast_mock:
            engine.stop_execution("execution-stop")

        approval_row = db.execute(
            "SELECT status, reject_reason, resolved_at FROM approvals WHERE id = ?",
            ("approval-stop",),
        ).fetchone()
        execution_row = db.execute(
            "SELECT status FROM workflow_executions WHERE id = ?",
            ("execution-stop",),
        ).fetchone()

        self.assertEqual(execution_row["status"], "stopped")
        self.assertEqual(approval_row["status"], "rejected")
        self.assertIn("stopped", approval_row["reject_reason"].lower())
        self.assertIsNotNone(approval_row["resolved_at"])
        event_types = [call.args[0]["type"] for call in broadcast_mock.call_args_list]
        self.assertIn("approval_update", event_types)
        self.assertIn("workflow_update", event_types)

    def test_resolve_approval_keeps_pending_record_when_execution_not_waiting(self) -> None:
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-resolve", "审批校验团队", self._temp_dir.name),
        )
        workflow_definition = {
            "nodes": {
                "approval-1": {
                    "type": "approval",
                    "label": "人工审批",
                    "description": "等待确认",
                }
            },
            "edges": [],
            "maxIterations": 100,
            "schedule": None,
        }
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            (
                "workflow-resolve",
                "team-resolve",
                "审批状态校验工作流",
                json.dumps(workflow_definition, ensure_ascii=False),
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'stopped', ?, '[]', '{}')
            """,
            ("execution-resolve", "workflow-resolve", "approval-1"),
        )
        db.execute(
            """
            INSERT INTO approvals (id, execution_id, node_id, title, description, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            ("approval-resolve", "execution-resolve", "approval-1", "人工审批", "等待确认"),
        )
        db.commit()

        engine = WorkflowEngine()

        with self.assertRaises(ValueError):
            asyncio.run(
                engine.resolve_approval(
                    "approval-resolve",
                    approved=True,
                    resolved_by="human",
                )
            )

        approval_row = db.execute(
            "SELECT status, reject_reason, resolved_at FROM approvals WHERE id = ?",
            ("approval-resolve",),
        ).fetchone()
        self.assertEqual(approval_row["status"], "pending")
        self.assertIsNone(approval_row["reject_reason"])
        self.assertIsNone(approval_row["resolved_at"])

    def test_stop_execution_rejects_pending_approvals_for_that_execution(self) -> None:
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-stop", "测试团队", self._temp_dir.name),
        )
        workflow_definition = {
            "nodes": {
                "approval-1": {
                    "type": "approval",
                    "label": "人工审批",
                    "description": "需要负责人确认",
                }
            },
            "edges": [],
            "maxIterations": 100,
            "schedule": None,
        }
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            (
                "workflow-stop",
                "team-stop",
                "审批工作流",
                json.dumps(workflow_definition, ensure_ascii=False),
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'waiting_approval', ?, '[]', '{}')
            """,
            ("execution-stop", "workflow-stop", "approval-1"),
        )
        db.execute(
            """
            INSERT INTO approvals (id, execution_id, node_id, title, description, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            ("approval-stop", "execution-stop", "approval-1", "人工审批", "等待处理"),
        )
        db.commit()

        engine = WorkflowEngine()
        with patch("openclaw_orchestrator.services.workflow_engine.broadcast") as broadcast_mock:
            engine.stop_execution("execution-stop")

        approval = db.execute(
            "SELECT status, reject_reason, resolved_at FROM approvals WHERE id = ?",
            ("approval-stop",),
        ).fetchone()
        execution = db.execute(
            "SELECT status FROM workflow_executions WHERE id = ?",
            ("execution-stop",),
        ).fetchone()

        self.assertEqual(execution["status"], "stopped")
        self.assertEqual(approval["status"], "rejected")
        self.assertIn("stopped", approval["reject_reason"].lower())
        self.assertIsNotNone(approval["resolved_at"])
        self.assertGreaterEqual(broadcast_mock.call_count, 2)

    def test_resolve_approval_rejects_stale_non_waiting_execution_before_mutating_approval(self) -> None:
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-stale", "测试团队", self._temp_dir.name),
        )
        workflow_definition = {
            "nodes": {
                "approval-1": {
                    "type": "approval",
                    "label": "人工审批",
                    "description": "需要负责人确认",
                }
            },
            "edges": [],
            "maxIterations": 100,
            "schedule": None,
        }
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            (
                "workflow-stale",
                "team-stale",
                "审批工作流",
                json.dumps(workflow_definition, ensure_ascii=False),
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'stopped', ?, '[]', '{}')
            """,
            ("execution-stale", "workflow-stale", "approval-1"),
        )
        db.execute(
            """
            INSERT INTO approvals (id, execution_id, node_id, title, description, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            ("approval-stale", "execution-stale", "approval-1", "人工审批", "等待处理"),
        )
        db.commit()

        engine = WorkflowEngine()

        with self.assertRaisesRegex(ValueError, "not waiting for approval"):
            asyncio.run(
                engine.resolve_approval(
                    "approval-stale",
                    approved=True,
                    resolved_by="human",
                )
            )

        approval = db.execute(
            "SELECT status, reject_reason, resolved_at FROM approvals WHERE id = ?",
            ("approval-stale",),
        ).fetchone()
        self.assertEqual(approval["status"], "pending")
        self.assertIsNone(approval["reject_reason"])
        self.assertIsNone(approval["resolved_at"])

    def test_list_active_execution_signals_uses_latest_log_timestamp_as_updated_at(self) -> None:
        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-3", "测试团队三", self._temp_dir.name),
        )
        workflow_definition = {
            "nodes": {
                "task-1": {
                    "type": "task",
                    "label": "执行任务",
                    "agentId": "agent-1",
                }
            },
            "edges": [],
            "maxIterations": 100,
            "schedule": None,
        }
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            (
                "workflow-3",
                "team-3",
                "活跃信号工作流",
                json.dumps(workflow_definition, ensure_ascii=False),
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'running', ?, ?, '{}')
            """,
            (
                "execution-3",
                "workflow-3",
                "task-1",
                json.dumps(
                    [
                        {
                            "timestamp": "2026-03-13T10:05:00Z",
                            "nodeId": "task-1",
                            "message": "节点进入执行",
                            "level": "info",
                        }
                    ],
                    ensure_ascii=False,
                ),
            ),
        )
        db.execute(
            "UPDATE workflow_executions SET started_at = ? WHERE id = ?",
            ("2026-03-13 10:00:00", "execution-3"),
        )
        db.commit()

        engine = WorkflowEngine()
        signals = engine.list_active_execution_signals()
        signal = next(item for item in signals if item["executionId"] == "execution-3")

        self.assertEqual(signal["updatedAt"], "2026-03-13T10:05:00Z")


class WorkflowEngineCreateWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "workflow.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)

    def test_create_workflow_rejects_unknown_team_id(self) -> None:
        engine = WorkflowEngine()

        with self.assertRaises(WorkflowValidationError) as exc_info:
            engine.create_workflow("default", "中文工作流", {"nodes": {}, "edges": []})

        self.assertEqual(str(exc_info.exception), "Team not found: default")


if __name__ == "__main__":
    unittest.main()
