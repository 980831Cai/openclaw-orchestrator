/**
 * Workflow utility functions for TeamWorkflowEditor.
 * Extracted from TeamWorkflowEditor.tsx for reusability.
 */

import type { Edge, Node } from 'reactflow'
import type { WorkflowDefinition, WorkflowNodeData, WorkflowSchedule } from '@/types'

export const DEFAULT_WORKFLOW_TIMEZONE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' : 'Asia/Shanghai'

export const EDGE_STYLE = { stroke: '#6366F1', strokeWidth: 2 }

/**
 * Normalize condition handle value to 'yes' | 'no' | undefined
 */
export function normalizeConditionHandle(value?: string | null): 'yes' | 'no' | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true') return 'yes'
  if (normalized === 'no' || normalized === 'false') return 'no'
  return undefined
}

/**
 * Resolve condition branch target from node data
 */
export function resolveConditionBranchTarget(
  nodeData: WorkflowNodeData | undefined,
  targetId: string
): 'yes' | 'no' | undefined {
  if (!nodeData || nodeData.type !== 'condition') return undefined
  const branches = nodeData.branches || {}
  if (branches.yes === targetId || branches.true === targetId) return 'yes'
  if (branches.no === targetId || branches.false === targetId) return 'no'
  if (!branches.yes && !branches.no && !branches.true && !branches.false && branches.default === targetId) return 'yes'
  return undefined
}

/**
 * Normalize node data, handling condition branches
 */
export function normalizeNodeData(data: WorkflowNodeData): WorkflowNodeData {
  if (data.type === 'condition') {
    const branches = data.branches || {}
    const hasExplicitBranch = Boolean(branches.yes || branches.no || branches.true || branches.false)

    if (!hasExplicitBranch && branches.default) {
      return {
        ...data,
        expression: !data.expression || data.expression === 'default' ? 'true' : data.expression,
        branches: { yes: branches.default },
      }
    }
  }

  return data
}

/**
 * Create default schedule configuration
 */
export function createDefaultSchedule(): WorkflowSchedule {
  return {
    enabled: false,
    cron: '',
    timezone: DEFAULT_WORKFLOW_TIMEZONE,
    window: null,
    activeFrom: null,
    activeUntil: null,
  }
}

/**
 * Normalize schedule configuration
 */
export function normalizeSchedule(schedule?: WorkflowSchedule | null): WorkflowSchedule {
  return {
    ...createDefaultSchedule(),
    ...(schedule || {}),
    timezone: schedule?.timezone || DEFAULT_WORKFLOW_TIMEZONE,
    window: schedule?.window
      ? {
          start: schedule.window.start || '',
          end: schedule.window.end || '',
          timezone: schedule.window.timezone || schedule.timezone || DEFAULT_WORKFLOW_TIMEZONE,
        }
      : null,
  }
}

/**
 * Convert ISO date string to datetime-local input value
 */
export function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/**
 * Convert datetime-local input value to ISO date string
 */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Convert workflow definition to ReactFlow nodes
 */
export function toFlowNodes(workflow: WorkflowDefinition): Node[] {
  return Object.entries(workflow.nodes).map(([id, rawData], index) => {
    const data = normalizeNodeData(rawData)
    return {
      id,
      type: data.type === 'parallel' ? 'join' : data.type,
      position: data.position ?? { x: 120 + index * 40, y: 120 + index * 30 },
      data: data.type === 'parallel'
        ? { ...data, type: 'join', label: data.label || '汇合节点', joinMode: data.joinMode || 'and' }
        : data,
    }
  })
}

/**
 * Convert workflow definition to ReactFlow edges
 */
export function toFlowEdges(workflow: WorkflowDefinition): Edge[] {
  return workflow.edges.map((edge, index) => {
    const sourceNode = workflow.nodes[edge.from]
    const normalizedHandle =
      resolveConditionBranchTarget(sourceNode, edge.to)
      ?? normalizeConditionHandle(edge.condition)

    return {
      id: `${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      label: normalizedHandle ?? (edge.condition && edge.condition !== 'default' ? edge.condition : undefined),
      sourceHandle: normalizedHandle,
      style: EDGE_STYLE,
      reconnectable: 'source',
    }
  })
}

/**
 * Serialize ReactFlow nodes and edges back to workflow format
 */
export function serializeNodes(nodes: Node[], edges: Edge[]): Record<string, WorkflowNodeData> {
  return Object.fromEntries(
    nodes.map((node) => {
      const data = {
        ...(node.data as WorkflowNodeData),
        position: node.position,
      } as WorkflowNodeData

      if (data.type === 'condition') {
        const branches = edges
          .filter((edge) => edge.source === node.id)
          .reduce<Record<string, string>>((acc, edge) => {
            const handle = String(edge.sourceHandle || edge.label || '').toLowerCase()
            if (handle === 'yes' || handle === 'true') acc.yes = edge.target
            if (handle === 'no' || handle === 'false') acc.no = edge.target
            return acc
          }, {})
        ;(data as any).branches = branches
      }

      return [node.id, data]
    })
  )
}

/**
 * Serialize edges to workflow format
 */
export function serializeEdges(edges: Edge[]): WorkflowDefinition['edges'] {
  return edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    condition: (edge.sourceHandle || edge.label || undefined) as string | undefined,
  }))
}
