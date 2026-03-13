"""SQLite database connection management.

Uses standard library sqlite3 (synchronous) to match the original better-sqlite3
behavior. The orchestrator is a local single-user service, so synchronous SQLite
is perfectly fine and simpler than async.
"""

import sqlite3
import threading

from openclaw_orchestrator.config import settings

_db_local = threading.local()


def get_db() -> sqlite3.Connection:
    """Get or create a SQLite connection scoped to the current thread."""
    connection = getattr(_db_local, "connection", None)
    if connection is None:
        connection = sqlite3.connect(settings.db_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA foreign_keys = ON")
        _db_local.connection = connection
    return connection


def close_db() -> None:
    """Close the SQLite connection for the current thread, if present."""
    connection = getattr(_db_local, "connection", None)
    if connection is not None:
        connection.close()
        _db_local.connection = None
