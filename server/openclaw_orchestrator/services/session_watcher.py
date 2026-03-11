"""Session watcher service.

Watches agent session JSONL files for changes and broadcasts new messages
via WebSocket. Uses watchfiles (Rust-based) for efficient file watching.

Also provides helper utilities for the workflow engine to poll for Agent
responses (``wait_for_response``).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.websocket.ws_handler import broadcast

logger = logging.getLogger(__name__)


class SessionWatcher:
    """Watches agent session files and broadcasts updates.

    Works alongside GatewayConnector:
    - Gateway provides real-time events (preferred, lower latency)
    - SessionWatcher provides file-based monitoring (fallback, guaranteed delivery)
    - Messages are deduplicated by ID to avoid double-push
    """

    def __init__(self) -> None:
        self._offsets: dict[str, int] = {}
        self._agent_statuses: dict[str, str] = {}
        self._last_activity: dict[str, float] = {}  # agent_id → unix timestamp
        self._task: Optional[asyncio.Task[None]] = None
        self._seen_message_ids: set[str] = set()  # dedup with Gateway
        self._seen_ids_max = 5000  # cap to prevent unbounded growth

    def start(self) -> None:
        """Start watching session files in background."""
        try:
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._watch_loop())
            print("Session watcher started")
        except RuntimeError:
            print("Session watcher: no event loop, skipping")

    def stop(self) -> None:
        """Stop watching."""
        if self._task:
            self._task.cancel()
            self._task = None
        print("Session watcher stopped")

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
            print(f"Session watcher error: {e}")

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

            # Dedup: skip if Gateway already pushed this message
            msg_id = parsed.get("id", "")
            if msg_id and msg_id in self._seen_message_ids:
                continue
            self._mark_seen(msg_id)

            broadcast(
                {
                    "type": "new_message",
                    "payload": parsed,
                    "timestamp": parsed.get("timestamp", ""),
                }
            )

            # Check for Agent-to-Agent communication
            self._check_agent_communication(parsed, agent_id)

            self._update_agent_status(agent_id, parsed)

    def _parse_line(
        self, line: str, agent_id: str, file_path: str
    ) -> Optional[dict[str, Any]]:
        try:
            data = json.loads(line)
            session_id = Path(file_path).stem  # filename without .jsonl
            if data.get("type") == "session":
                return None
            message = data.get("message") if isinstance(data.get("message"), dict) else data
            if not isinstance(message, dict):
                return None
            content = message.get("content", "")
            normalized_content = self._normalize_content(content)
            return {
                "id": data.get("id", message.get("id", f"{id(line)}-{hash(line) % 10000}")),
                "sessionId": session_id,
                "agentId": agent_id,
                "role": message.get("role", "assistant"),
                "content": normalized_content,
                "timestamp": data.get("timestamp", message.get("timestamp", "")),
                "metadata": message.get("metadata") or data.get("metadata"),
            }
        except (json.JSONDecodeError, KeyError):
            return None

    @staticmethod
    def _normalize_content(content: Any) -> str:
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

    def _mark_seen(self, msg_id: str) -> None:
        """Record a message ID to prevent duplicate broadcasts."""
        if not msg_id:
            return
        self._seen_message_ids.add(msg_id)
        # Trim if too large (keep recent half)
        if len(self._seen_message_ids) > self._seen_ids_max:
            to_remove = list(self._seen_message_ids)[:self._seen_ids_max // 2]
            for rid in to_remove:
                self._seen_message_ids.discard(rid)

    def mark_seen_from_gateway(self, msg_id: str) -> None:
        """Called by GatewayConnector to register IDs it already pushed."""
        self._mark_seen(msg_id)

    def _check_agent_communication(
        self, parsed: dict[str, Any], current_agent_id: str
    ) -> None:
        """Detect Agent-to-Agent communication and broadcast communication event.

        OpenClaw's ping-pong mode marks the source agent in metadata.
        We check metadata.source, metadata.fromAgent, and session scope
        to identify cross-agent messages.
        """
        metadata = parsed.get("metadata") or {}
        source = metadata.get("source", "")
        from_agent: Optional[str] = None

        # Pattern 1: source field like "agent:<id>" or "agent/<id>"
        if source.startswith("agent:"):
            from_agent = source.split(":", 1)[1]
        elif source.startswith("agent/"):
            from_agent = source.split("/", 1)[1]
        # Pattern 2: explicit fromAgent field
        elif metadata.get("fromAgent"):
            from_agent = metadata["fromAgent"]
        # Pattern 3: source is "orchestrator" — our own message, skip
        elif source == "orchestrator":
            return

        if from_agent and from_agent != current_agent_id:
            from datetime import datetime

            broadcast({
                "type": "communication",
                "payload": {
                    "id": f"comm-{parsed.get('id', '')}",
                    "fromAgentId": from_agent,
                    "toAgentId": current_agent_id,
                    "type": "message",
                    "eventType": "message",
                    "content": (parsed.get("content", "") or "")[:200],
                    "message": (parsed.get("content", "") or "")[:200],
                    "timestamp": datetime.utcnow().isoformat(),
                },
                "timestamp": datetime.utcnow().isoformat(),
            })

    def _update_agent_status(
        self, agent_id: str, message: dict[str, Any]
    ) -> None:
        """Update agent status based on message + heartbeat + schedule.

        Status priority:
        1. ``error``   — message content contains error indicators
        2. ``busy``    — assistant message just received (reset to idle after 10s)
        3. ``scheduled`` — agent is in an active schedule window but idle
        4. ``idle``    — has recent activity but not currently processing
        5. ``offline`` — no activity for 60s and no heartbeat
        """
        role = message.get("role", "")
        content = message.get("content", "")

        # Record activity time
        self._last_activity[agent_id] = time.time()

        # ── Determine base status from message ──
        if "error" in content.lower() or "Error" in content:
            new_status = "error"
        elif role == "assistant":
            new_status = "busy"
            # Schedule reset to idle/scheduled after 10s
            try:
                loop = asyncio.get_running_loop()
                loop.call_later(
                    10.0, self._reset_from_busy, agent_id
                )
            except RuntimeError:
                pass
        else:
            new_status = "busy"

        prev_status = self._agent_statuses.get(agent_id)
        if prev_status != new_status:
            self._agent_statuses[agent_id] = new_status
            self._broadcast_status(agent_id, new_status)

    def _reset_from_busy(self, agent_id: str) -> None:
        """After 10s of no new assistant messages, downgrade from busy.

        If the agent is on schedule → ``scheduled``, otherwise → ``idle``.
        """
        if self._agent_statuses.get(agent_id) != "busy":
            return

        target = self._resolve_idle_status(agent_id)
        self._agent_statuses[agent_id] = target
        self._broadcast_status(agent_id, target)

    def _resolve_idle_status(self, agent_id: str) -> str:
        """Decide between ``idle``, ``scheduled``, or ``offline``."""
        # Check heartbeat via bridge (non-blocking, best-effort)
        try:
            from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
            hb = openclaw_bridge.read_heartbeat_status(agent_id)
            has_heartbeat = hb.get("alive", False)
        except Exception:
            has_heartbeat = False

        # Check schedule via schedule_executor
        try:
            from openclaw_orchestrator.services.schedule_executor import schedule_executor
            on_schedule = schedule_executor.is_agent_on_duty(agent_id)
        except Exception:
            on_schedule = False

        last_active = self._last_activity.get(agent_id, 0)
        elapsed = time.time() - last_active

        if elapsed > 60 and not has_heartbeat:
            return "offline"
        if on_schedule:
            return "scheduled"
        return "idle"

    def get_enriched_status(self, agent_id: str) -> dict[str, Any]:
        """Return rich status combining watcher state, heartbeat, and schedule."""
        base_status = self._agent_statuses.get(agent_id, "offline")

        heartbeat: dict[str, Any] = {}
        try:
            from openclaw_orchestrator.services.openclaw_bridge import openclaw_bridge
            heartbeat = openclaw_bridge.read_heartbeat_status(agent_id)
        except Exception:
            pass

        on_duty = False
        try:
            from openclaw_orchestrator.services.schedule_executor import schedule_executor
            on_duty = schedule_executor.is_agent_on_duty(agent_id)
        except Exception:
            pass

        return {
            "status": base_status,
            "heartbeat": heartbeat,
            "onDuty": on_duty,
            "lastActivity": self._last_activity.get(agent_id),
        }

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
