"""Chat / session service.

Reads agent session JSONL files and provides message history.
"""

from __future__ import annotations

import json
import os
from typing import Any

from openclaw_orchestrator.config import settings


class ChatService:
    """Service for reading agent chat sessions."""

    def list_sessions(
        self, agent_id: str
    ) -> list[dict[str, Any]]:
        """List all sessions for an agent."""
        sessions_dir = os.path.join(
            settings.openclaw_home, "agents", agent_id, "sessions"
        )
        if not os.path.exists(sessions_dir):
            return []

        files = [f for f in os.listdir(sessions_dir) if f.endswith(".jsonl")]
        result = []

        for file in files:
            file_path = os.path.join(sessions_dir, file)
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            lines = [l for l in content.split("\n") if l.strip()]
            last_activity = ""
            if lines:
                try:
                    parsed = json.loads(lines[-1])
                    last_activity = parsed.get("timestamp", "")
                except (json.JSONDecodeError, KeyError):
                    pass

            session_id = file.removesuffix(".jsonl")
            result.append(
                {
                    "id": session_id,
                    "name": session_id,
                    "messageCount": len(lines),
                    "lastActivity": last_activity or "",
                }
            )

        return result

    def get_messages(
        self,
        agent_id: str,
        session_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get messages from a session file."""
        file_path = os.path.join(
            settings.openclaw_home,
            "agents",
            agent_id,
            "sessions",
            f"{session_id}.jsonl",
        )
        if not os.path.exists(file_path):
            return []

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        lines = [l for l in content.split("\n") if l.strip()]

        start = max(0, len(lines) - offset - limit)
        end = len(lines) - offset
        sliced = lines[start:end]

        messages = []
        for i, line in enumerate(sliced):
            try:
                data = json.loads(line)
                messages.append(
                    {
                        "id": data.get("id", f"msg-{i}"),
                        "sessionId": session_id,
                        "agentId": agent_id,
                        "role": data.get("role", "assistant"),
                        "content": data["content"]
                        if isinstance(data.get("content"), str)
                        else json.dumps(data.get("content", "")),
                        "timestamp": data.get("timestamp", ""),
                        "metadata": data.get("metadata"),
                    }
                )
            except (json.JSONDecodeError, KeyError):
                messages.append(
                    {
                        "id": f"msg-{i}",
                        "sessionId": session_id,
                        "agentId": agent_id,
                        "role": "system",
                        "content": line,
                        "timestamp": "",
                    }
                )

        return messages

    async def send_message(
        self, agent_id: str, session_id: str, content: str
    ) -> dict[str, Any]:
        """Send a message to an agent (placeholder for future OpenClaw integration)."""
        print(
            f"📨 Sending message to {agent_id}/{session_id}: {content[:50]}..."
        )
        return {"success": True, "message": "Message queued for delivery"}


# Singleton instance
chat_service = ChatService()
