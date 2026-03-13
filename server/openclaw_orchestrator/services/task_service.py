"""Task management service with artifact support.

Manages tasks, task files (task.md), and artifact files under the team directory
structure: teams/{teamId}/active/task-{id}/.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Optional

from openclaw_orchestrator.database.db import get_db
from openclaw_orchestrator.utils.time import utc_now, utc_now_iso
from openclaw_orchestrator.services.file_manager import file_manager
from openclaw_orchestrator.services.team_service import team_service
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

    # ────── Permission Checks ──────

    def validate_task_assignment_permission(
        self, team_id: str, caller_agent_id: Optional[str] = None
    ) -> None:
        """Validate that the caller has permission to create/assign tasks.

        Args:
            team_id: The team ID
            caller_agent_id: The agent ID making the call (if called by an agent)

        Raises:
            PermissionError: If the caller is not authorized to assign tasks
        """
        if caller_agent_id is None:
            # User-initiated task creation, no permission check needed
            return

        # Agent-initiated task assignment requires Lead permission
        if not team_service.is_lead(caller_agent_id, team_id):
            raise PermissionError(
                f"Agent {caller_agent_id} is not authorized to assign tasks in team {team_id}. "
                "Only the team Lead can assign tasks to members."
            )

    # ────── Task CRUD ──────

    def create_task(
        self,
        team_id: str,
        title: str,
        description: str,
        participant_agent_ids: list[str],
        caller_agent_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new task with directory structure.

        Args:
            team_id: The team ID
            title: Task title
            description: Task description
            participant_agent_ids: List of agent IDs participating in the task
            caller_agent_id: The agent ID making the call (for permission check)

        Returns:
            The created task

        Raises:
            PermissionError: If caller_agent_id is provided but not a team Lead
        """
        # Validate permission if called by an agent
        self.validate_task_assignment_permission(team_id, caller_agent_id)

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

        db.execute(
            "INSERT INTO tasks (id, team_id, title, description, status, task_file_path, participant_agent_ids, artifact_count) "
            "VALUES (?, ?, ?, ?, 'active', ?, ?, 0)",
            (
                task_id,
                team_id,
                title,
                description,
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


# Singleton instance
task_service = TaskService()
