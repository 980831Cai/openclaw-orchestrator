"""
Autonomous Coding Agent Module
==============================

A long-running autonomous coding harness that implements the two-agent pattern:
1. Initializer Agent (Session 1): Creates feature_list.json, sets up project
2. Coding Agent (Sessions 2+): Implements features one by one

Key features:
- Unlimited iterations across multiple sessions
- Progress persistence via feature_list.json
- Security hooks for bash command validation
- Browser automation for testing
"""

from .agent import run_autonomous_agent, run_agent_session
from .security import bash_security_hook, ALLOWED_COMMANDS
from .progress import count_passing_tests, print_progress_summary

__all__ = [
    "run_autonomous_agent",
    "run_agent_session",
    "bash_security_hook",
    "ALLOWED_COMMANDS",
    "count_passing_tests",
    "print_progress_summary",
]
