import type { ApprovalRecord } from '@/types'

export function selectPendingApproval(
  approvals: ApprovalRecord[],
  requestedApprovalId?: string | null,
): ApprovalRecord | null {
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending')
  if (pendingApprovals.length === 0) {
    return null
  }

  if (requestedApprovalId) {
    const requestedApproval = pendingApprovals.find((approval) => approval.id === requestedApprovalId)
    if (requestedApproval) {
      return requestedApproval
    }
  }

  return (
    pendingApprovals.sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )[0] ?? null
  )
}

export function resolveApprovalQueryId(
  approvals: ApprovalRecord[],
  requestedApprovalId?: string | null,
): string | null {
  return selectPendingApproval(approvals, requestedApprovalId)?.id ?? null
}
