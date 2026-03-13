import type { ApprovalUpdatePayload, WorkflowRuntimeSignal } from '@/types'

export function buildWorkflowSignalFromApprovalUpdate(
  approval: ApprovalUpdatePayload,
  currentSignal?: WorkflowRuntimeSignal | null,
): WorkflowRuntimeSignal | null {
  if (!approval.executionId) {
    return null
  }

  if (approval.status !== 'approved' && approval.status !== 'rejected') {
    return null
  }

  const updatedAt = approval.updatedAt || approval.resolvedAt || new Date().toISOString()
  const nextStatus = approval.status === 'approved' ? 'running' : 'failed'

  return {
    ...currentSignal,
    executionId: approval.executionId,
    status: nextStatus,
    currentNodeId: currentSignal?.currentNodeId ?? approval.nodeId ?? null,
    approvalId: null,
    approvalMode: null,
    approverAgentId: currentSignal?.approverAgentId ?? null,
    updatedAt,
  }
}
