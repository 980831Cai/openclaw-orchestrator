"""Path validation utilities to prevent path traversal attacks."""

from pathlib import Path

from openclaw_orchestrator.config import settings


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
