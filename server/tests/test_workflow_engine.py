import asyncio
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from datetime import timezone
from unittest.mock import AsyncMock, patch

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from openclaw_orchestrator.database.db import close_db, get_db
from openclaw_orchestrator.database.init_db import init_database
from openclaw_orchestrator.services.task_service import task_service
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

    def test_build_task_prompt_appends_team_context_section(self) -> None:
        prompt = WorkflowEngine._build_task_prompt(
            label="实现功能",
            task_prompt="请完成需求",
            upstream_artifacts=[],
            execution_id="execution-1234",
            node_id="node-1",
            team_context="## 团队规则\n保持代码简洁",
        )

        self.assertIn("### 团队必要上下文：", prompt)
        self.assertIn("保持代码简洁", prompt)

    def test_build_task_session_id_prefers_task_scope(self) -> None:
        session_id = WorkflowEngine._build_task_session_id(
            execution_id="execution-abcdef",
            task_id="task-123",
            agent_id="agent-a",
        )
        self.assertEqual(session_id, "task-task-123-agent-a")

    def test_resolve_context_level_uses_risk_and_dependencies(self) -> None:
        self.assertEqual(
            WorkflowEngine._resolve_context_level(
                node={"riskLevel": "high"},
                upstream_artifacts=[],
            ),
            "L3",
        )
        self.assertEqual(
            WorkflowEngine._resolve_context_level(
                node={"requiresDependency": True},
                upstream_artifacts=[{"a": 1}],
            ),
            "L2",
        )
        self.assertEqual(
            WorkflowEngine._resolve_context_level(
                node={},
                upstream_artifacts=[],
            ),
            "L1",
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


class WorkflowEngineTaskQueueLinkageTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self._temp_dir.cleanup)
        self._env_patch = patch.dict(
            os.environ,
            {
                "OPENCLAW_HOME": self._temp_dir.name,
                "DB_PATH": str(Path(self._temp_dir.name) / "workflow-queue.sqlite"),
            },
            clear=False,
        )
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)
        close_db()
        init_database()
        self.addCleanup(close_db)

        db = get_db()
        db.execute(
            """
            INSERT INTO teams (id, name, description, goal, theme, schedule_json, team_dir)
            VALUES (?, ?, '', '', 'default', '{}', ?)
            """,
            ("team-q", "队列团队", self._temp_dir.name),
        )
        db.execute(
            """
            INSERT INTO workflows (id, team_id, name, definition_json, status)
            VALUES (?, ?, ?, ?, 'draft')
            """,
            ("wf-q", "team-q", "队列工作流", json.dumps({"nodes": {}, "edges": []})),
        )
        db.execute(
            """
            INSERT INTO workflow_executions (id, workflow_id, status, current_node_id, logs, context_json)
            VALUES (?, ?, 'running', ?, '[]', '{}')
            """,
            ("exec-q", "wf-q", "node-1"),
        )
        db.commit()

    def test_execute_task_node_updates_task_queue_to_done(self) -> None:
        task = task_service.create_task(
            team_id="team-q",
            title="任务节点",
            description="执行后应完成",
            participant_agent_ids=["agent-a"],
        )
        node = {
            "id": "node-1",
            "type": "task",
            "label": "执行节点",
            "agentId": "agent-a",
            "task": "请完成任务",
            "taskId": task["id"],
        }

        engine = WorkflowEngine()
        workflow = {
            "id": "wf-q",
            "teamId": "team-q",
            "name": "队列工作流",
            "nodes": {"node-1": node},
            "edges": [],
        }

        with patch.object(engine, "_safe_get_workflow_by_execution", return_value=workflow), patch(
            "openclaw_orchestrator.services.workflow_engine.openclaw_bridge.invoke_agent",
            new=AsyncMock(return_value={"success": True, "content": "summary: 已完成\nto: agent-b"}),
        ), patch(
            "openclaw_orchestrator.services.workflow_engine.broadcast"
        ), patch(
            "openclaw_orchestrator.services.workflow_engine.notification_service.create_notification"
        ):
            result = asyncio.run(
                engine._execute_task_node("exec-q", "node-1", node, [], {})
            )

        self.assertIsNone(result)
        updated = task_service.get_task(task["id"])
        self.assertEqual(updated["queueStatus"], "done")
        self.assertEqual(updated["executionId"], "exec-q")
        self.assertEqual(updated["lastNodeId"], "node-1")

    def test_execute_task_node_failure_updates_task_to_blocked(self) -> None:
        task = task_service.create_task(
            team_id="team-q",
            title="失败节点",
            description="失败后应阻塞",
            participant_agent_ids=["agent-a"],
        )
        node = {
            "id": "node-err",
            "type": "task",
            "label": "失败节点",
            "agentId": "agent-a",
            "task": "请执行",
            "taskId": task["id"],
            "maxRetries": 0,
        }

        engine = WorkflowEngine()
        workflow = {
            "id": "wf-q",
            "teamId": "team-q",
            "name": "队列工作流",
            "nodes": {"node-err": node},
            "edges": [],
        }

        with patch.object(engine, "_safe_get_workflow_by_execution", return_value=workflow), patch(
            "openclaw_orchestrator.services.workflow_engine.openclaw_bridge.invoke_agent",
            new=AsyncMock(side_effect=RuntimeError("gateway timeout")),
        ), patch.object(engine, "_mark_failed", new=AsyncMock(return_value=None)), patch(
            "openclaw_orchestrator.services.workflow_engine.broadcast"
        ), patch(
            "openclaw_orchestrator.services.workflow_engine.notification_service.create_notification"
        ):
            result = asyncio.run(
                engine._execute_task_node("exec-q", "node-err", node, [], {})
            )

        self.assertEqual(result, "__failed__")
        updated = task_service.get_task(task["id"])
        self.assertEqual(updated["queueStatus"], "blocked")
        self.assertIn("gateway timeout", updated["lastError"])
        self.assertEqual(updated["executionId"], "exec-q")


if __name__ == "__main__":
    unittest.main()
