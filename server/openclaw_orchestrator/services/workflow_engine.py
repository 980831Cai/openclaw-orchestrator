"""Workflow engine service."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from datetime import datetime
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.services.notification_service import notification_service
from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
from openclaw_orchestrator.websocket.ws_handler import broadcast

JOIN_NODE_TYPES = {"join", "parallel"}
JOIN_MODES = {"and", "or", "xor"}


class WorkflowEngine:
    """Workflow CRUD and graph execution engine."""

    def __init__(self) -> None:
        self._running_executions: dict[str, dict[str, Any]] = {}

    def create_workflow(
        self, team_id: str, name: str, definition: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        db = get_db()
        workflow_id = str(uuid.uuid4())
        definition = definition or {}
        nodes = definition.get("nodes", {})
        edges = definition.get("edges", [])
        max_iterations = definition.get("maxIterations", 100)
        schedule = definition.get("schedule")

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
        execution_id = str(uuid.uuid4())

        db.execute(
            "INSERT INTO workflow_executions (id, workflow_id, status, logs) VALUES (?, ?, 'running', '[]')",
            (execution_id, workflow_id),
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
            "timestamp": datetime.utcnow().isoformat(),
            "nodeId": "__workflow__",
            "message": (
                f"工作流开始执行（source={trigger_source}"
                + (f", scheduledFor={scheduled_for}" if scheduled_for else "")
                + ")"
            ),
            "level": "info",
        }
        self._append_log(execution_id, trigger_log)
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

        db = get_db()
        db.execute(
            "UPDATE workflow_executions SET status = 'stopped', completed_at = datetime('now') WHERE id = ?",
            (execution_id,),
        )
        db.commit()
        broadcast(
            {
                "type": "workflow_update",
                "payload": {"executionId": execution_id, "status": "stopped"},
                "timestamp": datetime.utcnow().isoformat(),
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
            db.execute(
                "UPDATE workflow_executions SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
                (execution_id,),
            )
            db.commit()
            self._append_log(
                execution_id,
                {
                    "timestamp": datetime.utcnow().isoformat(),
                    "nodeId": row["current_node_id"] or "__approval__",
                    "message": f"审批被驳回: {reject_reason or '无原因'}",
                    "level": "error",
                },
            )
            broadcast(
                {
                    "type": "workflow_update",
                    "payload": {"executionId": execution_id, "status": "failed"},
                    "timestamp": datetime.utcnow().isoformat(),
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
        self._append_log(
            execution_id,
            {
                "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
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
        targets = {edge.get("to") for edge in edges if edge.get("to")}
        start_nodes = [node_id for node_id in nodes if node_id not in targets]
        return start_nodes or ([next(iter(nodes))] if nodes else [])

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
            if control["failed"]:
                self._running_executions.pop(execution_id, None)
            return

        db = get_db()
        row = db.execute(
            "SELECT status FROM workflow_executions WHERE id = ?",
            (execution_id,),
        ).fetchone()
        if not row or row["status"] != "running":
            return

        db.execute(
            "UPDATE workflow_executions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
            (execution_id,),
        )
        db.commit()

        total_artifacts = sum(len(items) for items in node_artifacts.values())
        self._append_log(
            execution_id,
            {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": "__workflow__",
                "message": f"工作流执行完成，共产出 {total_artifacts} 个产物",
                "level": "info",
            },
        )
        broadcast(
            {
                "type": "workflow_update",
                "payload": {
                    "executionId": execution_id,
                    "status": "completed",
                    "totalArtifacts": total_artifacts,
                },
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
        notification_service.create_notification(
            type="workflow_completed",
            title="工作流执行完成",
            message=f"工作流已成功完成，共产出 {total_artifacts} 个产物",
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
                "timestamp": datetime.utcnow().isoformat(),
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
                        "timestamp": datetime.utcnow().isoformat(),
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
                            "timestamp": datetime.utcnow().isoformat(),
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
                            "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
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
                "payload": {"executionId": execution_id, "status": "failed"},
                "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
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
                    "timestamp": datetime.utcnow().isoformat(),
                    "nodeId": node_id,
                    "message": f"接收上游产物 {len(upstream_artifacts)} 个: {artifact_names}",
                    "level": "info",
                },
            )

        self._append_log(
            execution_id,
            {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": node_id,
                "message": f"执行任务节点: {label} (Agent: {agent_id})",
                "level": "info",
            },
        )
        broadcast(
            {
                "type": "workflow_update",
                "payload": {
                    "executionId": execution_id,
                    "currentNodeId": node_id,
                    "status": "running",
                    "upstreamArtifactCount": len(upstream_artifacts),
                },
                "timestamp": datetime.utcnow().isoformat(),
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
                            "timestamp": datetime.utcnow().isoformat(),
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
                            "timestamp": datetime.utcnow().isoformat(),
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
                        "timestamp": datetime.utcnow().isoformat(),
                        "nodeId": node_id,
                        "message": f"节点执行失败，第 {attempt}/{max_retries} 次重试...",
                        "level": "warn",
                    },
                )
                await asyncio.sleep(retry_delay)

        if not result.get("success"):
            node_artifacts[node_id] = []
            return None

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
        if require_artifacts and not normalized_artifacts:
            return False, "Task requires at least one artifact", normalized_artifacts
        return True, "", normalized_artifacts

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
                "timestamp": datetime.utcnow().isoformat(),
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
        if not expression or not upstream_text:
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
                "timestamp": datetime.utcnow().isoformat(),
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
                    "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
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
                    "timestamp": datetime.utcnow().isoformat(),
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
                    "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": node_id,
                "message": f"审批节点: {title}，工作流已暂停等待审批",
                "level": "info",
            },
        )

        control = self._running_executions.get(execution_id, {})
        context_json = json.dumps(
            {"node_artifacts": node_artifacts, "control": control},
            default=str,
        )

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
                "payload": {
                    "executionId": execution_id,
                    "currentNodeId": node_id,
                    "status": "waiting_approval",
                    "approvalId": approval_id,
                },
                "timestamp": datetime.utcnow().isoformat(),
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
                "timestamp": datetime.utcnow().isoformat(),
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
                    "timestamp": datetime.utcnow().isoformat(),
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
                    "timestamp": datetime.utcnow().isoformat(),
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
