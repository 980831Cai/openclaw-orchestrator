"""Chat / session service.

Reads agent session JSONL files and provides message history.
Sends user messages via OpenClaw Webhook integration.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import UTC, datetime
from typing import Any

from openclaw_orchestrator.config import settings

logger = logging.getLogger(__name__)


class ChatDeliveryError(RuntimeError):
    """Raised when a chat message cannot be delivered to OpenClaw."""


class ChatService:
    """Service for reading agent chat sessions."""

    @staticmethod
    def _normalize_timestamp(value: Any) -> str:
        if isinstance(value, (int, float)):
            try:
                return datetime.fromtimestamp(float(value) / 1000.0, tz=UTC).isoformat()
            except (OverflowError, OSError, ValueError):
                return ""
        if isinstance(value, str):
            return value
        return ""

    @staticmethod
    def _session_key_suffix(session_key: str | None) -> str:
        value = str(session_key or "").strip()
        if not value.startswith("agent:"):
            return ""
        parts = value.split(":", 2)
        if len(parts) < 3:
            return ""
        return parts[2].strip()

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
            "timestamp": cls._normalize_timestamp(
                raw.get("timestamp", message.get("timestamp", ""))
            ),
            "metadata": message.get("metadata") or raw.get("metadata"),
        }

    @classmethod
    def _normalize_gateway_message(
        cls,
        raw: dict[str, Any],
        *,
        agent_id: str,
        session_id: str,
        fallback_id: str,
    ) -> dict[str, Any]:
        return {
            "id": str(raw.get("id") or fallback_id),
            "sessionId": session_id,
            "agentId": agent_id,
            "role": str(raw.get("role") or "assistant"),
            "content": cls._extract_text_content(raw.get("content", "")),
            "timestamp": cls._normalize_timestamp(raw.get("timestamp")),
            "metadata": {
                key: value
                for key, value in raw.items()
                if key
                not in {"id", "role", "content", "timestamp", "agentId", "sessionId"}
            }
            or None,
        }

    @staticmethod
    def _sort_sessions(sessions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(
            sessions,
            key=lambda session: (
                0 if str(session.get("id") or "") == "main" else 1,
                str(session.get("lastActivity") or ""),
            ),
            reverse=False,
        )

    @classmethod
    def _is_internal_gateway_session(
        cls, *, session_id: str, session_key: str | None = None
    ) -> bool:
        if session_id == "main":
            return False
        suffix = cls._session_key_suffix(session_key)
        return bool(suffix) and suffix.lower().startswith(
            ("wf-", "approval-", "meeting-", "meeting-conclude-", "debate-", "orchestrator-")
        )

    async def _list_sessions_from_gateway(self, agent_id: str) -> list[dict[str, Any]]:
        from openclaw_orchestrator.services.gateway_connector import gateway_connector

        if not gateway_connector.connected:
            return []

        sessions = await gateway_connector.list_active_sessions(agent_id)
        normalized: list[dict[str, Any]] = []
        for index, session in enumerate(sessions):
            session_id = str(session.get("sessionId") or "").strip()
            if not session_id:
                continue
            if self._is_internal_gateway_session(
                session_id=session_id,
                session_key=str(session.get("key") or ""),
            ):
                continue
            normalized.append(
                {
                    "id": session_id,
                    "name": "main" if session_id == "main" else session_id,
                    "messageCount": int(session.get("messageCount") or 0),
                    "lastActivity": self._normalize_timestamp(session.get("updatedAt")),
                }
            )

        if not any(session["id"] == "main" for session in normalized):
            normalized.insert(
                0,
                {
                    "id": "main",
                    "name": "main",
                    "messageCount": 0,
                    "lastActivity": "",
                },
            )

        deduped: dict[str, dict[str, Any]] = {}
        for session in normalized:
            deduped[session["id"]] = session
        return self._sort_sessions(list(deduped.values()))

    def _list_sessions_from_files(self, agent_id: str) -> list[dict[str, Any]]:
        """List all sessions for an agent from local JSONL files."""
        from openclaw_orchestrator.services.openclaw_bridge import OpenClawBridge

        sessions_dir = os.path.join(
            settings.openclaw_home, "agents", agent_id, "sessions"
        )
        if not os.path.exists(sessions_dir):
            return []

        files = [f for f in os.listdir(sessions_dir) if f.endswith(".jsonl")]
        result = []

        for file in files:
            session_id = file.removesuffix(".jsonl")
            if OpenClawBridge.is_transient_session_id(session_id):
                continue
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
                        session_id=session_id,
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
                        session_id=session_id,
                        fallback_id=f"{file}-{index}",
                    ):
                        message_count += 1

            result.append(
                {
                    "id": session_id,
                    "name": session_id,
                    "messageCount": message_count,
                    "lastActivity": last_activity or "",
                }
            )

        return self._sort_sessions(result)

    async def list_sessions(self, agent_id: str) -> list[dict[str, Any]]:
        gateway_sessions = await self._list_sessions_from_gateway(agent_id)
        if gateway_sessions:
            return gateway_sessions
        return self._list_sessions_from_files(agent_id)

    async def _get_messages_from_gateway(
        self,
        agent_id: str,
        session_id: str,
        limit: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        from openclaw_orchestrator.services.gateway_connector import gateway_connector
        from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge

        if not gateway_connector.connected:
            return []

        session_key = await openclaw_bridge._resolve_gateway_session_key(
            agent_id=agent_id,
            session_id=session_id,
        )
        if not session_key:
            return []

        raw_messages = await gateway_connector.get_chat_history(
            session_key=session_key,
            limit=max(1, min(limit + offset, 1000)),
        )
        if not raw_messages:
            return []

        normalized = [
            self._normalize_gateway_message(
                message,
                agent_id=agent_id,
                session_id=session_id,
                fallback_id=f"gateway-{index}",
            )
            for index, message in enumerate(raw_messages)
            if isinstance(message, dict)
        ]
        if offset:
            normalized = normalized[:-offset] if offset < len(normalized) else []
        if limit:
            normalized = normalized[-limit:]
        return normalized

    def _get_messages_from_files(
        self,
        agent_id: str,
        session_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Get messages from a local session file."""
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

    async def get_messages(
        self,
        agent_id: str,
        session_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        gateway_messages = await self._get_messages_from_gateway(
            agent_id=agent_id,
            session_id=session_id,
            limit=limit,
            offset=offset,
        )
        if gateway_messages:
            return gateway_messages
        return self._get_messages_from_files(agent_id, session_id, limit, offset)

    @staticmethod
    def _extract_workflow_id_from_text(content: str) -> str | None:
        match = re.search(r"(?:workflow|工作流)\s*[:：#-]?\s*([A-Za-z0-9-]{6,})", content)
        if not match:
            return None
        return str(match.group(1)).strip() or None

    @staticmethod
    def _derive_task_title(content: str) -> str:
        text = (content or "").strip()
        if not text:
            return "对话派发任务"
        first_line = text.splitlines()[0].strip()
        if len(first_line) <= 64:
            return first_line
        return first_line[:64].rstrip() + "..."

    async def dispatch_team_intent(
        self,
        team_id: str,
        content: str,
        *,
        requested_by: str = "chat",
        session_id: str = "",
    ) -> dict[str, Any]:
        """Dispatch chat intent to team queue first, then drain queue."""
        from openclaw_orchestrator.services.team_dispatch_service import team_dispatch_service

        normalized_content = str(content or "").strip()
        if not normalized_content:
            return {"action": "none", "reason": "empty_content"}

        explicit_workflow_id = self._extract_workflow_id_from_text(normalized_content)
        dispatch = await team_dispatch_service.dispatch(
            team_id=team_id,
            content=normalized_content,
            source="chat",
            actor_id=requested_by,
            session_id=session_id,
            workflow_id=explicit_workflow_id,
            planned_by=requested_by,
            title=self._derive_task_title(normalized_content),
            auto_drain=True,
        )

        task = dispatch.get("task") if isinstance(dispatch.get("task"), dict) else {}
        drain = dispatch.get("drain") if isinstance(dispatch.get("drain"), dict) else {}
        return {
            "action": "dispatchTask",
            "taskId": task.get("id"),
            "workflowId": task.get("workflowId"),
            "executionId": drain.get("executionId"),
            "triggerEventId": dispatch.get("triggerEventId"),
            "deduplicated": bool(dispatch.get("deduplicated")),
            "requestedBy": requested_by,
        }

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
            success = bool(result.get("success", True))
            message = str(result.get("message") or "Message sent")
            if not success:
                raise ChatDeliveryError(message)
            return {
                "success": success,
                "message": message,
                "method": method,
                "sessionKey": result.get("sessionKey"),
                "correlationId": result.get("correlationId"),
            }
        except ChatDeliveryError:
            raise
        except Exception as exc:
            logger.error("Failed to send message to %s: %s", agent_id, exc)
            raise ChatDeliveryError(f"Delivery failed: {exc}") from exc


chat_service = ChatService()
