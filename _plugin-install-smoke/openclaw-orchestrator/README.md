# OpenClaw Orchestrator Extension

This extension exposes `openclaw-orchestrator` capabilities as tools inside OpenClaw.

Current tool groups:

- Status: `orchestrator_status`
- Agent: `orchestrator_list_agents`, `orchestrator_get_agent`
- Team: `orchestrator_list_teams`, `orchestrator_get_team`, `orchestrator_create_team`, `orchestrator_add_team_member`
- Workflow: `orchestrator_list_workflows`, `orchestrator_get_workflow`, `orchestrator_create_workflow`, `orchestrator_update_workflow`, `orchestrator_execute_workflow`, `orchestrator_get_execution`
- Approval: `orchestrator_list_pending_approvals`, `orchestrator_resolve_approval`
- Chat: `orchestrator_list_sessions`, `orchestrator_send_agent_message`
- Knowledge: `orchestrator_list_knowledge`, `orchestrator_add_knowledge`, `orchestrator_search_knowledge`

## Configuration

`openclaw.plugin.json` and `moltbot.plugin.json` support:

- `baseUrl`: orchestrator service base URL, default `http://127.0.0.1:3721`
- `authToken`: optional bearer token
- `timeoutMs`: HTTP timeout in milliseconds, default `15000`

Environment variables can override them:

- `OPENCLAW_ORCHESTRATOR_BASE_URL`
- `OPENCLAW_ORCHESTRATOR_AUTH_TOKEN`
- `OPENCLAW_ORCHESTRATOR_TIMEOUT_MS`

## Install

The plugin source now lives in the `openclaw-orchestrator` repository instead of the `openclaw` main repository.

From the repository root:

```bash
pnpm install
pnpm plugin:install
```

Or run the installer directly:

```bash
node scripts/install-openclaw-plugin.mjs
```

Optional flags:

- `--target <dir>`: install into a custom OpenClaw extensions directory
- `--force`: overwrite an existing target

Default target:

- Windows: `%USERPROFILE%/.openclaw/extensions/openclaw-orchestrator`
- macOS / Linux: `~/.openclaw/extensions/openclaw-orchestrator`

If your OpenClaw extension loader does not install dependencies automatically, run this once inside the target directory:

```bash
npm install --omit=dev
```

## Notes

- The extension only bridges tools; it does not bundle the orchestrator frontend or backend.
- Workflow, approval, knowledge, and chat data are still served by the external `openclaw-orchestrator` service.
- `orchestrator_send_agent_message` defaults to the `main` session.
