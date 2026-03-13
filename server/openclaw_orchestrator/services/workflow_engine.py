"""Workflow engine service."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.notification_service import notification_service
from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
from openclaw_orchestrator.utils.time import utc_now, utc_now_iso
from openclaw_orchestrator.websocket.ws_handler import broadcast

JOIN_NODE_TYPES = {"join", "parallel"}
JOIN_MODES = {"and", "or", "xor"}
ACTIONABLE_NODE_TYPES = {"task", "meeting", "debate"}


class WorkflowValidationError(ValueError):
    """Raised when a workflow definition is not runnable."""


class WorkflowEngine:
    """Workflow CRUD and graph execution engine."""

    def __init__(self) -> None:
        self._running_executions: dict[str, dict[str, Any]] = {}

    @staticmethod
    def _utcnow():
        return utc_now()

    @classmethod
    def _utcnow_iso(cls) -> str:
        return utc_now_iso()

    def create_workflow(
        self, team_id: str, name: str, definition: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        db = get_db()
        self._ensure_team_exists(db, team_id)
        workflow_id = str(uuid.uuid4())
        definition = definition or {}
        nodes = definition.get("nodes", {})
        edges = definition.get("edges", [])
        max_iterations = definition.get("maxIterations", 100)
        schedule = definition.get("schedule")
        self._validate_workflow_definition(
            {
                "nodes": nodes,
                "edges": edges,
                "schedule": schedule,
            },
            require_runnable=bool(schedule and schedule.get("enabled")),
        )

        db.execute(
            "INSERT INTO workflows (id, team_id, name, definition_json, status) VALUES (?, ?, ?, ?, 'draft')",
            (
                workflow_id,
                team_id,
                name,
                json.dumps(
                    {
                        "nodes": nodes,
                        "edges": edges,
                        "maxIterations": max_iterations,
                        "schedule": schedule,
                    }
                ),
            ),
        )
        db.commit()
        return self.get_workflow(workflow_id)

    @staticmethod
    def _ensure_team_exists(db: Any, team_id: str) -> None:
        normalized_team_id = str(team_id or "").strip()
        if not normalized_team_id:
            raise WorkflowValidationError("teamId is required")

        row = db.execute(
            "SELECT 1 FROM teams WHERE id = ?",
            (normalized_team_id,),
        ).fetchone()
        if not row:
            raise WorkflowValidationError(f"Team not found: {normalized_team_id}")

    def get_workflow(self, workflow_id: str) -> dict[str, Any]:
        db = get_db()
        row = db.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Workflow not found: {workflow_id}")
        return self._map_workflow_row(row)

    def list_workflows(self, team_id: Optional[str] = None) -> list[dict[str, Any]]:
        db = get_db()
        if team_id:
            rows = db.execute(
                "SELECT * FROM workflows WHERE team_id = ? ORDER BY created_at DESC",
                (team_id,),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM workflows ORDER BY created_at DESC"
            ).fetchall()
        return [self._map_workflow_row(row) for row in rows]

    def update_workflow(
        self, workflow_id: str, updates: dict[str, Any]
    ) -> dict[str, Any]:
        db = get_db()
        current = self.get_workflow(workflow_id)
        nodes = updates.get("nodes", current["nodes"])
        edges = updates.get("edges", current["edges"])
        name = updates.get("name", current["name"])
        max_iterations = updates.get(
            "maxIterations", current.get("maxIterations", 100)
        )
        schedule = updates.get("schedule", current.get("schedule"))
        self._validate_workflow_definition(
            {
                "nodes": nodes,
                "edges": edges,
                "schedule": schedule,
            },
            require_runnable=bool(schedule and schedule.get("enabled")),
        )

        db.execute(
            "UPDATE workflows SET name = ?, definition_json = ? WHERE id = ?",
            (
                name,
                json.dumps(
                    {
                        "nodes": nodes,
                        "edges": edges,
                        "maxIterations": max_iterations,
                        "schedule": schedule,
                    }
                ),
                workflow_id,
            ),
        )
        db.commit()
        return self.get_workflow(workflow_id)

    def delete_workflow(self, workflow_id: str) -> None:
        db = get_db()
        db.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
        db.commit()

    async def execute_workflow(
        self,
        workflow_id: str,
        *,
        trigger_source: str = "manual",
        scheduled_for: str | None = None,
    ) -> dict[str, Any]:
        db = get_db()
        workflow = self.get_workflow(workflow_id)
        self._validate_workflow_definition(workflow, require_runnable=True)
        if self.has_active_execution(workflow_id):
            raise WorkflowValidationError(
                "工作流已有运行中或待审批的执行，不能重复触发"
            )
        execution_id = str(uuid.uuid4())

        context_json = json.dumps(
            {
                "triggerSource": trigger_source,
                "scheduledFor": scheduled_for,
            },
            default=str,
        )
        db.execute(
            "INSERT INTO workflow_executions (id, workflow_id, status, logs, context_json) VALUES (?, ?, 'running', '[]', ?)",
            (execution_id, workflow_id, context_json),
        )
        db.commit()

        control = {
            "abort": False,
            "paused": False,
            "failed": False,
            "iterations": 0,
            "join_arrivals": {},
            "join_release_count": {},
        }
        self._running_executions[execution_id] = control
        trigger_log = {
            "timestamp": self._utcnow_iso(),
            "nodeId": "__workflow__",
            "message": (
                f"工作流开始执行（source={trigger_source}"
                + (f", scheduledFor={scheduled_for}" if scheduled_for else "")
                + ")"
            ),
            "level": "info",
        }
        self._append_log(execution_id, trigger_log)
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal(
                    execution_id=execution_id,
                    workflow=workflow,
                    status="running",
                ),
                "timestamp": self._utcnow_iso(),
            }
        )
        asyncio.ensure_future(self._run_nodes(execution_id, workflow, control))
        return self.get_execution(execution_id)

    def has_active_execution(self, workflow_id: str) -> bool:
        db = get_db()
        row = db.execute(
            """
            SELECT 1
            FROM workflow_executions
            WHERE workflow_id = ?
              AND status IN ('running', 'waiting_approval')
            LIMIT 1
            """,
            (workflow_id,),
        ).fetchone()
        return row is not None

    def stop_execution(self, execution_id: str) -> None:
        control = self._running_executions.get(execution_id)
        if control:
            control["abort"] = True

        workflow = self._safe_get_workflow_by_execution(execution_id)
        execution = self._safe_get_execution(execution_id)
        db = get_db()
        pending_approvals = db.execute(
            """
            SELECT id, node_id
            FROM approvals
            WHERE execution_id = ? AND status = 'pending'
            """,
            (execution_id,),
        ).fetchall()
        db.execute(
            "UPDATE workflow_executions SET status = 'stopped', completed_at = datetime('now') WHERE id = ?",
            (execution_id,),
        )
        if pending_approvals:
            db.execute(
                """
                UPDATE approvals
                SET status = 'rejected', reject_reason = ?, resolved_at = datetime('now')
                WHERE execution_id = ? AND status = 'pending'
                """,
                ("Execution stopped", execution_id),
            )
        db.commit()
        for approval in pending_approvals:
            broadcast(
                {
                    "type": "approval_update",
                    "payload": {
                        "id": approval["id"],
                        "executionId": execution_id,
                        "nodeId": approval["node_id"],
                        "status": "rejected",
                        "rejectReason": "Execution stopped",
                        "resolvedBy": "system",
                    },
                    "timestamp": self._utcnow_iso(),
                }
            )
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal(
                    execution_id=execution_id,
                    workflow=workflow,
                    status="stopped",
                    current_node_id=execution.get("currentNodeId") if execution else None,
                ),
                "timestamp": self._utcnow_iso(),
            }
        )

    def get_execution(self, execution_id: str) -> dict[str, Any]:
        db = get_db()
        row = db.execute(
            "SELECT * FROM workflow_executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Execution not found: {execution_id}")
        return self._map_execution_row(row)

    def get_executions_by_workflow(self, workflow_id: str) -> list[dict[str, Any]]:
        db = get_db()
        rows = db.execute(
            "SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC",
            (workflow_id,),
        ).fetchall()
        return [self._map_execution_row(row) for row in rows]

    def list_active_execution_signals(self) -> list[dict[str, Any]]:
        db = get_db()
        rows = db.execute(
            """
            SELECT id, workflow_id, status, current_node_id, started_at, completed_at, logs
            FROM workflow_executions
            WHERE status IN ('running', 'waiting_approval')
            ORDER BY started_at DESC
            """,
        ).fetchall()

        signals: list[dict[str, Any]] = []
        for row in rows:
            workflow = None
            try:
                workflow = self.get_workflow(row["workflow_id"])
            except Exception:
                workflow = None

            current_node_id = row["current_node_id"] or None
            node = (
                workflow.get("nodes", {}).get(current_node_id)
                if workflow and current_node_id
                else None
            )
            updated_at = self._resolve_signal_updated_at(
                row["logs"],
                row["completed_at"],
                row["started_at"],
            )
            signals.append(
                self._build_workflow_signal(
                    execution_id=row["id"],
                    workflow=workflow,
                    status=row["status"],
                    current_node_id=current_node_id,
                    node=node,
                    updatedAt=updated_at,
                )
            )
        return signals

    async def resume_execution(
        self,
        execution_id: str,
        approved: bool,
        reject_reason: str = "",
    ) -> dict[str, Any]:
        db = get_db()
        row = db.execute(
            "SELECT * FROM workflow_executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Execution not found: {execution_id}")
        if row["status"] != "waiting_approval":
            raise ValueError(
                f"Execution {execution_id} is not waiting for approval (status={row['status']})"
            )

        if not approved:
            workflow = self.get_workflow(row["workflow_id"])
            current_node_id = row["current_node_id"] or None
            db.execute(
                "UPDATE workflow_executions SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
                (execution_id,),
            )
            db.commit()
            self._append_log(
                execution_id,
                {
                    "timestamp": self._utcnow_iso(),
                    "nodeId": row["current_node_id"] or "__approval__",
                    "message": f"审批被驳回: {reject_reason or '无原因'}",
                    "level": "error",
                },
            )
            broadcast(
                {
                    "type": "workflow_update",
                    "payload": self._build_workflow_signal(
                        execution_id=execution_id,
                        workflow=workflow,
                        status="failed",
                        current_node_id=current_node_id,
                    ),
                    "timestamp": self._utcnow_iso(),
                }
            )
            notification_service.create_notification(
                type="workflow_error",
                title="工作流审批被驳回",
                message=reject_reason or "审批未通过，工作流已终止",
                execution_id=execution_id,
                node_id=row["current_node_id"],
            )
            return self.get_execution(execution_id)

        workflow = self.get_workflow(row["workflow_id"])
        nodes = workflow["nodes"]
        edges = workflow["edges"]
        current_node_id = row["current_node_id"]
        next_targets = self._resolve_next_targets(
            current_node_id,
            nodes.get(current_node_id, {}),
            edges,
            None,
        )
        stored = json.loads(row["context_json"] or "{}")
        node_artifacts = stored.get("node_artifacts", {})
        control = stored.get("control", {})
        control.update({"abort": False, "paused": False, "failed": False})
        self._running_executions[execution_id] = control

        db.execute(
            "UPDATE workflow_executions SET status = 'running' WHERE id = ?",
            (execution_id,),
        )
        db.commit()
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal(
                    execution_id=execution_id,
                    workflow=workflow,
                    status="running",
                    current_node_id=current_node_id,
                ),
                "timestamp": self._utcnow_iso(),
            }
        )
        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": current_node_id or "__approval__",
                "message": "审批通过，工作流继续执行",
                "level": "info",
            },
        )

        asyncio.ensure_future(
            self._resume_after_approval(
                execution_id,
                workflow,
                control,
                next_targets,
                current_node_id,
                node_artifacts,
            )
        )
        return self.get_execution(execution_id)

    async def resolve_approval(
        self,
        approval_id: str,
        *,
        approved: bool,
        reject_reason: str = "",
        resolved_by: str = "human",
    ) -> dict[str, Any]:
        db = get_db()
        row = db.execute(
            "SELECT * FROM approvals WHERE id = ?",
            (approval_id,),
        ).fetchone()
        if not row:
            raise ValueError(f"Approval not found: {approval_id}")
        if row["status"] != "pending":
            raise ValueError(f"Approval is already {row['status']}")
        execution_row = db.execute(
            "SELECT status FROM workflow_executions WHERE id = ?",
            (row["execution_id"],),
        ).fetchone()
        if not execution_row:
            raise ValueError(f"Execution not found: {row['execution_id']}")
        if execution_row["status"] != "waiting_approval":
            raise ValueError(
                f"Execution {row['execution_id']} is not waiting for approval (status={execution_row['status']})"
            )

        next_status = "approved" if approved else "rejected"
        db.execute(
            """
            UPDATE approvals
            SET status = ?, reject_reason = ?, resolved_at = datetime('now')
            WHERE id = ?
            """,
            (next_status, reject_reason if not approved else None, approval_id),
        )
        db.commit()

        self._append_log(
            row["execution_id"],
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": row["node_id"],
                "message": f"审批已由 {resolved_by} {next_status}",
                "level": "info" if approved else "warn",
            },
        )
        broadcast(
            {
                "type": "approval_update",
                "payload": {
                    "id": approval_id,
                    "executionId": row["execution_id"],
                    "nodeId": row["node_id"],
                    "status": next_status,
                    "rejectReason": reject_reason or None,
                    "resolvedBy": resolved_by,
                },
                "timestamp": self._utcnow_iso(),
            }
        )
        execution = await self.resume_execution(
            execution_id=row["execution_id"],
            approved=approved,
            reject_reason=reject_reason,
        )
        latest_row = db.execute(
            "SELECT * FROM approvals WHERE id = ?",
            (approval_id,),
        ).fetchone()
        return {
            "success": True,
            "approval": self._map_approval_row(latest_row),
            "execution": execution,
        }

    async def _resume_after_approval(
        self,
        execution_id: str,
        workflow: dict[str, Any],
        control: dict[str, Any],
        next_targets: list[str],
        current_node_id: str | None,
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        await self._run_targets(
            execution_id,
            workflow,
            control,
            next_targets,
            current_node_id,
            node_artifacts,
        )
        await self._finalize_execution_if_done(execution_id, control, node_artifacts)

    def _resolve_start_nodes(
        self, nodes: dict[str, Any], edges: list[dict[str, str]]
    ) -> list[str]:
        return self._find_start_nodes(nodes, edges)

    def _resolve_next_targets(
        self,
        current_id: str | None,
        node: dict[str, Any],
        edges: list[dict[str, str]],
        result: Any,
    ) -> list[str]:
        if not current_id:
            return []

        node_type = node.get("type", "task")
        if node_type == "condition":
            branches: dict[str, str] = node.get("branches", {})
            branch_key = str(result).strip().lower() if result is not None else ""
            alias_map = {
                "yes": ("yes", "true"),
                "no": ("no", "false"),
                "true": ("true", "yes"),
                "false": ("false", "no"),
            }
            target = None
            for candidate in alias_map.get(branch_key, (branch_key,)):
                target = branches.get(candidate)
                if target:
                    break
            return [target] if target else []

        seen: set[str] = set()
        targets: list[str] = []
        for edge in edges:
            if edge.get("from") != current_id:
                continue
            target = edge.get("to")
            if target and target not in seen:
                seen.add(target)
                targets.append(target)
        return targets

    async def _run_nodes(
        self,
        execution_id: str,
        workflow: dict[str, Any],
        control: dict[str, Any],
    ) -> None:
        node_artifacts: dict[str, list[dict[str, Any]]] = {}
        start_nodes = self._resolve_start_nodes(workflow["nodes"], workflow["edges"])
        if not start_nodes:
            control["failed"] = True
            await self._mark_failed(
                execution_id,
                "工作流没有可执行起点，已终止",
            )
            return

        await self._run_targets(
            execution_id,
            workflow,
            control,
            start_nodes,
            None,
            node_artifacts,
        )

        await self._finalize_execution_if_done(execution_id, control, node_artifacts)

    async def _finalize_execution_if_done(
        self,
        execution_id: str,
        control: dict[str, Any],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        if control["paused"] or control["abort"] or control["failed"]:
            self._running_executions.pop(execution_id, None)
            return

        db = get_db()
        row = db.execute(
            "SELECT workflow_id, status, current_node_id, context_json FROM workflow_executions WHERE id = ?",
            (execution_id,),
        ).fetchone()
        if not row or row["status"] != "running":
            return

        db.execute(
            "UPDATE workflow_executions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
            (execution_id,),
        )
        db.commit()

        total_artifacts = self._count_materialized_artifacts(node_artifacts)
        completion_message = (
            f"工作流执行完成，共产出 {total_artifacts} 个产物"
            if total_artifacts > 0
            else "工作流执行完成，未产生产物"
        )
        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": "__workflow__",
                "message": completion_message,
                "level": "info",
            },
        )
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal(
                    execution_id=execution_id,
                    workflow=self.get_workflow(row["workflow_id"]) if row and row["workflow_id"] else None,
                    status="completed",
                    current_node_id=row["current_node_id"] if row else None,
                    totalArtifacts=total_artifacts,
                ),
                "timestamp": self._utcnow_iso(),
            }
        )
        execution_context = self._parse_execution_context(
            row["context_json"] if row else None
        )
        trigger_source = str(execution_context.get("triggerSource") or "manual").strip().lower()
        should_notify_completion = not (
            trigger_source == "schedule" and total_artifacts == 0
        )
        if should_notify_completion:
            notification_service.create_notification(
                type="workflow_completed",
                title="工作流执行完成",
                message=(
                    f"工作流已成功完成，共产出 {total_artifacts} 个产物"
                    if total_artifacts > 0
                    else "工作流已完成，但本次没有产生产物"
                ),
                execution_id=execution_id,
            )
        self._running_executions.pop(execution_id, None)

    async def _run_targets(
        self,
        execution_id: str,
        workflow: dict[str, Any],
        control: dict[str, Any],
        targets: list[str],
        previous_node_id: str | None,
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        if not targets or control["abort"] or control["paused"] or control["failed"]:
            return

        if len(targets) == 1:
            await self._run_path(
                execution_id,
                workflow,
                control,
                targets[0],
                previous_node_id,
                node_artifacts,
            )
            return

        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": previous_node_id or "__start__",
                "message": f"普通节点触发并行分发，下游分支数: {len(targets)}",
                "level": "info",
            },
        )
        await asyncio.gather(
            *[
                self._run_path(
                    execution_id,
                    workflow,
                    control,
                    target,
                    previous_node_id,
                    node_artifacts,
                )
                for target in targets
            ]
        )

    async def _run_path(
        self,
        execution_id: str,
        workflow: dict[str, Any],
        control: dict[str, Any],
        current_node_id: str,
        previous_node_id: str | None,
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        nodes = workflow["nodes"]
        edges = workflow["edges"]
        max_iterations = workflow.get("maxIterations", 100)

        while current_node_id and not control["abort"] and not control["paused"]:
            control["iterations"] = int(control.get("iterations", 0)) + 1
            if control["iterations"] > max_iterations:
                control["failed"] = True
                await self._mark_failed(
                    execution_id,
                    f"超过最大迭代次数 {max_iterations}，工作流强制终止",
                )
                return

            if current_node_id not in nodes:
                self._append_log(
                    execution_id,
                    {
                        "timestamp": self._utcnow_iso(),
                        "nodeId": current_node_id,
                        "message": f"节点 {current_node_id} 未在工作流定义中找到，跳过",
                        "level": "warn",
                    },
                )
                return

            node = nodes[current_node_id]
            node_type = node.get("type", "task")

            if node_type in JOIN_NODE_TYPES:
                join_decision = self._register_join_arrival(
                    current_node_id,
                    previous_node_id,
                    node,
                    edges,
                    control,
                    nodes,
                )
                if join_decision == "wait":
                    return
                if join_decision == "drop":
                    self._append_log(
                        execution_id,
                        {
                            "timestamp": self._utcnow_iso(),
                            "nodeId": current_node_id,
                            "message": "汇合节点按当前模式丢弃该分支，不再向下游继续",
                            "level": "info",
                        },
                    )
                    return

            self._update_execution_node(execution_id, current_node_id)
            result = await self._execute_node(
                execution_id,
                current_node_id,
                node,
                edges,
                node_artifacts,
            )
            if result == "__paused__":
                control["paused"] = True
                return
            if result == "__failed__":
                control["failed"] = True
                return

            next_targets = self._resolve_next_targets(
                current_node_id,
                node,
                edges,
                result,
            )
            if not next_targets:
                if node_type == "condition":
                    branch_label = str(result).strip().lower() if result is not None else "unknown"
                    self._append_log(
                        execution_id,
                        {
                            "timestamp": self._utcnow_iso(),
                            "nodeId": current_node_id,
                            "message": f"条件节点结果为 {branch_label or 'unknown'}，但该分支未连接下游节点",
                            "level": "warn",
                        },
                    )
                return

            if len(next_targets) > 1 and node_type != "condition":
                await self._run_targets(
                    execution_id,
                    workflow,
                    control,
                    next_targets,
                    current_node_id,
                    node_artifacts,
                )
                return

            previous_node_id = current_node_id
            current_node_id = next_targets[0]

    def _register_join_arrival(
        self,
        node_id: str,
        previous_node_id: str | None,
        node: dict[str, Any],
        edges: list[dict[str, str]],
        control: dict[str, Any],
        nodes: dict[str, Any],
    ) -> str:
        incoming_sources = [
            edge.get("from") for edge in edges if edge.get("to") == node_id and edge.get("from")
        ]
        unique_sources = list(dict.fromkeys(incoming_sources))
        if not unique_sources:
            return "release"

        arrivals: set[str] = set(control.setdefault("join_arrivals", {}).setdefault(node_id, []))
        if previous_node_id:
            arrivals.add(previous_node_id)
        control["join_arrivals"][node_id] = sorted(arrivals)

        arrived_count = len(arrivals)
        total_count = len(unique_sources)
        join_mode = str(node.get("joinMode") or "and").lower()
        if join_mode not in JOIN_MODES:
            join_mode = "and"

        release_count = int(control.setdefault("join_release_count", {}).get(node_id, 0))
        should_release = False
        drop_branch = False

        if join_mode == "and":
            should_release = arrived_count >= total_count and release_count == 0
        elif join_mode == "or":
            should_release = arrived_count >= 1 and release_count == 0
        elif join_mode == "xor":
            preferred_source_node_id = str(node.get("preferredSourceNodeId") or "").strip()

            if preferred_source_node_id:
                if previous_node_id == preferred_source_node_id and release_count == 0:
                    should_release = True
                else:
                    drop_branch = True
            else:
                should_release = arrived_count >= 1 and release_count == 0

        if should_release:
            control["join_release_count"][node_id] = release_count + 1
            return "release"
        if drop_branch:
            return "drop"
        return "wait"

    async def _mark_failed(self, execution_id: str, message: str) -> None:
        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": "__workflow__",
                "message": message,
                "level": "error",
            },
        )
        db = get_db()
        db.execute(
            "UPDATE workflow_executions SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
            (execution_id,),
        )
        db.commit()
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal(
                    execution_id=execution_id,
                    workflow=self._safe_get_workflow_by_execution(execution_id),
                    status="failed",
                    current_node_id=self._safe_get_execution(execution_id).get("currentNodeId")
                    if self._safe_get_execution(execution_id)
                    else None,
                ),
                "timestamp": self._utcnow_iso(),
            }
        )
        notification_service.create_notification(
            type="workflow_error",
            title="工作流执行失败",
            message=message,
            execution_id=execution_id,
        )

    async def _execute_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        edges: list[dict[str, str]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> Any:
        node_type = node.get("type", "task")
        upstream_artifacts = self._collect_upstream_artifacts(
            node_id, edges, node_artifacts
        )
        self._broadcast_workflow_update(
            execution_id=execution_id,
            status="running",
            node_id=node_id,
            node=node,
            extra={"upstreamArtifactCount": len(upstream_artifacts)},
        )

        if node_type == "task":
            return await self._execute_task_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        if node_type == "condition":
            return self._execute_condition_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        if node_type in JOIN_NODE_TYPES:
            return self._execute_join_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        if node_type == "approval":
            return await self._execute_approval_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        if node_type in ("meeting", "debate"):
            return await self._execute_meeting_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )

        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": node_id,
                "message": f"未知节点类型: {node_type}，跳过",
                "level": "warn",
            },
        )
        return None

    async def _execute_task_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        label = node.get("label", node_id)
        agent_id = node.get("agentId", "unknown")
        task_prompt = node.get("task", "")
        max_retries = node.get("maxRetries", 0)
        retry_delay = node.get("retryDelayMs", 2000) / 1000.0
        timeout_seconds = node.get("timeoutSeconds", 120)
        require_response = bool(node.get("requireResponse", True))
        require_artifacts = bool(node.get("requireArtifacts", False))
        min_output_length = max(int(node.get("minOutputLength", 1) or 0), 0)
        success_pattern = str(node.get("successPattern", "") or "").strip()

        agent_model: str | None = None
        try:
            from openclaw_orchestrator.services.agent_service import agent_service

            agent_model = agent_service._get_agent_model(agent_id)
        except Exception:
            pass

        if upstream_artifacts:
            artifact_names = ", ".join(
                artifact.get("filename", "unknown") for artifact in upstream_artifacts
            )
            self._append_log(
                execution_id,
                {
                    "timestamp": self._utcnow_iso(),
                    "nodeId": node_id,
                    "message": f"接收上游产物 {len(upstream_artifacts)} 个: {artifact_names}",
                    "level": "info",
                },
            )

        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": node_id,
                "message": f"执行任务节点: {label} (Agent: {agent_id})",
                "level": "info",
            },
        )
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal(
                    execution_id=execution_id,
                    workflow=self._safe_get_workflow_by_execution(execution_id),
                    status="running",
                    current_node_id=node_id,
                    node=node,
                    upstreamArtifactCount=len(upstream_artifacts),
                ),
                "timestamp": self._utcnow_iso(),
            }
        )

        full_prompt = self._build_task_prompt(
            label, task_prompt, upstream_artifacts, execution_id, node_id
        )

        attempt = 0
        result: dict[str, Any] = {"success": False, "content": ""}
        while attempt <= max_retries:
            try:
                result = await openclaw_bridge.invoke_agent(
                    agent_id=agent_id,
                    message=full_prompt,
                    session_id=f"wf-{execution_id[:8]}",
                    timeout_seconds=timeout_seconds,
                    correlation_id=f"{execution_id[:8]}-{node_id}",
                    model=agent_model,
                )
                task_success, failure_reason, artifacts = self._evaluate_task_result(
                    node=node,
                    node_id=node_id,
                    agent_id=agent_id,
                    result=result,
                    require_response=require_response,
                    require_artifacts=require_artifacts,
                    min_output_length=min_output_length,
                    success_pattern=success_pattern,
                )
                result["success"] = task_success
                result["artifacts"] = artifacts
                if task_success:
                    self._append_log(
                        execution_id,
                        {
                            "timestamp": self._utcnow_iso(),
                            "nodeId": node_id,
                            "message": f"Agent {agent_id} 响应 ({result.get('elapsed', '?')}s): {result['content'][:120]}...",
                            "level": "info",
                        },
                    )
                    break
                raise RuntimeError(failure_reason)
            except Exception as err:
                attempt += 1
                if attempt > max_retries:
                    self._append_log(
                        execution_id,
                        {
                            "timestamp": self._utcnow_iso(),
                            "nodeId": node_id,
                            "message": f"节点执行失败（已重试 {max_retries} 次）: {err}",
                            "level": "error",
                        },
                    )
                    notification_service.create_notification(
                        type="workflow_error",
                        title=f"节点失败: {label}",
                        message=f"Agent {agent_id} 在 {max_retries + 1} 次尝试后仍未响应: {err}",
                        execution_id=execution_id,
                        node_id=node_id,
                    )
                    break
                self._append_log(
                    execution_id,
                    {
                        "timestamp": self._utcnow_iso(),
                        "nodeId": node_id,
                        "message": f"节点执行失败，第 {attempt}/{max_retries} 次重试...",
                        "level": "warn",
                    },
                )
                await asyncio.sleep(retry_delay)

        if not result.get("success"):
            node_artifacts[node_id] = []
            await self._mark_failed(
                execution_id,
                f"节点执行失败: {label} (agent={agent_id})，未产生有效输出",
            )
            return "__failed__"

        node_artifacts[node_id] = result.get("artifacts", [])
        return None

    @staticmethod
    def _evaluate_task_result(
        node: dict[str, Any],
        node_id: str,
        agent_id: str,
        result: dict[str, Any],
        require_response: bool,
        require_artifacts: bool,
        min_output_length: int,
        success_pattern: str,
    ) -> tuple[bool, str, list[dict[str, Any]]]:
        content = str(result.get("content") or "").strip()
        artifacts = result.get("artifacts")
        normalized_artifacts: list[dict[str, Any]] = []

        if isinstance(artifacts, list):
            for index, artifact in enumerate(artifacts):
                if not isinstance(artifact, dict):
                    continue
                normalized_artifacts.append(
                    {
                        "nodeId": artifact.get("nodeId", node_id),
                        "agentId": artifact.get("agentId", agent_id),
                        "content": artifact.get("content", ""),
                        "success": artifact.get("success", result.get("success", False)),
                        "elapsed": artifact.get("elapsed", result.get("elapsed")),
                        "filename": artifact.get(
                            "filename", f"artifact-{node_id}-{index + 1}.txt"
                        ),
                        "type": artifact.get("type", "agent_artifact"),
                    }
                )

        if content:
            normalized_artifacts.insert(
                0,
                {
                    "nodeId": node_id,
                    "agentId": agent_id,
                    "content": content,
                    "success": result.get("success", False),
                    "elapsed": result.get("elapsed"),
                    "filename": f"response-{node_id}-{agent_id}.txt",
                    "type": "agent_response",
                },
            )

        if not result.get("success"):
            return False, str(result.get("content") or "Agent invocation failed"), normalized_artifacts
        if require_response and len(content) < min_output_length:
            return False, "Agent returned no usable output", normalized_artifacts
        if success_pattern and success_pattern.lower() not in content.lower():
            return False, f"Output did not match success pattern: {success_pattern}", normalized_artifacts
        if require_artifacts and not WorkflowEngine._has_materialized_artifacts(
            normalized_artifacts
        ):
            return False, "Task requires at least one artifact", normalized_artifacts
        return True, "", normalized_artifacts

    @staticmethod
    def _is_materialized_artifact(artifact: dict[str, Any]) -> bool:
        if not isinstance(artifact, dict):
            return False

        artifact_type = str(artifact.get("type") or "").strip().lower()
        if artifact_type != "agent_response":
            return True

        content = str(artifact.get("content") or "").strip()
        return bool(content)

    @classmethod
    def _has_materialized_artifacts(cls, artifacts: list[dict[str, Any]]) -> bool:
        return any(cls._is_materialized_artifact(artifact) for artifact in artifacts)

    @classmethod
    def _count_materialized_artifacts(
        cls, node_artifacts: dict[str, list[dict[str, Any]]]
    ) -> int:
        total = 0
        for artifacts in node_artifacts.values():
            if not isinstance(artifacts, list):
                continue
            total += sum(
                1
                for artifact in artifacts
                if cls._is_materialized_artifact(artifact)
            )
        return total

    @staticmethod
    def _build_task_prompt(
        label: str,
        task_prompt: str,
        upstream_artifacts: list[dict[str, Any]],
        execution_id: str,
        node_id: str,
    ) -> str:
        parts = [f"## 任务: {label}"]
        if task_prompt:
            parts.append(f"\n{task_prompt}")
        parts.append(f"\n[工作流执行 ID: {execution_id[:8]}, 节点: {node_id}]")
        if upstream_artifacts:
            parts.append("\n### 上游节点产出：")
            for artifact in upstream_artifacts:
                agent = artifact.get("agentId", "unknown")
                content = artifact.get("content", "")
                preview = content[:300] if content else "(空)"
                parts.append(f"\n**{agent}** 的输出:\n{preview}")
        return "\n".join(parts)

    def _execute_condition_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> str:
        label = node.get("label", node_id)
        expression = node.get("expression", "")
        branches = node.get("branches", {})
        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": node_id,
                "message": f"评估条件节点: {label} (表达式: {expression})",
                "level": "info",
            },
        )
        node_artifacts[node_id] = upstream_artifacts

        upstream_text = "\n".join(
            artifact.get("content", "") for artifact in upstream_artifacts if artifact.get("content")
        ).strip()
        return self._evaluate_condition(expression, upstream_text, branches)

    @staticmethod
    def _evaluate_condition(
        expression: str,
        upstream_text: str,
        branches: dict[str, str],
    ) -> str:
        normalized_expression = expression.strip().lower()
        if not normalized_expression:
            return "no"
        if not upstream_text:
            if normalized_expression in {"true", "yes", "1", "always"}:
                if "yes" in branches:
                    return "yes"
                if "true" in branches:
                    return "true"
                non_boolean = [
                    key
                    for key in branches
                    if key not in {"yes", "true", "no", "false"}
                ]
                return non_boolean[0] if non_boolean else ""
            if normalized_expression in {"false", "no", "0", "never"}:
                if "no" in branches:
                    return "no"
                if "false" in branches:
                    return "false"
                return ""
            return "no"
        if ";;" in expression:
            segments = [segment.strip() for segment in expression.split(";;") if segment.strip()]
            for segment in segments:
                if "=" in segment:
                    branch_candidate, sub_expr = segment.split("=", 1)
                    if WorkflowEngine._match_single_expr(sub_expr.strip(), upstream_text):
                        branch_candidate = branch_candidate.strip()
                        if branch_candidate in branches or branch_candidate in ("true", "false", "yes", "no"):
                            return branch_candidate
            return "no"
        if WorkflowEngine._match_single_expr(expression, upstream_text):
            if "yes" in branches:
                return "yes"
            if "true" in branches:
                return "true"
            non_boolean = [
                key for key in branches if key not in {"yes", "true", "no", "false"}
            ]
            return non_boolean[0] if non_boolean else ""
        if "no" in branches:
            return "no"
        if "false" in branches:
            return "false"
        return ""

    @staticmethod
    def _match_single_expr(expr: str, text: str) -> bool:
        expr = expr.strip()
        if not expr:
            return False
        if "||" in expr:
            return any(
                WorkflowEngine._match_single_expr(part, text)
                for part in expr.split("||")
            )
        if "&&" in expr:
            return all(
                WorkflowEngine._match_single_expr(part, text)
                for part in expr.split("&&")
            )
        if expr.lower().startswith("contains:"):
            keyword = expr[len("contains:") :].strip()
            return keyword.lower() in text.lower()
        if expr.lower().startswith("regex:"):
            pattern = expr[len("regex:") :].strip()
            try:
                return bool(re.search(pattern, text, re.IGNORECASE))
            except re.error:
                return False
        if expr.lower().startswith("json:"):
            json_expr = expr[len("json:") :].strip()
            if "=" in json_expr:
                key, expected = json_expr.split("=", 1)
                try:
                    json_match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
                    if json_match:
                        data = json.loads(json_match.group())
                        actual = str(data.get(key.strip(), ""))
                        return actual.lower() == expected.strip().lower()
                except (json.JSONDecodeError, AttributeError):
                    return False
            return False
        return expr.lower() in text.lower()

    def _execute_join_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        join_mode = str(node.get("joinMode") or "and").upper()
        node_artifacts[node_id] = upstream_artifacts
        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": node_id,
                "message": f"汇合节点放行，模式 {join_mode}，合并上游产物 {len(upstream_artifacts)} 个",
                "level": "info",
            },
        )
        return None

    async def _execute_meeting_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        from openclaw_orchestrator.services.meeting_service import meeting_service

        label = node.get("label", node_id)
        node_type = node.get("type", "meeting")
        meeting_type = node.get(
            "meetingType", "debate" if node_type == "debate" else "review"
        )
        topic = node.get("topic", label)
        topic_description = node.get("topicDescription", "")
        participants = node.get("participants", [])
        team_id = node.get("teamId", "default")
        lead_agent_id = node.get("leadAgentId") or node.get("judgeAgentId")
        max_rounds = node.get("maxRounds", 3)

        if not participants:
            self._append_log(
                execution_id,
                {
                    "timestamp": self._utcnow_iso(),
                    "nodeId": node_id,
                    "message": "会议/辩论节点缺少参与者配置，已跳过",
                    "level": "error",
                },
            )
            node_artifacts[node_id] = []
            return None

        if upstream_artifacts:
            artifact_summaries: list[str] = []
            for artifact in upstream_artifacts[:5]:
                content = str(artifact.get("content") or "").strip()
                preview = content[:200] if content else "(空)"
                artifact_summaries.append(
                    f"- {artifact.get('agentId', 'unknown')}: {preview}"
                )
            topic_description += "\n\n### 上游节点产出：\n" + "\n".join(
                artifact_summaries
            )

        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": node_id,
                "message": f"执行{'辩论' if meeting_type == 'debate' else '会议'}节点: {label} ({meeting_type}，{len(participants)} 人)",
                "level": "info",
            },
        )

        try:
            meeting = meeting_service.create_meeting(
                team_id=team_id,
                meeting_type=meeting_type,
                topic=topic,
                participants=participants,
                topic_description=topic_description,
                lead_agent_id=lead_agent_id,
                max_rounds=max_rounds,
            )
            result = await meeting_service.run_meeting(meeting["id"])
            summary = result.get("summary", "")
            self._append_log(
                execution_id,
                {
                    "timestamp": self._utcnow_iso(),
                    "nodeId": node_id,
                    "message": f"会议已结束: {summary[:120]}...",
                    "level": "info",
                },
            )
            node_artifacts[node_id] = [
                {
                    "nodeId": node_id,
                    "agentId": lead_agent_id or "meeting",
                    "content": summary,
                    "success": True,
                    "filename": f"meeting-{meeting['id'][:8]}.md",
                    "type": "meeting_conclusion",
                    "meetingId": meeting["id"],
                }
            ]
        except Exception as err:
            self._append_log(
                execution_id,
                {
                    "timestamp": self._utcnow_iso(),
                    "nodeId": node_id,
                    "message": f"会议/辩论节点执行失败: {err}",
                    "level": "error",
                },
            )
            node_artifacts[node_id] = [
                {
                    "nodeId": node_id,
                    "agentId": "meeting",
                    "content": f"Meeting failed: {err}",
                    "success": False,
                    "filename": f"meeting-error-{node_id}.txt",
                    "type": "meeting_conclusion",
                }
            ]
        return None

    async def _execute_approval_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> str:
        title = node.get("title", node.get("label", "审批"))
        description = node.get("description", "")

        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": node_id,
                "message": f"审批节点: {title}，工作流已暂停等待审批",
                "level": "info",
            },
        )

        control = self._running_executions.get(execution_id, {})
        execution_context = self._get_execution_context(execution_id)
        execution_context.update({"node_artifacts": node_artifacts, "control": control})
        context_json = json.dumps(execution_context, default=str)

        db = get_db()
        db.execute(
            "UPDATE workflow_executions SET status = 'waiting_approval', context_json = ? WHERE id = ?",
            (context_json, execution_id),
        )

        approval_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO approvals (id, execution_id, node_id, title, description, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            (approval_id, execution_id, node_id, title, description),
        )
        db.commit()

        notification_service.create_notification(
            type="approval_required",
            title=f"审批等待: {title}",
            message=description or f"工作流在节点 {title} 处等待审批",
            execution_id=execution_id,
            node_id=node_id,
        )
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal(
                    execution_id=execution_id,
                    workflow=self._safe_get_workflow_by_execution(execution_id),
                    status="waiting_approval",
                    current_node_id=node_id,
                    node=node,
                    approvalId=approval_id,
                ),
                "timestamp": self._utcnow_iso(),
            }
        )

        approver_agent_id = self._resolve_approval_agent_id(node.get("approver"))
        if approver_agent_id:
            asyncio.create_task(
                self._request_agent_approval(
                    approval_id=approval_id,
                    execution_id=execution_id,
                    node_id=node_id,
                    node=node,
                    approver_agent_id=approver_agent_id,
                    upstream_artifacts=upstream_artifacts,
                )
            )
        return "__paused__"

    def _safe_get_execution(self, execution_id: str) -> dict[str, Any] | None:
        try:
            return self.get_execution(execution_id)
        except Exception:
            return None

    def _safe_get_workflow_by_execution(
        self, execution_id: str
    ) -> dict[str, Any] | None:
        execution = self._safe_get_execution(execution_id)
        workflow_id = execution.get("workflowId") if execution else None
        if not workflow_id:
            return None
        try:
            return self.get_workflow(str(workflow_id))
        except Exception:
            return None

    def _build_workflow_signal(
        self,
        *,
        execution_id: str,
        workflow: dict[str, Any] | None,
        status: str,
        current_node_id: str | None = None,
        node: dict[str, Any] | None = None,
        **extra: Any,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "executionId": execution_id,
            "status": status,
        }
        if workflow:
            payload["workflowId"] = workflow.get("id")
            payload["workflowName"] = workflow.get("name")
        if current_node_id:
            payload["currentNodeId"] = current_node_id

        effective_node = node
        if effective_node is None and workflow and current_node_id:
            effective_node = workflow.get("nodes", {}).get(current_node_id)

        if isinstance(effective_node, dict):
            payload["nodeType"] = effective_node.get("type")
            payload["nodeLabel"] = effective_node.get("label") or current_node_id
            if effective_node.get("agentId"):
                payload["agentId"] = effective_node.get("agentId")
            participants = effective_node.get("participants")
            if isinstance(participants, list):
                payload["participantIds"] = [
                    item for item in participants if isinstance(item, str)
                ]
            approver_agent_id = self._resolve_approval_agent_id(
                effective_node.get("approver")
            )
            if approver_agent_id:
                payload["approverAgentId"] = approver_agent_id
                payload["approvalMode"] = "agent"
            elif effective_node.get("type") == "approval":
                payload["approvalMode"] = "human"

        payload.update({key: value for key, value in extra.items() if value is not None})
        return payload

    @classmethod
    def _normalize_signal_timestamp(cls, value: Any) -> str:
        raw = str(value or "").strip()
        if not raw:
            return utc_now_iso()
        if "T" not in raw and " " in raw:
            raw = raw.replace(" ", "T", 1)
        if raw.endswith("Z") or "+" in raw[10:]:
            return raw
        return raw + "Z"

    @classmethod
    def _resolve_signal_updated_at(
        cls,
        raw_logs: Any,
        completed_at: Any,
        started_at: Any,
    ) -> str:
        try:
            logs = json.loads(raw_logs or "[]")
        except (TypeError, json.JSONDecodeError):
            logs = []

        if isinstance(logs, list):
            for item in reversed(logs):
                if not isinstance(item, dict):
                    continue
                timestamp = item.get("timestamp")
                if str(timestamp or "").strip():
                    return cls._normalize_signal_timestamp(timestamp)

        return cls._normalize_signal_timestamp(completed_at or started_at)

    def _collect_upstream_artifacts(
        self,
        node_id: str,
        edges: list[dict[str, str]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        upstream: list[dict[str, Any]] = []
        for edge in edges:
            if edge.get("to") != node_id:
                continue
            upstream.extend(node_artifacts.get(edge.get("from", ""), []))
        return upstream

    def _update_execution_node(self, execution_id: str, node_id: str) -> None:
        db = get_db()
        db.execute(
            "UPDATE workflow_executions SET current_node_id = ? WHERE id = ?",
            (node_id, execution_id),
        )
        db.commit()

    def _build_workflow_signal_payload(
        self,
        *,
        execution_id: str,
        status: str,
        node_id: str | None = None,
        node: dict[str, Any] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "executionId": execution_id,
            "status": status,
        }
        workflow_id = self._get_workflow_id_for_execution(execution_id)
        if workflow_id:
            payload["workflowId"] = workflow_id
        if node_id:
            payload["currentNodeId"] = node_id
        if node:
            node_type = str(node.get("type") or "task")
            payload["nodeType"] = node_type
            payload["nodeLabel"] = str(
                node.get("label") or node.get("title") or node_id or node_type
            )
            if node_type == "task":
                agent_id = node.get("agentId")
                if agent_id:
                    payload["agentId"] = str(agent_id)
            elif node_type in {"meeting", "debate"}:
                participants = node.get("participants")
                if isinstance(participants, list):
                    payload["participantIds"] = [str(item) for item in participants if item]
                lead_key = "leadAgentId" if node_type == "meeting" else "judgeAgentId"
                lead_agent_id = node.get(lead_key)
                if lead_agent_id:
                    payload["agentId"] = str(lead_agent_id)
        if extra:
            payload.update(extra)
        return payload

    def _get_workflow_id_for_execution(self, execution_id: str) -> str | None:
        try:
            db = get_db()
            row = db.execute(
                "SELECT workflow_id FROM workflow_executions WHERE id = ?",
                (execution_id,),
            ).fetchone()
        except Exception:
            return None
        if not row:
            return None
        workflow_id = row["workflow_id"]
        return str(workflow_id) if workflow_id else None

    def _broadcast_workflow_update(
        self,
        *,
        execution_id: str,
        status: str,
        node_id: str | None = None,
        node: dict[str, Any] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        broadcast(
            {
                "type": "workflow_update",
                "payload": self._build_workflow_signal_payload(
                    execution_id=execution_id,
                    status=status,
                    node_id=node_id,
                    node=node,
                    extra=extra,
                ),
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    def _append_log(self, execution_id: str, log: dict[str, Any]) -> None:
        db = get_db()
        row = db.execute(
            "SELECT logs FROM workflow_executions WHERE id = ?", (execution_id,)
        ).fetchone()
        logs = json.loads(row["logs"] or "[]")
        logs.append(log)
        db.execute(
            "UPDATE workflow_executions SET logs = ? WHERE id = ?",
            (json.dumps(logs, ensure_ascii=False), execution_id),
        )
        db.commit()

    def _get_execution_context(self, execution_id: str) -> dict[str, Any]:
        db = get_db()
        row = db.execute(
            "SELECT context_json FROM workflow_executions WHERE id = ?",
            (execution_id,),
        ).fetchone()
        if not row:
            return {}
        return self._parse_execution_context(row["context_json"])

    @staticmethod
    def _parse_execution_context(raw: Any) -> dict[str, Any]:
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def _collect_branch_targets(node: dict[str, Any]) -> list[str]:
        branches = node.get("branches")
        if not isinstance(branches, dict):
            return []
        return [
            value.strip()
            for value in branches.values()
            if isinstance(value, str) and value.strip()
        ]

    @classmethod
    def _collect_outgoing_targets(
        cls,
        node_id: str,
        node: dict[str, Any],
        edges: list[dict[str, str]],
    ) -> list[str]:
        seen: set[str] = set()
        targets: list[str] = []

        for edge in edges:
            if not isinstance(edge, dict) or edge.get("from") != node_id:
                continue
            target = str(edge.get("to") or "").strip()
            if target and target not in seen:
                seen.add(target)
                targets.append(target)

        for target in cls._collect_branch_targets(node):
            if target not in seen:
                seen.add(target)
                targets.append(target)

        return targets

    @classmethod
    def _find_start_nodes(
        cls,
        nodes: dict[str, Any],
        edges: list[dict[str, str]],
    ) -> list[str]:
        targets: set[str] = set()
        for edge in edges:
            if not isinstance(edge, dict):
                continue
            target = str(edge.get("to") or "").strip()
            if target:
                targets.add(target)

        for node in nodes.values():
            if isinstance(node, dict):
                targets.update(cls._collect_branch_targets(node))

        return [node_id for node_id in nodes if node_id not in targets]

    @classmethod
    def _has_reachable_actionable_path(
        cls,
        nodes: dict[str, Any],
        edges: list[dict[str, str]],
        start_nodes: list[str],
    ) -> bool:
        if not start_nodes:
            return False

        visited: set[str] = set()
        queue = list(start_nodes)
        while queue:
            node_id = queue.pop(0)
            if node_id in visited:
                continue
            visited.add(node_id)

            node = nodes.get(node_id)
            if not isinstance(node, dict):
                continue

            node_type = str(node.get("type") or "task").strip().lower()
            if node_type in ACTIONABLE_NODE_TYPES:
                return True

            for target in cls._collect_outgoing_targets(node_id, node, edges):
                if target in nodes and target not in visited:
                    queue.append(target)

        return False

    @classmethod
    def _validate_workflow_definition(
        cls,
        workflow: dict[str, Any], *, require_runnable: bool
    ) -> None:
        if not require_runnable:
            return

        nodes = workflow.get("nodes")
        edges = workflow.get("edges")
        if not isinstance(nodes, dict) or not nodes:
            raise WorkflowValidationError("工作流没有任何节点，不能执行或启用定时")

        if not isinstance(edges, list):
            edges = []

        errors: list[str] = []
        actionable_node_ids: list[str] = []

        for node_id, raw_node in nodes.items():
            if not isinstance(raw_node, dict):
                continue
            node_type = str(raw_node.get("type") or "task").strip().lower()
            node_label = str(raw_node.get("label") or node_id).strip() or node_id

            if node_type in ACTIONABLE_NODE_TYPES:
                actionable_node_ids.append(node_id)

            if node_type == "task":
                agent_id = str(raw_node.get("agentId") or "").strip()
                if not agent_id:
                    errors.append(f"任务节点“{node_label}”未选择 agent")

            if node_type in {"meeting", "debate"}:
                participants = raw_node.get("participants")
                valid_participants = (
                    [item for item in participants if isinstance(item, str) and item.strip()]
                    if isinstance(participants, list)
                    else []
                )
                if not valid_participants:
                    errors.append(f"{'辩论' if node_type == 'debate' else '会议'}节点“{node_label}”未配置参与者")

            if node_type == "condition":
                branch_targets = cls._collect_branch_targets(raw_node)
                has_outgoing_edge = any(
                    isinstance(edge, dict)
                    and edge.get("from") == node_id
                    and str(edge.get("to") or "").strip()
                    for edge in edges
                )
                if not branch_targets and not has_outgoing_edge:
                    errors.append(f"条件节点“{node_label}”未连接任何分支")

        if not actionable_node_ids:
            errors.append("工作流没有任何可执行节点（task / meeting / debate）")

        start_nodes = cls._find_start_nodes(nodes, edges)
        if not start_nodes:
            errors.append("工作流没有起始节点，无法开始执行")
        elif not cls._has_reachable_actionable_path(nodes, edges, start_nodes):
            errors.append("从起始节点无法到达任何可执行节点（task / meeting / debate）")

        if errors:
            raise WorkflowValidationError("；".join(errors))

    @staticmethod
    def _map_workflow_row(row: Any) -> dict[str, Any]:
        definition = json.loads(row["definition_json"] or "{}")
        return {
            "id": row["id"],
            "name": row["name"],
            "teamId": row["team_id"],
            "nodes": definition.get("nodes", {}),
            "edges": definition.get("edges", []),
            "maxIterations": definition.get("maxIterations", 100),
            "schedule": definition.get("schedule"),
        }

    @staticmethod
    def _map_execution_row(row: Any) -> dict[str, Any]:
        return {
            "id": row["id"],
            "workflowId": row["workflow_id"],
            "status": row["status"],
            "currentNodeId": row["current_node_id"] or None,
            "startedAt": row["started_at"],
            "completedAt": row["completed_at"] or None,
            "logs": json.loads(row["logs"] or "[]"),
        }

    @staticmethod
    def _map_approval_row(row: Any) -> dict[str, Any]:
        return {
            "id": row["id"],
            "executionId": row["execution_id"],
            "nodeId": row["node_id"],
            "title": row["title"],
            "description": row["description"],
            "status": row["status"],
            "rejectReason": row["reject_reason"],
            "createdAt": row["created_at"],
            "resolvedAt": row["resolved_at"],
        }

    @staticmethod
    def _extract_json_object(raw: str) -> dict[str, Any] | None:
        text = raw.strip()
        if not text:
            return None
        candidates = [text]
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            candidates.append(match.group(0))
        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
        return None

    @staticmethod
    def _parse_agent_approval_response(raw: str) -> tuple[bool, str] | None:
        parsed = WorkflowEngine._extract_json_object(raw)
        if parsed:
            decision = str(
                parsed.get("decision")
                or parsed.get("status")
                or parsed.get("action")
                or ""
            ).strip().lower()
            reason = str(parsed.get("reason") or parsed.get("comment") or "").strip()
            if decision in {"approve", "approved", "yes", "pass"}:
                return True, reason
            if decision in {"reject", "rejected", "no", "deny", "denied"}:
                return False, reason

        lowered = raw.strip().lower()
        if any(token in lowered for token in ("approve", "approved", "同意", "批准", "通过")):
            return True, ""
        if any(token in lowered for token in ("reject", "rejected", "拒绝", "驳回", "不通过")):
            return False, ""
        return None

    @staticmethod
    def _build_agent_approval_prompt(
        *,
        workflow_id: str,
        node_id: str,
        title: str,
        description: str,
        upstream_artifacts: list[dict[str, Any]],
    ) -> str:
        artifact_lines: list[str] = []
        for artifact in upstream_artifacts[:5]:
            artifact_name = str(artifact.get("filename") or artifact.get("type") or "artifact")
            artifact_content = str(artifact.get("content") or "").strip()
            artifact_preview = artifact_content[:240]
            artifact_lines.append(f"- {artifact_name}: {artifact_preview}")
        artifacts_block = "\n".join(artifact_lines) if artifact_lines else "- 无上游产物"

        return (
            "你现在是工作流审批代理，请只返回 JSON，不要输出其他文本。\n"
            "允许的返回格式只有两种：\n"
            '{"decision":"approve","reason":"..."}\n'
            '{"decision":"reject","reason":"..."}\n\n'
            f"workflowId: {workflow_id}\n"
            f"nodeId: {node_id}\n"
            f"title: {title}\n"
            f"description: {description or '无'}\n"
            "upstreamArtifacts:\n"
            f"{artifacts_block}\n"
        )

    @staticmethod
    def _resolve_approval_agent_id(raw_approver: Any) -> str | None:
        if raw_approver is None:
            return None

        candidates: list[str] = []
        if isinstance(raw_approver, dict):
            for key in ("agentId", "agent_id", "id", "value", "name"):
                value = raw_approver.get(key)
                if value is not None:
                    candidates.append(str(value).strip())
        else:
            candidates.append(str(raw_approver).strip())

        normalized_candidates: list[str] = []
        for candidate in candidates:
            if not candidate:
                continue
            normalized_candidates.append(candidate)
            if candidate.startswith("agent:"):
                normalized_candidates.append(candidate.split(":", 1)[1].strip())
            if candidate.startswith("@"):
                normalized_candidates.append(candidate[1:].strip())

        if not normalized_candidates:
            return None

        try:
            from openclaw_orchestrator.services.agent_service import agent_service

            known_ids = {agent["id"] for agent in agent_service.list_agents()}
        except Exception:
            known_ids = set()

        for candidate in normalized_candidates:
            if candidate in known_ids:
                return candidate
        return None

    async def _request_agent_approval(
        self,
        *,
        approval_id: str,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        approver_agent_id: str,
        upstream_artifacts: list[dict[str, Any]],
    ) -> None:
        title = str(node.get("title") or node.get("label") or "审批")
        description = str(node.get("description") or "")
        timeout_minutes = max(int(node.get("timeoutMinutes") or 5), 1)
        on_timeout = str(node.get("onTimeout") or "reject").strip().lower()
        prompt = self._build_agent_approval_prompt(
            workflow_id=self.get_execution(execution_id)["workflowId"],
            node_id=node_id,
            title=title,
            description=description,
            upstream_artifacts=upstream_artifacts,
        )

        self._append_log(
            execution_id,
            {
                "timestamp": self._utcnow_iso(),
                "nodeId": node_id,
                "message": f"已请求 agent {approver_agent_id} 处理审批",
                "level": "info",
            },
        )

        try:
            result = await openclaw_bridge.invoke_agent(
                agent_id=approver_agent_id,
                message=prompt,
                session_id=f"approval-{approval_id[:8]}",
                timeout_seconds=min(timeout_minutes * 60, 3600),
                correlation_id=f"approval-{approval_id[:8]}",
            )
        except Exception as exc:
            self._append_log(
                execution_id,
                {
                    "timestamp": self._utcnow_iso(),
                    "nodeId": node_id,
                    "message": f"agent 审批调用失败: {exc}",
                    "level": "warn",
                },
            )
            return

        parsed = self._parse_agent_approval_response(str(result.get("content") or ""))
        if parsed is None:
            self._append_log(
                execution_id,
                {
                    "timestamp": self._utcnow_iso(),
                    "nodeId": node_id,
                    "message": f"agent {approver_agent_id} 未返回可解析审批结果，保留人工审批",
                    "level": "warn",
                },
            )
            if not result.get("success") and on_timeout == "reject":
                try:
                    await self.resolve_approval(
                        approval_id,
                        approved=False,
                        reject_reason=f"agent approver timeout: {approver_agent_id}",
                        resolved_by=f"agent:{approver_agent_id}",
                    )
                except ValueError:
                    return
            return

        approved, reason = parsed
        try:
            await self.resolve_approval(
                approval_id,
                approved=approved,
                reject_reason=reason,
                resolved_by=f"agent:{approver_agent_id}",
            )
        except ValueError:
            return


workflow_engine = WorkflowEngine()
