import assert from 'node:assert/strict'
import test from 'node:test'
import type { Edge, Node } from 'reactflow'

import type { WorkflowDefinition, WorkflowNodeData } from '../src/types/index.ts'
import {
  createDefaultSchedule,
  normalizeNodeData,
  serializeEdges,
  serializeNodes,
  toFlowEdges,
  toFlowNodes,
  upsertConnectedEdge,
} from '../src/pages/workflow-editor/graph.ts'

function buildWorkflow(nodes: Record<string, WorkflowNodeData>, edges: WorkflowDefinition['edges']): WorkflowDefinition {
  return {
    id: 'wf-1',
    name: 'workflow',
    teamId: 'team-1',
    nodes,
    edges,
  }
}

test('normalizeNodeData upgrades legacy condition default branch to yes branch', () => {
  const normalized = normalizeNodeData({
    type: 'condition',
    label: '条件',
    expression: 'default',
    branches: { default: 'task-1' },
  })

  assert.deepEqual(normalized, {
    type: 'condition',
    label: '条件',
    expression: 'true',
    branches: { yes: 'task-1' },
  })
})

test('toFlowNodes maps legacy parallel nodes to join nodes with default label and mode', () => {
  const workflow = buildWorkflow(
    {
      parallel_1: {
        type: 'parallel',
        label: '',
        position: { x: 10, y: 20 },
      },
    },
    [],
  )

  const [node] = toFlowNodes(workflow)

  assert.equal(node.type, 'join')
  assert.deepEqual(node.data, {
    type: 'join',
    label: '汇合节点',
    joinMode: 'and',
    position: { x: 10, y: 20 },
  })
})

test('toFlowEdges resolves condition branch handles from node branch mapping', () => {
  const workflow = buildWorkflow(
    {
      condition_1: {
        type: 'condition',
        label: '条件',
        expression: 'true',
        branches: { yes: 'task_yes', no: 'task_no' },
      },
      task_yes: {
        type: 'task',
        label: 'yes',
        agentId: 'agent-1',
        task: 'a',
        timeoutSeconds: 60,
      },
      task_no: {
        type: 'task',
        label: 'no',
        agentId: 'agent-1',
        task: 'b',
        timeoutSeconds: 60,
      },
    },
    [
      { from: 'condition_1', to: 'task_yes' },
      { from: 'condition_1', to: 'task_no' },
    ],
  )

  const edges = toFlowEdges(workflow)

  assert.equal(edges[0]?.sourceHandle, 'yes')
  assert.equal(edges[0]?.label, 'yes')
  assert.equal(edges[1]?.sourceHandle, 'no')
  assert.equal(edges[1]?.label, 'no')
})

test('serializeNodes rebuilds condition branches from flow edges', () => {
  const nodes: Node[] = [
    {
      id: 'condition_1',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        type: 'condition',
        label: '条件',
        expression: 'true',
        branches: {},
      },
    },
  ]
  const edges: Edge[] = [
    { id: '1', source: 'condition_1', target: 'task_yes', sourceHandle: 'yes' },
    { id: '2', source: 'condition_1', target: 'task_no', sourceHandle: 'no' },
  ]

  const serialized = serializeNodes(nodes, edges)

  assert.deepEqual((serialized.condition_1 as Extract<WorkflowNodeData, { type: 'condition' }>).branches, {
    yes: 'task_yes',
    no: 'task_no',
  })
})

test('serializeEdges preserves normalized condition handles only', () => {
  const edges: Edge[] = [
    { id: '1', source: 'a', target: 'b', sourceHandle: 'yes', label: 'yes' },
    { id: '2', source: 'a', target: 'c', label: 'default' },
  ]

  assert.deepEqual(serializeEdges(edges), [
    { from: 'a', to: 'b', condition: 'yes' },
    { from: 'a', to: 'c', condition: undefined },
  ])
})

test('upsertConnectedEdge keeps one outgoing edge per condition branch handle', () => {
  const nodes: Node[] = [
    {
      id: 'condition_1',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        type: 'condition',
        label: '条件',
        expression: 'true',
        branches: {},
      },
    },
  ]
  const currentEdges: Edge[] = [
    { id: 'old-yes', source: 'condition_1', target: 'task_old', sourceHandle: 'yes', label: 'yes' },
    { id: 'old-no', source: 'condition_1', target: 'task_no', sourceHandle: 'no', label: 'no' },
  ]

  const nextEdges = upsertConnectedEdge(
    currentEdges,
    { source: 'condition_1', target: 'task_new', sourceHandle: 'yes' },
    nodes,
  )

  assert.equal(nextEdges.filter((edge) => edge.source === 'condition_1' && edge.sourceHandle === 'yes').length, 1)
  assert.equal(nextEdges.some((edge) => edge.target === 'task_new' && edge.sourceHandle === 'yes'), true)
  assert.equal(nextEdges.some((edge) => edge.id === 'old-no'), true)
})

test('createDefaultSchedule starts disabled with local timezone', () => {
  const schedule = createDefaultSchedule()

  assert.equal(schedule.enabled, false)
  assert.equal(schedule.cron, '')
  assert.equal(typeof schedule.timezone, 'string')
  assert.equal(schedule.window, null)
})
