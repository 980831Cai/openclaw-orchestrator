"""Application configuration."""

import json
import os
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings, loaded from environment variables."""

    port: int = Field(default=3721, alias="PORT")
    openclaw_home: str = Field(
        default_factory=lambda: os.environ.get(
            "OPENCLAW_HOME", str(Path.home() / ".openclaw")
        ),
    )
    cors_origin: str = Field(default="http://localhost:5173", alias="CORS_ORIGIN")

    # OpenClaw Webhook integration
    openclaw_webhook_url: str = Field(
        default="http://localhost:3578",
        alias="OPENCLAW_WEBHOOK_URL",
        description="Base URL of the OpenClaw runtime Webhook server",
    )
    openclaw_webhook_timeout: int = Field(
        default=5,
        alias="OPENCLAW_WEBHOOK_TIMEOUT",
        description="Timeout in seconds for Webhook HTTP calls",
    )

    # OpenClaw Gateway WebSocket (control plane)
    openclaw_gateway_url: str = Field(
        default="ws://localhost:18789",
        alias="OPENCLAW_GATEWAY_URL",
        description="WebSocket URL of the OpenClaw Gateway control plane",
    )

    # OpenClaw Gateway auth token (for remote connections)
    # Local connections (127.0.0.1) are auto-approved by Gateway.
    # For remote connections, set this via env var or let the system
    # auto-read from ~/.openclaw/openclaw.json (generated during onboarding).
    openclaw_gateway_token: str = Field(
        default="",
        alias="OPENCLAW_GATEWAY_TOKEN",
        description="Auth token for OpenClaw Gateway WebSocket connection. "
                    "Leave empty for local connections (auto-approved). "
                    "For remote, set via env var or auto-read from openclaw.json.",
    )

    # API Key authentication
    # When set, all API endpoints (except /api/health and /ws) require
    # the X-API-Key header or ?api_key= query parameter to match this value.
    # Leave empty to disable authentication (development mode).
    api_key: str = Field(
        default="",
        alias="API_KEY",
        description="API Key for authenticating requests. "
                    "Empty = no auth (dev mode). Set to enable.",
    )

    # Team-scoped context budgets (prompt injection)
    context_budget_total_chars: int = Field(
        default=6000,
        alias="CONTEXT_BUDGET_TOTAL_CHARS",
        description="Total character budget for team-scoped context injection.",
    )
    context_budget_team_chars: int = Field(
        default=2200,
        alias="CONTEXT_BUDGET_TEAM_CHARS",
        description="Character budget for team.md (long-term rules).",
    )
    context_budget_task_chars: int = Field(
        default=2600,
        alias="CONTEXT_BUDGET_TASK_CHARS",
        description="Character budget for current task context.",
    )
    context_budget_meeting_chars: int = Field(
        default=1200,
        alias="CONTEXT_BUDGET_MEETING_CHARS",
        description="Character budget for recent meeting summaries.",
    )
    context_budget_meeting_items: int = Field(
        default=2,
        alias="CONTEXT_BUDGET_MEETING_ITEMS",
        description="Maximum number of recent meeting summaries to include.",
    )

    # Task handoff & layered-read strategy
    handoff_validation_mode: str = Field(
        default="strict",
        alias="HANDOFF_VALIDATION_MODE",
        description="Handoff validation mode: strict / lenient / disabled.",
    )
    context_l2_handoff_items: int = Field(
        default=3,
        alias="CONTEXT_L2_HANDOFF_ITEMS",
        description="How many recent handoffs to read at L2.",
    )
    context_l3_handoff_items: int = Field(
        default=8,
        alias="CONTEXT_L3_HANDOFF_ITEMS",
        description="How many recent handoffs to read at L3 fallback.",
    )

    @property
    def db_path(self) -> str:
        return os.environ.get(
            "DB_PATH", str(Path(self.openclaw_home) / "orchestrator.sqlite")
        )

    @property
    def openclaw_config_path(self) -> Path:
        return Path(self.openclaw_home) / "openclaw.json"

    @property
    def openclaw_config(self) -> dict[str, Any]:
        if self.openclaw_config_path.exists():
            try:
                return json.loads(self.openclaw_config_path.read_text(encoding="utf-8-sig"))
            except Exception:
                return {}
        return {}

    @property
    def gateway_port(self) -> int:
        env_value = os.environ.get("OPENCLAW_GATEWAY_PORT") or os.environ.get("CLAWDBOT_GATEWAY_PORT")
        if env_value:
            try:
                return int(env_value)
            except ValueError:
                pass
        config_value = self.openclaw_config.get("gateway", {}).get("port")
        if isinstance(config_value, int) and config_value > 0:
            return config_value
        return 18789

    @property
    def gateway_url(self) -> str:
        env_value = os.environ.get("OPENCLAW_GATEWAY_URL")
        if env_value:
            return env_value.strip()
        gateway = self.openclaw_config.get("gateway", {})
        remote_url = gateway.get("remote", {}).get("url") if isinstance(gateway.get("remote"), dict) else None
        if isinstance(remote_url, str) and remote_url.strip():
            return remote_url.strip()
        tls_enabled = bool(gateway.get("tls", {}).get("enabled")) if isinstance(gateway.get("tls"), dict) else False
        scheme = "wss" if tls_enabled else "ws"
        return f"{scheme}://127.0.0.1:{self.gateway_port}"

    @property
    def gateway_token(self) -> str | None:
        env_value = os.environ.get("OPENCLAW_GATEWAY_TOKEN")
        if env_value:
            return env_value.strip()
        token = self.openclaw_config.get("gateway", {}).get("auth", {}).get("token")
        return token.strip() if isinstance(token, str) and token.strip() else None

    model_config = {"env_prefix": "", "extra": "ignore"}


settings = Settings()

DEFAULT_SERVER_PORT = 3721
