#!/usr/bin/env python3
"""
Autonomous Coding Agent Demo
============================

A minimal harness demonstrating long-running autonomous coding.
This script implements the two-agent pattern (initializer + coding agent) and
incorporates all the strategies from the long-running agents guide.

Example Usage:
    python autonomous_agent_demo.py --project-dir ./my_project
    python autonomous_agent_demo.py --project-dir ./my_project --max-iterations 5
"""

import argparse
import asyncio
import logging
import os
from pathlib import Path

# Add parent directory to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from openclaw_orchestrator.autonomous.agent import run_autonomous_agent, create_simple_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Autonomous Coding Agent - Long-running agent harness",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Start fresh project
  python autonomous_agent_demo.py --project-dir ./my_project

  # Use a specific model
  python autonomous_agent_demo.py --project-dir ./my_project --model claude-sonnet-4-5-20250929

  # Limit iterations for testing
  python autonomous_agent_demo.py --project-dir ./my_project --max-iterations 5

  # Continue existing project
  python autonomous_agent_demo.py --project-dir ./my_project

Environment Variables:
  ANTHROPIC_API_KEY    Your Anthropic API key (required for Claude SDK)
        """,
    )

    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path("./autonomous_demo_project"),
        help="Directory for the project (default: ./autonomous_demo_project)",
    )

    parser.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="Maximum number of agent iterations (default: unlimited)",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Claude model to use (default: {DEFAULT_MODEL})",
    )

    parser.add_argument(
        "--use-sdk",
        action="store_true",
        help="Use Claude SDK if available (requires ANTHROPIC_API_KEY)",
    )

    return parser.parse_args()


def create_client_factory(use_sdk: bool):
    """Create a client factory based on configuration."""
    if use_sdk:
        try:
            from claude_code_sdk import ClaudeSDKClient, ClaudeCodeOptions
            from openclaw_orchestrator.autonomous.security import bash_security_hook
            from claude_code_sdk.types import HookMatcher
            
            def factory(project_dir: Path, model: str):
                api_key = os.environ.get("ANTHROPIC_API_KEY")
                if not api_key:
                    raise ValueError("ANTHROPIC_API_KEY environment variable not set")

                security_settings = {
                    "sandbox": {"enabled": True, "autoAllowBashIfSandboxed": True},
                    "permissions": {
                        "defaultMode": "acceptEdits",
                        "allow": [
                            "Read(./**)",
                            "Write(./**)",
                            "Edit(./**)",
                            "Glob(./**)",
                            "Grep(./**)",
                            "Bash(*)",
                        ],
                    },
                }

                import json
                settings_file = project_dir / ".claude_settings.json"
                with open(settings_file, "w") as f:
                    json.dump(security_settings, f, indent=2)

                return ClaudeSDKClient(
                    options=ClaudeCodeOptions(
                        model=model,
                        system_prompt="You are an expert full-stack developer building a production-quality application.",
                        allowed_tools=["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
                        hooks={
                            "PreToolUse": [
                                HookMatcher(matcher="Bash", hooks=[bash_security_hook]),
                            ],
                        },
                        max_turns=1000,
                        cwd=str(project_dir.resolve()),
                        settings=str(settings_file.resolve()),
                    )
                )
            
            return factory
        except ImportError:
            logger.warning("Claude SDK not available, using simple client")
            return create_simple_client
    else:
        return create_simple_client


def main() -> None:
    """Main entry point."""
    args = parse_args()

    # Check for API key if using SDK
    if args.use_sdk and not os.environ.get("ANTHROPIC_API_KEY"):
        print("Warning: ANTHROPIC_API_KEY not set, will use simulation mode")
        print("Get your API key from: https://console.anthropic.com/")
        print()

    # Run the agent
    try:
        client_factory = create_client_factory(args.use_sdk)
        
        asyncio.run(
            run_autonomous_agent(
                project_dir=args.project_dir,
                model=args.model,
                max_iterations=args.max_iterations,
                client_factory=client_factory,
            )
        )
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        print("To resume, run the same command again")
    except Exception as e:
        print(f"\nFatal error: {e}")
        logger.exception("Fatal error in autonomous agent")
        raise


if __name__ == "__main__":
    main()
