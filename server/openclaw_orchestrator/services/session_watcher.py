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
from openclaw_orchestrator.services.live_feed_service import live_feed_service
from openclaw_orchestrator.utils.message_content import extract_visible_text
from openclaw_orchestrator.utils.time import utc_now_iso
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
        self._session_alias_cache: dict[str, tuple[float, dict[str, str]]] = {}

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
                    normalized_path = path.replace("\\", "/")
                    if normalized_path.endswith(".jsonl") and "/sessions/" in normalized_path:
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

            live_feed_service.record_message(parsed)
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
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict) or data.get("type") == "session":
            return None

        message = data.get("message") if isinstance(data.get("message"), dict) else data
        if not isinstance(message, dict):
            return None

        session_id = self._resolve_session_id(agent_id, file_path)
        role = str(message.get("role") or data.get("role") or "assistant")
        if role == "tool":
            role = "assistant"

        content = self._normalize_content(
            message.get("content")
            or data.get("content")
            or message.get("text")
            or data.get("text")
            or ""
        )
        timestamp = message.get("timestamp") or data.get("timestamp") or ""
        metadata = message.get("metadata") or data.get("metadata")

        if not content and role != "system":
            return None

        return {
            "id": data.get("id", message.get("id", f"{id(line)}-{hash(line) % 10000}")),
            "sessionId": session_id,
            "agentId": agent_id,
            "role": role,
            "content": content,
            "timestamp": timestamp,
            "metadata": metadata,
        }

    @staticmethod
    def _normalize_content(content: Any) -> str:
        return extract_visible_text(content)

    def _resolve_session_id(self, agent_id: str, file_path: str) -> str:
        raw_session_id = Path(file_path).stem
        aliases = self._get_session_aliases(agent_id)
        return aliases.get(raw_session_id, raw_session_id)

    def _get_session_aliases(self, agent_id: str) -> dict[str, str]:
        sessions_dir = Path(settings.openclaw_home) / "agents" / agent_id / "sessions"
        store_path = sessions_dir / "sessions.json"
        try:
            mtime = store_path.stat().st_mtime
        except OSError:
            return {}

        cached = self._session_alias_cache.get(agent_id)
        if cached and cached[0] == mtime:
            return cached[1]

        aliases: dict[str, str] = {}
        try:
            raw = json.loads(store_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            logger.warning("Failed to read session alias store for %s", agent_id, exc_info=True)
            return {}

        if isinstance(raw, dict):
            prefix = f"agent:{agent_id}:"
            for session_key, entry in raw.items():
                if not isinstance(session_key, str) or not session_key.startswith(prefix):
                    continue
                logical_session_id = session_key[len(prefix):]
                if not logical_session_id:
                    continue
                aliases[logical_session_id] = logical_session_id
                if isinstance(entry, dict):
                    session_uuid = entry.get("sessionId")
                    if isinstance(session_uuid, str) and session_uuid.strip():
                        aliases[session_uuid.strip()] = logical_session_id
                    session_file = entry.get("sessionFile")
                    if isinstance(session_file, str) and session_file.strip():
                        aliases[Path(session_file).stem] = logical_session_id

        self._session_alias_cache[agent_id] = (mtime, aliases)
        return aliases

    def _resolve_session_id(self, agent_id: str, file_path: str) -> str:
        raw_session_id = Path(file_path).stem
        aliases = self._get_session_aliases(agent_id)
        return aliases.get(raw_session_id, raw_session_id)

    def _get_session_aliases(self, agent_id: str) -> dict[str, str]:
        sessions_dir = Path(settings.openclaw_home) / "agents" / agent_id / "sessions"
        store_path = sessions_dir / "sessions.json"
        try:
            mtime = store_path.stat().st_mtime
        except OSError:
            return {}

        cached = self._session_alias_cache.get(agent_id)
        if cached and cached[0] == mtime:
            return cached[1]

        aliases: dict[str, str] = {}
        try:
            raw = json.loads(store_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            logger.warning("Failed to read session alias store for %s", agent_id, exc_info=True)
            return {}

        if isinstance(raw, dict):
            prefix = f"agent:{agent_id}:"
            for session_key, entry in raw.items():
                if not isinstance(session_key, str) or not session_key.startswith(prefix):
                    continue
                logical_session_id = session_key[len(prefix):]
                if not logical_session_id:
                    continue
                aliases[logical_session_id] = logical_session_id
                if isinstance(entry, dict):
                    session_uuid = entry.get("sessionId")
                    if isinstance(session_uuid, str) and session_uuid.strip():
                        aliases[session_uuid.strip()] = logical_session_id
                    session_file = entry.get("sessionFile")
                    if isinstance(session_file, str) and session_file.strip():
                        aliases[Path(session_file).stem] = logical_session_id

        self._session_alias_cache[agent_id] = (mtime, aliases)
        return aliases

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
            event_payload = {
                "id": f"comm-{parsed.get('id', '')}",
                "fromAgentId": from_agent,
                "toAgentId": current_agent_id,
                "type": "message",
                "eventType": "message",
                "content": (parsed.get("content", "") or "")[:200],
                "message": (parsed.get("content", "") or "")[:200],
                "timestamp": utc_now_iso(),
            }
            live_feed_service.record_event(event_payload)
            broadcast({
                "type": "communication",
                "payload": event_payload,
                "timestamp": utc_now_iso(),
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
        else:
            new_status = "busy"
            try:
                loop = asyncio.get_running_loop()
                loop.call_later(10.0, self._reset_from_busy, agent_id)
            except RuntimeError:
                pass

        prev_status = self._agent_statuses.get(agent_id)
        if prev_status != new_status:
            self._agent_statuses[agent_id] = new_status
            self._broadcast_status(agent_id, new_status)

    def mark_gateway_activity(self, payload: dict[str, Any]) -> None:
        """Project Gateway chat events onto the same status pipeline."""
        session_key = str(payload.get("sessionKey") or "")
        agent_id = self._extract_agent_id_from_session_key(session_key)
        if not agent_id:
            return

        message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
        role = str(message.get("role") or payload.get("role") or "assistant")
        content = self._normalize_content(
            message.get("content") or payload.get("content") or ""
        )
        timestamp = message.get("timestamp") or payload.get("timestamp") or ""

        self._update_agent_status(
            agent_id,
            {
                "role": role,
                "content": content,
                "timestamp": timestamp,
            },
        )

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
        broadcast(
            {
                "type": "agent_status",
                "payload": {
                    "agentId": agent_id,
                    "status": status,
                    "timestamp": utc_now_iso(),
                },
                "timestamp": utc_now_iso(),
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

    @staticmethod
    def _extract_agent_id_from_session_key(session_key: str) -> str:
        if session_key.startswith("agent:"):
            parts = session_key.split(":")
            if len(parts) >= 3:
                return parts[1]
        if session_key.startswith("agent/"):
            parts = session_key.split("/")
            if len(parts) >= 3:
                return parts[1]
        return ""


# Singleton instance
session_watcher = SessionWatcher()
