import type { WorkflowRuntimeSignal } from '../types/session'
import type { WorkflowDefinition, WorkflowExecutionStatus } from '../types/workflow'

const ACTIVE_WORKFLOW_SIGNAL_STATUSES: WorkflowExecutionStatus[] = ['running', 'waiting_approval']

function toArray<T>(items?: Iterable<T> | Record<string, T> | null) {
  if (!items) {
    return []
  }

  if (Array.isArray(items)) {
    return [...items]
  }

  if (items instanceof Map) {
    return [...items.values()]
  }

  if (items instanceof Set) {
    return [...items.values()]
  }

  if (typeof items === 'object' && Symbol.iterator in items && typeof items[Symbol.iterator] === 'function') {
    return [...items]
  }

  if (typeof items === 'object') {
    return Object.values(items)
  }

  return []
}

function toTimestamp(value?: string | null) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeText(value?: string | null) {
  return (value ?? '').trim().toLowerCase()
}

function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  return Boolean(value) && typeof value === 'object' && typeof (value as WorkflowDefinition).id === 'string'
}

function compareNextRunAt(left: WorkflowDefinition, right: WorkflowDefinition) {
  return (toTimestamp(left.schedule?.nextRunAt) ?? Number.MAX_SAFE_INTEGER) - (toTimestamp(right.schedule?.nextRunAt) ?? Number.MAX_SAFE_INTEGER)
}

function dedupeWorkflowsById(workflows: WorkflowDefinition[]) {
  const deduped = new Map<string, WorkflowDefinition>()

  workflows.forEach((workflow) => {
    const previous = deduped.get(workflow.id)
    if (!previous || compareNextRunAt(workflow, previous) < 0) {
      deduped.set(workflow.id, workflow)
    }
  })

  return [...deduped.values()]
}

function toWorkflowArray(
  workflows?: Iterable<WorkflowDefinition> | Record<string, WorkflowDefinition> | null,
) {
  return toArray(workflows).filter(isWorkflowDefinition)
}

export function isActiveWorkflowSignal(signal: WorkflowRuntimeSignal) {
  return ACTIVE_WORKFLOW_SIGNAL_STATUSES.includes(signal.status)
}

export function getActiveWorkflowSignals(signals?: Iterable<WorkflowRuntimeSignal> | Record<string, WorkflowRuntimeSignal> | null) {
  return toArray(signals)
    .filter(isActiveWorkflowSignal)
    .sort((left, right) => (toTimestamp(right.updatedAt) ?? 0) - (toTimestamp(left.updatedAt) ?? 0))
}

export function isSchedulableWorkflow(workflow: WorkflowDefinition, now = Date.now()) {
  const schedule = workflow.schedule
  if (!schedule?.enabled) return false

  const activeFrom = toTimestamp(schedule.activeFrom)
  if (activeFrom && activeFrom > now) return false

  const activeUntil = toTimestamp(schedule.activeUntil)
  if (activeUntil && activeUntil < now) return false

  return true
}

export function getSchedulableWorkflows(
  workflows?: Iterable<WorkflowDefinition> | Record<string, WorkflowDefinition> | null,
  now = Date.now(),
) {
  return dedupeWorkflowsById(
    toWorkflowArray(workflows).filter((workflow) => isSchedulableWorkflow(workflow, now)),
  ).sort(compareNextRunAt)
}

export function resolveWorkflowIdForSignal(
  signal: Pick<WorkflowRuntimeSignal, 'workflowId' | 'workflowName'>,
  workflows?: Iterable<WorkflowDefinition> | Record<string, WorkflowDefinition> | null,
) {
  if (signal.workflowId) {
    return signal.workflowId
  }

  const signalName = normalizeText(signal.workflowName)
  if (!signalName) {
    return null
  }

  const candidates = toWorkflowArray(workflows)
  const matched = candidates.find((workflow) => normalizeText(workflow.name) === signalName)
  return matched?.id ?? null
}

export function getActiveWorkflowCount(params: {
  signals?: Iterable<WorkflowRuntimeSignal> | Record<string, WorkflowRuntimeSignal> | null
  workflows?: Iterable<WorkflowDefinition> | Record<string, WorkflowDefinition> | null
  now?: number
}) {
  const workflowIds = new Set<string>()

  getActiveWorkflowSignals(params.signals).forEach((signal) => {
    const resolvedWorkflowId = resolveWorkflowIdForSignal(signal, params.workflows)
    if (resolvedWorkflowId) {
      workflowIds.add(resolvedWorkflowId)
      return
    }

    workflowIds.add(`execution:${signal.executionId}`)
  })

  getSchedulableWorkflows(params.workflows, params.now).forEach((workflow) => {
    workflowIds.add(workflow.id)
  })

  return workflowIds.size
}
