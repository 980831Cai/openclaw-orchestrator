"""SQLite database connection management.

Uses standard library sqlite3 (synchronous) to match the original better-sqlite3
behavior. The orchestrator is a local single-user service, so synchronous SQLite
is perfectly fine and simpler than async.
"""

import sqlite3
from typing import Optional

from openclaw_orchestrator.config import settings

_db: Optional[sqlite3.Connection] = None


def get_db() -> sqlite3.Connection:
    """Get or create the database connection (singleton)."""
    global _db
    if _db is None:
        _db = sqlite3.connect(settings.db_path, check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.execute("PRAGMA journal_mode = WAL")
        _db.execute("PRAGMA foreign_keys = ON")
    return _db


def close_db() -> None:
    """Close the database connection."""
    global _db
    if _db is not None:
        _db.close()
        _db = None
