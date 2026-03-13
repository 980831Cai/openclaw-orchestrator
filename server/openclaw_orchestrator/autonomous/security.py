"""
Security Hooks for Autonomous Coding Agent
==========================================

Pre-tool-use hooks that validate bash commands for security.
Uses an allowlist approach - only explicitly permitted commands can run.
"""

import os
import re
import shlex
from typing import Any

# Allowed commands for development tasks
ALLOWED_COMMANDS = {
    # File inspection
    "ls",
    "cat",
    "head",
    "tail",
    "wc",
    "grep",
    "find",
    # File operations
    "cp",
    "mv",
    "mkdir",
    "rm",
    "chmod",
    "touch",
    # Directory
    "pwd",
    "cd",
    # Python development
    "python",
    "python3",
    "pip",
    "pip3",
    "uv",
    "poetry",
    # Node.js development
    "npm",
    "node",
    "npx",
    "yarn",
    "pnpm",
    # Version control
    "git",
    # Process management
    "ps",
    "lsof",
    "sleep",
    "pkill",
    "kill",
    # Script execution
    "init.sh",
    # Other useful commands
    "echo",
    "env",
    "which",
    "curl",
    "wget",
}

# Commands that need additional validation
COMMANDS_NEEDING_EXTRA_VALIDATION = {"pkill", "chmod", "rm", "kill", "init.sh"}


def split_command_segments(command_string: str) -> list[str]:
    """
    Split a compound command into individual command segments.

    Handles command chaining (&&, ||, ;) but not pipes (those are single commands).
    """
    segments = re.split(r"\s*(?:&&|\|\|)\s*", command_string)

    result = []
    for segment in segments:
        sub_segments = re.split(r'(?<!["\'])\s*;\s*(?!["\'])', segment)
        for sub in sub_segments:
            sub = sub.strip()
            if sub:
                result.append(sub)

    return result


def extract_commands(command_string: str) -> list[str]:
    """
    Extract command names from a shell command string.

    Handles pipes, command chaining (&&, ||, ;), and subshells.
    Returns the base command names (without paths).
    """
    commands = []

    segments = re.split(r'(?<!["\'])\s*;\s*(?!["\'])', command_string)

    for segment in segments:
        segment = segment.strip()
        if not segment:
            continue

        try:
            tokens = shlex.split(segment)
        except ValueError:
            return []

        if not tokens:
            continue

        expect_command = True

        for token in tokens:
            if token in ("|", "||", "&&", "&"):
                expect_command = True
                continue

            if token in (
                "if",
                "then",
                "else",
                "elif",
                "fi",
                "for",
                "while",
                "until",
                "do",
                "done",
                "case",
                "esac",
                "in",
                "!",
                "{",
                "}",
            ):
                continue

            if token.startswith("-"):
                continue

            if "=" in token and not token.startswith("="):
                continue

            if expect_command:
                cmd = os.path.basename(token)
                commands.append(cmd)
                expect_command = False

    return commands


def validate_pkill_command(command_string: str) -> tuple[bool, str]:
    """
    Validate pkill commands - only allow killing dev-related processes.
    """
    allowed_process_names = {
        "node",
        "npm",
        "npx",
        "vite",
        "next",
        "python",
        "python3",
        "uvicorn",
        "gunicorn",
        "celery",
    }

    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse pkill command"

    if not tokens:
        return False, "Empty pkill command"

    args = []
    for token in tokens[1:]:
        if not token.startswith("-"):
            args.append(token)

    if not args:
        return False, "pkill requires a process name"

    target = args[-1]

    if " " in target:
        target = target.split()[0]

    if target in allowed_process_names:
        return True, ""
    return False, f"pkill only allowed for dev processes: {allowed_process_names}"


def validate_chmod_command(command_string: str) -> tuple[bool, str]:
    """
    Validate chmod commands - only allow making files executable with +x.
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse chmod command"

    if not tokens or tokens[0] != "chmod":
        return False, "Not a chmod command"

    mode = None
    files = []

    for token in tokens[1:]:
        if token.startswith("-"):
            return False, "chmod flags are not allowed"
        elif mode is None:
            mode = token
        else:
            files.append(token)

    if mode is None:
        return False, "chmod requires a mode"

    if not files:
        return False, "chmod requires at least one file"

    if not re.match(r"^[ugoa]*\+x$", mode):
        return False, f"chmod only allowed with +x mode, got: {mode}"

    return True, ""


def validate_rm_command(command_string: str) -> tuple[bool, str]:
    """
    Validate rm commands - prevent dangerous patterns.
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse rm command"

    if not tokens or tokens[0] != "rm":
        return False, "Not a rm command"

    # Check for dangerous patterns
    for token in tokens:
        if token in ["-rf", "-fr"]:
            # Allow -rf only for specific directories, not root
            pass
        if token in ["/", "/*", "~", "~/*"]:
            return False, f"rm of root or home directory not allowed: {token}"

    return True, ""


def validate_init_script(command_string: str) -> tuple[bool, str]:
    """
    Validate init.sh script execution.
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse init script command"

    if not tokens:
        return False, "Empty command"

    script = tokens[0]

    if script == "./init.sh" or script.endswith("/init.sh"):
        return True, ""

    return False, f"Only ./init.sh is allowed, got: {script}"


def get_command_for_validation(cmd: str, segments: list[str]) -> str:
    """
    Find the specific command segment that contains the given command.
    """
    for segment in segments:
        segment_commands = extract_commands(segment)
        if cmd in segment_commands:
            return segment
    return ""


async def bash_security_hook(
    input_data: dict[str, Any], tool_use_id: str = None, context: Any = None
) -> dict[str, Any]:
    """
    Pre-tool-use hook that validates bash commands using an allowlist.

    Only commands in ALLOWED_COMMANDS are permitted.

    Returns:
        Empty dict to allow, or {"decision": "block", "reason": "..."} to block
    """
    if input_data.get("tool_name") != "Bash":
        return {}

    command = input_data.get("tool_input", {}).get("command", "")
    if not command:
        return {}

    commands = extract_commands(command)

    if not commands:
        return {
            "decision": "block",
            "reason": f"Could not parse command for security validation: {command}",
        }

    segments = split_command_segments(command)

    for cmd in commands:
        if cmd not in ALLOWED_COMMANDS:
            return {
                "decision": "block",
                "reason": f"Command '{cmd}' is not in the allowed commands list",
            }

        if cmd in COMMANDS_NEEDING_EXTRA_VALIDATION:
            cmd_segment = get_command_for_validation(cmd, segments)
            if not cmd_segment:
                cmd_segment = command

            if cmd == "pkill":
                allowed, reason = validate_pkill_command(cmd_segment)
                if not allowed:
                    return {"decision": "block", "reason": reason}
            elif cmd == "chmod":
                allowed, reason = validate_chmod_command(cmd_segment)
                if not allowed:
                    return {"decision": "block", "reason": reason}
            elif cmd == "rm":
                allowed, reason = validate_rm_command(cmd_segment)
                if not allowed:
                    return {"decision": "block", "reason": reason}
            elif cmd == "init.sh":
                allowed, reason = validate_init_script(cmd_segment)
                if not allowed:
                    return {"decision": "block", "reason": reason}

    return {}
