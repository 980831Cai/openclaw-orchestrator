# Orchestrator Hardening Plan

## Goal

Finish the remaining `openclaw-orchestrator` stabilization work in a controlled order:

1. Restore the plugin source to this repository and make installation repeatable.
2. Audit workflow, interaction, monitoring, and realtime paths with a strict review standard.
3. Classify findings by severity.
4. Fix high-severity issues first, then medium-severity issues in parallel.
5. Re-test workflow execution, scheduling, interaction flows, and realtime updates.
6. Improve the 3D agent movement logic after the core runtime paths are stable.

## Workstreams

### 1. Plugin Packaging

- Keep the OpenClaw plugin source under `extensions/openclaw-orchestrator/`.
- Keep installation scripts in the orchestrator repository.
- Validate that the plugin can be copied into `~/.openclaw/extensions/openclaw-orchestrator`.

### 2. Strict Audit

- Workflow audit:
  - editor interactions
  - schedule toggle and scheduling inputs
  - execution and status visualization
  - backend scheduler / execution edge cases
- Interaction and monitoring audit:
  - Empire / agent plaza
  - chat realtime refresh
  - websocket lifecycle
  - active workflow cards
  - homepage status blocks

## Severity Rules

### High

- Breaks execution, scheduling, approvals, realtime updates, or plugin loading
- Produces wrong data silently
- Causes misleading success / health / completion state

### Medium

- Causes partial feature failure, stale UI, wrong navigation, or broken edge-case interaction
- Requires manual refresh or workaround but does not corrupt core data

### Low

- Cosmetic issues
- Small affordance or copy problems
- Minor UX inconsistency without feature breakage

## Output Artifacts

- `docs/orchestrator-audit-workflow.md`
- `docs/orchestrator-audit-monitoring.md`
- follow-up fix commits grouped by severity

## Execution Order

1. Finish plugin migration cleanup.
2. Collect audit findings in markdown.
3. Fix all high-severity findings.
4. Fix selected medium-severity findings.
5. Run regression checks.
6. Improve 3D movement.
