"""Chat / session service.

Reads agent session JSONL files and provides message history.
Sends user messages via OpenClaw Webhook integration.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from openclaw_orchestrator.config import settings

logger = logging.getLogger(__name__)


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
        """Send a message to an agent via OpenClaw Webhook.

        The message is sent through the bridge which:
        1. Tries Webhook ``/hooks/agent`` first (fire-and-forget).
        2. Falls back to writing directly to the session JSONL file.

        In both cases the session_watcher will pick up the Agent's reply
        and broadcast it over WebSocket automatically.
        """
        from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

        # Read the agent's configured model
        agent_model: str | None = None
        try:
            from openclaw_orchestrator.services.agent_service import agent_service
            agent_model = agent_service._get_agent_model(agent_id)
        except Exception:
            pass

        logger.info("📨 Sending message to %s/%s (model=%s): %s...", agent_id, session_id, agent_model or "default", content[:80])

        try:
            result = await openclaw_bridge.send_agent_message(
                agent_id=agent_id,
                message=content,
                session_id=session_id,
                model=agent_model,
            )
            return {
                "success": True,
                "message": "Message delivered via Webhook" if result.get("webhook") else "Message written to session file",
                "method": "webhook" if result.get("webhook") else "file",
            }
        except Exception as exc:
            logger.error("Failed to send message to %s: %s", agent_id, exc)
            return {"success": False, "message": f"Delivery failed: {exc}"}


# Singleton instance
chat_service = ChatService()
