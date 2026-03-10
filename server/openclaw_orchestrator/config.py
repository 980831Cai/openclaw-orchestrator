"""Application configuration."""

import os
from pathlib import Path

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

    model_config = {"env_prefix": "", "extra": "ignore"}


# Singleton instance
settings = Settings()

# Constants matching shared/constants
DEFAULT_SERVER_PORT = 3721
