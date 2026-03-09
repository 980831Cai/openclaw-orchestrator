"""Workflow engine service.

Graph-traversal execution model with support for:
- Topological start-node resolution
- Condition branch jumps (including backtracking to upstream nodes)
- Approval node pause / resume
- Task node retry (maxRetries + retryDelayMs)
- Global max_iterations guard against infinite loops
- Context serialization for pause/resume across restarts
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.websocket.ws_handler import broadcast
from openclaw_orchestrator.services.notification_service import notification_service


class WorkflowEngine:
    """Workflow CRUD and graph-traversal execution engine."""

    def __init__(self) -> None:
        self._running_executions: dict[str, dict[str, bool]] = {}

    # ────── Workflow CRUD ──────

    def create_workflow(
        self, team_id: str, name: str, definition: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        """Create a new workflow."""
        db = get_db()
        workflow_id = str(uuid.uuid4())
        definition = definition or {}
        nodes = definition.get("nodes", {})
        edges = definition.get("edges", [])
        max_iterations = definition.get("maxIterations", 100)

        db.execute(
            "INSERT INTO workflows (id, team_id, name, definition_json, status) VALUES (?, ?, ?, ?, 'draft')",
            (
                workflow_id,
                team_id,
                name,
                json.dumps({"nodes": nodes, "edges": edges, "maxIterations": max_iterations}),
            ),
        )
        db.commit()

        return self.get_workflow(workflow_id)

    def get_workflow(self, workflow_id: str) -> dict[str, Any]:
        """Get a workflow by ID."""
        db = get_db()
        row = db.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Workflow not found: {workflow_id}")
        return self._map_workflow_row(row)

    def list_workflows(self, team_id: Optional[str] = None) -> list[dict[str, Any]]:
        """List workflows, optionally filtered by team."""
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
        return [self._map_workflow_row(r) for r in rows]

    def update_workflow(
        self, workflow_id: str, updates: dict[str, Any]
    ) -> dict[str, Any]:
        """Update a workflow."""
        db = get_db()
        current = self.get_workflow(workflow_id)
        nodes = updates.get("nodes", current["nodes"])
        edges = updates.get("edges", current["edges"])
        name = updates.get("name", current["name"])
        max_iterations = updates.get("maxIterations", current.get("maxIterations", 100))

        db.execute(
            "UPDATE workflows SET name = ?, definition_json = ? WHERE id = ?",
            (
                name,
                json.dumps({"nodes": nodes, "edges": edges, "maxIterations": max_iterations}),
                workflow_id,
            ),
        )
        db.commit()
        return self.get_workflow(workflow_id)

    def delete_workflow(self, workflow_id: str) -> None:
        """Delete a workflow."""
        db = get_db()
        db.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))
        db.commit()

    # ────── Execution ──────

    async def execute_workflow(self, workflow_id: str) -> dict[str, Any]:
        """Start executing a workflow asynchronously."""
        db = get_db()
        workflow = self.get_workflow(workflow_id)
        execution_id = str(uuid.uuid4())

        db.execute(
            "INSERT INTO workflow_executions (id, workflow_id, status, logs) VALUES (?, ?, 'running', '[]')",
            (execution_id, workflow_id),
        )
        db.commit()

        control = {"abort": False}
        self._running_executions[execution_id] = control

        # Execute asynchronously via graph traversal
        asyncio.ensure_future(self._run_nodes(execution_id, workflow, control))

        return self.get_execution(execution_id)

    def stop_execution(self, execution_id: str) -> None:
        """Stop a running execution."""
        control = self._running_executions.get(execution_id)
        if control:
            control["abort"] = True

        db = get_db()
        db.execute(
            "UPDATE workflow_executions SET status = 'stopped', completed_at = datetime('now') WHERE id = ?",
            (execution_id,),
        )
        db.commit()

        broadcast({
            "type": "workflow_update",
            "payload": {"executionId": execution_id, "status": "stopped"},
            "timestamp": datetime.utcnow().isoformat(),
        })

    def get_execution(self, execution_id: str) -> dict[str, Any]:
        """Get an execution by ID."""
        db = get_db()
        row = db.execute(
            "SELECT * FROM workflow_executions WHERE id = ?", (execution_id,)
        ).fetchone()
        if not row:
            raise ValueError(f"Execution not found: {execution_id}")
        return self._map_execution_row(row)

    def get_executions_by_workflow(
        self, workflow_id: str
    ) -> list[dict[str, Any]]:
        """Get all executions for a workflow."""
        db = get_db()
        rows = db.execute(
            "SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC",
            (workflow_id,),
        ).fetchall()
        return [self._map_execution_row(r) for r in rows]

    # ────── Resume (from approval pause) ──────

    async def resume_execution(
        self,
        execution_id: str,
        approved: bool,
        reject_reason: str = "",
    ) -> dict[str, Any]:
        """Resume a paused execution after an approval decision.

        Args:
            execution_id: The paused execution's ID.
            approved: True = continue, False = mark failed.
            reject_reason: Reason text when rejected.

        Returns:
            Updated execution dict.
        """
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
            # Rejection → mark execution as failed
            db.execute(
                "UPDATE workflow_executions SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
                (execution_id,),
            )
            db.commit()

            self._append_log(execution_id, {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": row["current_node_id"] or "__approval__",
                "message": f"❌ 审批被驳回: {reject_reason or '无原因'}",
                "level": "error",
            })

            broadcast({
                "type": "workflow_update",
                "payload": {"executionId": execution_id, "status": "failed"},
                "timestamp": datetime.utcnow().isoformat(),
            })

            notification_service.create_notification(
                type="workflow_error",
                title="工作流审批被驳回",
                message=reject_reason or "审批未通过，工作流已终止",
                execution_id=execution_id,
                node_id=row["current_node_id"],
            )

            return self.get_execution(execution_id)

        # Approved → restore context and continue graph traversal
        approval_node_id = row["current_node_id"]
        context_json = row["context_json"] if "context_json" in row.keys() else None
        node_artifacts: dict[str, list[dict[str, Any]]] = (
            json.loads(context_json) if context_json else {}
        )

        # Update status to running
        db.execute(
            "UPDATE workflow_executions SET status = 'running' WHERE id = ?",
            (execution_id,),
        )
        db.commit()

        self._append_log(execution_id, {
            "timestamp": datetime.utcnow().isoformat(),
            "nodeId": approval_node_id or "__approval__",
            "message": "✅ 审批通过，工作流继续执行",
            "level": "info",
        })

        # Reload workflow definition
        workflow_id = row["workflow_id"]
        workflow = self.get_workflow(workflow_id)
        nodes = workflow["nodes"]
        edges = workflow["edges"]

        # Find the next node after the approval node
        next_node_id = self._resolve_next_node(
            approval_node_id, nodes.get(approval_node_id, {}), edges, None
        )

        # Restore control and continue
        control = {"abort": False}
        self._running_executions[execution_id] = control

        asyncio.ensure_future(
            self._run_nodes_from(
                execution_id, workflow, control, next_node_id, node_artifacts
            )
        )

        broadcast({
            "type": "workflow_update",
            "payload": {"executionId": execution_id, "status": "running"},
            "timestamp": datetime.utcnow().isoformat(),
        })

        return self.get_execution(execution_id)

    # ────── Graph-traversal execution core ──────

    def _resolve_start_node(
        self, nodes: dict[str, Any], edges: list[dict[str, str]]
    ) -> str | None:
        """Find the node with in-degree 0 (no incoming edges) as the start node."""
        targets = {e.get("to") for e in edges if e.get("to")}
        for node_id in nodes:
            if node_id not in targets:
                return node_id
        # Fallback: first node in dict order
        return next(iter(nodes), None)

    def _resolve_next_node(
        self,
        current_id: str,
        node: dict[str, Any],
        edges: list[dict[str, str]],
        result: Any,
    ) -> str | None:
        """Determine the next node based on node type and execution result.

        For condition nodes, reads `branches` dict to decide the target node
        (which may be an upstream node, enabling backtracking).
        """
        node_type = node.get("type", "task")

        if node_type == "condition":
            # Evaluate which branch to take
            branches: dict[str, str] = node.get("branches", {})
            expression = node.get("expression", "")

            # Simple expression evaluation:
            # result from condition evaluation is the branch key
            branch_key = str(result) if result is not None else "default"
            target = branches.get(branch_key) or branches.get("default")
            if target:
                return target

        # Default: follow the outgoing edge from current node
        for edge in edges:
            if edge.get("from") == current_id:
                return edge.get("to")

        return None  # No outgoing edge → workflow ends

    async def _run_nodes(
        self,
        execution_id: str,
        workflow: dict[str, Any],
        control: dict[str, bool],
    ) -> None:
        """Execute workflow using graph traversal (while + current_node_id pointer)."""
        nodes = workflow["nodes"]
        edges = workflow["edges"]
        node_artifacts: dict[str, list[dict[str, Any]]] = {}

        start_node = self._resolve_start_node(nodes, edges)
        await self._run_nodes_from(
            execution_id, workflow, control, start_node, node_artifacts
        )

    async def _run_nodes_from(
        self,
        execution_id: str,
        workflow: dict[str, Any],
        control: dict[str, bool],
        start_node_id: str | None,
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        """Core graph-traversal loop starting from a specific node.

        Used both for initial execution and for resuming after approval.
        """
        nodes = workflow["nodes"]
        edges = workflow["edges"]
        max_iterations = workflow.get("maxIterations", 100)

        current_node_id = start_node_id
        iteration_count = 0

        while (
            current_node_id is not None
            and not control["abort"]
            and iteration_count < max_iterations
        ):
            if current_node_id not in nodes:
                self._append_log(execution_id, {
                    "timestamp": datetime.utcnow().isoformat(),
                    "nodeId": current_node_id,
                    "message": f"⚠️ 节点 {current_node_id} 未在工作流定义中找到，跳过",
                    "level": "warn",
                })
                break

            node = nodes[current_node_id]

            # When backtracking: clear previous artifacts for re-entered node
            if current_node_id in node_artifacts:
                node_artifacts[current_node_id] = []

            self._update_execution_node(execution_id, current_node_id)

            # Execute the current node
            result = await self._execute_node(
                execution_id, current_node_id, node, edges, node_artifacts
            )

            # Approval pause: save context and exit
            if result == "__paused__":
                return

            # Resolve next node
            current_node_id = self._resolve_next_node(
                current_node_id, node, edges, result
            )

            # Log backtracking if next node was already visited
            if current_node_id and current_node_id in node_artifacts:
                self._append_log(execution_id, {
                    "timestamp": datetime.utcnow().isoformat(),
                    "nodeId": current_node_id,
                    "message": f"🔄 回跳到已执行节点 {nodes.get(current_node_id, {}).get('label', current_node_id)}",
                    "level": "info",
                })

            iteration_count += 1

        # ── Post-loop handling ──

        if iteration_count >= max_iterations:
            self._append_log(execution_id, {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": "__workflow__",
                "message": f"🚫 超过最大迭代次数 {max_iterations}，工作流强制终止",
                "level": "error",
            })
            db = get_db()
            db.execute(
                "UPDATE workflow_executions SET status = 'failed', completed_at = datetime('now') WHERE id = ?",
                (execution_id,),
            )
            db.commit()

            broadcast({
                "type": "workflow_update",
                "payload": {"executionId": execution_id, "status": "failed"},
                "timestamp": datetime.utcnow().isoformat(),
            })

            notification_service.create_notification(
                type="workflow_error",
                title="工作流超过最大迭代次数",
                message=f"工作流在执行 {max_iterations} 次迭代后被强制终止",
                execution_id=execution_id,
            )

        elif not control["abort"]:
            # Normal completion
            db = get_db()
            db.execute(
                "UPDATE workflow_executions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
                (execution_id,),
            )
            db.commit()

            total_artifacts = sum(len(v) for v in node_artifacts.values())
            self._append_log(execution_id, {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": "__workflow__",
                "message": f"✅ 工作流执行完成，共产出 {total_artifacts} 个产物",
                "level": "info",
            })

            broadcast({
                "type": "workflow_update",
                "payload": {
                    "executionId": execution_id,
                    "status": "completed",
                    "totalArtifacts": total_artifacts,
                },
                "timestamp": datetime.utcnow().isoformat(),
            })

            notification_service.create_notification(
                type="workflow_completed",
                title="工作流执行完成",
                message=f"工作流已成功完成，共产出 {total_artifacts} 个产物",
                execution_id=execution_id,
            )

        self._running_executions.pop(execution_id, None)

    # ────── Node execution dispatch ──────

    async def _execute_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        edges: list[dict[str, str]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> Any:
        """Execute a single node based on its type.

        Returns:
            - For task/parallel nodes: None (artifacts stored in node_artifacts)
            - For condition nodes: the branch key (str) to determine next node
            - For approval nodes: "__paused__" to signal the engine to pause
        """
        node_type = node.get("type", "task")

        # Collect upstream artifacts
        upstream_artifacts = self._collect_upstream_artifacts(
            node_id, edges, node_artifacts
        )

        if node_type == "task":
            return await self._execute_task_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        elif node_type == "condition":
            return self._execute_condition_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        elif node_type == "parallel":
            return self._execute_parallel_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        elif node_type == "approval":
            return await self._execute_approval_node(
                execution_id, node_id, node, upstream_artifacts, node_artifacts
            )
        else:
            self._append_log(execution_id, {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": node_id,
                "message": f"⚠️ 未知节点类型: {node_type}，跳过",
                "level": "warn",
            })
            return None

    # ── Task node (with retry) ──

    async def _execute_task_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        """Execute a task node with retry support."""
        label = node.get("label", node_id)
        agent_id = node.get("agentId", "unknown")
        max_retries = node.get("maxRetries", 0)
        retry_delay = node.get("retryDelayMs", 2000) / 1000.0

        # Log upstream artifacts
        if upstream_artifacts:
            artifact_names = ", ".join(
                a.get("filename", "unknown") for a in upstream_artifacts
            )
            self._append_log(execution_id, {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": node_id,
                "message": f"📥 接收上游产物 {len(upstream_artifacts)} 个: {artifact_names}",
                "level": "info",
            })

        self._append_log(execution_id, {
            "timestamp": datetime.utcnow().isoformat(),
            "nodeId": node_id,
            "message": f"执行任务节点: {label} (Agent: {agent_id})",
            "level": "info",
        })

        broadcast({
            "type": "workflow_update",
            "payload": {
                "executionId": execution_id,
                "currentNodeId": node_id,
                "status": "running",
                "upstreamArtifactCount": len(upstream_artifacts),
            },
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Retry loop
        attempt = 0
        while attempt <= max_retries:
            try:
                # Simulate task execution (TODO: replace with real agent invocation)
                await asyncio.sleep(2)
                break  # Success
            except Exception as err:
                attempt += 1
                if attempt > max_retries:
                    self._append_log(execution_id, {
                        "timestamp": datetime.utcnow().isoformat(),
                        "nodeId": node_id,
                        "message": f"💥 节点执行失败（已重试 {max_retries} 次）: {err}",
                        "level": "error",
                    })
                    raise
                self._append_log(execution_id, {
                    "timestamp": datetime.utcnow().isoformat(),
                    "nodeId": node_id,
                    "message": f"⚠️ 节点执行失败，第 {attempt}/{max_retries} 次重试...",
                    "level": "warn",
                })
                await asyncio.sleep(retry_delay)

        # Record produced artifacts (empty in simulation mode)
        node_artifacts[node_id] = []

        self._append_log(execution_id, {
            "timestamp": datetime.utcnow().isoformat(),
            "nodeId": node_id,
            "message": f"📤 节点执行完成，产出产物 0 个",
            "level": "info",
        })

        notification_service.create_notification(
            type="node_completed",
            title=f"节点完成: {label}",
            message=f"任务节点 {label} 执行完成",
            execution_id=execution_id,
            node_id=node_id,
        )

        return None

    # ── Condition node ──

    def _execute_condition_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> str:
        """Evaluate a condition node and return the branch key."""
        label = node.get("label", node_id)
        expression = node.get("expression", "")
        branches = node.get("branches", {})

        self._append_log(execution_id, {
            "timestamp": datetime.utcnow().isoformat(),
            "nodeId": node_id,
            "message": f"评估条件节点: {label} (表达式: {expression})",
            "level": "info",
        })

        # Pass through upstream artifacts
        node_artifacts[node_id] = upstream_artifacts

        # Simple condition evaluation:
        # In simulation mode, use "default" branch.
        # When real evaluation is implemented, parse `expression` against context.
        branch_key = "default"

        if branches:
            target_label = branches.get(branch_key, "未知")
            self._append_log(execution_id, {
                "timestamp": datetime.utcnow().isoformat(),
                "nodeId": node_id,
                "message": f"📋 条件分支选择: {branch_key} → {target_label}",
                "level": "info",
            })

        return branch_key

    # ── Parallel node ──

    def _execute_parallel_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> None:
        """Execute a parallel node (merge upstream artifacts)."""
        label = node.get("label", node_id)

        self._append_log(execution_id, {
            "timestamp": datetime.utcnow().isoformat(),
            "nodeId": node_id,
            "message": f"并行执行节点: {label}",
            "level": "info",
        })

        node_artifacts[node_id] = upstream_artifacts
        return None

    # ── Approval node ──

    async def _execute_approval_node(
        self,
        execution_id: str,
        node_id: str,
        node: dict[str, Any],
        upstream_artifacts: list[dict[str, Any]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> str:
        """Handle an approval node: pause execution and wait for human decision.

        Returns "__paused__" to signal the engine to exit the traversal loop.
        """
        title = node.get("title", node.get("label", "审批"))
        description = node.get("description", "")
        timeout_minutes = node.get("timeoutMinutes", 0)

        self._append_log(execution_id, {
            "timestamp": datetime.utcnow().isoformat(),
            "nodeId": node_id,
            "message": f"⏸️ 审批节点: {title} — 工作流已暂停，等待审批",
            "level": "info",
        })

        db = get_db()

        # Save execution context (node_artifacts) so we can restore on resume
        context_json = json.dumps(node_artifacts, default=str)
        db.execute(
            "UPDATE workflow_executions SET status = 'waiting_approval', context_json = ? WHERE id = ?",
            (context_json, execution_id),
        )

        # Create approval record
        approval_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO approvals (id, execution_id, node_id, title, description, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            """,
            (approval_id, execution_id, node_id, title, description),
        )
        db.commit()

        # Send notification
        notification_service.create_notification(
            type="approval_required",
            title=f"审批等待: {title}",
            message=description or f"工作流在节点 {title} 处等待您的审批",
            execution_id=execution_id,
            node_id=node_id,
        )

        # Broadcast status update
        broadcast({
            "type": "workflow_update",
            "payload": {
                "executionId": execution_id,
                "currentNodeId": node_id,
                "status": "waiting_approval",
                "approvalId": approval_id,
            },
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Also broadcast approval event for frontend notification subscription
        broadcast({
            "type": "approval_update",
            "payload": {
                "id": approval_id,
                "executionId": execution_id,
                "nodeId": node_id,
                "title": title,
                "description": description,
                "status": "pending",
            },
            "timestamp": datetime.utcnow().isoformat(),
        })

        return "__paused__"

    # ────── Helpers ──────

    def _collect_upstream_artifacts(
        self,
        node_id: str,
        edges: list[dict[str, str]],
        node_artifacts: dict[str, list[dict[str, Any]]],
    ) -> list[dict[str, Any]]:
        """Collect artifacts from all upstream nodes."""
        upstream: list[dict[str, Any]] = []
        incoming_edges = [e for e in edges if e.get("to") == node_id]
        for edge in incoming_edges:
            source_artifacts = node_artifacts.get(edge.get("from", ""), [])
            upstream.extend(source_artifacts)
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
            (json.dumps(logs), execution_id),
        )
        db.commit()

    # ─── Row mappers ───

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


# Singleton instance
workflow_engine = WorkflowEngine()
