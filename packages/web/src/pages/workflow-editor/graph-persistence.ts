import type { Edge, Node } from 'reactflow'

import type { WorkflowDefinition, WorkflowNodeData } from '../../types/workflow.ts'
import { serializeEdges, serializeNodes, toFlowEdges, toFlowNodes } from './graph'

export interface PreparedWorkflowGraphPayload {
  nodes: Record<string, WorkflowNodeData>
  edges: WorkflowDefinition['edges']
}

function normalizeWorkflowGraphPayload(
  payload: PreparedWorkflowGraphPayload,
): PreparedWorkflowGraphPayload {
  const normalizedNodes = Object.fromEntries(
    Object.entries(payload.nodes).map(([nodeId, nodeData]) => [
      nodeId,
      {
        ...nodeData,
        label: (nodeData.label || nodeId).trim(),
      },
    ]),
  )

  return {
    nodes: normalizedNodes,
    edges: payload.edges,
  }
}

function getComparablePersistedWorkflowGraph(
  workflow: WorkflowDefinition,
): PreparedWorkflowGraphPayload {
  const persistedNodes = toFlowNodes(workflow)
  const persistedEdges = toFlowEdges(workflow)

  return normalizeWorkflowGraphPayload({
    nodes: serializeNodes(persistedNodes, persistedEdges),
    edges: serializeEdges(persistedEdges),
  })
}

export function prepareWorkflowGraphForSave(
  nodes: Node[],
  edges: Edge[],
): PreparedWorkflowGraphPayload {
  return normalizeWorkflowGraphPayload({
    nodes: serializeNodes(nodes, edges),
    edges: serializeEdges(edges),
  })
}

export function haveWorkflowGraphChanges(
  nodes: Node[],
  edges: Edge[],
  workflow: WorkflowDefinition | null | undefined,
): boolean {
  if (!workflow) {
    return false
  }

  return JSON.stringify(prepareWorkflowGraphForSave(nodes, edges)) !== JSON.stringify(getComparablePersistedWorkflowGraph(workflow))
}
