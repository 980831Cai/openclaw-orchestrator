"""Task management service with artifact support.

Manages tasks, task files (task.md), and artifact files under the team directory
structure: teams/{teamId}/active/task-{id}/.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.utils.time import utc_now, utc_now_iso
from openclaw_orchestrator.services.file_manager import file_manager
from openclaw_orchestrator.websocket.ws_handler import broadcast

# ─── Artifact type inference ───

EXT_TYPE_MAP: dict[str, str] = {
    "ts": "code", "tsx": "code", "js": "code", "jsx": "code", "py": "code",
    "go": "code", "java": "code", "rs": "code", "c": "code", "cpp": "code",
    "h": "code", "rb": "code", "swift": "code", "kt": "code", "css": "code",
    "scss": "code", "less": "code", "html": "code", "vue": "code",
    "svelte": "code", "sh": "code", "bat": "code",
    "md": "document", "txt": "document", "doc": "document", "pdf": "document",
    "rst": "document",
    "json": "data", "csv": "data", "xml": "data", "yaml": "data",
    "yml": "data", "sql": "data",
    "conf": "config", "ini": "config", "toml": "config", "env": "config",
    "properties": "config",
}


def _infer_artifact_type(ext: str) -> str:
    return EXT_TYPE_MAP.get(ext.lower(), "other")


# ─── Task MD template ───

HANDOFF_SECTION_TITLE = "可执行交接区"
DECISION_SECTION_TITLE = "决议摘要区"


def _task_md_template(title: str, description: str, agents: list[str]) -> str:
    agent_lines = "\n".join(f"- {a}" for a in agents)
    return f"""# {title}

## 任务描述
{description}

## 参与成员
{agent_lines}

## 状态：进行中

---

## 信息交换区

<!-- Agent 们在此区域交换信息、更新进度 -->

---

## {HANDOFF_SECTION_TITLE}

<!-- 仅记录可消费交接；由后端统一模板写入 -->

---

## {DECISION_SECTION_TITLE}

<!-- 仅记录授权后的会议决议摘要（非原始会议纪要） -->

---

## 产物引用区

