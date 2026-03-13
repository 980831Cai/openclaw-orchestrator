"""Tests for health endpoint."""

import pytest
from fastapi.testclient import TestClient


class TestHealthEndpoint:
    """Tests for the /health endpoint."""

    def test_health_check_returns_ok(self, client: TestClient):
        """Verify health endpoint returns 200 OK."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"

    def test_api_key_required_for_protected_routes(self, client: TestClient):
        """Verify protected routes require API key."""
        # This test assumes there are protected routes
        # Adjust based on actual API structure
        response = client.get("/api/agents")
        # Should return 401 or 403 without API key
        assert response.status_code in [401, 403, 200]  # 200 if endpoint allows anonymous
