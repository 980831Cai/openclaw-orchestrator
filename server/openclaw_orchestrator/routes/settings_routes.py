"""Settings API routes — provider API keys, global config.

API keys are stored in ``~/.openclaw/openclaw.json`` → ``models.providers``
following OpenClaw's canonical configuration structure.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from openclaw_orchestrator.services.provider_keys import provider_keys_service

router = APIRouter()


class UpdateApiKeyRequest(BaseModel):
    provider: str
    api_key: str
    base_url: Optional[str] = None


class DeleteApiKeyRequest(BaseModel):
    provider: str


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
