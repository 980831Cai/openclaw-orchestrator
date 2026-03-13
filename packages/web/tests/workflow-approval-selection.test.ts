import assert from 'node:assert/strict'
import test from 'node:test'

import type { ApprovalRecord } from '../src/types/index.ts'
import { resolveApprovalQueryId, selectPendingApproval } from '../src/pages/workflow-editor/approval-selection.ts'

const baseApprovals: ApprovalRecord[] = [
  {
    id: 'approval-old',
    executionId: 'exec-1',
    nodeId: 'node-1',
    title: '旧审批',
    description: '',
    status: 'pending',
    createdAt: '2026-03-13T09:00:00.000Z',
  },
  {
    id: 'approval-new',
    executionId: 'exec-1',
    nodeId: 'node-2',
    title: '新审批',
    description: '',
    status: 'pending',
    createdAt: '2026-03-13T10:00:00.000Z',
  },
]

test('selectPendingApproval prefers requested approval id when it is still pending', () => {
  const selected = selectPendingApproval(baseApprovals, 'approval-old')

  assert.equal(selected?.id, 'approval-old')
})

test('selectPendingApproval falls back to latest pending approval when requested id is absent', () => {
  const selected = selectPendingApproval(baseApprovals, 'approval-missing')

  assert.equal(selected?.id, 'approval-new')
})

test('selectPendingApproval ignores resolved approvals and returns null when no pending approval remains', () => {
  const approvals: ApprovalRecord[] = [
    {
      ...baseApprovals[0],
      status: 'approved',
      resolvedAt: '2026-03-13T11:00:00.000Z',
    },
  ]

  const selected = selectPendingApproval(approvals, 'approval-old')

  assert.equal(selected, null)
})

test('resolveApprovalQueryId keeps requested approval id when still valid', () => {
  assert.equal(resolveApprovalQueryId(baseApprovals, 'approval-old'), 'approval-old')
})

test('resolveApprovalQueryId rewrites stale approval id to latest pending approval', () => {
  assert.equal(resolveApprovalQueryId(baseApprovals, 'approval-stale'), 'approval-new')
})

test('resolveApprovalQueryId clears query when no pending approval remains', () => {
  const approvals: ApprovalRecord[] = [
    {
      ...baseApprovals[0],
      status: 'rejected',
      resolvedAt: '2026-03-13T11:00:00.000Z',
    },
  ]

  assert.equal(resolveApprovalQueryId(approvals, 'approval-old'), null)
})
