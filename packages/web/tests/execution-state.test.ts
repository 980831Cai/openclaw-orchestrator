import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkflowExecution } from '../src/types/index.ts'
import {
  findLatestActiveExecution,
  mergeExecutionWithSignal,
  reconcileExecutionSelection,
  resolveWaitingApprovalFocusNodeId,
} from '../src/pages/workflow-editor/execution-state.ts'

function buildExecution(
  id: string,
  status: WorkflowExecution['status'],
  startedAt: string,
  workflowId = 'workflow-1'
): WorkflowExecution {
  return {
    id,
    workflowId,
    status,
    startedAt,
    logs: [],
  }
}

test('findLatestActiveExecution returns newest active execution only', () => {
  const executions = [
    buildExecution('failed-old', 'failed', '2026-03-12T09:00:00.000Z'),
    buildExecution('running-old', 'running', '2026-03-12T10:00:00.000Z'),
    buildExecution('running-new', 'running', '2026-03-12T11:00:00.000Z'),
  ]

  assert.equal(findLatestActiveExecution(executions)?.id, 'running-new')
})

test('reconcileExecutionSelection keeps requested execution even after it finishes', () => {
  const currentExecution = buildExecution('exec-failed', 'failed', '2026-03-12T12:00:00.000Z')
  const executions = [
    currentExecution,
    buildExecution('exec-running', 'running', '2026-03-12T11:00:00.000Z'),
  ]

  const selected = reconcileExecutionSelection({
    workflowId: 'workflow-1',
    requestedExecutionId: 'exec-failed',
    currentExecution,
    executions,
  })

  assert.equal(selected?.id, 'exec-failed')
  assert.equal(selected?.status, 'failed')
})

test('reconcileExecutionSelection falls back to latest active execution when no requested execution is pinned', () => {
  const currentExecution = buildExecution('exec-completed', 'completed', '2026-03-12T09:00:00.000Z')
  const executions = [
    currentExecution,
    buildExecution('exec-running', 'running', '2026-03-12T12:00:00.000Z'),
    buildExecution('exec-waiting', 'waiting_approval', '2026-03-12T11:00:00.000Z'),
  ]

  const selected = reconcileExecutionSelection({
    workflowId: 'workflow-1',
    currentExecution,
    executions,
  })

  assert.equal(selected?.id, 'exec-running')
})

test('reconcileExecutionSelection can preserve current finished execution for embedded editors', () => {
  const currentExecution = buildExecution('exec-failed', 'failed', '2026-03-12T12:00:00.000Z')
  const executions = [
    currentExecution,
    buildExecution('exec-running', 'running', '2026-03-12T13:00:00.000Z'),
  ]

  const selected = reconcileExecutionSelection({
    workflowId: 'workflow-1',
    currentExecution,
    executions,
    preserveCurrentExecution: true,
  })

  assert.equal(selected?.id, 'exec-failed')
  assert.equal(selected?.status, 'failed')
})

test('resolveWaitingApprovalFocusNodeId prefers pending approval node when available', () => {
  const focusedNodeId = resolveWaitingApprovalFocusNodeId({
    status: 'waiting_approval',
    currentNodeId: 'task-node',
    pendingApprovalNodeId: 'approval-node',
    availableNodeIds: ['task-node', 'approval-node'],
  })

  assert.equal(focusedNodeId, 'approval-node')
})

test('resolveWaitingApprovalFocusNodeId falls back to execution current node when approval node is unavailable', () => {
  const focusedNodeId = resolveWaitingApprovalFocusNodeId({
    status: 'waiting_approval',
    currentNodeId: 'approval-node',
    pendingApprovalNodeId: 'missing-node',
    availableNodeIds: ['approval-node'],
  })

  assert.equal(focusedNodeId, 'approval-node')
})

test('resolveWaitingApprovalFocusNodeId returns null outside waiting approval or when no node matches', () => {
  assert.equal(
    resolveWaitingApprovalFocusNodeId({
      status: 'running',
      currentNodeId: 'node-1',
      pendingApprovalNodeId: 'node-2',
      availableNodeIds: ['node-1', 'node-2'],
    }),
    null,
  )

  assert.equal(
    resolveWaitingApprovalFocusNodeId({
      status: 'waiting_approval',
      currentNodeId: 'node-1',
      pendingApprovalNodeId: 'node-2',
      availableNodeIds: ['node-3'],
    }),
    null,
  )
})

test('mergeExecutionWithSignal updates matching execution status and node from workflow signal', () => {
  const execution = buildExecution('exec-1', 'waiting_approval', '2026-03-12T12:00:00.000Z')

  const merged = mergeExecutionWithSignal(execution, {
    executionId: 'exec-1',
    status: 'completed',
    currentNodeId: 'approval-node',
    updatedAt: '2026-03-12T12:05:00.000Z',
  })

  assert.equal(merged.status, 'completed')
  assert.equal(merged.currentNodeId, 'approval-node')
  assert.equal(merged.completedAt, '2026-03-12T12:05:00.000Z')
})

test('mergeExecutionWithSignal ignores unrelated signals', () => {
  const execution = buildExecution('exec-1', 'running', '2026-03-12T12:00:00.000Z')

  const merged = mergeExecutionWithSignal(execution, {
    executionId: 'exec-2',
    status: 'failed',
    updatedAt: '2026-03-12T12:05:00.000Z',
  })

  assert.equal(merged, execution)
})
