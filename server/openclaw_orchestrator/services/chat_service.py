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

    @staticmethod
    def _extract_text_content(content: Any) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text)
                elif isinstance(item, str) and item.strip():
                    parts.append(item)
            return "\n".join(parts)
        if isinstance(content, dict):
            text = content.get("text")
            if isinstance(text, str):
                return text
            return json.dumps(content, ensure_ascii=False)
        return ""

    @classmethod
    def _normalize_entry(
        cls,
        raw: dict[str, Any],
        *,
        agent_id: str,
        session_id: str,
        fallback_id: str,
    ) -> dict[str, Any] | None:
        if raw.get("type") == "session":
            return None
        message = raw.get("message") if isinstance(raw.get("message"), dict) else raw
        if not isinstance(message, dict):
            return None
        return {
            "id": raw.get("id", fallback_id),
            "sessionId": session_id,
            "agentId": agent_id,
            "role": message.get("role", "assistant"),
            "content": cls._extract_text_content(message.get("content", "")),
            "timestamp": raw.get("timestamp", message.get("timestamp", "")),
            "metadata": message.get("metadata") or raw.get("metadata"),
        }

    def list_sessions(self, agent_id: str) -> list[dict[str, Any]]:
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
            message_count = 0
            if lines:
                for line in reversed(lines):
                    try:
                        parsed = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    normalized = self._normalize_entry(
                        parsed,
                        agent_id=agent_id,
                        session_id=file.removesuffix(".jsonl"),
                        fallback_id=f"{file}-tail",
                    )
                    if normalized:
                        last_activity = str(normalized.get("timestamp") or "")
                        break
                for index, line in enumerate(lines):
                    try:
                        parsed = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if self._normalize_entry(
                        parsed,
                        agent_id=agent_id,
                        session_id=file.removesuffix(".jsonl"),
                        fallback_id=f"{file}-{index}",
                    ):
                        message_count += 1

            session_id = file.removesuffix(".jsonl")
            result.append(
                {
                    "id": session_id,
                    "name": session_id,
                    "messageCount": message_count,
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
                normalized = self._normalize_entry(
                    data,
                    agent_id=agent_id,
                    session_id=session_id,
                    fallback_id=f"msg-{i}",
                )
                if normalized:
                    messages.append(normalized)
            except json.JSONDecodeError:
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

        In both cases the session watcher will pick up the agent reply
        and broadcast it over WebSocket automatically.
        """
        from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

        agent_model: str | None = None
        try:
            from openclaw_orchestrator.services.agent_service import agent_service

            agent_model = agent_service._get_agent_model(agent_id)
        except Exception:
            pass

        logger.info(
            "Sending message to %s/%s (model=%s): %s...",
            agent_id,
            session_id,
            agent_model or "default",
            content[:80],
        )

        try:
            result = await openclaw_bridge.send_agent_message(
                agent_id=agent_id,
                content=content,
                session_id=session_id,
                model=agent_model,
            )
            method = str(result.get("channel") or "unknown")
            return {
                "success": bool(result.get("success", True)),
                "message": str(result.get("message") or "Message sent"),
                "method": method,
                "sessionKey": result.get("sessionKey"),
                "correlationId": result.get("correlationId"),
            }
        except Exception as exc:
            logger.error("Failed to send message to %s: %s", agent_id, exc)
            return {"success": False, "message": f"Delivery failed: {exc}"}


chat_service = ChatService()
