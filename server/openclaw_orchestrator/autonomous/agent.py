"""
Agent Session Logic
===================

Core agent interaction functions for running autonomous coding sessions.
Implements the infinite loop pattern with session management.
"""

import asyncio
import logging
from pathlib import Path
from typing import Any, Optional

from .progress import print_session_header, print_progress_summary, update_progress_notes
from .prompts import get_initializer_prompt, get_coding_prompt, copy_spec_to_project

logger = logging.getLogger(__name__)

# Configuration
AUTO_CONTINUE_DELAY_SECONDS = 3
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"


async def run_agent_session(
    client: Any,
    message: str,
    project_dir: Path,
) -> tuple[str, str]:
    """
    Run a single agent session.

    Args:
        client: Claude SDK client or compatible client
        message: The prompt to send
        project_dir: Project directory path

    Returns:
        (status, response_text) where status is:
        - "continue" if agent should continue working
        - "error" if an error occurred
    """
    logger.info("Starting agent session")
    print("Sending prompt to Agent...\n")

    try:
        # If using Claude SDK
        if hasattr(client, 'query'):
            await client.query(message)
            
            response_text = ""
            async for msg in client.receive_response():
                msg_type = type(msg).__name__

                if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        block_type = type(block).__name__

                        if block_type == "TextBlock" and hasattr(block, "text"):
                            response_text += block.text
                            print(block.text, end="", flush=True)
                        elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                            print(f"\n[Tool: {block.name}]", flush=True)
                            if hasattr(block, "input"):
                                input_str = str(block.input)
                                if len(input_str) > 200:
                                    print(f"   Input: {input_str[:200]}...", flush=True)
                                else:
                                    print(f"   Input: {input_str}", flush=True)

                elif msg_type == "UserMessage" and hasattr(msg, "content"):
                    for block in msg.content:
                        block_type = type(block).__name__

                        if block_type == "ToolResultBlock":
                            result_content = getattr(block, "content", "")
                            is_error = getattr(block, "is_error", False)

                            if "blocked" in str(result_content).lower():
                                print(f"   [BLOCKED] {result_content}", flush=True)
                            elif is_error:
                                error_str = str(result_content)[:500]
                                print(f"   [Error] {error_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)

            print("\n" + "-" * 70 + "\n")
            return "continue", response_text
        
        # Fallback for simple client (simulate response)
        else:
            logger.warning("No query method on client, using simulation mode")
            print("Agent session running in simulation mode...")
            return "continue", "Simulated response"

    except Exception as e:
        logger.error(f"Error during agent session: {e}")
        print(f"Error during agent session: {e}")
        return "error", str(e)


async def run_autonomous_agent(
    project_dir: Path,
    model: str = DEFAULT_MODEL,
    max_iterations: Optional[int] = None,
    client_factory: Optional[callable] = None,
) -> None:
    """
    Run the autonomous agent loop with infinite iterations.

    Args:
        project_dir: Directory for the project
        model: Claude model to use
        max_iterations: Maximum number of iterations (None for unlimited)
        client_factory: Optional factory function to create client
    """
    print("\n" + "=" * 70)
    print("  AUTONOMOUS CODING AGENT")
    print("=" * 70)
    print(f"\nProject directory: {project_dir}")
    print(f"Model: {model}")
    if max_iterations:
        print(f"Max iterations: {max_iterations}")
    else:
        print("Max iterations: Unlimited (will run until completion)")
    print()

    # Create project directory
    project_dir.mkdir(parents=True, exist_ok=True)

    # Check if this is a fresh start or continuation
    tests_file = project_dir / "feature_list.json"
    is_first_run = not tests_file.exists()

    if is_first_run:
        print("Fresh start - will use initializer agent")
        print()
        print("=" * 70)
        print("  NOTE: First session may take several minutes!")
        print("  The agent is generating the feature list.")
        print("=" * 70)
        print()
        copy_spec_to_project(project_dir)
    else:
        print("Continuing existing project")
        print_progress_summary(project_dir)

    # Main infinite loop
    iteration = 0

    while True:
        iteration += 1

        # Check max iterations
        if max_iterations and iteration > max_iterations:
            print(f"\nReached max iterations ({max_iterations})")
            print("To continue, run the script again without --max-iterations")
            break

        # Print session header
        print_session_header(iteration, is_first_run)

        # Create client if factory provided
        client = None
        if client_factory:
            try:
                client = client_factory(project_dir, model)
            except Exception as e:
                logger.error(f"Failed to create client: {e}")
                print(f"Failed to create client: {e}")
                await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)
                continue

        # Choose prompt based on session type
        if is_first_run:
            prompt = get_initializer_prompt()
            is_first_run = False
        else:
            prompt = get_coding_prompt()

        # Run session
        if client and hasattr(client, '__aenter__'):
            async with client:
                status, response = await run_agent_session(client, prompt, project_dir)
        elif client:
            status, response = await run_agent_session(client, prompt, project_dir)
        else:
            # No client - just print prompt and wait
            print("No client available. Prompt would be:")
            print(prompt[:500] + "..." if len(prompt) > 500 else prompt)
            status = "continue"
            response = ""

        # Handle status
        if status == "continue":
            print(f"\nAgent will auto-continue in {AUTO_CONTINUE_DELAY_SECONDS}s...")
            print_progress_summary(project_dir)
            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        elif status == "error":
            print("\nSession encountered an error")
            print("Will retry with a fresh session...")
            await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)

        # Small delay between sessions
        if max_iterations is None or iteration < max_iterations:
            print("\nPreparing next session...\n")
            await asyncio.sleep(1)

    # Final summary
    print("\n" + "=" * 70)
    print("  SESSION COMPLETE")
    print("=" * 70)
    print(f"\nProject directory: {project_dir}")
    print_progress_summary(project_dir)

    print("\nDone!")


def create_simple_client(project_dir: Path, model: str) -> Any:
    """
    Create a simple client for testing without Claude SDK.
    
    Returns a mock client that just logs operations.
    """
    class SimpleClient:
        def __init__(self, project_dir: Path, model: str):
            self.project_dir = project_dir
            self.model = model
            
        async def query(self, message: str):
            print(f"[Query] Sending message to {self.model}")
            
        async def receive_response(self):
            # Yield a simple response
            class MockMessage:
                class Content:
                    text = "Mock response - no actual AI connection"
                content = [Content()]
            yield MockMessage()
            
        async def __aenter__(self):
            return self
            
        async def __aexit__(self, *args):
            pass
    
    return SimpleClient(project_dir, model)
