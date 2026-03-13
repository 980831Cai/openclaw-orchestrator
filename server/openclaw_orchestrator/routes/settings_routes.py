"""Settings API routes — provider API keys, global config.

API keys are stored in ``~/.openclaw/openclaw.json`` → ``models.providers``
following OpenClaw's canonical configuration structure.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import json
from pathlib import Path

from openclaw_orchestrator.services.provider_keys import provider_keys_service, _openclaw_config_path
from openclaw_orchestrator.config import settings

router = APIRouter()


class UpdateApiKeyRequest(BaseModel):
    provider: str
    api_key: str
    base_url: Optional[str] = None


class DeleteApiKeyRequest(BaseModel):
    provider: str


class UpdateDefaultModelRequest(BaseModel):
    model: str


@router.get("/settings/providers")
def get_providers():
    """Get all configured providers (keys masked).

    Returns list of providers with their configuration status.
    Keys stored as env-var refs (``${VAR}``) are flagged with ``envRef: true``.
    """
    return provider_keys_service.list_providers()


@router.put("/settings/providers/key")
def update_api_key(req: UpdateApiKeyRequest):
    """Set or update an API key for a provider.

    The key is written to ``openclaw.json → models.providers.<provider>.apiKey``.
    Optionally sets a custom ``baseUrl`` for the provider.
    """
    if not req.provider or not req.api_key:
        raise HTTPException(status_code=400, detail="provider and api_key are required")
    provider_keys_service.set_key(req.provider, req.api_key, base_url=req.base_url)
    return {"success": True, "provider": req.provider, "configured": True}


@router.delete("/settings/providers/key")
def delete_api_key(req: DeleteApiKeyRequest):
    """Remove an API key for a provider."""
    provider_keys_service.delete_key(req.provider)
    return {"success": True, "provider": req.provider, "configured": False}


@router.get("/settings/models/available")
def get_available_models():
    """Get all available models from OpenClaw configuration.
    
    Returns:
    - providers: list of providers with their models
    - defaultModel: global default model (agents.defaults.model.primary)
    - customModels: custom models used by agents but not from known providers
    """
    return provider_keys_service.get_available_models()


@router.put("/settings/default-model")
def update_default_model(req: UpdateDefaultModelRequest):
    """Update the global default model.
    
    Writes to openclaw.json → agents.defaults.model.primary
    """
    config_path = _openclaw_config_path()
    
    # Read existing config
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    else:
        config = {}
    
    # Ensure nested structure exists
    if "agents" not in config:
        config["agents"] = {}
    if "defaults" not in config["agents"]:
        config["agents"]["defaults"] = {}
    
    # Set default model
    config["agents"]["defaults"]["model"] = {"primary": req.model}
    
    # Write back
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    return {"success": True, "defaultModel": req.model}
