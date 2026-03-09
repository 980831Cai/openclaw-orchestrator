"""Markdown parsing utilities for agent configuration files.

Parses IDENTITY.md, SOUL.md, and AGENTS.md files using python-frontmatter.
"""

from __future__ import annotations

import re
from typing import Any

import frontmatter


# ─── Agent Identity (IDENTITY.md) ───


def parse_identity_md(content: str) -> dict[str, Any]:
    """Parse an IDENTITY.md file with frontmatter."""
    post = frontmatter.loads(content)
    return {
        "name": post.metadata.get("name", ""),
        "emoji": post.metadata.get("emoji", "🤖"),
        "theme": post.metadata.get("theme", ""),
        "vibe": post.metadata.get("vibe", ""),
        "avatar": post.metadata.get("avatar", ""),
        "greeting": post.content.strip(),
    }


def generate_identity_md(identity: dict[str, Any]) -> str:
    """Generate an IDENTITY.md file with frontmatter."""
    metadata: dict[str, str] = {
        "name": identity.get("name", ""),
        "emoji": identity.get("emoji", "🤖"),
    }
    if identity.get("theme"):
        metadata["theme"] = identity["theme"]
    if identity.get("vibe"):
        metadata["vibe"] = identity["vibe"]
    if identity.get("avatar"):
        metadata["avatar"] = identity["avatar"]

    post = frontmatter.Post(identity.get("greeting", ""), **metadata)
    return frontmatter.dumps(post)


# ─── Agent Soul (SOUL.md) ───


def parse_soul_md(content: str) -> dict[str, str]:
    """Parse a SOUL.md file with sections."""
    sections = _parse_sections(content)
    return {
        "coreTruths": sections.get("core truths", sections.get("core-truths", "")),
        "boundaries": sections.get("boundaries", ""),
        "vibe": sections.get("vibe", ""),
        "continuity": sections.get("continuity", ""),
        "rawContent": content,
    }


def generate_soul_md(soul: dict[str, str]) -> str:
    """Generate a SOUL.md file from sections."""
    section_defs = [
        ("Core Truths", soul.get("coreTruths", "")),
        ("Boundaries", soul.get("boundaries", "")),
        ("Vibe", soul.get("vibe", "")),
        ("Continuity", soul.get("continuity", "")),
    ]
    parts = []
    for title, content in section_defs:
        if content.strip():
            parts.append(f"## {title}\n\n{content.strip()}")
    return "\n\n".join(parts)


# ─── Agent Rules (AGENTS.md) ───


def parse_rules_md(content: str) -> dict[str, str]:
    """Parse an AGENTS.md file with sections."""
    sections = _parse_sections(content)
    return {
        "startupFlow": sections.get("startup flow", sections.get("startup", "")),
        "memoryRules": sections.get("memory rules", sections.get("memory", "")),
        "securityRules": sections.get("security rules", sections.get("security", "")),
        "toolProtocols": sections.get("tool protocols", sections.get("tools", "")),
        "rawContent": content,
    }


def generate_rules_md(rules: dict[str, str]) -> str:
    """Generate an AGENTS.md file from sections."""
    section_defs = [
        ("Startup Flow", rules.get("startupFlow", "")),
        ("Memory Rules", rules.get("memoryRules", "")),
        ("Security Rules", rules.get("securityRules", "")),
        ("Tool Protocols", rules.get("toolProtocols", "")),
    ]
    parts = []
    for title, content in section_defs:
        if content.strip():
            parts.append(f"## {title}\n\n{content.strip()}")
    return "\n\n".join(parts)


# ─── Internal helpers ───


def _parse_sections(content: str) -> dict[str, str]:
    """Parse markdown content into sections keyed by heading (lowercase)."""
    sections: dict[str, str] = {}
    current_section = ""
    current_lines: list[str] = []

    for line in content.split("\n"):
        match = re.match(r"^##\s+(.+)", line)
        if match:
            if current_section:
                sections[current_section.lower()] = "\n".join(current_lines).strip()
            current_section = match.group(1).strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_section:
        sections[current_section.lower()] = "\n".join(current_lines).strip()

    return sections
