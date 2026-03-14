"""OpenClaw Bridge — unified integration layer for OpenClaw runtime.

Provides four core capabilities:
1. Agent invocation: Trigger agents via Gateway ``agent`` / ``agent.wait``,
   falling back to Webhook POST /hooks/agent, then direct transcript write
2. Cron configuration: Write scheduled jobs to ~/.openclaw/cron/jobs.json
3. Heartbeat status: Read agent HEARTBEAT.md to check liveness
4. Transcript polling: Wait for agent responses by watching session files

Three-layer degradation for agent invocation:
  ① Gateway RPC (``agent`` / ``chat.send`` / ``chat.history``) — preferred
  ② Webhook HTTP (POST /hooks/agent) — if Gateway unavailable
  ③ JSONL direct write — ultimate fallback

All file paths are relative to OPENCLAW_HOME (default: ~/.openclaw).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import uuid
from pathlib import Path
from typing import Any, Optional

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.utils.time import utc_from_timestamp, utc_now, utc_now_iso

logger = logging.getLogger(__name__)

TRANSIENT_SESSION_PREFIXES = (
    "wf-",
    "approval-",
    "meeting-",
    "meeting-conclude-",
    "debate-",
    "orchestrator-",
)


class OpenClawBridge:
    """Unified bridge to OpenClaw runtime capabilities."""

    def __init__(self) -> None:
        self._http_client: Any = None  # Lazy-init httpx.AsyncClient
        self._simulation_mode = False
        self._cleanup_tasks: set[asyncio.Task[Any]] = set()

    @staticmethod
    def _utcnow():
        return utc_now()

    @staticmethod
    def _utcnow_iso() -> str:
        return utc_now_iso()

    @property
    def _home(self) -> Path:
        return Path(settings.openclaw_home)

    @property
    def webhook_base_url(self) -> str:
        return getattr(settings, "openclaw_webhook_url", "http://localhost:3578")

    @property
    def webhook_timeout(self) -> float:
        return getattr(settings, "openclaw_webhook_timeout", 5.0)

    # ════════════════════════════════════════════════════════════
    # 1. Webhook — Invoke / Message Agent
    # ════════════════════════════════════════════════════════════

    async def _get_client(self) -> Any:
        """Lazy-initialize httpx async client."""
        if self._http_client is None:
            try:
                import httpx
                self._http_client = httpx.AsyncClient(timeout=self.webhook_timeout)
            except ImportError:
                logger.warning("httpx not installed, falling back to simulation mode")
                self._simulation_mode = True
                return None
        return self._http_client

    async def check_webhook_available(self) -> bool:
        """Check if OpenClaw webhook endpoint is reachable."""
        client = await self._get_client()
        if client is None:
            return False
        try:
            resp = await client.get(f"{self.webhook_base_url}/health")
            return resp.status_code < 500
        except Exception:
            return False

    async def check_connectivity(self) -> None:
        """Test OpenClaw runtime connectivity at startup.

        Logs status and sets simulation mode if Webhook is unreachable.
        This is non-fatal — the server will still start in simulation mode.
        """
        available = await self.check_webhook_available()
        if available:
            logger.info("OpenClaw Webhook reachable at %s", self.webhook_base_url)
            self._simulation_mode = False
        else:
            logger.warning(
                "OpenClaw Webhook unreachable at %s; running in simulation/fallback mode",
                self.webhook_base_url,
            )
            self._simulation_mode = True

    @staticmethod
    def _main_session_key(agent_id: str) -> str:
        return f"agent:{agent_id}:main"

    @staticmethod
    def is_transient_session_id(session_id: str | None) -> bool:
        normalized = str(session_id or "").strip().lower()
        return bool(normalized) and normalized.startswith(TRANSIENT_SESSION_PREFIXES)

    @staticmethod
    def _extract_text_content(content: Any) -> str:
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text.strip())
                elif isinstance(item, str) and item.strip():
                    parts.append(item.strip())
            return "\n".join(parts).strip()
        if isinstance(content, dict):
            text = content.get("text")
            if isinstance(text, str):
                return text.strip()
            try:
                return json.dumps(content, ensure_ascii=False)
            except TypeError:
                return str(content)
        return ""

    @classmethod
    def _normalize_transcript_message(
        cls,
        raw: dict[str, Any],
        *,
        agent_id: str,
        session_id: str,
        fallback_id: str,
    ) -> dict[str, Any] | None:
        if not isinstance(raw, dict):
            return None
        if raw.get("type") == "session":
            return None
        message = raw.get("message") if isinstance(raw.get("message"), dict) else raw
        if not isinstance(message, dict):
            return None
        content = cls._extract_text_content(message.get("content"))
        timestamp = raw.get("timestamp") or message.get("timestamp") or ""
        metadata = message.get("metadata") if isinstance(message.get("metadata"), dict) else raw.get("metadata")
        return {
            "id": raw.get("id") or message.get("id") or fallback_id,
            "sessionId": session_id,
            "agentId": agent_id,
            "role": message.get("role", "assistant"),
            "content": content,
            "timestamp": timestamp,
            "metadata": metadata,
        }

    async def _resolve_gateway_session_key(
        self,
        *,
        agent_id: str,
        session_id: str | None = None,
    ) -> str | None:
        from openclaw_orchestrator.services.gateway_connector import gateway_connector

        if not gateway_connector.connected:
            return None

        if session_id:
            candidate = session_id.strip()
            if candidate.startswith("agent:"):
                resolved = await gateway_connector.resolve_session_key(
                    key=candidate,
                    agent_id=agent_id,
                )
                if resolved:
                    return resolved
            resolved = await gateway_connector.resolve_session_key(
                key=candidate,
                session_id=candidate,
                label=candidate,
                agent_id=agent_id,
            )
            if resolved:
                return resolved

        return self._main_session_key(agent_id)

    async def _fetch_gateway_reply(
        self,
        *,
        session_key: str,
        assistant_count_before: int,
    ) -> str:
        from openclaw_orchestrator.services.gateway_connector import gateway_connector

        history = await gateway_connector.get_chat_history(
            session_key=session_key,
            limit=1000,
        )
        assistant_messages = [
            msg for msg in history if isinstance(msg, dict) and msg.get("role") == "assistant"
        ]
        fresh_messages = assistant_messages[assistant_count_before:]
        candidates = fresh_messages if fresh_messages else assistant_messages[-1:]
        texts = [
            self._extract_text_content(message.get("content"))
            for message in candidates
            if isinstance(message, dict)
        ]
        return "\n\n".join(text for text in texts if text).strip()

    async def invoke_agent(
        self,
        agent_id: str,
        message: str,
        session_id: Optional[str] = None,
        timeout_seconds: int = 120,
        correlation_id: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict[str, Any]:
        """Invoke an agent and wait for response (three-layer degradation).

        This is the primary method for workflow task node execution.
        1. Try Gateway ``agent`` + ``agent.wait`` and read ``chat.history``
        2. Fall back to Webhook POST /hooks/agent
        3. Fall back to JSONL direct write
        4. Poll the agent's transcript file for the response

        Args:
            agent_id: Target agent identifier.
            message: Task prompt / instruction to send.
            session_id: Specific session to use (auto-generated if None).
            timeout_seconds: Max wait time for response.
            correlation_id: Tracking ID for request-response matching.
            model: Override model for this invocation (from agent config).

        Returns:
            dict with keys: success, content, session_id, correlation_id, elapsed
        """
        correlation_id = correlation_id or str(uuid.uuid4())[:8]
        session_id = session_id or f"orchestrator-{correlation_id}"
        cleanup_transient_session = self.is_transient_session_id(session_id)
        start_time = utc_now()

        async def finalize(payload: dict[str, Any]) -> dict[str, Any]:
            if cleanup_transient_session:
                cleaned = await self._cleanup_transient_session(
                    agent_id=agent_id,
                    session_id=session_id,
                    session_key=gateway_session_key,
                    expect_gateway_session=gateway_used,
                )
                if not cleaned:
                    self._schedule_transient_cleanup_retry(
                        agent_id=agent_id,
                        session_id=session_id,
                        session_key=gateway_session_key,
                        expect_gateway_session=gateway_used,
                    )
            return payload

        gateway_session_key: str | None = None
        gateway_run_id: str | None = None
        gateway_used = False
        gateway_request_label: str | None = None
        assistant_count_before = 0
        try:
            from openclaw_orchestrator.services.gateway_connector import gateway_connector
            if gateway_connector.connected:
                gateway_session_key = await self._resolve_gateway_session_key(
                    agent_id=agent_id,
                    session_id=session_id,
                )
                if gateway_session_key:
                    if not (
                        cleanup_transient_session
                        and gateway_session_key == self._main_session_key(agent_id)
                    ):
                        gateway_request_label = session_id if session_id else None
                    history_before = await gateway_connector.get_chat_history(
                        session_key=gateway_session_key,
                        limit=1000,
                    )
                    assistant_count_before = sum(
                        1
                        for msg in history_before
                        if isinstance(msg, dict) and msg.get("role") == "assistant"
                    )
                    params = {
                        "agentId": agent_id,
                        "sessionKey": gateway_session_key,
                        "message": message,
                        "deliver": False,
                        "timeout": max(0, int(timeout_seconds * 1000)),
                        "idempotencyKey": correlation_id,
                    }
                    if gateway_request_label:
                        params["label"] = gateway_request_label
                    agent_result = await gateway_connector.call_rpc(
                        "agent",
                        params,
                        timeout=10.0,
                    )
                    if isinstance(agent_result, dict):
                        gateway_run_id = str(agent_result.get("runId") or "").strip() or None
                    if gateway_run_id:
                        gateway_used = True
                        logger.info(
                            "Gateway agent dispatch: %s/%s (%s)",
                            agent_id,
                            gateway_session_key,
                            gateway_run_id,
                        )
        except Exception as e:
            logger.warning("Gateway agent failed for %s: %s", agent_id, e)

        # Record the current file offset BEFORE sending, so we only read new content
        session_file = self._agent_session_path(agent_id, session_id)
        pre_offset = self._get_file_size(session_file)

        if not gateway_used:
            # Gateway unavailable — try Webhook, then JSONL direct write
            webhook_ok = await self._send_webhook(agent_id, message, session_id, correlation_id, model=model)

            if not webhook_ok:
                # Fallback: write directly to JSONL (manual trigger)
                self._write_user_message(agent_id, session_id, message, correlation_id)

        elapsed = (utc_now() - start_time).total_seconds()

        if gateway_used and gateway_run_id and gateway_session_key:
            try:
                from openclaw_orchestrator.services.gateway_connector import gateway_connector

                wait_result = await gateway_connector.call_rpc(
                    "agent.wait",
                    {
                        "runId": gateway_run_id,
                        "timeoutMs": max(0, int(timeout_seconds * 1000)),
                    },
                    timeout=float(timeout_seconds) + 5.0,
                )
                status = (
                    str(wait_result.get("status") or "").strip()
                    if isinstance(wait_result, dict)
                    else ""
                )
                if status == "ok":
                    response = await self._fetch_gateway_reply(
                        session_key=gateway_session_key,
                        assistant_count_before=assistant_count_before,
                    )
                    return await finalize({
                        "success": True,
                        "content": response,
                        "sessionId": session_id,
                        "sessionKey": gateway_session_key,
                        "correlationId": correlation_id,
                        "elapsed": round(elapsed, 2),
                        "channel": "gateway",
                        "runId": gateway_run_id,
                    })
                if status == "error":
                    error_message = (
                        str(wait_result.get("error") or "").strip()
                        if isinstance(wait_result, dict)
                        else ""
                    )
                    return await finalize({
                        "success": False,
                        "content": error_message or f"Agent {agent_id} execution failed",
                        "sessionId": session_id,
                        "sessionKey": gateway_session_key,
                        "correlationId": correlation_id,
                        "elapsed": round(elapsed, 2),
                        "channel": "gateway",
                        "runId": gateway_run_id,
                    })
            except Exception as exc:
                return await finalize({
                    "success": False,
                    "content": f"Gateway wait failed: {exc}",
                    "sessionId": session_id,
                    "sessionKey": gateway_session_key,
                    "correlationId": correlation_id,
                    "elapsed": round(elapsed, 2),
                    "channel": "gateway",
                    "runId": gateway_run_id,
                })

        response = await self._poll_for_response(
            agent_id, session_id, pre_offset, timeout_seconds
        )

        if response:
            return await finalize({
                "success": True,
                "content": response,
                "sessionId": session_id,
                "correlationId": correlation_id,
                "elapsed": round(elapsed, 2),
                "channel": "webhook+jsonl",
            })

        return await finalize({
            "success": False,
            "content": f"Agent {agent_id} did not respond within {timeout_seconds}s",
            "sessionId": session_id,
            "correlationId": correlation_id,
            "elapsed": round(elapsed, 2),
        })

    async def send_agent_message(
        self,
        agent_id: str,
        session_id: str,
        content: str,
        model: Optional[str] = None,
    ) -> dict[str, Any]:
        """Send a message to an agent (for chat, not workflow).

        Unlike invoke_agent, this does NOT wait for response.
        The response will be picked up by session_watcher's JSONL monitoring.

        Returns:
            dict with keys: success, message
        """
        correlation_id = str(uuid.uuid4())[:8]

        # ── Try Gateway chat.send first ──
        try:
            from openclaw_orchestrator.services.gateway_connector import gateway_connector
            if gateway_connector.connected:
                session_key = await self._resolve_gateway_session_key(
                    agent_id=agent_id,
                    session_id=session_id,
                )
                if session_key:
                    await gateway_connector.send_chat(
                        session_key=session_key,
                        message=content,
                        idempotency_key=correlation_id,
                    )
                    return {
                        "success": True,
                        "message": "Message sent to agent via Gateway",
                        "correlationId": correlation_id,
                        "channel": "gateway",
                        "sessionKey": session_key,
                    }
        except Exception as e:
            logger.warning("Gateway chat.send failed for %s: %s", agent_id, e)
            # Fall back to Webhook

        webhook_ok = await self._send_webhook(agent_id, content, session_id, correlation_id, model=model)

        if not webhook_ok:
            # Fallback: write directly to JSONL
            self._write_user_message(agent_id, session_id, content, correlation_id)

        return {
            "success": True,
            "message": "Message sent to agent",
            "correlationId": correlation_id,
            "channel": "webhook" if webhook_ok else "file",
        }

    async def _send_webhook(
        self,
        agent_id: str,
        message: str,
        session_id: str,
        correlation_id: str,
        model: Optional[str] = None,
    ) -> bool:
        """Send a webhook request to OpenClaw runtime.

        POST /hooks/agent with JSON payload.
        Returns True if webhook was accepted, False otherwise.
        """
        client = await self._get_client()
        if client is None or self._simulation_mode:
            return False

        try:
            payload: dict[str, Any] = {
                "agent": agent_id,
                "message": message,
                "session": session_id,
                "correlationId": correlation_id,
                "source": "orchestrator",
            }
            # Include model override if specified.
            # model uses OpenClaw's provider/model-id format (e.g. "anthropic/claude-sonnet-4-5").
            # API key is looked up from openclaw.json → models.providers.<provider>.apiKey
            if model:
                payload["model"] = model
                try:
                    from openclaw_orchestrator.services.provider_keys import provider_keys_service
                    api_key = provider_keys_service.get_key_for_model(model)
                    if api_key:
                        payload["apiKey"] = api_key
                except Exception:
                    pass  # Best-effort — OpenClaw may resolve the key itself
            resp = await client.post(
                f"{self.webhook_base_url}/hooks/agent",
                json=payload,
            )
            if resp.status_code < 400:
                logger.info("Webhook sent to %s: %s...", agent_id, message[:60])
                return True
            logger.warning("Webhook returned %s for %s", resp.status_code, agent_id)
            return False
        except Exception as e:
            logger.warning("Webhook failed for %s: %s", agent_id, e)
            return False

    # ════════════════════════════════════════════════════════════
    # 2. Cron — Schedule Jobs via jobs.json
    # ════════════════════════════════════════════════════════════

    def read_cron_jobs(self) -> dict[str, Any]:
        """Read current cron jobs configuration.

        Returns:
            The parsed jobs.json content, or empty structure if not found.
        """
        jobs_path = self._home / "cron" / "jobs.json"
        if not jobs_path.exists():
            return {"jobs": []}
        try:
            with open(jobs_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {"jobs": []}

    def write_cron_jobs(self, jobs_config: dict[str, Any]) -> bool:
        """Write cron jobs configuration to ~/.openclaw/cron/jobs.json.

        This is used by the schedule_executor to sync time-based and
        custom schedule entries to OpenClaw's cron system.

        Args:
            jobs_config: Full jobs.json content with "jobs" array.

        Returns:
            True if written successfully, False on error.
        """
        cron_dir = self._home / "cron"
        jobs_path = cron_dir / "jobs.json"

        try:
            cron_dir.mkdir(parents=True, exist_ok=True)

            # Backup existing file
            if jobs_path.exists():
                backup_path = cron_dir / "jobs.json.bak"
                import shutil
                shutil.copy2(str(jobs_path), str(backup_path))

            with open(jobs_path, "w", encoding="utf-8") as f:
                json.dump(jobs_config, f, indent=2, ensure_ascii=False)

            logger.info("Cron jobs updated: %s jobs", len(jobs_config.get("jobs", [])))
            return True
        except OSError as e:
            logger.error("Failed to write cron jobs: %s", e)
            return False

    def upsert_cron_jobs_for_team(
        self,
        team_id: str,
        team_jobs: list[dict[str, Any]],
    ) -> bool:
        """Update cron jobs for a specific team, preserving other teams' jobs.

        Each job is tagged with a 'teamId' field for identification.

        Args:
            team_id: The team whose jobs to update.
            team_jobs: New list of jobs for this team.

        Returns:
            True if successful.
        """
        config = self.read_cron_jobs()
        existing_jobs = config.get("jobs", [])

        # Remove old jobs for this team
        filtered = [j for j in existing_jobs if j.get("teamId") != team_id]

        # Add new team jobs (tag each with teamId)
        for job in team_jobs:
            job["teamId"] = team_id
            filtered.append(job)

        config["jobs"] = filtered
        return self.write_cron_jobs(config)

    # ════════════════════════════════════════════════════════════
    # 3. Heartbeat — Read Agent Liveness
    # ════════════════════════════════════════════════════════════

    def read_heartbeat_status(self, agent_id: str) -> dict[str, Any]:
        """Read an agent's HEARTBEAT.md to determine liveness.

        The heartbeat file is checked by OpenClaw's daemon every ~30 minutes.
        If it contains recent timestamps or checklist items, the agent is alive.

        Returns:
            dict with keys: alive, lastCheck, content, checklistItems
        """
        hb_path = self._home / "agents" / agent_id / "HEARTBEAT.md"

        if not hb_path.exists():
            return {
                "alive": False,
                "lastCheck": None,
                "content": "",
                "checklistItems": 0,
            }

        try:
            content = hb_path.read_text(encoding="utf-8")
            mtime = utc_from_timestamp(hb_path.stat().st_mtime)

            # Count checklist items (lines starting with - [ ] or - [x])
            checklist_items = len(re.findall(r"^- \[[ x]\]", content, re.MULTILINE))

            # Consider alive if modified within last 60 minutes
            age_minutes = (utc_now() - mtime).total_seconds() / 60

            return {
                "alive": age_minutes < 60,
                "lastCheck": mtime.isoformat().replace("+00:00", "Z"),
                "content": content,
                "checklistItems": checklist_items,
                "ageMinutes": round(age_minutes, 1),
            }
        except OSError:
            return {
                "alive": False,
                "lastCheck": None,
                "content": "",
                "checklistItems": 0,
            }

    def write_heartbeat(self, agent_id: str, checklist: list[str]) -> bool:
        """Write/update an agent's HEARTBEAT.md checklist.

        This is used to set up tasks for the agent to check on next heartbeat.

        Args:
            agent_id: Target agent.
            checklist: List of checklist items (strings).

        Returns:
            True if written successfully.
        """
        hb_path = self._home / "agents" / agent_id / "HEARTBEAT.md"
        try:
            hb_path.parent.mkdir(parents=True, exist_ok=True)
            timestamp = utc_now().strftime("%Y-%m-%d %H:%M:%S UTC")
            lines = [
                f"# Heartbeat Checklist",
                f"",
                f"_Updated by Orchestrator at {timestamp}_",
                f"",
            ]
            for item in checklist:
                lines.append(f"- [ ] {item}")

            hb_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            logger.info("Heartbeat updated for %s: %s items", agent_id, len(checklist))
            return True
        except OSError as e:
            logger.error("Failed to write heartbeat for %s: %s", agent_id, e)
            return False

    def get_all_agent_heartbeats(self) -> dict[str, dict[str, Any]]:
        """Get heartbeat status for all agents.

        Returns:
            dict mapping agent_id -> heartbeat status.
        """
        agents_dir = self._home / "agents"
        if not agents_dir.exists():
            return {}

        result = {}
        for entry in agents_dir.iterdir():
            if entry.is_dir():
                result[entry.name] = self.read_heartbeat_status(entry.name)
        return result

    def report_team_governance_summary(
        self,
        team_id: str,
        report: dict[str, Any],
    ) -> bool:
        """Persist latest team governance summary for OpenClaw-level aggregation."""
        normalized_team_id = str(team_id or "").strip()
        if not normalized_team_id:
            return False

        report_dir = self._home / "teams" / normalized_team_id / "governance"
        latest_path = report_dir / "latest-report.json"
        history_path = report_dir / "reports.jsonl"

        payload = {
            **(report or {}),
            "teamId": normalized_team_id,
            "reportedAt": str((report or {}).get("reportedAt") or self._utcnow_iso()),
        }

        try:
            report_dir.mkdir(parents=True, exist_ok=True)
            latest_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            with open(history_path, "a", encoding="utf-8") as fp:
                fp.write(json.dumps(payload, ensure_ascii=False) + "\n")
            return True
        except OSError as exc:
            logger.warning("Failed to persist governance summary for team %s: %s", normalized_team_id, exc)
            return False

    # ════════════════════════════════════════════════════════════
    # 4. JSONL Response Polling
    # ════════════════════════════════════════════════════════════

    async def _poll_for_response(
        self,
        agent_id: str,
        session_id: str,
        pre_offset: int,
        timeout_seconds: int,
    ) -> Optional[str]:
        """Poll agent session JSONL file for new assistant messages.

        Checks for new content after `pre_offset` in the session file.
        Looks for lines with role=assistant that appeared after we sent our message.

        Args:
            agent_id: The agent to watch.
            session_id: The session file name (without .jsonl).
            pre_offset: File byte offset before our message was sent.
            timeout_seconds: Max wait time.

        Returns:
            The assistant's response content, or None if timeout.
        """
        session_file = self._agent_session_path(agent_id, session_id)
        poll_interval = 1.0  # seconds
        elapsed = 0.0

        while elapsed < timeout_seconds:
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

            if not os.path.exists(session_file):
                continue

            current_size = os.path.getsize(session_file)
            if current_size <= pre_offset:
                continue

            # Read new content
            try:
                with open(session_file, "r", encoding="utf-8") as f:
                    f.seek(pre_offset)
                    new_content = f.read()
            except OSError:
                continue

            # Parse new lines looking for assistant messages
            for line in new_content.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    normalized = self._normalize_transcript_message(
                        data,
                        agent_id=agent_id,
                        session_id=session_id,
                        fallback_id=f"poll-{agent_id}-{session_id}",
                    )
                    if normalized and normalized.get("role") == "assistant":
                        content = str(normalized.get("content") or "").strip()
                        if content:
                            return content
                except json.JSONDecodeError:
                    continue

            # Gradually increase poll interval to reduce I/O
            if elapsed > 10:
                poll_interval = min(poll_interval + 0.5, 3.0)

        return None

    # ════════════════════════════════════════════════════════════
    # Helper methods
    # ════════════════════════════════════════════════════════════

    def _agent_session_path(self, agent_id: str, session_id: str) -> str:
        """Get full path to an agent's session JSONL file."""
        return str(self._home / "agents" / agent_id / "sessions" / f"{session_id}.jsonl")

    def _get_file_size(self, file_path: str) -> int:
        """Get current file size, 0 if not exists."""
        try:
            return os.path.getsize(file_path) if os.path.exists(file_path) else 0
        except OSError:
            return 0

    def _cleanup_session_file(self, agent_id: str, session_id: str) -> bool:
        """Delete transient session transcript files after internal orchestration use."""
        session_file = self._agent_session_path(agent_id, session_id)
        if not os.path.exists(session_file):
            return True
        try:
            os.remove(session_file)
            logger.info("Cleaned transient session file %s/%s.jsonl", agent_id, session_id)
            return True
        except OSError as exc:
            logger.warning(
                "Failed to clean transient session file %s/%s.jsonl: %s",
                agent_id,
                session_id,
                exc,
            )
            return False

    def _schedule_transient_cleanup_retry(
        self,
        *,
        agent_id: str,
        session_id: str,
        session_key: str | None = None,
        expect_gateway_session: bool = False,
    ) -> None:
        task = asyncio.create_task(
            self._retry_transient_cleanup(
                agent_id=agent_id,
                session_id=session_id,
                session_key=session_key,
                expect_gateway_session=expect_gateway_session,
            )
        )
        self._cleanup_tasks.add(task)

        def _finalize_cleanup_task(done_task: asyncio.Task[Any]) -> None:
            self._cleanup_tasks.discard(done_task)
            try:
                done_task.result()
            except Exception as exc:
                logger.warning(
                    "Deferred transient cleanup crashed for %s/%s: %s",
                    agent_id,
                    session_id,
                    exc,
                )

        task.add_done_callback(_finalize_cleanup_task)

    async def _retry_transient_cleanup(
        self,
        *,
        agent_id: str,
        session_id: str,
        session_key: str | None = None,
        expect_gateway_session: bool = False,
    ) -> None:
        for delay_seconds in (0.5, 1.0, 2.0, 4.0, 8.0):
            await asyncio.sleep(delay_seconds)
            cleaned = await self._cleanup_transient_session(
                agent_id=agent_id,
                session_id=session_id,
                session_key=session_key,
                expect_gateway_session=expect_gateway_session,
            )
            if cleaned:
                return

        logger.warning(
            "Transient cleanup remained inconclusive after retries: %s/%s",
            agent_id,
            session_id,
        )

    async def _resolve_transient_session_key_for_cleanup(
        self,
        *,
        agent_id: str,
        session_id: str,
        session_key: str | None = None,
    ) -> str | None:
        resolved_session_key = (session_key or "").strip()
        main_session_key = self._main_session_key(agent_id)
        if resolved_session_key and resolved_session_key != main_session_key:
            return resolved_session_key

        try:
            from openclaw_orchestrator.services.gateway_connector import (
                gateway_connector,
            )
        except Exception:
            return None

        if not gateway_connector.connected:
            return None

        for attempt in range(3):
            resolved = await gateway_connector.resolve_session_key(
                key=session_id,
                session_id=session_id,
                label=session_id,
                agent_id=agent_id,
            )
            if resolved and resolved != main_session_key:
                return resolved

            list_active_sessions = getattr(gateway_connector, "list_active_sessions", None)
            if callable(list_active_sessions):
                sessions = await list_active_sessions(agent_id)
                for session in sessions:
                    candidate_key = str(session.get("key") or "").strip()
                    candidate_session_id = str(session.get("sessionId") or "").strip()
                    if not candidate_key or candidate_key == main_session_key:
                        continue
                    if candidate_session_id == session_id:
                        return candidate_key
                    if candidate_key.startswith(f"agent:{agent_id}:") and candidate_key.split(":", 2)[-1] == session_id:
                        return candidate_key

            if attempt < 2:
                await asyncio.sleep(0.2 * (attempt + 1))
        return None

    async def _cleanup_transient_session(
        self,
        *,
        agent_id: str,
        session_id: str,
        session_key: str | None = None,
        expect_gateway_session: bool = False,
    ) -> bool:
        main_session_key = self._main_session_key(agent_id)
        resolved_session_key = await self._resolve_transient_session_key_for_cleanup(
            agent_id=agent_id,
            session_id=session_id,
            session_key=session_key,
        )
        gateway_session_cleaned = not expect_gateway_session

        if resolved_session_key and resolved_session_key != main_session_key:
            try:
                from openclaw_orchestrator.services.gateway_connector import (
                    gateway_connector,
                )

                if gateway_connector.connected:
                    deleted = await gateway_connector.delete_session(
                        session_key=resolved_session_key,
                        delete_transcript=True,
                    )
                    if deleted:
                        gateway_session_cleaned = True
                        logger.info(
                            "Cleaned transient Gateway session %s (%s/%s)",
                            resolved_session_key,
                            agent_id,
                            session_id,
                        )
                    else:
                        gateway_session_cleaned = False
                else:
                    gateway_session_cleaned = not expect_gateway_session
            except Exception as exc:
                gateway_session_cleaned = False
                logger.warning(
                    "Failed to clean transient Gateway session %s (%s/%s): %s",
                    resolved_session_key,
                    agent_id,
                    session_id,
                    exc,
                )
        elif resolved_session_key == main_session_key:
            gateway_session_cleaned = not expect_gateway_session
        else:
            gateway_session_cleaned = not expect_gateway_session

        file_cleaned = self._cleanup_session_file(agent_id, session_id)
        return gateway_session_cleaned and file_cleaned

    def _write_user_message(
        self,
        agent_id: str,
        session_id: str,
        content: str,
        correlation_id: str,
    ) -> None:
        """Write a user message directly to JSONL (fallback when webhook unavailable).

        This creates the session file if needed and appends a user-role message.
        OpenClaw's session watcher should pick it up and trigger the agent.
        """
        session_file = self._agent_session_path(agent_id, session_id)
        session_dir = os.path.dirname(session_file)
        os.makedirs(session_dir, exist_ok=True)

        timestamp = utc_now_iso()
        message = {
            "type": "message",
            "id": f"orch-{correlation_id}",
            "timestamp": timestamp,
            "message": {
                "role": "user",
                "content": [{"type": "text", "text": content}],
                "timestamp": timestamp,
                "metadata": {
                    "source": "orchestrator",
                    "correlationId": correlation_id,
                },
            },
        }

        try:
            with open(session_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(message, ensure_ascii=False) + "\n")
            logger.info("Wrote user message to %s/%s.jsonl", agent_id, session_id)
        except OSError as e:
            logger.error("Failed to write JSONL for %s: %s", agent_id, e)

    async def close(self) -> None:
        """Close the HTTP client on shutdown."""
        cleanup_tasks = list(self._cleanup_tasks)
        for task in cleanup_tasks:
            task.cancel()
        for task in cleanup_tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._cleanup_tasks.clear()
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None


# Singleton instance
openclaw_bridge = OpenClawBridge()
