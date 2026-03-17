"""Helpers for extracting user-visible text from chat payloads."""

from __future__ import annotations

from typing import Any

_PREFERRED_TEXT_KEYS = (
    "text",
    "content",
    "message",
    "output",
    "response",
    "summary",
    "answer",
    "result",
)

_COLLECTION_KEYS = ("parts", "messages", "items", "chunks", "data")

_IGNORED_STRING_KEYS = {
    "id",
    "type",
    "role",
    "provider",
    "mode",
    "citations",
    "source",
    "sessionId",
    "agentId",
    "sessionKey",
    "timestamp",
}


def extract_visible_text(content: Any) -> str:
    """Extract readable text from heterogeneous chat payloads.

    Returns an empty string for metadata-only structured payloads so they do not
    leak into end-user chat surfaces.
    """
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = [extract_visible_text(item) for item in content]
        return "\n".join(part for part in parts if part).strip()

    if isinstance(content, dict):
        for key in _PREFERRED_TEXT_KEYS:
            if key not in content:
                continue
            extracted = extract_visible_text(content.get(key))
            if extracted:
                return extracted

        for key in _COLLECTION_KEYS:
            value = content.get(key)
            if isinstance(value, list):
                extracted = extract_visible_text(value)
                if extracted:
                    return extracted

        fallback_strings = [
            value.strip()
            for key, value in content.items()
            if isinstance(value, str) and value.strip() and key not in _IGNORED_STRING_KEYS
        ]
        if len(fallback_strings) == 1:
            return fallback_strings[0]

    return ""
