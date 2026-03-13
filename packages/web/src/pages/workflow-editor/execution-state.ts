import type { WorkflowExecution, WorkflowRuntimeSignal } from '../../types'

export const ACTIVE_EXECUTION_STATUSES: WorkflowExecution['status'][] = ['running', 'waiting_approval']

export function isExecutionActive(status?: WorkflowExecution['status'] | null): boolean {
  return Boolean(status && ACTIVE_EXECUTION_STATUSES.includes(status))
}

export function findLatestActiveExecution(executions: WorkflowExecution[]): WorkflowExecution | null {
  return [...executions]
    .filter((execution) => isExecutionActive(execution.status))
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())[0] ?? null
}

interface ReconcileExecutionSelectionInput {
  workflowId: string
  requestedExecutionId?: string | null
  currentExecution?: WorkflowExecution | null
  executions: WorkflowExecution[]
  preserveCurrentExecution?: boolean
}

export function reconcileExecutionSelection({
  workflowId,
  requestedExecutionId,
  currentExecution,
  executions,
  preserveCurrentExecution = false,
}: ReconcileExecutionSelectionInput): WorkflowExecution | null {
  const workflowExecutions = executions.filter((execution) => execution.workflowId === workflowId)

  if (requestedExecutionId) {
    const requestedExecution =
      workflowExecutions.find((execution) => execution.id === requestedExecutionId)
      ?? (currentExecution?.workflowId === workflowId && currentExecution.id === requestedExecutionId
        ? currentExecution
        : null)

    if (requestedExecution) {
      return requestedExecution
    }
  }

  if (preserveCurrentExecution && currentExecution?.workflowId === workflowId) {
    const matchedCurrentExecution =
      workflowExecutions.find((execution) => execution.id === currentExecution.id) ?? currentExecution
    if (matchedCurrentExecution) {
      return matchedCurrentExecution
    }
  }

  if (currentExecution?.workflowId === workflowId && isExecutionActive(currentExecution.status)) {
    return currentExecution
  }

  return findLatestActiveExecution(workflowExecutions)
}

interface ResolveWaitingApprovalFocusNodeIdInput {
  status?: WorkflowExecution['status'] | null
  currentNodeId?: string | null
  pendingApprovalNodeId?: string | null
  availableNodeIds: string[]
}

export function resolveWaitingApprovalFocusNodeId({
  status,
  currentNodeId,
  pendingApprovalNodeId,
  availableNodeIds,
}: ResolveWaitingApprovalFocusNodeIdInput): string | null {
  if (status !== 'waiting_approval') {
    return null
  }

  const nodeIdSet = new Set(availableNodeIds)
  if (pendingApprovalNodeId && nodeIdSet.has(pendingApprovalNodeId)) {
    return pendingApprovalNodeId
  }
  if (currentNodeId && nodeIdSet.has(currentNodeId)) {
    return currentNodeId
  }

  return null
}

export function mergeExecutionWithSignal(
  execution: WorkflowExecution,
  signal: Pick<WorkflowRuntimeSignal, 'executionId' | 'status' | 'currentNodeId' | 'updatedAt'>,
): WorkflowExecution {
  if (execution.id !== signal.executionId) {
    return execution
  }

  const nextStatus = signal.status ?? execution.status
  const terminal = nextStatus === 'completed' || nextStatus === 'failed' || nextStatus === 'stopped'

  return {
    ...execution,
    status: nextStatus,
    currentNodeId: signal.currentNodeId ?? execution.currentNodeId ?? null,
    completedAt: terminal ? signal.updatedAt ?? execution.completedAt ?? null : execution.completedAt,
  }
}
