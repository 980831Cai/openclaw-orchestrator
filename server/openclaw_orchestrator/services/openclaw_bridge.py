"""OpenClaw Bridge — unified integration layer for OpenClaw runtime.

Provides four core capabilities:
1. Agent invocation: Trigger agents via Gateway sessions.spawn / sessions.send,
   falling back to Webhook POST /hooks/agent, then JSONL direct write
2. Cron configuration: Write scheduled jobs to ~/.openclaw/cron/jobs.json
3. Heartbeat status: Read agent HEARTBEAT.md to check liveness
4. JSONL response polling: Wait for agent responses by watching session files

Three-layer degradation for agent invocation:
  ① Gateway RPC (sessions.spawn / sessions.send) — lowest latency
  ② Webhook HTTP (POST /hooks/agent) — if Gateway unavailable
  ③ JSONL file direct write — ultimate fallback, always works

IMPORTANT: OpenClaw Gateway is a communication bus, NOT an execution engine.
It does NOT support 'agent.invoke'. The correct RPC methods are:
  - sessions.spawn: Create session + send first message (triggers Agent)
  - sessions.send: Send message to existing session

All file paths are relative to OPENCLAW_HOME (default: ~/.openclaw).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from openclaw_orchestrator.config import settings


class OpenClawBridge:
    """Unified bridge to OpenClaw runtime capabilities."""

    def __init__(self) -> None:
        self._http_client: Any = None  # Lazy-init httpx.AsyncClient
        self._simulation_mode = False

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
                print("⚠️ httpx not installed, falling back to simulation mode")
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
            print(f"✅ OpenClaw Webhook reachable at {self.webhook_base_url}")
            self._simulation_mode = False
        else:
            print(f"⚠️ OpenClaw Webhook unreachable at {self.webhook_base_url} — running in simulation/fallback mode")
            self._simulation_mode = True

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
        1. Try Gateway sessions.spawn (creates session + triggers agent)
        2. Fall back to Webhook POST /hooks/agent
        3. Fall back to JSONL direct write
        4. Poll the agent's session JSONL for the response

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
        start_time = datetime.utcnow()

        # ── Try Gateway sessions.spawn first (create session + trigger Agent) ──
        # NOTE: OpenClaw Gateway is a communication bus, not an execution engine.
        # It does NOT support "agent.invoke". The correct RPC method is:
        #   - sessions.spawn: Create a new session and send the first message
        #   - sessions.send: Send a message to an existing session
        # After spawning, we still poll JSONL for the response since Gateway
        # only triggers the Agent — it doesn't wait for the response.
        gateway_spawned = False
        try:
            from openclaw_orchestrator.services.gateway_connector import gateway_connector
            if gateway_connector.connected:
                spawn_params: dict[str, Any] = {
                    "agentId": agent_id,
                    "sessionId": session_id,
                    "message": message,
                    "metadata": {
                        "source": "orchestrator",
                        "correlationId": correlation_id,
                    },
                }
                if model:
                    spawn_params["model"] = model
                await gateway_connector.call_rpc(
                    "sessions.spawn", spawn_params, timeout=10.0
                )
                gateway_spawned = True
                print(f"🔌 Gateway sessions.spawn → {agent_id}/{session_id}")
        except Exception as e:
            print(f"⚠️ Gateway sessions.spawn failed for {agent_id}: {e}")
            # Fall through to Webhook+JSONL fallback

        # Record the current file offset BEFORE sending, so we only read new content
        session_file = self._agent_session_path(agent_id, session_id)
        pre_offset = self._get_file_size(session_file)

        if not gateway_spawned:
            # Gateway unavailable — try Webhook, then JSONL direct write
            webhook_ok = await self._send_webhook(agent_id, message, session_id, correlation_id, model=model)

            if not webhook_ok:
                # Fallback: write directly to JSONL (manual trigger)
                self._write_user_message(agent_id, session_id, message, correlation_id)

        # Poll for response
        response = await self._poll_for_response(
            agent_id, session_id, pre_offset, timeout_seconds
        )

        elapsed = (datetime.utcnow() - start_time).total_seconds()

        if response:
            return {
                "success": True,
                "content": response,
                "sessionId": session_id,
                "correlationId": correlation_id,
                "elapsed": round(elapsed, 2),
                "channel": "gateway" if gateway_spawned else "webhook+jsonl",
            }

        return {
            "success": False,
            "content": f"Agent {agent_id} did not respond within {timeout_seconds}s",
            "sessionId": session_id,
            "correlationId": correlation_id,
            "elapsed": round(elapsed, 2),
        }

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

        # ── Try Gateway sessions.send first ──
        try:
            from openclaw_orchestrator.services.gateway_connector import gateway_connector
            if gateway_connector.connected:
                await gateway_connector.call_rpc("sessions.send", {
                    "agentId": agent_id,
                    "sessionId": session_id,
                    "message": content,
                    "metadata": {
                        "source": "orchestrator",
                        "correlationId": correlation_id,
                    },
                    **({"model": model} if model else {}),
                }, timeout=5.0)
                return {
                    "success": True,
                    "message": "Message sent to agent via Gateway (sessions.send)",
                    "correlationId": correlation_id,
                    "channel": "gateway",
                }
        except Exception as e:
            print(f"⚠️ Gateway sessions.send failed for {agent_id}: {e}")
            # Fall back to Webhook

        webhook_ok = await self._send_webhook(agent_id, content, session_id, correlation_id, model=model)

        if not webhook_ok:
            # Fallback: write directly to JSONL
            self._write_user_message(agent_id, session_id, content, correlation_id)

        return {
            "success": True,
            "message": "Message sent to agent",
            "correlationId": correlation_id,
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
                print(f"🔗 Webhook sent to {agent_id}: {message[:60]}...")
                return True
            print(f"⚠️ Webhook returned {resp.status_code} for {agent_id}")
            return False
        except Exception as e:
            print(f"⚠️ Webhook failed for {agent_id}: {e}")
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

            print(f"📅 Cron jobs updated: {len(jobs_config.get('jobs', []))} jobs")
            return True
        except OSError as e:
            print(f"❌ Failed to write cron jobs: {e}")
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
            mtime = datetime.fromtimestamp(hb_path.stat().st_mtime)

            # Count checklist items (lines starting with - [ ] or - [x])
            checklist_items = len(re.findall(r"^- \[[ x]\]", content, re.MULTILINE))

            # Consider alive if modified within last 60 minutes
            age_minutes = (datetime.utcnow() - mtime).total_seconds() / 60

            return {
                "alive": age_minutes < 60,
                "lastCheck": mtime.isoformat(),
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
            timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
            lines = [
                f"# Heartbeat Checklist",
                f"",
                f"_Updated by Orchestrator at {timestamp}_",
                f"",
            ]
            for item in checklist:
                lines.append(f"- [ ] {item}")

            hb_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            print(f"💓 Heartbeat updated for {agent_id}: {len(checklist)} items")
            return True
        except OSError as e:
            print(f"❌ Failed to write heartbeat for {agent_id}: {e}")
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
                    if data.get("role") == "assistant":
                        content = data.get("content", "")
                        if isinstance(content, str) and content.strip():
                            return content
                        elif isinstance(content, dict):
                            return json.dumps(content)
                except (json.JSONDecodeError, KeyError):
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

        message = {
            "id": f"orch-{correlation_id}",
            "role": "user",
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": {
                "source": "orchestrator",
                "correlationId": correlation_id,
            },
        }

        try:
            with open(session_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(message, ensure_ascii=False) + "\n")
            print(f"📝 Wrote user message to {agent_id}/{session_id}.jsonl")
        except OSError as e:
            print(f"❌ Failed to write JSONL for {agent_id}: {e}")

    async def close(self) -> None:
        """Close the HTTP client on shutdown."""
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None


# Singleton instance
openclaw_bridge = OpenClawBridge()
