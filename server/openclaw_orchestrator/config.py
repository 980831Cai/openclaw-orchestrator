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
