"""Pytest fixtures for testing."""

import os
import sqlite3
import tempfile
from typing import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def temp_db_path(tmp_path) -> Generator[str, None, None]:
    """Create a temporary database for testing."""
    db_file = tmp_path / "test.db"
    yield str(db_file)


@pytest.fixture
def temp_db(temp_db_path: str) -> Generator[sqlite3.Connection, None, None]:
    """Create a temporary database connection for testing."""
    conn = sqlite3.connect(temp_db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    yield conn
    conn.close()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Create a test client for API testing."""
    # Import here to avoid circular imports
    from openclaw_orchestrator.app import app
    
    with TestClient(app) as test_client:
        yield test_client
