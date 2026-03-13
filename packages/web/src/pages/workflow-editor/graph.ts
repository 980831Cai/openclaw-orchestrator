import { addEdge, type Connection, type Edge, type Node } from 'reactflow'

import type { MeetingType, WorkflowDefinition, WorkflowEdge, WorkflowExecution, WorkflowNodeData, WorkflowSchedule } from '../../types/index.ts'

export const EDGE_STYLE = { stroke: '#6366F1', strokeWidth: 2 }
export const MEETING_WORKFLOW_TYPES: Exclude<MeetingType, 'debate'>[] = [
  'standup',
  'kickoff',
  'review',
  'brainstorm',
  'decision',
  'retro',
]
export const DEBATE_ROUND_OPTIONS = [2, 3, 4, 5] as const
export const DEFAULT_WORKFLOW_TIMEZONE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' : 'Asia/Shanghai'

export function normalizeConditionHandle(value?: string | null): 'yes' | 'no' | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true') return 'yes'
  if (normalized === 'no' || normalized === 'false') return 'no'
  return undefined
}

export function resolveConditionBranchTarget(
  nodeData: WorkflowNodeData | undefined,
  targetId: string,
): 'yes' | 'no' | undefined {
  if (!nodeData || nodeData.type !== 'condition') return undefined
  const branches = nodeData.branches || {}
  if (branches.yes === targetId || branches.true === targetId) return 'yes'
  if (branches.no === targetId || branches.false === targetId) return 'no'
  if (!branches.yes && !branches.no && !branches.true && !branches.false && branches.default === targetId) {
    return 'yes'
  }
  return undefined
}

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

export function getExecutionBadge(status: WorkflowExecution['status']): { tone: string; label: string } {
  if (status === 'running') {
    return {
      tone: 'bg-cyber-green/10 text-cyber-green border-cyber-green/20 animate-pulse',
      label: '������',
    }
  }
  if (status === 'waiting_approval') {
    return {
      tone: 'bg-cyber-amber/10 text-cyber-amber border-cyber-amber/20',
      label: '������',
    }
  }
  if (status === 'completed') {
    return {
      tone: 'bg-cyber-blue/10 text-cyber-blue border-cyber-blue/20',
      label: '�����',
    }
  }
  if (status === 'failed') {
    return {
      tone: 'bg-red-500/10 text-red-300 border-red-500/20',
      label: 'ʧ��',
    }
  }
  if (status === 'stopped') {
    return {
      tone: 'bg-white/5 text-white/50 border-white/10',
      label: '��ֹͣ',
    }
  }
  return {
    tone: 'bg-white/5 text-white/40 border-white/10',
    label: status,
  }
}

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

export function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function toFlowNodes(workflow: WorkflowDefinition): Node[] {
  return Object.entries(workflow.nodes).map(([id, rawData], index) => {
    const data = normalizeNodeData(rawData)
    return {
      id,
      type: data.type === 'parallel' ? 'join' : data.type,
      position: data.position ?? { x: 120 + index * 40, y: 120 + index * 30 },
      data:
        data.type === 'parallel'
          ? { ...data, type: 'join', label: data.label || '\u6c47\u5408\u8282\u70b9', joinMode: data.joinMode || 'and' }
          : data,
    }
  })
}

export function toFlowEdges(workflow: WorkflowDefinition): Edge[] {
  return workflow.edges.map((edge, index) => {
    const sourceNode = workflow.nodes[edge.from]
    const normalizedHandle =
      resolveConditionBranchTarget(sourceNode, edge.to) ?? normalizeConditionHandle(edge.condition)

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
        ;(data as WorkflowNodeData & { branches: Record<string, string> }).branches = branches
      }

      return [node.id, data]
    }),
  )
}

export function serializeEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    condition:
      typeof edge.sourceHandle === 'string' && edge.sourceHandle.trim()
        ? edge.sourceHandle
        : typeof edge.label === 'string' && edge.label.trim() && edge.label !== 'default'
          ? edge.label
          : undefined,
  }))
}

export function buildEdge(connection: Connection): Edge {
  if (!connection.source || !connection.target) {
    throw new Error('Invalid edge connection')
  }

  const suffix = connection.sourceHandle || connection.targetHandle || 'edge'
  return {
    id: `${connection.source}-${connection.target}-${suffix}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
    style: EDGE_STYLE,
    reconnectable: 'source',
    label:
      connection.sourceHandle === 'yes' || connection.sourceHandle === 'no'
        ? connection.sourceHandle
        : undefined,
  }
}

export function upsertConnectedEdge(
  current: Edge[],
  connection: Connection,
  nodes: Node[],
  replaceEdgeId?: string,
): Edge[] {
  if (!connection.source || !connection.target) return current

  const sourceNode = nodes.find((node) => node.id === connection.source)
  const nextEdge = buildEdge(connection)
  const nextEdges = current.filter((edge) => {
    if (replaceEdgeId && edge.id === replaceEdgeId) return false
    if (edge.source !== connection.source) return true
    if ((sourceNode?.data as WorkflowNodeData | undefined)?.type === 'condition') {
      return edge.sourceHandle !== connection.sourceHandle
    }
    return edge.target !== connection.target
  })

  return addEdge(replaceEdgeId ? { ...nextEdge, id: replaceEdgeId } : nextEdge, nextEdges)
}
