import type { WorkflowRuntimeSignal } from '@/types'

export interface ApprovalReminder {
  title: string
  description: string
  workflowUrl: string
}

export function getApprovalReminderKey(signal: Pick<WorkflowRuntimeSignal, 'approvalId' | 'executionId' | 'currentNodeId'>): string {
  return signal.approvalId || `${signal.executionId}:${signal.currentNodeId || '__approval__'}`
}

export function buildHumanApprovalReminder(signal: WorkflowRuntimeSignal): ApprovalReminder | null {
  if (signal.status !== 'waiting_approval' || signal.approvalMode !== 'human') {
    return null
  }

  const workflowName = (signal.workflowName || signal.workflowId || '未命名工作流').trim()
  const nodeLabel = (signal.nodeLabel || signal.currentNodeId || '审批节点').trim()
  const approvalQuery = signal.approvalId ? `&approvalId=${encodeURIComponent(signal.approvalId)}` : ''
  const workflowUrl = signal.workflowId
    ? `/workflows?workflowId=${encodeURIComponent(signal.workflowId)}&executionId=${encodeURIComponent(signal.executionId)}${approvalQuery}`
    : `/workflows?executionId=${encodeURIComponent(signal.executionId)}${approvalQuery}`

  return {
    title: '工作流等待你的审批',
    description: `${workflowName} · 节点：${nodeLabel}`,
    workflowUrl,
  }
}
