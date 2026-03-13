import assert from 'node:assert/strict'
import test from 'node:test'

import type { Connection, Edge, Node } from 'reactflow'

import type { WorkflowDefinition, WorkflowNodeData, WorkflowSchedule } from '../src/types/index.ts'
import {
  createDefaultSchedule,
  normalizeNodeData,
  normalizeSchedule,
  serializeNodes,
  toFlowNodes,
  upsertConnectedEdge,
} from '../src/pages/workflow-editor/graph.ts'

test('normalizeNodeData migrates legacy default branch to yes branch', () => {
  const normalized = normalizeNodeData({
    type: 'condition',
    label: '条件节点',
    expression: 'default',
    branches: { default: 'target-yes' },
  })

  assert.deepEqual(normalized, {
    type: 'condition',
    label: '条件节点',
    expression: 'true',
    branches: { yes: 'target-yes' },
  })
})

test('normalizeSchedule fills missing defaults and window timezone', () => {
  const schedule = normalizeSchedule({
    enabled: true,
    cron: '*/15 * * * *',
    timezone: '',
    window: {
      start: '09:00',
      end: '18:00',
      timezone: '',
    },
  } as WorkflowSchedule)

  const fallback = createDefaultSchedule()

  assert.equal(schedule.enabled, true)
  assert.equal(schedule.cron, '*/15 * * * *')
  assert.equal(schedule.timezone, fallback.timezone)
  assert.deepEqual(schedule.window, {
    start: '09:00',
    end: '18:00',
    timezone: fallback.timezone,
  })
})

test('toFlowNodes rewrites parallel nodes to join nodes with default join config', () => {
  const workflow: WorkflowDefinition = {
    id: 'wf-1',
    name: '测试工作流',
    teamId: 'team-1',
    edges: [],
    nodes: {
      join_1: {
        type: 'parallel',
        label: '',
        position: { x: 10, y: 20 },
      },
    },
  }

  const [node] = toFlowNodes(workflow)

  assert.equal(node.type, 'join')
  assert.deepEqual(node.data, {
    type: 'join',
    label: '\u6c47\u5408\u8282\u70b9',
    joinMode: 'and',
    position: { x: 10, y: 20 },
  })
})

test('serializeNodes derives yes/no branches from outgoing condition handles', () => {
  const nodes: Node[] = [
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        type: 'condition',
        label: '条件',
        expression: 'x > 0',
        branches: {},
      } satisfies WorkflowNodeData,
    },
  ]
  const edges: Edge[] = [
    { id: 'edge-yes', source: 'cond-1', target: 'task-yes', sourceHandle: 'yes' },
    { id: 'edge-no', source: 'cond-1', target: 'task-no', sourceHandle: 'no' },
  ]

  const serialized = serializeNodes(nodes, edges)

  assert.deepEqual(serialized['cond-1'], {
    type: 'condition',
    label: '条件',
    expression: 'x > 0',
    branches: {
      yes: 'task-yes',
      no: 'task-no',
    },
    position: { x: 0, y: 0 },
  })
})

test('upsertConnectedEdge replaces condition branch target but keeps normal node fan-out', () => {
  const nodes: Node[] = [
    {
      id: 'cond-1',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: { type: 'condition', label: '条件', expression: 'true', branches: {} } satisfies WorkflowNodeData,
    },
    {
      id: 'task-1',
      type: 'task',
      position: { x: 0, y: 0 },
      data: { type: 'task', label: '任务', agentId: 'agent-1', task: 'do', timeoutSeconds: 60 } satisfies WorkflowNodeData,
    },
  ]

  const conditionEdges: Edge[] = [
    { id: 'cond-yes-old', source: 'cond-1', target: 'task-old', sourceHandle: 'yes' },
  ]
  const replacedConditionEdges = upsertConnectedEdge(
    conditionEdges,
    { source: 'cond-1', target: 'task-new', sourceHandle: 'yes' } satisfies Connection,
    nodes,
  )

  assert.equal(replacedConditionEdges.length, 1)
  assert.equal(replacedConditionEdges[0].target, 'task-new')
  assert.equal(replacedConditionEdges[0].sourceHandle, 'yes')

  const taskEdges: Edge[] = [
    { id: 'task-out-1', source: 'task-1', target: 'task-a' },
  ]
  const appendedTaskEdges = upsertConnectedEdge(
    taskEdges,
    { source: 'task-1', target: 'task-b' } satisfies Connection,
    nodes,
  )

  assert.equal(appendedTaskEdges.length, 2)
  assert.deepEqual(
    appendedTaskEdges.map((edge) => edge.target).sort(),
    ['task-a', 'task-b'],
  )
})
