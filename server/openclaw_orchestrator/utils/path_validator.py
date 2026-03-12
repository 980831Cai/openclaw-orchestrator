"""Path validation utilities to prevent path traversal attacks."""

import re
from pathlib import Path

from openclaw_orchestrator.config import settings

# Safe filename pattern: starts with alphanumeric, allows . - _ in the rest
_SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")


def validate_path(target_path: str) -> str:
    """Validate that a path is within the OpenClaw home directory.

    Args:
        target_path: The path to validate.

    Returns:
        The resolved, normalized path string.

    Raises:
        ValueError: If the path is outside the OpenClaw home directory.
    """
    normalized = Path(target_path).resolve()
    home = Path(settings.openclaw_home).resolve()

    if not str(normalized).startswith(str(home)):
        raise ValueError(
            f"Path traversal detected: {target_path} is outside of {settings.openclaw_home}"
        )

    return str(normalized)


def is_path_safe(target_path: str) -> bool:
    """Check if a path is within the OpenClaw home directory."""
    try:
        validate_path(target_path)
        return True
    except ValueError:
        return False


def is_safe_filename(filename: str) -> bool:
    """Check if a filename is safe (no path traversal, no special characters).

    A safe filename:
    - Starts with an alphanumeric character
    - Contains only alphanumeric characters, dots, hyphens, and underscores
    - Does not contain path separators or '..'
    - Is not empty and has a maximum length of 255 characters

    Args:
        filename: The filename to validate.

    Returns:
        True if the filename is safe, False otherwise.
    """
    if not filename or len(filename) > 255:
        return False
    if ".." in filename:
        return False
    return bool(_SAFE_FILENAME_RE.match(filename))
