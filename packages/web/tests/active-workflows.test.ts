import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkflowRuntimeSignal } from '../src/types/index.ts'
import type { WorkflowDefinition } from '../src/types/workflow.ts'
import {
  getActiveWorkflowCount,
  getActiveWorkflowSignals,
  getSchedulableWorkflows,
  isSchedulableWorkflow,
} from '../src/lib/active-workflows.ts'

function buildWorkflow(
  id: string,
  schedule?: WorkflowDefinition['schedule'],
): WorkflowDefinition {
  return {
    id,
    name: id,
    teamId: 'team-1',
    nodes: {},
    edges: [],
    schedule: schedule ?? null,
  }
}

function buildSignal(
  executionId: string,
  workflowId: string,
  status: WorkflowRuntimeSignal['status'],
  updatedAt: string,
): WorkflowRuntimeSignal {
  return {
    executionId,
    workflowId,
    workflowName: workflowId,
    status,
    updatedAt,
  }
}

test('getActiveWorkflowSignals only keeps running-like signals and sorts by updatedAt desc', () => {
  const signals: WorkflowRuntimeSignal[] = [
    buildSignal('exec-completed', 'workflow-completed', 'completed', '2026-03-13T09:00:00.000Z'),
    buildSignal('exec-running-old', 'workflow-running-old', 'running', '2026-03-13T10:00:00.000Z'),
    buildSignal('exec-waiting-new', 'workflow-waiting', 'waiting_approval', '2026-03-13T11:00:00.000Z'),
  ]

  const result = getActiveWorkflowSignals(signals)

  assert.deepEqual(result.map((signal) => signal.executionId), ['exec-waiting-new', 'exec-running-old'])
})

test('isSchedulableWorkflow treats enabled schedules as active even when nextRunAt is missing', () => {
  const now = Date.parse('2026-03-13T12:00:00.000Z')
  const workflow = buildWorkflow('workflow-scheduled', {
    enabled: true,
    cron: '*/5 * * * *',
    timezone: 'Asia/Shanghai',
    nextRunAt: null,
  })

  assert.equal(isSchedulableWorkflow(workflow, now), true)
})

test('isSchedulableWorkflow excludes schedules outside active window', () => {
  const now = Date.parse('2026-03-13T12:00:00.000Z')
  const expiredWorkflow = buildWorkflow('workflow-expired', {
    enabled: true,
    cron: '*/5 * * * *',
    timezone: 'Asia/Shanghai',
    activeUntil: '2026-03-13T11:59:00.000Z',
  })
  const notStartedWorkflow = buildWorkflow('workflow-not-started', {
    enabled: true,
    cron: '*/5 * * * *',
    timezone: 'Asia/Shanghai',
    activeFrom: '2026-03-13T12:01:00.000Z',
  })

  assert.equal(isSchedulableWorkflow(expiredWorkflow, now), false)
  assert.equal(isSchedulableWorkflow(notStartedWorkflow, now), false)
})

test('getSchedulableWorkflows keeps enabled workflows and orders by nextRunAt when available', () => {
  const now = Date.parse('2026-03-13T12:00:00.000Z')
  const workflows = [
    buildWorkflow('workflow-no-next-run', {
      enabled: true,
      cron: '*/5 * * * *',
      timezone: 'Asia/Shanghai',
      nextRunAt: null,
    }),
    buildWorkflow('workflow-later', {
      enabled: true,
      cron: '*/5 * * * *',
      timezone: 'Asia/Shanghai',
      nextRunAt: '2026-03-13T12:10:00.000Z',
    }),
    buildWorkflow('workflow-soon', {
      enabled: true,
      cron: '*/5 * * * *',
      timezone: 'Asia/Shanghai',
      nextRunAt: '2026-03-13T12:05:00.000Z',
    }),
  ]

  const result = getSchedulableWorkflows(workflows, now)

  assert.deepEqual(result.map((workflow) => workflow.id), [
    'workflow-soon',
    'workflow-later',
    'workflow-no-next-run',
  ])
})

test('getActiveWorkflowCount counts active executions and enabled schedules as one deduped set', () => {
  const now = Date.parse('2026-03-13T12:00:00.000Z')
  const signals: WorkflowRuntimeSignal[] = [
    buildSignal('exec-running', 'workflow-shared', 'running', '2026-03-13T12:00:00.000Z'),
    buildSignal('exec-waiting', 'workflow-live-only', 'waiting_approval', '2026-03-13T11:59:00.000Z'),
  ]
  const workflows = [
    buildWorkflow('workflow-shared', {
      enabled: true,
      cron: '*/5 * * * *',
      timezone: 'Asia/Shanghai',
    }),
    buildWorkflow('workflow-scheduled-only', {
      enabled: true,
      cron: '*/5 * * * *',
      timezone: 'Asia/Shanghai',
    }),
  ]

  assert.equal(getActiveWorkflowCount({ signals, workflows, now }), 3)
})
