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

        db.execute(
            "UPDATE workflows SET name = ?, definition_json = ? WHERE id = ?",
            (
                name,
                json.dumps(
                    {
                        "nodes": nodes,
                        "edges": edges,
                        "maxIterations": max_iterations,
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

    async def execute_workflow(self, workflow_id: str) -> dict[str, Any]:
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
        asyncio.ensure_future(self._run_nodes(execution_id, workflow, control))
        return self.get_execution(execution_id)

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
        self._broadcast_workflow_update(execution_id=execution_id, status="stopped")

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
            self._broadcast_workflow_update(execution_id=execution_id, status="failed")
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
            self._run_targets(
                execution_id,
                workflow,
                control,
                next_targets,
                current_node_id,
                node_artifacts,
            )
        )
        return self.get_execution(execution_id)

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
            branch_key = str(result) if result is not None else "default"
            target = branches.get(branch_key) or branches.get("default")
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

        if control["paused"] or control["abort"] or control["failed"]:
            if control["failed"]:
                self._running_executions.pop(execution_id, None)
            return

        db = get_db()
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
        self._broadcast_workflow_update(
            execution_id=execution_id,
            status="completed",
            extra={"totalArtifacts": total_artifacts},
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
        self._broadcast_workflow_update(execution_id=execution_id, status="failed")
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
                if result["success"]:
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
                raise TimeoutError(result.get("content", "No response"))
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

        node_artifacts[node_id] = [
            {
                "nodeId": node_id,
                "agentId": agent_id,
                "content": result.get("content", ""),
                "success": result.get("success", False),
                "elapsed": result.get("elapsed"),
                "filename": f"response-{node_id}-{agent_id}.txt",
                "type": "agent_response",
            }
        ]
        return None

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
            return "default"
        if ";;" in expression:
            segments = [segment.strip() for segment in expression.split(";;") if segment.strip()]
            for segment in segments:
                if "=" in segment:
                    branch_candidate, sub_expr = segment.split("=", 1)
                    if WorkflowEngine._match_single_expr(sub_expr.strip(), upstream_text):
                        branch_candidate = branch_candidate.strip()
                        if branch_candidate in branches or branch_candidate in ("true", "false"):
                            return branch_candidate
            return "default"
        if WorkflowEngine._match_single_expr(expression, upstream_text):
            if "true" in branches:
                return "true"
            non_default = [key for key in branches if key != "default"]
            return non_default[0] if non_default else "default"
        if "false" in branches:
            return "false"
        return "default"

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
        """Execute a meeting or debate node in a workflow."""
        from openclaw_orchestrator.services.meeting_service import meeting_service

        label = node.get("label", node_id)
        node_type = node.get("type", "meeting")
        meeting_type = node.get("meetingType", "debate" if node_type == "debate" else "review")
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
                    "message": f"会议/辩论节点缺少参与者配置，跳过",
                    "level": "error",
                },
            )
            return None

        # Augment topic with upstream artifacts
        if upstream_artifacts:
            artifact_summaries = []
            for art in upstream_artifacts[:5]:
                content = art.get("content", "")
                preview = content[:200] if content else "(空)"
                artifact_summaries.append(f"- {art.get('agentId', 'unknown')}: {preview}")
            topic_description += "\n\n### 上游节点产出：\n" + "\n".join(artifact_summaries)

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
            # Create and run meeting
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

            # Store meeting conclusion as node artifact
            node_artifacts[node_id] = [
                {
                    "nodeId": node_id,
                    "agentId": lead_agent_id or "meeting",
                    "content": summary,
                    "success": True,
                    "filename": f"meeting-{meeting['id'][:8]}.md",
                    "type": "meeting_conclusion",
                    "meetingId": meeting["id"],
                },
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
                },
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
        self._broadcast_workflow_update(
            execution_id=execution_id,
            status="waiting_approval",
            node_id=node_id,
            node=node,
            extra={"approvalId": approval_id},
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


workflow_engine = WorkflowEngine()
