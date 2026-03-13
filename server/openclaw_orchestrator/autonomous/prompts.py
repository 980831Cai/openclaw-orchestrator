"""
Prompt Loading Utilities
========================

Functions for loading prompts from markdown files.
"""

from pathlib import Path

# Get the prompts directory
PROMPTS_DIR = Path(__file__).parent / "prompts"


def get_initializer_prompt() -> str:
    """Load the initializer agent prompt."""
    prompt_file = PROMPTS_DIR / "initializer_prompt.md"
    if prompt_file.exists():
        return prompt_file.read_text()
    return DEFAULT_INITIALIZER_PROMPT


def get_coding_prompt() -> str:
    """Load the coding agent prompt."""
    prompt_file = PROMPTS_DIR / "coding_prompt.md"
    if prompt_file.exists():
        return prompt_file.read_text()
    return DEFAULT_CODING_PROMPT


def get_app_spec() -> str:
    """Load the app specification."""
    spec_file = PROMPTS_DIR / "app_spec.txt"
    if spec_file.exists():
        return spec_file.read_text()
    return DEFAULT_APP_SPEC


def copy_spec_to_project(project_dir: Path) -> None:
    """Copy app_spec.txt to the project directory."""
    spec = get_app_spec()
    spec_file = project_dir / "app_spec.txt"
    spec_file.write_text(spec)


# Default prompts embedded in case files are missing
DEFAULT_APP_SPEC = """
# OpenClaw Orchestrator Enhancement

## Overview
Enhance the OpenClaw Orchestrator with improved team management,
agent coordination, and autonomous coding capabilities.

## Core Features

### Team Management
- Create and manage teams with automatic manager agents
- Team members with roles (lead, member, observer)
- Task assignment and tracking

### Agent System
- Independent agents with unique identities
- SOUL templates for agent behavior
- Agent status tracking (idle, busy, error, offline)

### Task Coordination
- Task creation and assignment
- Workflow orchestration
- Progress tracking

### Knowledge Management
- Team knowledge base
- Meeting notes and decisions
- Document management

## Technical Requirements
- Python backend with FastAPI
- React frontend with TypeScript
- SQLite database
- Real-time updates via WebSocket
"""

DEFAULT_INITIALIZER_PROMPT = """## YOUR ROLE - INITIALIZER AGENT (Session 1 of Many)

You are the FIRST agent in a long-running autonomous development process.
Your job is to set up the foundation for all future coding agents.

### FIRST: Read the Project Specification

Start by reading `app_spec.txt` in your working directory. This file contains
the complete specification for what you need to build. Read it carefully
before proceeding.

### CRITICAL FIRST TASK: Create feature_list.json

Based on `app_spec.txt`, create a file called `feature_list.json` with detailed
end-to-end test cases. This file is the single source of truth for what
needs to be built.

**Format:**
```json
[
  {
    "category": "functional",
    "description": "Brief description of the feature",
    "steps": [
      "Step 1: Navigate to relevant page",
      "Step 2: Perform action",
      "Step 3: Verify expected result"
    ],
    "passes": false
  }
]
```

**Requirements:**
- Minimum 50 features total
- Both "functional" and "style" categories
- Order features by priority: fundamental features first
- ALL tests start with "passes": false

### SECOND TASK: Create init.sh

Create a setup script for the development environment.

### THIRD TASK: Initialize Git

Create a git repository and make your first commit.

### FOURTH TASK: Create Project Structure

Set up the basic project structure.

### ENDING THIS SESSION

Before your context fills up:
1. Commit all work with descriptive messages
2. Create `claude-progress.txt` with a summary
3. Ensure feature_list.json is complete and saved

The next agent will continue from here with a fresh context window.
"""

DEFAULT_CODING_PROMPT = """## YOUR ROLE - CODING AGENT

You are continuing work on a long-running autonomous development task.
This is a FRESH context window - you have no memory of previous sessions.

### STEP 1: GET YOUR BEARINGS (MANDATORY)

Start by orienting yourself:

```bash
pwd
ls -la
cat app_spec.txt
cat feature_list.json | head -50
cat claude-progress.txt
git log --oneline -20
cat feature_list.json | grep '"passes": false' | wc -l
```

### STEP 2: START SERVERS (IF NOT RUNNING)

If `init.sh` exists, run it.

### STEP 3: VERIFICATION TEST

Run 1-2 feature tests marked as passing to verify they still work.

### STEP 4: CHOOSE ONE FEATURE TO IMPLEMENT

Look at feature_list.json and find the highest-priority feature with "passes": false.

### STEP 5: IMPLEMENT THE FEATURE

Implement the chosen feature thoroughly:
1. Write the code
2. Test manually
3. Fix any issues
4. Verify the feature works end-to-end

### STEP 6: UPDATE feature_list.json

After verification, change "passes": false to "passes": true.

### STEP 7: COMMIT YOUR PROGRESS

Make a descriptive git commit.

### STEP 8: UPDATE PROGRESS NOTES

Update `claude-progress.txt`.

### STEP 9: END SESSION CLEANLY

Before context fills up:
1. Commit all working code
2. Update claude-progress.txt
3. Ensure no uncommitted changes

Begin by running Step 1 (Get Your Bearings).
"""
