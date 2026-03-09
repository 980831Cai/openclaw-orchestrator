"""Session watcher service.

Watches agent session JSONL files for changes and broadcasts new messages
via WebSocket. Uses watchfiles (Rust-based) for efficient file watching.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Optional

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.websocket.ws_handler import broadcast


class SessionWatcher:
    """Watches agent session files and broadcasts updates."""

    def __init__(self) -> None:
        self._offsets: dict[str, int] = {}
        self._agent_statuses: dict[str, str] = {}
        self._task: Optional[asyncio.Task[None]] = None

    def start(self) -> None:
        """Start watching session files in background."""
        try:
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._watch_loop())
            print("👁️ Session watcher started")
        except RuntimeError:
            print("👁️ Session watcher: no event loop, skipping")

    def stop(self) -> None:
        """Stop watching."""
        if self._task:
            self._task.cancel()
            self._task = None
        print("👁️ Session watcher stopped")

    def get_agent_status(self, agent_id: str) -> str:
        """Get the current status of an agent."""
        return self._agent_statuses.get(agent_id, "offline")

    def get_all_statuses(self) -> dict[str, str]:
        """Get all agent statuses."""
        return dict(self._agent_statuses)

    async def _watch_loop(self) -> None:
        """Background loop that periodically checks for file changes."""
        from watchfiles import awatch, Change

        sessions_dir = Path(settings.openclaw_home) / "agents"

        if not sessions_dir.exists():
            sessions_dir.mkdir(parents=True, exist_ok=True)

        try:
            async for changes in awatch(
                str(sessions_dir),
                recursive=True,
                step=300,
            ):
                for change_type, path in changes:
                    if path.endswith(".jsonl") and "/sessions/" in path:
                        if change_type in (Change.added, Change.modified):
                            self._handle_file_change(path)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"👁️ Session watcher error: {e}")

    def _handle_file_change(self, file_path: str) -> None:
        """Process new content in a session file."""
        if not os.path.exists(file_path):
            return

        current_offset = self._offsets.get(file_path, 0)
        file_size = os.path.getsize(file_path)

        if file_size <= current_offset:
            return

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        new_content = content[current_offset:]
        self._offsets[file_path] = file_size

        agent_id = self._extract_agent_id(file_path)
        lines = [l for l in new_content.split("\n") if l.strip()]

        for line in lines:
            parsed = self._parse_line(line, agent_id, file_path)
            if not parsed:
                continue

            broadcast(
                {
                    "type": "new_message",
                    "payload": parsed,
                    "timestamp": parsed.get("timestamp", ""),
                }
            )

            self._update_agent_status(agent_id, parsed)

    def _parse_line(
        self, line: str, agent_id: str, file_path: str
    ) -> Optional[dict[str, Any]]:
        try:
            data = json.loads(line)
            session_id = Path(file_path).stem  # filename without .jsonl
            return {
                "id": data.get("id", f"{id(line)}-{hash(line) % 10000}"),
                "sessionId": session_id,
                "agentId": agent_id,
                "role": data.get("role", "assistant"),
                "content": data["content"]
                if isinstance(data.get("content"), str)
                else json.dumps(data.get("content", "")),
                "timestamp": data.get("timestamp", ""),
                "metadata": data.get("metadata"),
            }
        except (json.JSONDecodeError, KeyError):
            return None

    def _update_agent_status(
        self, agent_id: str, message: dict[str, Any]
    ) -> None:
        new_status = "idle"
        role = message.get("role", "")
        content = message.get("content", "")

        if role == "assistant":
            new_status = "busy"
            # Schedule reset to idle after 10s
            try:
                loop = asyncio.get_running_loop()
                loop.call_later(
                    10.0, self._reset_to_idle, agent_id
                )
            except RuntimeError:
                pass
        elif "error" in content.lower() or "Error" in content:
            new_status = "error"
        else:
            new_status = "busy"

        prev_status = self._agent_statuses.get(agent_id)
        if prev_status != new_status:
            self._agent_statuses[agent_id] = new_status
            self._broadcast_status(agent_id, new_status)

    def _reset_to_idle(self, agent_id: str) -> None:
        if self._agent_statuses.get(agent_id) == "busy":
            self._agent_statuses[agent_id] = "idle"
            self._broadcast_status(agent_id, "idle")

    def _broadcast_status(self, agent_id: str, status: str) -> None:
        from datetime import datetime

        broadcast(
            {
                "type": "agent_status",
                "payload": {
                    "agentId": agent_id,
                    "status": status,
                    "timestamp": datetime.utcnow().isoformat(),
                },
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    @staticmethod
    def _extract_agent_id(file_path: str) -> str:
        """Extract agent ID from path: .../agents/<agentId>/sessions/<file>.jsonl"""
        parts = file_path.replace("\\", "/").split("/")
        try:
            sessions_idx = parts.index("sessions")
            if sessions_idx >= 1:
                return parts[sessions_idx - 1]
        except ValueError:
            pass
        return "unknown"


# Singleton instance
session_watcher = SessionWatcher()
