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

# Common models for each provider (used when provider API key is configured)
_COMMON_MODELS = {
    "anthropic": [
        {"id": "anthropic/claude-sonnet-4-5", "name": "Claude Sonnet 4", "desc": "最强综合能力"},
        {"id": "anthropic/claude-haiku-3.5", "name": "Claude 3.5 Haiku", "desc": "快速且便宜"},
    ],
    "openai": [
        {"id": "openai/gpt-4o", "name": "GPT-4o", "desc": "旗舰多模态"},
        {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "desc": "极低成本"},
        {"id": "openai/o3", "name": "o3", "desc": "深度推理"},
    ],
    "google": [
        {"id": "google/gemini-2.5-pro", "name": "Gemini 2.5 Pro", "desc": "长上下文"},
        {"id": "google/gemini-2.0-flash", "name": "Gemini 2.0 Flash", "desc": "快速便宜"},
    ],
    "deepseek": [
        {"id": "deepseek/deepseek-v3", "name": "DeepSeek V3", "desc": "编程和数学"},
        {"id": "deepseek/deepseek-r1", "name": "DeepSeek R1", "desc": "推理"},
    ],
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

    def get_available_models(self) -> dict[str, Any]:
        """Get all available models from OpenClaw configuration.
        
        Returns a structure containing:
        - providers: list of providers with their configured models
        - defaultModel: the global default model (if configured)
        - customModels: list of custom models used by agents
        
        Models are sourced from:
        1. Models already used by agents (agents.list[].model.primary)
        2. Common models for providers with configured API keys
        """
        config = self._read_config()
        providers_config = self._get_providers_section(config)
        
        # Step 1: Extract models used by agents
        used_models = set()
        agents_list = config.get("agents", {}).get("list", [])
        for agent in agents_list:
            model = agent.get("model")
            if isinstance(model, dict):
                primary = model.get("primary")
                if primary:
                    used_models.add(primary)
            elif isinstance(model, str) and model:
                used_models.add(model)
        
        # Step 2: Get default model
        defaults = config.get("agents", {}).get("defaults", {})
        default_model = None
        default_model_conf = defaults.get("model")
        if isinstance(default_model_conf, dict):
            default_model = default_model_conf.get("primary")
        elif isinstance(default_model_conf, str):
            default_model = default_model_conf
        
        if default_model:
            used_models.add(default_model)
        
        # Step 3: Build provider list with models
        result_providers = []
        seen_providers = set()
        
        # First, process known providers
        for provider_id, meta in KNOWN_PROVIDERS.items():
            seen_providers.add(provider_id)
            provider_conf = providers_config.get(provider_id, {})
            raw_key = provider_conf.get("apiKey")
            has_key = self._resolve_key(raw_key) is not None
            
            # Collect models for this provider
            provider_models = []
            
            # Add common models if API key is configured
            if has_key and provider_id in _COMMON_MODELS:
                for model_info in _COMMON_MODELS[provider_id]:
                    provider_models.append({
                        "id": model_info["id"],
                        "name": model_info["name"],
                        "desc": model_info.get("desc", ""),
                        "available": True,
                        "source": "common",
                    })
            
            # Add models used by agents for this provider
            for model_id in used_models:
                model_provider = self._provider_for_model(model_id)
                if model_provider == provider_id:
                    # Check if already added (from common models)
                    if not any(m["id"] == model_id for m in provider_models):
                        # Extract display name from model ID
                        display_name = model_id.split("/", 1)[1] if "/" in model_id else model_id
                        provider_models.append({
                            "id": model_id,
                            "name": display_name,
                            "desc": "",
                            "available": has_key,
                            "source": "used",
                        })
            
            result_providers.append({
                "id": provider_id,
                "name": meta["name"],
                "icon": meta.get("icon", "⚙️"),
                "configured": has_key,
                "models": provider_models,
            })
        
        # Step 4: Handle custom/unknown providers from used_models
        custom_models = []
        for model_id in used_models:
            provider_id = self._provider_for_model(model_id)
            if provider_id and provider_id not in seen_providers:
                # This is a custom provider
                provider_conf = providers_config.get(provider_id, {})
                raw_key = provider_conf.get("apiKey")
                has_key = self._resolve_key(raw_key) is not None
                
                display_name = model_id.split("/", 1)[1] if "/" in model_id else model_id
                custom_models.append({
                    "id": model_id,
                    "provider": provider_id,
                    "name": display_name,
                    "available": has_key,
                })
        
        return {
            "providers": result_providers,
            "defaultModel": default_model,
            "customModels": custom_models,
        }

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
