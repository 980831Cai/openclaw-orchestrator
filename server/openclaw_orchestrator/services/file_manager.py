"""File manager service - all file I/O operations go through here.

Mirrors the original TypeScript FileManager, operating relative to OPENCLAW_HOME.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from openclaw_orchestrator.config import settings
from openclaw_orchestrator.utils.path_validator import validate_path


class FileManager:
    """Manages file operations within the OpenClaw home directory."""

    @property
    def _home(self) -> Path:
        return Path(settings.openclaw_home)

    # ─── Read operations ───

    def read_file(self, relative_path: str) -> str:
        """Read a text file relative to openclaw_home."""
        full_path = validate_path(str(self._home / relative_path))
        if not os.path.exists(full_path):
            raise FileNotFoundError(f"File not found: {full_path}")
        with open(full_path, "r", encoding="utf-8-sig") as f:
            return f.read()

    def read_json(self, relative_path: str) -> Any:
        """Read and parse a JSON file."""
        content = self.read_file(relative_path)
        return json.loads(content)

    def file_exists(self, relative_path: str) -> bool:
        """Check if a file exists."""
        full_path = str(self._home / relative_path)
        return os.path.exists(full_path)

    def is_directory(self, relative_path: str) -> bool:
        """Check if a path is a directory."""
        full_path = str(self._home / relative_path)
        return os.path.isdir(full_path)

    def get_file_size(self, relative_path: str) -> int:
        """Get file size in bytes."""
        full_path = str(self._home / relative_path)
        if not os.path.exists(full_path):
            return 0
        return os.path.getsize(full_path)

    # ─── Write operations ───

    def write_file(self, relative_path: str, content: str) -> None:
        """Write a text file, creating directories and backing up as needed."""
        full_path = validate_path(str(self._home / relative_path))
        parent = os.path.dirname(full_path)
        os.makedirs(parent, exist_ok=True)
        self._backup_file(full_path)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)

    def write_binary(self, relative_path: str, data: bytes) -> None:
        """Write binary content to a file."""
        full_path = validate_path(str(self._home / relative_path))
        parent = os.path.dirname(full_path)
        os.makedirs(parent, exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)

    def write_json(self, relative_path: str, data: Any) -> None:
        """Write data as formatted JSON."""
        self.write_file(relative_path, json.dumps(data, indent=2, ensure_ascii=False))

    # ─── Directory operations ───

    def ensure_dir(self, relative_path: str) -> str:
        """Ensure a directory exists, return its full path."""
        full_path = validate_path(str(self._home / relative_path))
        os.makedirs(full_path, exist_ok=True)
        return full_path

    def list_dir(self, relative_path: str) -> list[str]:
        """List files in a directory."""
        full_path = validate_path(str(self._home / relative_path))
        if not os.path.exists(full_path):
            return []
        return os.listdir(full_path)

    def list_agent_dirs(self) -> list[str]:
        """List all agent directories under agents/."""
        agents_dir = self._home / "agents"
        if not agents_dir.exists():
            return []
        return [
            name
            for name in os.listdir(str(agents_dir))
            if os.path.isdir(str(agents_dir / name))
        ]

    # ─── Move / Delete operations ───

    def move_file(self, from_relative: str, to_relative: str) -> None:
        """Move a file from one relative path to another."""
        from_path = validate_path(str(self._home / from_relative))
        to_path = validate_path(str(self._home / to_relative))
        os.makedirs(os.path.dirname(to_path), exist_ok=True)
        os.rename(from_path, to_path)

    def move_dir(self, from_relative: str, to_relative: str) -> None:
        """Move a directory."""
        from_path = validate_path(str(self._home / from_relative))
        to_path = validate_path(str(self._home / to_relative))
        os.makedirs(os.path.dirname(to_path), exist_ok=True)
        os.rename(from_path, to_path)

    def remove_dir(self, relative_path: str) -> None:
        """Recursively remove a directory."""
        full_path = validate_path(str(self._home / relative_path))
        if os.path.exists(full_path):
            shutil.rmtree(full_path)

    def delete_file(self, relative_path: str) -> None:
        """Delete a single file."""
        full_path = validate_path(str(self._home / relative_path))
        if os.path.exists(full_path):
            os.unlink(full_path)

    # ─── Helpers ───

    def get_full_path(self, relative_path: str) -> str:
        """Resolve a relative path to full path."""
        return str(self._home / relative_path)

    def _backup_file(self, full_path: str) -> None:
        """Create a .bak backup if the file exists."""
        if os.path.exists(full_path):
            shutil.copy2(full_path, f"{full_path}.bak")


# Singleton instance
file_manager = FileManager()
