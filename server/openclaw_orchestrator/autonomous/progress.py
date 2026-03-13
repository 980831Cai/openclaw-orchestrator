"""
Progress Tracking Utilities
===========================

Functions for tracking and displaying progress of the autonomous coding agent.
"""

import json
from pathlib import Path
from typing import Any


def count_passing_tests(project_dir: Path) -> tuple[int, int]:
    """
    Count passing and total tests in feature_list.json.

    Args:
        project_dir: Directory containing feature_list.json

    Returns:
        (passing_count, total_count)
    """
    tests_file = project_dir / "feature_list.json"

    if not tests_file.exists():
        return 0, 0

    try:
        with open(tests_file, "r") as f:
            tests = json.load(f)

        total = len(tests)
        passing = sum(1 for test in tests if test.get("passes", False))

        return passing, total
    except (json.JSONDecodeError, IOError):
        return 0, 0


def print_session_header(session_num: int, is_initializer: bool) -> None:
    """Print a formatted header for the session."""
    session_type = "INITIALIZER" if is_initializer else "CODING AGENT"

    print("\n" + "=" * 70)
    print(f"  SESSION {session_num}: {session_type}")
    print("=" * 70)
    print()


def print_progress_summary(project_dir: Path) -> None:
    """Print a summary of current progress."""
    passing, total = count_passing_tests(project_dir)

    if total > 0:
        percentage = (passing / total) * 100
        print(f"\nProgress: {passing}/{total} tests passing ({percentage:.1f}%)")
    else:
        print("\nProgress: feature_list.json not yet created")


def get_progress_status(project_dir: Path) -> dict[str, Any]:
    """
    Get progress status as a dictionary.

    Returns:
        Dictionary with passing, total, percentage, and status fields
    """
    passing, total = count_passing_tests(project_dir)

    if total == 0:
        return {
            "passing": 0,
            "total": 0,
            "percentage": 0.0,
            "status": "not_started",
        }

    percentage = (passing / total) * 100
    status = "completed" if passing == total else "in_progress"

    return {
        "passing": passing,
        "total": total,
        "percentage": percentage,
        "status": status,
    }


def update_progress_notes(project_dir: Path, notes: str) -> None:
    """Update the claude-progress.txt file with session notes."""
    progress_file = project_dir / "claude-progress.txt"

    with open(progress_file, "a") as f:
        f.write(f"\n\n{'=' * 50}\n")
        f.write(f"Session Update\n")
        f.write(f"{'=' * 50}\n")
        f.write(notes)
        f.write("\n")


def read_progress_notes(project_dir: Path) -> str:
    """Read the claude-progress.txt file."""
    progress_file = project_dir / "claude-progress.txt"

    if not progress_file.exists():
        return ""

    try:
        with open(progress_file, "r") as f:
            return f.read()
    except IOError:
        return ""
