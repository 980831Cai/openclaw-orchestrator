"""API Key authentication middleware.

When `settings.api_key` is set (non-empty), all HTTP requests to /api/*
(except /api/health) must include a valid API key via:
  - Header: X-API-Key: <key>
  - Query param: ?api_key=<key>

WebSocket (/ws) and health check (/api/health) are excluded.
When `settings.api_key` is empty (default), authentication is disabled (dev mode).
"""

from __future__ import annotations

import hmac

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from openclaw_orchestrator.config import settings

# Paths that are always accessible without authentication
_PUBLIC_PATHS = frozenset({"/api/health"})


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Middleware that validates API Key on protected endpoints."""

    async def dispatch(self, request: Request, call_next):
        # Skip auth if no API key is configured (dev mode)
        if not settings.api_key:
            return await call_next(request)

        path = request.url.path

        # Skip auth for public paths and WebSocket upgrade
        if path in _PUBLIC_PATHS or path.startswith("/ws"):
            return await call_next(request)

        # Only protect /api/* paths (let static files through)
        if not path.startswith("/api"):
            return await call_next(request)

        # Extract API key from header or query param
        api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")

        if not api_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing API key. Provide via X-API-Key header or ?api_key= query parameter."},
            )

        # Constant-time comparison to prevent timing attacks
        if not hmac.compare_digest(api_key, settings.api_key):
            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid API key."},
            )

        return await call_next(request)
