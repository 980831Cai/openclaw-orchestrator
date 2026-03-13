import assert from 'node:assert/strict'
import test from 'node:test'

import { buildHumanApprovalReminder, getApprovalReminderKey } from '../src/lib/approval-reminders.ts'

test('buildHumanApprovalReminder returns reminder data for human approval signals', () => {
  const reminder = buildHumanApprovalReminder({
    executionId: 'exec-1',
    workflowId: 'wf-1',
    workflowName: '发布流程',
    status: 'waiting_approval',
    nodeLabel: '人工审批',
    approvalId: 'approval-1',
    approvalMode: 'human',
  })

  assert.deepEqual(reminder, {
    title: '工作流等待你的审批',
    description: '发布流程 · 节点：人工审批',
    workflowUrl: '/workflows?workflowId=wf-1&executionId=exec-1&approvalId=approval-1',
  })
})

test('buildHumanApprovalReminder ignores non-human approvals', () => {
  assert.equal(
    buildHumanApprovalReminder({
      executionId: 'exec-1',
      status: 'waiting_approval',
      approvalMode: 'agent',
      approvalId: 'approval-1',
    }),
    null,
  )
})

test('getApprovalReminderKey prefers approval id', () => {
  assert.equal(
    getApprovalReminderKey({
      executionId: 'exec-1',
      currentNodeId: 'node-1',
      approvalId: 'approval-1',
      status: 'waiting_approval',
    }),
    'approval-1',
  )
})