<!-- 产物文件记录：Agent 创建产物后自动追加引用指针 -->
<!-- 格式：📦 [agentId] name.ext - 描述 -->
"""


def _empty_manifest(task_id: str) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "artifacts": [],
        "updatedAt": utc_now_iso(),
    }


class TaskService:
    """Service for managing tasks and their artifacts."""

    QUEUE_ALLOWED_STATUSES = {
        "backlog",
        "ready",
        "running",
        "blocked",
        "done",
        "cancelled",
    }

    # ────── Task CRUD ──────

    def create_task(
        self,
        team_id: str,
        title: str,
        description: str,
        participant_agent_ids: list[str],
        *,
        queue_status: str = "backlog",
        parent_task_id: Optional[str] = None,
        planned_by: Optional[str] = None,
        workflow_id: Optional[str] = None,
        trigger_event_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new task with directory structure."""
        db = get_db()
        task_id = str(uuid.uuid4())

        task_dir = os.path.join("teams", team_id, "active", f"task-{task_id}")
        task_md_path = os.path.join(task_dir, "task.md")
        artifacts_dir = os.path.join(task_dir, "artifacts")
        manifest_path = os.path.join(artifacts_dir, "manifest.json")

        file_manager.ensure_dir(task_dir)
        file_manager.ensure_dir(artifacts_dir)
        file_manager.write_file(
            task_md_path, _task_md_template(title, description, participant_agent_ids)
        )
        file_manager.write_json(manifest_path, _empty_manifest(task_id))

        normalized_queue_status = self._normalize_queue_status(queue_status)
        queue_seq_row = db.execute(
            "SELECT COALESCE(MAX(queue_seq), 0) + 1 AS next_seq FROM tasks WHERE team_id = ?",
            (team_id,),
        ).fetchone()
        next_queue_seq = int(queue_seq_row["next_seq"] if queue_seq_row else 1)

        db.execute(
            """
            INSERT INTO tasks (
                id, team_id, title, description, status, queue_status,
                parent_task_id, planned_by, queued_at,
                workflow_id, trigger_event_id, queue_seq,
                task_file_path, participant_agent_ids, artifact_count
            ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, 0)
            """,
            (
                task_id,
                team_id,
                title,
                description,
                normalized_queue_status,
                parent_task_id,
                planned_by,
                workflow_id,
                trigger_event_id,
                next_queue_seq,
                file_manager.get_full_path(task_dir),
                json.dumps(participant_agent_ids),
            ),
        )
        db.commit()
        return self.get_task(task_id)

    def get_task(self, task_id: str) -> dict[str, Any]:
        """Get task details."""
        db = get_db()
        row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise ValueError(f"Task not found: {task_id}")

        return {
            "id": row["id"],
            "teamId": row["team_id"],
            "title": row["title"],
            "description": row["description"],
            "status": row["status"],
            "queueStatus": row["queue_status"] if "queue_status" in row.keys() else "backlog",
            "parentTaskId": row["parent_task_id"] if "parent_task_id" in row.keys() else None,
            "plannedBy": row["planned_by"] if "planned_by" in row.keys() else None,
            "blockedReason": row["blocked_reason"] if "blocked_reason" in row.keys() else "",
            "lastError": row["last_error"] if "last_error" in row.keys() else "",
            "retryCount": row["retry_count"] if "retry_count" in row.keys() else 0,
            "executionId": row["execution_id"] if "execution_id" in row.keys() else None,
            "workflowId": row["workflow_id"] if "workflow_id" in row.keys() else None,
            "triggerEventId": row["trigger_event_id"] if "trigger_event_id" in row.keys() else None,
            "queueSeq": row["queue_seq"] if "queue_seq" in row.keys() else None,
            "lastNodeId": row["last_node_id"] if "last_node_id" in row.keys() else None,
            "queuedAt": row["queued_at"] if "queued_at" in row.keys() else None,
            "startedAt": row["started_at"] if "started_at" in row.keys() else None,
            "finishedAt": row["finished_at"] if "finished_at" in row.keys() else None,
            "lastHeartbeatAt": row["last_heartbeat_at"] if "last_heartbeat_at" in row.keys() else None,
            "nextRetryAt": row["next_retry_at"] if "next_retry_at" in row.keys() else None,
            "taskFilePath": row["task_file_path"],
            "participantAgentIds": json.loads(row["participant_agent_ids"] or "[]"),
            "summary": row["summary"],
            "artifactCount": row["artifact_count"] or 0,
            "createdAt": row["created_at"],
            "completedAt": row["completed_at"],
        }

    def list_tasks(
        self, team_id: str, status: Optional[str] = None
    ) -> list[dict[str, Any]]:
        """List tasks for a team."""
        db = get_db()
        if status:
            rows = db.execute(
                "SELECT * FROM tasks WHERE team_id = ? AND status = ? ORDER BY created_at DESC",
                (team_id, status),
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM tasks WHERE team_id = ? ORDER BY created_at DESC",
                (team_id,),
            ).fetchall()

        return [
            {
                "id": r["id"],
                "teamId": r["team_id"],
                "title": r["title"],
                "status": r["status"],
                "participantAgentIds": json.loads(
                    r["participant_agent_ids"] or "[]"
                ),
                "artifactCount": r["artifact_count"] or 0,
                "createdAt": r["created_at"],
                "completedAt": r["completed_at"],
            }
            for r in rows
        ]

    def get_task_content(self, task_id: str) -> str:
        """Get task.md content (compatible with old/new format)."""
        task = self.get_task(task_id)
        team_id = task["teamId"]

        # New format: directory structure
        dir_task_md = os.path.join(
            "teams", team_id, "active", f"task-{task_id}", "task.md"
        )
        if file_manager.file_exists(dir_task_md):
            return file_manager.read_file(dir_task_md)

        # Legacy format: single file
        legacy_file = os.path.join(
            "teams", team_id, "active", f"task-{task_id}.md"
        )
        if file_manager.file_exists(legacy_file):
            return file_manager.read_file(legacy_file)

        # Archive directory
        archive_dir_md = os.path.join(
            "teams", team_id, "archive", f"task-{task_id}", "task.md"
        )
        if file_manager.file_exists(archive_dir_md):
            return file_manager.read_file(archive_dir_md)

        # Legacy archive
        archive_legacy = os.path.join(
            "teams", team_id, "archive", f"task-{task_id}.md"
        )
        if file_manager.file_exists(archive_legacy):
            return file_manager.read_file(archive_legacy)

        return ""

    def get_task_summary_excerpt(self, task_id: str, *, max_chars: int = 1600) -> str:
        """Extract a concise context excerpt from task.md."""
        content = self.get_task_content(task_id)
        if not content:
            return ""

        sections = self._extract_task_sections(content)
        ordered = [
            sections.get("任务描述", "").strip(),
            sections.get("状态", "").strip(),
            sections.get("信息交换区", "").strip(),
            sections.get("产物引用区", "").strip(),
        ]
        merged = "\n\n".join(chunk for chunk in ordered if chunk).strip()
        if not merged:
            merged = content.strip()

        normalized_limit = max(int(max_chars), 0)
        if normalized_limit <= 0:
            return ""
        if len(merged) <= normalized_limit:
            return merged
        return merged[:normalized_limit].rstrip() + "\n...（任务内容已截断）"

    def get_task_goal_excerpt(self, task_id: str, *, max_chars: int = 1200) -> str:
        """Extract task goal + status as L1 baseline context."""
        content = self.get_task_content(task_id)
        if not content:
            return ""

        sections = self._extract_task_sections(content)
        merged = "\n\n".join(
            chunk
            for chunk in (
                sections.get("任务描述", "").strip(),
                sections.get("状态：进行中", "").strip() or sections.get("状态", "").strip(),
            )
            if chunk
        ).strip()
        if not merged:
            merged = sections.get("任务描述", "").strip() or content.strip()
        return self._truncate_text(merged, max_chars=max_chars)

    def get_handoff_excerpt(
        self,
        task_id: str,
        *,
        limit: int,
        max_chars: int = 1800,
    ) -> str:
        """Return recent handoff records for contextual reading."""
        handoffs = self.get_recent_handoffs(task_id, limit=limit)
        if not handoffs:
            return ""

        lines: list[str] = []
        for item in handoffs:
            lines.extend(
                [
                    f"- [{item.get('timestamp', '')}] {item.get('fromAgentId', 'unknown')} -> {', '.join(item.get('toAgentIds', []) or ['未指定'])}",
                    f"  摘要: {item.get('summary', '')}",
                    f"  风险: {item.get('riskLevel', 'medium')} | 阻塞: {'是' if item.get('blocked') else '否'}",
                ]
            )
        return self._truncate_text("\n".join(lines).strip(), max_chars=max_chars)

    def get_authorized_decision_excerpt(self, task_id: str, *, max_chars: int = 1000) -> str:
        """Read only authorized meeting decision digests from task.md section."""
        content = self.get_task_content(task_id)
        if not content:
            return ""
        sections = self._extract_task_sections(content)
        decision_text = sections.get(DECISION_SECTION_TITLE, "").strip()
        return self._truncate_text(decision_text, max_chars=max_chars)

    def append_handoff_record(
        self,
        *,
        task_id: str,
        node_id: str,
        from_agent_id: str,
        raw_output: str,
        to_agent_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Parse and append a normalized handoff block into task.md."""
        task = self.get_task(task_id)
        task_dir = self._get_task_dir_path(task)
        task_md_path = os.path.join(task_dir, "task.md")

        content = file_manager.read_file(task_md_path) if file_manager.file_exists(task_md_path) else ""
        normalized_content = self._ensure_task_core_sections(content)

        payload = self._parse_handoff_payload(raw_output)
        summary = payload.get("summary") or self._truncate_text(str(raw_output or "").strip(), max_chars=300)
        normalized_to = [str(item).strip() for item in (payload.get("toAgentIds") or to_agent_ids or []) if str(item).strip()]
        blocked = bool(payload.get("blocked", False))
        risk_level = self._normalize_risk_level(payload.get("riskLevel"))

        handoff = {
            "timestamp": utc_now_iso(),
            "nodeId": str(node_id or "").strip() or "unknown",
            "fromAgentId": str(from_agent_id or "").strip() or "unknown",
            "toAgentIds": normalized_to,
            "summary": summary,
            "dependencies": payload.get("dependencies") or [],
            "blocked": blocked,
            "blockReason": str(payload.get("blockReason") or "").strip(),
            "riskLevel": risk_level,
            "nextAction": str(payload.get("nextAction") or "").strip(),
            "raw": str(raw_output or "").strip(),
        }

        handoff_block = self._render_handoff_block(handoff)
        updated = self._append_to_section(
            normalized_content,
            section_title=HANDOFF_SECTION_TITLE,
            block=handoff_block,
        )
        file_manager.write_file(task_md_path, updated)

        handoff_log_path = os.path.join(task_dir, "handoffs.jsonl")
        existing = ""
        if file_manager.file_exists(handoff_log_path):
            existing = file_manager.read_file(handoff_log_path)
        serialized = json.dumps(handoff, ensure_ascii=False)
        file_manager.write_file(handoff_log_path, (existing + "\n" + serialized).strip() + "\n")
        return handoff

    def append_authorized_decision_summary(
        self,
        *,
        task_id: str,
        meeting_id: str,
        summary: str,
        participants: list[str],
    ) -> None:
        """Append authorized decision digest to task.md (never raw meeting notes)."""
        task = self.get_task(task_id)
        task_dir = self._get_task_dir_path(task)
        task_md_path = os.path.join(task_dir, "task.md")

        content = file_manager.read_file(task_md_path) if file_manager.file_exists(task_md_path) else ""
        normalized_content = self._ensure_task_core_sections(content)
        now = utc_now().strftime("%Y-%m-%d %H:%M:%S")
        participant_text = ", ".join(p for p in participants if str(p).strip()) or "未记录"
        digest = (
            f"\n### 决议 {now} ({meeting_id[:8]})\n"
            f"- 参会方: {participant_text}\n"
            f"- 摘要: {self._truncate_text(summary.strip(), max_chars=400)}\n"
        )
        updated = self._append_to_section(
            normalized_content,
            section_title=DECISION_SECTION_TITLE,
            block=digest,
        )
        file_manager.write_file(task_md_path, updated)

    def validate_handoff(
        self,
        handoff: dict[str, Any],
        *,
        mode: str,
        expected_from_agent: str,
    ) -> tuple[bool, str]:
        """Validate handoff payload according to configured release mode."""
        normalized_mode = str(mode or "strict").strip().lower()
        if normalized_mode == "disabled":
            return True, ""

        from_agent = str(handoff.get("fromAgentId") or "").strip()
        summary = str(handoff.get("summary") or "").strip()
        to_agents = [item for item in (handoff.get("toAgentIds") or []) if str(item).strip()]

        if from_agent != str(expected_from_agent or "").strip():
            return False, "handoff source mismatch"
        if not summary:
            return False, "handoff summary is empty"
        if normalized_mode == "strict" and not to_agents:
            return False, "handoff missing toAgentIds in strict mode"

        return True, ""

    def get_recent_handoffs(self, task_id: str, *, limit: int) -> list[dict[str, Any]]:
        """Read structured handoff records from task.md."""
        normalized_limit = max(int(limit), 0)
        if normalized_limit <= 0:
            return []

        task = self.get_task(task_id)
        task_dir = self._get_task_dir_path(task)
        handoff_log_path = os.path.join(task_dir, "handoffs.jsonl")

        found: list[dict[str, Any]] = []
        if file_manager.file_exists(handoff_log_path):
            raw_lines = file_manager.read_file(handoff_log_path).splitlines()
            for line in raw_lines:
                text = str(line or "").strip()
                if not text:
                    continue
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    found.append(parsed)

        # Fallback: parse markdown annotation for backward compatibility
        if not found:
            content = self.get_task_content(task_id)
            if not content:
                return []
            for match in re.finditer(r"<!--\\s*HANDOFF:(.*?)\\s*-->", content, flags=re.DOTALL):
                raw_json = match.group(1).strip()
                if not raw_json:
                    continue
                try:
                    parsed = json.loads(raw_json)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    found.append(parsed)

        if not found:
            return []
        return found[-normalized_limit:]

    def complete_task(
        self, task_id: str, summary: Optional[str] = None
    ) -> dict[str, Any]:
        """Complete a task and archive it."""
        db = get_db()
        task = self.get_task(task_id)
        team_id = task["teamId"]

        db.execute(
            "UPDATE tasks SET status = 'completed', completed_at = datetime('now'), summary = ? WHERE id = ?",
            (summary or "", task_id),
        )
        db.commit()

        # Move directory to archive
        active_dir = os.path.join("teams", team_id, "active", f"task-{task_id}")
        archive_dir = os.path.join("teams", team_id, "archive", f"task-{task_id}")

        if file_manager.is_directory(active_dir):
            file_manager.move_dir(active_dir, archive_dir)
        else:
            # Legacy single file
            active_file = os.path.join(
                "teams", team_id, "active", f"task-{task_id}.md"
            )
            archive_file = os.path.join(
                "teams", team_id, "archive", f"task-{task_id}.md"
            )
            if file_manager.file_exists(active_file):
                file_manager.move_file(active_file, archive_file)

        if summary:
            self._append_to_team_md(team_id, summary, task["title"])

        return self.get_task(task_id)

    def update_task_status(self, task_id: str, status: str) -> dict[str, Any]:
        """Update task status."""
        if status == "completed":
            return self.complete_task(task_id)
        db = get_db()
        db.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
        db.commit()
        return self.get_task(task_id)

    def set_queue_status(
        self,
        task_id: str,
        queue_status: str,
        *,
        execution_id: Optional[str] = None,
        node_id: Optional[str] = None,
        blocked_reason: Optional[str] = None,
        last_error: Optional[str] = None,
    ) -> dict[str, Any]:
        """Update task queue status and execution metadata."""
        normalized = self._normalize_queue_status(queue_status)
        db = get_db()
        sets = ["queue_status = ?"]
        values: list[Any] = [normalized]

        now_expr_fields = {
            "ready": [
                "queued_at = COALESCE(queued_at, datetime('now'))",
                "started_at = NULL",
                "finished_at = NULL",
                "blocked_reason = ''",
                "last_error = ''",
                "last_heartbeat_at = NULL",
                "next_retry_at = NULL",
            ],
            "running": [
                "started_at = COALESCE(started_at, datetime('now'))",
                "blocked_reason = ''",
                "last_error = ''",
                "last_heartbeat_at = datetime('now')",
                "next_retry_at = NULL",
            ],
            "blocked": ["finished_at = NULL", "last_heartbeat_at = NULL"],
            "done": [
                "finished_at = datetime('now')",
                "blocked_reason = ''",
                "last_error = ''",
                "last_heartbeat_at = NULL",
            ],
            "cancelled": ["finished_at = datetime('now')", "last_heartbeat_at = NULL"],
            "backlog": [
                "started_at = NULL",
                "finished_at = NULL",
                "blocked_reason = ''",
                "last_error = ''",
                "last_heartbeat_at = NULL",
                "next_retry_at = NULL",
            ],
        }
        sets.extend(now_expr_fields.get(normalized, []))

        if execution_id is not None:
            sets.append("execution_id = ?")
            values.append(execution_id)
        if node_id is not None:
            sets.append("last_node_id = ?")
            values.append(node_id)
        if blocked_reason is not None:
            sets.append("blocked_reason = ?")
            values.append(blocked_reason)
        if last_error is not None:
            sets.append("last_error = ?")
            values.append(last_error)
            if last_error.strip():
                sets.append("retry_count = COALESCE(retry_count, 0) + 1")

        values.append(task_id)
        db.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", values)

        if normalized == "done":
            db.execute(
                "UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
                (task_id,),
            )
        elif normalized in {"running", "ready", "blocked", "backlog"}:
            db.execute(
                "UPDATE tasks SET status = 'active', completed_at = NULL WHERE id = ?",
                (task_id,),
            )

        db.commit()
        return self.get_task(task_id)

    def heartbeat_running_task(self, task_id: str) -> None:
        """Refresh task running heartbeat timestamp."""
        db = get_db()
        db.execute(
            """
            UPDATE tasks
            SET last_heartbeat_at = datetime('now')
            WHERE id = ? AND queue_status = 'running'
            """,
            (task_id,),
        )
        db.commit()

    def recover_stale_running_tasks(
        self,
        team_id: str,
        *,
        stale_seconds: int = 300,
        max_retries: int = 3,
        base_backoff_seconds: int = 30,
    ) -> dict[str, int]:
        """Recover stale running tasks to ready/blocked state."""
        db = get_db()
        stale_threshold = max(int(stale_seconds), 1)
        retries_cap = max(int(max_retries), 0)
        base_backoff = max(int(base_backoff_seconds), 1)

        rows = db.execute(
            """
            SELECT id, COALESCE(retry_count, 0) AS retry_count
            FROM tasks
            WHERE team_id = ?
              AND queue_status = 'running'
              AND COALESCE(last_heartbeat_at, started_at, queued_at, created_at) <= datetime('now', ?)
            """,
            (team_id, f"-{stale_threshold} seconds"),
        ).fetchall()

        recovered = 0
        blocked = 0
        for row in rows:
            task_id = row["id"]
            retry_count = int(row["retry_count"])
            if retry_count >= retries_cap:
                db.execute(
                    """
                    UPDATE tasks
                    SET queue_status = 'blocked',
                        status = 'active',
                        finished_at = NULL,
                        last_heartbeat_at = NULL,
                        blocked_reason = 'running_timeout',
                        last_error = 'running task timeout exceeded retry limit'
                    WHERE id = ?
                    """,
                    (task_id,),
                )
                blocked += 1
                continue

            backoff_seconds = base_backoff * (2 ** retry_count)
            db.execute(
                """
                UPDATE tasks
                SET queue_status = 'ready',
                    status = 'active',
                    started_at = NULL,
                    finished_at = NULL,
                    last_heartbeat_at = NULL,
                    blocked_reason = '',
                    last_error = 'running task timeout, re-queued',
                    retry_count = retry_count + 1,
                    next_retry_at = datetime('now', ?)
                WHERE id = ?
                """,
                (f"+{backoff_seconds} seconds", task_id),
            )
            recovered += 1

        if rows:
            db.commit()

        return {
            "scanned": len(rows),
            "recovered": recovered,
            "blocked": blocked,
        }

    def get_next_ready_task(self, team_id: str) -> dict[str, Any] | None:
        """Pick the next ready task in FIFO order for a team."""
        db = get_db()
        row = db.execute(
            """
            SELECT id
            FROM tasks
            WHERE team_id = ?
              AND queue_status = 'ready'
              AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
            ORDER BY
              CASE WHEN queue_seq IS NULL THEN 1 ELSE 0 END,
              queue_seq ASC,
              queued_at ASC,
              created_at ASC
            LIMIT 1
            """,
            (team_id,),
        ).fetchone()
        if not row:
            return None
        return self.get_task(row["id"])

    def attach_execution(
        self,
        task_id: str,
        *,
        execution_id: str,
        workflow_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Bind a workflow execution to a task."""
        db = get_db()
        sets = ["execution_id = ?"]
        values: list[Any] = [execution_id]
        if workflow_id is not None:
            sets.append("workflow_id = ?")
            values.append(workflow_id)
        values.append(task_id)
        db.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", values)
        db.commit()
        return self.get_task(task_id)

    # ────── Artifact management ──────

    def add_artifact(
        self,
        task_id: str,
        agent_id: str,
        name: str,
        ext: str,
        content: str,
        description: Optional[str] = None,
    ) -> dict[str, Any]:
        """Add an artifact to a task."""
        task = self.get_task(task_id)
        task_dir = self._get_task_dir_path(task)
        artifacts_dir = os.path.join(task_dir, "artifacts")
        manifest_path = os.path.join(artifacts_dir, "manifest.json")

        file_manager.ensure_dir(artifacts_dir)

        # Build filename: {agentId}_{name}.{ext}
        import re
        sanitized_name = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
        filename = f"{agent_id}_{sanitized_name}.{ext}"
        artifact_file = os.path.join(artifacts_dir, filename)

        file_manager.write_file(artifact_file, content)

        artifact = {
            "id": str(uuid.uuid4()),
            "taskId": task_id,
            "agentId": agent_id,
            "name": sanitized_name,
            "filename": filename,
            "ext": ext,
            "type": _infer_artifact_type(ext),
            "description": description or "",
            "size": len(content.encode("utf-8")),
            "createdAt": utc_now_iso(),
        }

        # Update manifest
        manifest = self._load_manifest(manifest_path, task_id)
        manifest["artifacts"] = [
            a for a in manifest["artifacts"] if a["filename"] != filename
        ]
        manifest["artifacts"].append(artifact)
        manifest["updatedAt"] = utc_now_iso()
        file_manager.write_json(manifest_path, manifest)

        # Update DB count
        db = get_db()
        db.execute(
            "UPDATE tasks SET artifact_count = ? WHERE id = ?",
            (len(manifest["artifacts"]), task_id),
        )
        db.commit()

        # Append reference to task.md
        self._append_artifact_reference(task_dir, artifact)

        # WebSocket notification
        broadcast(
            {
                "type": "task_update",
                "payload": {"taskId": task_id, "event": "artifact_added", "artifact": artifact},
                "timestamp": utc_now_iso(),
            }
        )

        return artifact

    def get_artifacts(self, task_id: str) -> list[dict[str, Any]]:
        """Get all artifacts for a task."""
        task = self.get_task(task_id)
        task_dir = self._get_task_dir_path(task)
        manifest_path = os.path.join(task_dir, "artifacts", "manifest.json")

        if not file_manager.file_exists(manifest_path):
            return []

        manifest = self._load_manifest(manifest_path, task_id)
        return manifest["artifacts"]

    def get_artifact_content(self, task_id: str, filename: str) -> str:
        """Read artifact file content."""
        task = self.get_task(task_id)
        task_dir = self._get_task_dir_path(task)
        artifact_file = os.path.join(task_dir, "artifacts", filename)

        if not file_manager.file_exists(artifact_file):
            raise FileNotFoundError(f"Artifact not found: {filename}")

        return file_manager.read_file(artifact_file)

    def delete_artifact(self, task_id: str, filename: str) -> None:
        """Delete an artifact."""
        task = self.get_task(task_id)
        task_dir = self._get_task_dir_path(task)
        artifacts_dir = os.path.join(task_dir, "artifacts")
        manifest_path = os.path.join(artifacts_dir, "manifest.json")

        file_manager.delete_file(os.path.join(artifacts_dir, filename))

        if file_manager.file_exists(manifest_path):
            manifest = self._load_manifest(manifest_path, task_id)
            manifest["artifacts"] = [
                a for a in manifest["artifacts"] if a["filename"] != filename
            ]
            manifest["updatedAt"] = utc_now_iso()
            file_manager.write_json(manifest_path, manifest)

            db = get_db()
            db.execute(
                "UPDATE tasks SET artifact_count = ? WHERE id = ?",
                (len(manifest["artifacts"]), task_id),
            )
            db.commit()

        broadcast(
            {
                "type": "task_update",
                "payload": {"taskId": task_id, "event": "artifact_deleted", "filename": filename},
                "timestamp": utc_now_iso(),
            }
        )

    # ─── Private helpers ───

    @staticmethod
    def _extract_task_sections(content: str) -> dict[str, str]:
        """Split markdown content by level-2 headings."""
        sections: dict[str, str] = {}
        current = ""
        bucket: list[str] = []

        for raw_line in str(content or "").splitlines():
            line = raw_line.rstrip()
            if line.startswith("## "):
                if current:
                    sections[current] = "\n".join(bucket).strip()
                current = line.replace("## ", "", 1).strip()
                bucket = []
                continue
            if current:
                bucket.append(line)

        if current:
            sections[current] = "\n".join(bucket).strip()

        return sections

    def _get_task_dir_path(self, task: dict[str, Any]) -> str:
        """Get relative task directory path (compatible with old/new format)."""
        team_id = task["teamId"]
        task_id = task["id"]

        dir_path = os.path.join("teams", team_id, "active", f"task-{task_id}")
        if file_manager.is_directory(dir_path):
            return dir_path

        archive_dir = os.path.join("teams", team_id, "archive", f"task-{task_id}")
        if file_manager.is_directory(archive_dir):
            return archive_dir

        # Auto-upgrade to directory structure
        file_manager.ensure_dir(dir_path)
        file_manager.ensure_dir(os.path.join(dir_path, "artifacts"))

        legacy_file = os.path.join("teams", team_id, "active", f"task-{task_id}.md")
        if file_manager.file_exists(legacy_file):
            content = file_manager.read_file(legacy_file)
            file_manager.write_file(os.path.join(dir_path, "task.md"), content)
            file_manager.delete_file(legacy_file)

        manifest_path = os.path.join(dir_path, "artifacts", "manifest.json")
        if not file_manager.file_exists(manifest_path):
            file_manager.write_json(manifest_path, _empty_manifest(task_id))

        return dir_path

    def _load_manifest(self, manifest_path: str, task_id: str) -> dict[str, Any]:
        try:
            return file_manager.read_json(manifest_path)
        except Exception:
            return _empty_manifest(task_id)

    def _append_artifact_reference(
        self, task_dir: str, artifact: dict[str, Any]
    ) -> None:
        task_md_path = os.path.join(task_dir, "task.md")
        if not file_manager.file_exists(task_md_path):
            return
        content = file_manager.read_file(task_md_path)
        timestamp = utc_now().strftime("%Y-%m-%d %H:%M:%S")
        reference = f"\n📦 [{artifact['agentId']}] {artifact['filename']} - {artifact.get('description') or artifact['name']} ({timestamp})"
        file_manager.write_file(task_md_path, content + reference)

    def _append_to_team_md(
        self, team_id: str, summary: str, task_title: str
    ) -> None:
        team_md_path = os.path.join("teams", team_id, "team.md")
        if not file_manager.file_exists(team_md_path):
            return
        content = file_manager.read_file(team_md_path)
        date_str = utc_now().strftime("%Y-%m-%d")
        entry = f"\n\n### [{date_str}] 任务「{task_title}」总结\n\n{summary}"
        file_manager.write_file(team_md_path, content + entry)

    @classmethod
    def _normalize_queue_status(cls, status: str) -> str:
        normalized = str(status or "").strip().lower()
        if normalized not in cls.QUEUE_ALLOWED_STATUSES:
            raise ValueError(f"Invalid queue status: {status}")
        return normalized

    @staticmethod
    def _truncate_text(text: str, *, max_chars: int) -> str:
        normalized_limit = max(int(max_chars), 0)
        raw = str(text or "").strip()
        if normalized_limit <= 0:
            return ""
        if len(raw) <= normalized_limit:
            return raw
        return raw[:normalized_limit].rstrip() + "\n...（内容已截断）"

    @staticmethod
    def _normalize_risk_level(value: Any) -> str:
        risk = str(value or "medium").strip().lower()
        if risk in {"low", "medium", "high", "critical"}:
            return risk
        alias = {
            "中": "medium",
            "高": "high",
            "低": "low",
            "严重": "critical",
            "阻塞": "high",
        }
        return alias.get(risk, "medium")

    def _parse_handoff_payload(self, raw_output: str) -> dict[str, Any]:
        text = str(raw_output or "").strip()
        if not text:
            return {}

        payload: dict[str, Any] = {}
        json_match = re.search(r"\{[\s\S]*\}", text)
        if json_match:
            try:
                parsed = json.loads(json_match.group(0))
                if isinstance(parsed, dict):
                    payload.update(parsed)
            except json.JSONDecodeError:
                pass

        if payload:
            return {
                "summary": str(payload.get("summary") or payload.get("handoff") or payload.get("结论") or "").strip(),
                "toAgentIds": payload.get("toAgentIds") or payload.get("to") or [],
                "dependencies": payload.get("dependencies") or payload.get("dependsOn") or [],
                "blocked": payload.get("blocked") or payload.get("isBlocked") or False,
                "blockReason": payload.get("blockReason") or payload.get("阻塞原因") or "",
                "riskLevel": payload.get("riskLevel") or payload.get("risk") or payload.get("风险") or "medium",
                "nextAction": payload.get("nextAction") or payload.get("next") or payload.get("下一步") or "",
            }

        extracted: dict[str, Any] = {}
        key_patterns = {
            "summary": [r"^(?:摘要|结论|handoff|summary)[:：]\s*(.+)$"],
            "toAgentIds": [r"^(?:to|接收人|交接给)[:：]\s*(.+)$"],
            "dependencies": [r"^(?:依赖|dependencies|depends)[:：]\s*(.+)$"],
            "blockReason": [r"^(?:阻塞原因|blockReason|block_reason)[:：]\s*(.+)$"],
            "riskLevel": [r"^(?:风险|risk|riskLevel)[:：]\s*(.+)$"],
            "nextAction": [r"^(?:下一步|next|nextAction)[:：]\s*(.+)$"],
            "blocked": [r"^(?:阻塞|blocked|isBlocked)[:：]\s*(.+)$"],
        }

        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            for key, patterns in key_patterns.items():
                matched = False
                for pattern in patterns:
                    hit = re.match(pattern, stripped, flags=re.IGNORECASE)
                    if hit:
                        extracted[key] = hit.group(1).strip()
                        matched = True
                        break
                if matched:
                    break

        to_agents = [
            item.strip()
            for item in re.split(r"[,，\s]+", str(extracted.get("toAgentIds") or ""))
            if item.strip()
        ]
        dependencies = [
            item.strip()
            for item in re.split(r"[,，\s]+", str(extracted.get("dependencies") or ""))
            if item.strip()
        ]
        blocked_raw = str(extracted.get("blocked") or "").strip().lower()
        blocked = blocked_raw in {"1", "true", "yes", "y", "是", "阻塞"}

        return {
            "summary": str(extracted.get("summary") or "").strip(),
            "toAgentIds": to_agents,
            "dependencies": dependencies,
            "blocked": blocked,
            "blockReason": str(extracted.get("blockReason") or "").strip(),
            "riskLevel": str(extracted.get("riskLevel") or "medium").strip(),
            "nextAction": str(extracted.get("nextAction") or "").strip(),
        }

    def _ensure_task_core_sections(self, content: str) -> str:
        text = str(content or "").strip()
        if not text:
            return _task_md_template("未命名任务", "", [])

        sections_to_add: list[str] = []
        if f"## {HANDOFF_SECTION_TITLE}" not in text:
            sections_to_add.append(
                f"\n\n---\n\n## {HANDOFF_SECTION_TITLE}\n\n<!-- 仅记录可消费交接；由后端统一模板写入 -->\n"
            )
        if f"## {DECISION_SECTION_TITLE}" not in text:
            sections_to_add.append(
                f"\n\n---\n\n## {DECISION_SECTION_TITLE}\n\n<!-- 仅记录授权后的会议决议摘要（非原始会议纪要） -->\n"
            )
        if not sections_to_add:
            return text
        return text + "".join(sections_to_add)

    def _append_to_section(self, content: str, *, section_title: str, block: str) -> str:
        pattern = rf"(##\s+{re.escape(section_title)}\s*\n)([\s\S]*?)(?=\n##\s+|$)"

        def _repl(match: re.Match[str]) -> str:
            prefix = match.group(1)
            body = match.group(2).rstrip()
            merged = (body + "\n" + block.strip()).strip()
            return prefix + merged + "\n"

        if re.search(pattern, content):
            return re.sub(pattern, _repl, content, count=1)

        return content.rstrip() + f"\n\n## {section_title}\n\n{block.strip()}\n"

    def _render_handoff_block(self, handoff: dict[str, Any]) -> str:
        safe_json = json.dumps(handoff, ensure_ascii=False)
        now = utc_now().strftime("%Y-%m-%d %H:%M:%S")
        to_text = ", ".join(handoff.get("toAgentIds") or ["未指定"])
        deps = ", ".join(handoff.get("dependencies") or ["无"])
        blocked_text = "是" if handoff.get("blocked") else "否"
        return (
            f"\n<!-- HANDOFF:{safe_json} -->\n"
            f"### 交接 {now} [{handoff.get('nodeId', 'unknown')}]\n"
            f"- 来源: {handoff.get('fromAgentId', 'unknown')}\n"
            f"- 去向: {to_text}\n"
            f"- 摘要: {handoff.get('summary', '')}\n"
            f"- 依赖: {deps}\n"
            f"- 阻塞: {blocked_text}\n"
            f"- 阻塞原因: {handoff.get('blockReason') or '无'}\n"
            f"- 风险: {handoff.get('riskLevel', 'medium')}\n"
            f"- 下一步: {handoff.get('nextAction') or '待补充'}\n"
        )


# Singleton instance
task_service = TaskService()
