"""Provider API Key management service.

Reads and writes API keys directly from/to the ``models.providers``
section of OpenClaw's canonical config file: ``~/.openclaw/openclaw.json``.

OpenClaw supports three API Key formats:
  1. Direct string:  ``"apiKey": "sk-..."``
  2. Env-var ref:     ``"apiKey": "${OPENAI_API_KEY}"``
  3. SecretRef:       ``"apiKey": {"source": "env", "id": "OPENAI_API_KEY"}``

This service currently handles format 1 (direct string) for simplicity,
but reads and displays all three formats correctly.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Optional

from openclaw_orchestrator.config import settings


# Known providers and their display metadata
KNOWN_PROVIDERS = {
    "anthropic": {"name": "Anthropic", "icon": "🟣"},
    "openai":    {"name": "OpenAI",    "icon": "🟢"},
    "google":    {"name": "Google",    "icon": "🔵"},
    "deepseek":  {"name": "DeepSeek",  "icon": "🐋"},
}

# Prefix-based provider detection for model IDs without explicit provider/
_PREFIX_TO_PROVIDER = {
    "claude": "anthropic",
    "gpt": "openai",
    "o1": "openai",
    "o3": "openai",
    "o4": "openai",
    "gemini": "google",
    "deepseek": "deepseek",
}


def _openclaw_config_path() -> Path:
    """Path to the canonical OpenClaw config file."""
    return Path(settings.openclaw_home) / "openclaw.json"


class ProviderKeysService:
    """Manage provider API keys stored in openclaw.json → models.providers."""

    # ─── Low-level config read/write ──────────────────────────

    def _read_config(self) -> dict[str, Any]:
        """Read full openclaw.json. Returns empty dict if missing."""
        path = _openclaw_config_path()
        if not path.exists():
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}

    def _write_config(self, config: dict[str, Any]) -> None:
        """Write the full openclaw.json back to disk."""
        path = _openclaw_config_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

    def _get_providers_section(self, config: dict[str, Any] | None = None) -> dict[str, Any]:
        """Get the models.providers dict from openclaw.json."""
        if config is None:
            config = self._read_config()
        return config.get("models", {}).get("providers", {})

    def _set_providers_section(self, providers: dict[str, Any]) -> None:
        """Write back the models.providers dict to openclaw.json."""
        config = self._read_config()
        if "models" not in config:
            config["models"] = {}
        config["models"]["providers"] = providers
        self._write_config(config)

    # ─── Public API ───────────────────────────────────────────

    def set_key(self, provider_id: str, api_key: str, base_url: str | None = None) -> None:
        """Set/update an API key for a provider.

        Writes to ``models.providers.<provider>.apiKey`` in openclaw.json.
        Optionally sets ``baseUrl`` for custom endpoints.
        """
        providers = self._get_providers_section()
        if provider_id not in providers:
            providers[provider_id] = {}

        providers[provider_id]["apiKey"] = api_key
        if base_url:
            providers[provider_id]["baseUrl"] = base_url

        self._set_providers_section(providers)

    def delete_key(self, provider_id: str) -> None:
        """Remove an API key for a provider."""
        providers = self._get_providers_section()
        if provider_id in providers:
            providers[provider_id].pop("apiKey", None)
            # Remove provider entirely if no other config remains
            if not providers[provider_id]:
                del providers[provider_id]
            self._set_providers_section(providers)

    def get_key(self, provider_id: str) -> Optional[str]:
        """Get the resolved API key for a provider.

        Handles the three OpenClaw formats:
        - Direct string: return as-is
        - Env-var ref ``${VAR}``: resolve from environment
        - SecretRef dict: resolve from source
        """
        providers = self._get_providers_section()
        provider_conf = providers.get(provider_id, {})
        raw = provider_conf.get("apiKey")
        return self._resolve_key(raw)

    def get_key_for_model(self, model_id: str) -> Optional[str]:
        """Look up the API key by model ID.

        Model IDs use the ``provider/model-name`` format
        (e.g. ``anthropic/claude-sonnet-4-5``). Falls back to prefix matching
        for bare model IDs.
        """
        provider_id = self._provider_for_model(model_id)
        if provider_id:
            return self.get_key(provider_id)
        return None

    def list_providers(self) -> list[dict[str, Any]]:
        """List all known + configured providers with masked key status."""
        providers = self._get_providers_section()
        result = []
        seen = set()

        # Known providers first (in order)
        for pid, meta in KNOWN_PROVIDERS.items():
            seen.add(pid)
            provider_conf = providers.get(pid, {})
            raw = provider_conf.get("apiKey")
            resolved = self._resolve_key(raw)
            is_env_ref = self._is_env_ref(raw)

            result.append({
                "id": pid,
                "name": meta["name"],
                "icon": meta.get("icon", "⚙️"),
                "configured": resolved is not None and len(resolved) > 0,
                "maskedKey": self._mask(resolved) if resolved else None,
                "envRef": is_env_ref,
                "baseUrl": provider_conf.get("baseUrl"),
            })

        # Any extra providers the user configured
        for pid, conf in providers.items():
            if pid in seen:
                continue
            raw = conf.get("apiKey")
            resolved = self._resolve_key(raw)
            result.append({
                "id": pid,
                "name": pid,
                "icon": "⚙️",
                "configured": resolved is not None and len(resolved) > 0,
                "maskedKey": self._mask(resolved) if resolved else None,
                "envRef": self._is_env_ref(raw),
                "baseUrl": conf.get("baseUrl"),
            })

        return result

    # ─── Internal helpers ─────────────────────────────────────

    @staticmethod
    def _provider_for_model(model_id: str) -> Optional[str]:
        """Extract provider from model ID.

        Supports:
        - ``provider/model-name`` format (explicit)
        - Bare model ID with prefix matching (fallback)
        """
        if "/" in model_id:
            return model_id.split("/", 1)[0]
        model_lower = model_id.lower()
        for prefix, provider in _PREFIX_TO_PROVIDER.items():
            if model_lower.startswith(prefix):
                return provider
        return None

    @staticmethod
    def _resolve_key(raw: Any) -> Optional[str]:
        """Resolve an API key from the three OpenClaw formats."""
        if raw is None:
            return None

        # Format 1: direct string
        if isinstance(raw, str):
            # Format 2: env-var ref ``${VAR_NAME}``
            match = re.match(r"^\$\{(.+?)\}$", raw)
            if match:
                return os.environ.get(match.group(1))
            return raw

        # Format 3: SecretRef object
        if isinstance(raw, dict):
            source = raw.get("source", "env")
            key_id = raw.get("id", "")
            if source == "env":
                return os.environ.get(key_id)
            # Other sources (file, exec) not supported yet
            return None

        return None

    @staticmethod
    def _is_env_ref(raw: Any) -> bool:
        """Check if the key is stored as an env var reference."""
        if isinstance(raw, str) and re.match(r"^\$\{.+\}$", raw):
            return True
        if isinstance(raw, dict) and raw.get("source") == "env":
            return True
        return False

    @staticmethod
    def _mask(key: str) -> str:
        """Mask an API key for display."""
        if not key:
            return ""
        if len(key) <= 8:
            return "••••••••"
        return key[:4] + "••••" + key[-4:]


provider_keys_service = ProviderKeysService()
