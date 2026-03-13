import type { WorkflowRuntimeSignal } from '../types/session'
import type { WorkflowDefinition, WorkflowExecutionStatus } from '../types/workflow'

const ACTIVE_WORKFLOW_SIGNAL_STATUSES: WorkflowExecutionStatus[] = ['running', 'waiting_approval']

function toTimestamp(value?: string | null) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function isActiveWorkflowSignal(signal: WorkflowRuntimeSignal) {
  return ACTIVE_WORKFLOW_SIGNAL_STATUSES.includes(signal.status)
}

export function getActiveWorkflowSignals(signals: Iterable<WorkflowRuntimeSignal>) {
  return [...signals]
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

export function getSchedulableWorkflows(workflows: Iterable<WorkflowDefinition>, now = Date.now()) {
  return [...workflows]
    .filter((workflow) => isSchedulableWorkflow(workflow, now))
    .sort((left, right) => (toTimestamp(left.schedule?.nextRunAt) ?? Number.MAX_SAFE_INTEGER) - (toTimestamp(right.schedule?.nextRunAt) ?? Number.MAX_SAFE_INTEGER))
}

export function getActiveWorkflowCount(params: {
  signals: Iterable<WorkflowRuntimeSignal>
  workflows: Iterable<WorkflowDefinition>
  now?: number
}) {
  const workflowIds = new Set<string>()

  getActiveWorkflowSignals(params.signals).forEach((signal) => {
    if (signal.workflowId) {
      workflowIds.add(signal.workflowId)
      return
    }
    workflowIds.add(`execution:${signal.executionId}`)
  })

  getSchedulableWorkflows(params.workflows, params.now).forEach((workflow) => {
    workflowIds.add(workflow.id)
  })

  return workflowIds.size
}
