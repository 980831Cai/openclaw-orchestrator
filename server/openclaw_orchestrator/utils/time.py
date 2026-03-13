"""UTC time helpers."""

from __future__ import annotations

from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return a timezone-aware UTC datetime."""

    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    """Return an ISO-8601 UTC timestamp with ``Z`` suffix."""

    return utc_now().isoformat().replace("+00:00", "Z")


def utc_from_timestamp(value: float) -> datetime:
    """Return a timezone-aware UTC datetime from a POSIX timestamp."""

    return datetime.fromtimestamp(value, tz=timezone.utc)
