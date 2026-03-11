import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { GitBranch, Loader2, Merge, MessageSquare, Play, Plus, Save, Split, Square, Swords, Trash2, UserCheck, Zap } from 'lucide-react'

import { TaskNodeComponent } from '@/components/workflow/TaskNode'
import { ConditionNodeComponent } from '@/components/workflow/ConditionNode'
import { ApprovalNodeComponent } from '@/components/workflow/ApprovalNode'
import { JoinNodeComponent } from '@/components/workflow/JoinNode'
import { MeetingNodeComponent } from '@/components/workflow/MeetingNode'
import { DebateNodeComponent } from '@/components/workflow/DebateNode'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { MEETING_TYPE_LABELS } from '@/types'
import type { AgentListItem, MeetingType, WorkflowDefinition, WorkflowExecution, WorkflowLog, WorkflowNodeData, WorkflowSchedule } from '@/types'

const nodeTypes: NodeTypes = {
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
  parallel: JoinNodeComponent,
  approval: ApprovalNodeComponent,
  meeting: MeetingNodeComponent,
  debate: DebateNodeComponent,
}

const EDGE_STYLE = { stroke: '#6366F1', strokeWidth: 2 }
const MEETING_WORKFLOW_TYPES: Exclude<MeetingType, 'debate'>[] = ['standup', 'kickoff', 'review', 'brainstorm', 'decision', 'retro']
const DEBATE_ROUND_OPTIONS = [2, 3, 4, 5] as const
const WORKFLOW_NODE_BUTTONS = [
  { type: 'task', label: '任务', icon: Zap, hoverClassName: 'hover:border-cyber-blue/30', iconClassName: 'text-cyber-blue' },
  { type: 'condition', label: '条件', icon: Split, hoverClassName: 'hover:border-cyber-amber/30', iconClassName: 'text-cyber-amber' },
  { type: 'approval', label: '审批', icon: UserCheck, hoverClassName: 'hover:border-yellow-500/30', iconClassName: 'text-yellow-400' },
  { type: 'join', label: '汇合', icon: Merge, hoverClassName: 'hover:border-cyber-green/30', iconClassName: 'text-cyber-green' },
  { type: 'meeting', label: '会议', icon: MessageSquare, hoverClassName: 'hover:border-purple-400/30', iconClassName: 'text-purple-400' },
  { type: 'debate', label: '辩论', icon: Swords, hoverClassName: 'hover:border-orange-400/30', iconClassName: 'text-orange-400' },
] as const satisfies ReadonlyArray<{
  type: Extract<WorkflowNodeData['type'], 'task' | 'condition' | 'approval' | 'join' | 'meeting' | 'debate'>
  label: string
  icon: typeof Zap
  hoverClassName: string
  iconClassName: string
}>

const DEFAULT_WORKFLOW_TIMEZONE =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai' : 'Asia/Shanghai'

function normalizeConditionHandle(value?: string | null): 'yes' | 'no' | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true') return 'yes'
  if (normalized === 'no' || normalized === 'false') return 'no'
  return undefined
}

function resolveConditionBranchTarget(nodeData: WorkflowNodeData | undefined, targetId: string): 'yes' | 'no' | undefined {
  if (!nodeData || nodeData.type !== 'condition') return undefined
  const branches = nodeData.branches || {}
  if (branches.yes === targetId || branches.true === targetId) return 'yes'
  if (branches.no === targetId || branches.false === targetId) return 'no'
  if (!branches.yes && !branches.no && !branches.true && !branches.false && branches.default === targetId) return 'yes'
  return undefined
}

function normalizeNodeData(data: WorkflowNodeData): WorkflowNodeData {
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

  if (data.type === 'approval') {
    const legacyApprover = String((data as any).approver || '').trim()
    const explicitMode = (data as any).approvalMode
    const explicitAgentId = String((data as any).approverAgentId || '').trim()
    const derivedMode = explicitMode === 'agent' || explicitMode === 'human'
      ? explicitMode
      : legacyApprover && legacyApprover !== 'web-user'
        ? 'agent'
        : 'human'
    const derivedAgentId = explicitAgentId || (
      derivedMode === 'agent'
        ? (legacyApprover.startsWith('agent:') ? legacyApprover.slice(6) : legacyApprover)
        : ''
    )

    return {
      ...data,
      approvalMode: derivedMode,
      approverAgentId: derivedAgentId || undefined,
      approver: derivedMode === 'agent' ? derivedAgentId : 'web-user',
    }
  }

  return data
}

function createDefaultSchedule(): WorkflowSchedule {
  return {
    enabled: false,
    cron: '',
    timezone: DEFAULT_WORKFLOW_TIMEZONE,
    window: null,
    activeFrom: null,
    activeUntil: null,
  }
}

function normalizeSchedule(schedule?: WorkflowSchedule | null): WorkflowSchedule {
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

function toDateTimeLocalValue(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

interface TeamWorkflowEditorProps {
  teamId: string
}

function toFlowNodes(workflow: WorkflowDefinition): Node[] {
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

function toFlowEdges(workflow: WorkflowDefinition): Edge[] {
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

function serializeNodes(nodes: Node[], edges: Edge[]): Record<string, WorkflowNodeData> {
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

function serializeEdges(edges: Edge[]) {
  return edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    condition: normalizeConditionHandle(
      typeof edge.sourceHandle === 'string'
        ? edge.sourceHandle
        : typeof edge.label === 'string'
          ? edge.label
          : undefined
    ),
  }))
}

function buildEdge(connection: Connection): Edge {
  if (!connection.source || !connection.target) {
    throw new Error('Invalid edge connection')
  }

  const normalizedHandle = normalizeConditionHandle(connection.sourceHandle)

  return {
    id: `edge-${connection.source}-${normalizedHandle || connection.sourceHandle || 'default'}-${connection.target}-${connection.targetHandle || 'default'}-${Date.now()}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: normalizedHandle ?? connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
    label: normalizedHandle ?? undefined,
    style: EDGE_STYLE,
    reconnectable: 'source',
  }
}

function upsertConnectedEdge(current: Edge[], connection: Connection, nodes: Node[], replaceEdgeId?: string): Edge[] {
  if (!connection.source || !connection.target) return current

  const nextEdge = buildEdge(connection)
  const sourceNode = nodes.find((node) => node.id === connection.source)
  const sourceType = (sourceNode?.data as WorkflowNodeData | undefined)?.type
  const branchHandle = normalizeConditionHandle(nextEdge.sourceHandle ? String(nextEdge.sourceHandle) : undefined)

  let nextEdges = current.filter((edge) => edge.id !== replaceEdgeId)

  if (sourceType === 'condition' && branchHandle) {
    nextEdges = nextEdges.filter((edge) => {
      if (edge.source !== connection.source) return true
      return normalizeConditionHandle(String(edge.sourceHandle || edge.label || '')) !== branchHandle
    })
  }

  return addEdge(replaceEdgeId ? { ...nextEdge, id: replaceEdgeId } : nextEdge, nextEdges)
}

export function TeamWorkflowEditor({ teamId }: TeamWorkflowEditorProps) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [execution, setExecution] = useState<WorkflowExecution | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [schedule, setSchedule] = useState<WorkflowSchedule>(createDefaultSchedule())
  const [edgeReconnectSuccessful, setEdgeReconnectSuccessful] = useState(true)

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId])
  const selectedNodeUpstreamOptions = useMemo(() => {
    if (!selectedNodeId) return []

    const upstreamIds = Array.from(
      new Set(edges.filter((edge) => edge.target === selectedNodeId).map((edge) => edge.source))
    )

    return upstreamIds.map((sourceId) => {
      const sourceNode = nodes.find((node) => node.id === sourceId)
      const sourceData = sourceNode?.data as WorkflowNodeData | undefined
      return {
        id: sourceId,
        label: sourceData?.label || sourceId,
        type: sourceData?.type || 'task',
      }
    })
  }, [edges, nodes, selectedNodeId])
  const logs: WorkflowLog[] = execution?.logs ?? []

  const executionDecorations = useMemo(() => {
    const failedNodeIds = new Set<string>()
    const successfulNodeIds = new Set<string>()

    if (execution) {
      for (const log of execution.logs) {
        if (!log.nodeId || log.nodeId.startsWith('__')) continue
        if (log.level === 'error') {
          failedNodeIds.add(log.nodeId)
          successfulNodeIds.delete(log.nodeId)
        } else if (!failedNodeIds.has(log.nodeId)) {
          successfulNodeIds.add(log.nodeId)
        }
      }
    }

    return {
      nodes: nodes.map((node) => {
        const executionState =
          execution?.currentNodeId === node.id && execution.status === 'running'
            ? 'running'
            : failedNodeIds.has(node.id)
              ? 'failed'
              : successfulNodeIds.has(node.id)
                ? 'success'
                : 'idle'

        return {
          ...node,
          data: {
            ...(node.data as WorkflowNodeData),
            executionState,
          },
        }
      }),
      edges: edges.map((edge) => {
        const sourceState =
          execution?.currentNodeId === edge.source && execution.status === 'running'
            ? 'running'
            : failedNodeIds.has(edge.source)
              ? 'failed'
              : successfulNodeIds.has(edge.source)
                ? 'success'
                : 'idle'

        return {
          ...edge,
          animated: sourceState === 'running',
          style:
            sourceState === 'running'
              ? { ...EDGE_STYLE, stroke: '#f59e0b', strokeDasharray: '6 4' }
              : sourceState === 'failed'
                ? { ...EDGE_STYLE, stroke: '#ef4444' }
                : sourceState === 'success'
                  ? { ...EDGE_STYLE, stroke: '#22c55e' }
                  : EDGE_STYLE,
        }
      }),
    }
  }, [edges, execution, nodes])

  const loadWorkflow = useCallback((workflow: WorkflowDefinition) => {
    setSelected(workflow)
    setNodes(toFlowNodes(workflow))
    setEdges(toFlowEdges(workflow))
    setSchedule(normalizeSchedule(workflow.schedule))
    setSelectedNodeId(null)
    setExecution(null)
  }, [setEdges, setNodes])

  const fetchWorkflows = useCallback(async () => {
    try {
      const all = await api.get<WorkflowDefinition[]>('/workflows')
      const teamWorkflows = all.filter((workflow) => workflow.teamId === teamId)
      setWorkflows(teamWorkflows)

      if (!selected && teamWorkflows[0]) {
        loadWorkflow(teamWorkflows[0])
        return
      }

      if (selected) {
        const refreshed = teamWorkflows.find((workflow) => workflow.id === selected.id)
        if (refreshed) {
          setSelected(refreshed)
        }
      }
    } catch (error) {
      toast({
        title: '工作流加载失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }, [loadWorkflow, selected, teamId])

  const refreshExecution = useCallback(async (executionId: string) => {
    try {
      const data = await api.get<WorkflowExecution>(`/executions/${executionId}`)
      setExecution(data)
    } catch {
      // ignore polling errors
    }
  }, [])

  useEffect(() => {
    void fetchWorkflows()
  }, [fetchWorkflows])

  useEffect(() => {
    const fetchAgentOptions = async () => {
      try {
        const data = await api.get<AgentListItem[]>('/agents')
        setAgents(data)
      } catch {
        // 保留手动输入兜底
      }
    }

    void fetchAgentOptions()
  }, [])

  useEffect(() => {
    if (!execution || !['running', 'waiting_approval'].includes(execution.status)) {
      return undefined
    }

    const timer = window.setInterval(() => {
      void refreshExecution(execution.id)
    }, 2500)

    return () => window.clearInterval(timer)
  }, [execution, refreshExecution])

  const onConnect = useCallback((params: Connection) => {
    setEdges((current) => upsertConnectedEdge(current, params, nodes))
  }, [nodes, setEdges])

  const handleEdgeUpdateStart = useCallback(() => {
    setEdgeReconnectSuccessful(false)
  }, [])

  const handleEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    if (!newConnection.source || !newConnection.target) return

    setEdgeReconnectSuccessful(true)
    setEdges((current) => upsertConnectedEdge(current, newConnection, nodes, oldEdge.id))
  }, [nodes, setEdges])

  const handleEdgeUpdateEnd = useCallback((_: unknown, edge: Edge) => {
    if (edgeReconnectSuccessful) return
    setEdges((current) => current.filter((item) => item.id !== edge.id))
  }, [edgeReconnectSuccessful, setEdges])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const workflow = await api.post<WorkflowDefinition>('/workflows', { teamId, name: newName.trim(), nodes: {}, edges: [] })
      setWorkflows((prev) => [workflow, ...prev])
      loadWorkflow(workflow)
      setNewName('')
      setCreating(false)
      toast({ title: '工作流已创建' })
    } catch (error) {
      toast({
        title: '创建失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    const nextSchedule =
      schedule.enabled && schedule.cron.trim()
        ? {
            ...schedule,
            cron: schedule.cron.trim(),
            timezone: schedule.timezone.trim() || DEFAULT_WORKFLOW_TIMEZONE,
            window:
              schedule.window?.start && schedule.window?.end
                ? {
                    start: schedule.window.start,
                    end: schedule.window.end,
                    timezone: schedule.window.timezone?.trim() || schedule.timezone.trim() || DEFAULT_WORKFLOW_TIMEZONE,
                  }
                : null,
          }
        : null

    if (schedule.enabled && !schedule.cron.trim()) {
      toast({ title: '保存失败', description: '开启定时执行后必须填写 Cron 表达式', variant: 'destructive' })
      setSaving(false)
      return
    }

    const nodeMap = serializeNodes(nodes, edges)
    Object.keys(nodeMap).forEach((nodeId) => {
      nodeMap[nodeId] = {
        ...nodeMap[nodeId],
        label: (nodeMap[nodeId].label || nodeId).trim(),
      }
    })
    const edgeList = serializeEdges(edges)

    try {
      const updated = await api.put<WorkflowDefinition>(`/workflows/${selected.id}`, {
        name: selected.name,
        nodes: nodeMap,
        edges: edgeList,
        schedule: nextSchedule,
      })
      setSelected(updated)
      setSchedule(normalizeSchedule(updated.schedule))
      setWorkflows((prev) => prev.map((workflow) => (workflow.id === updated.id ? updated : workflow)))
      toast({ title: '工作流已保存' })
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const addNode = (type: WorkflowNodeData['type']) => {
    const id = `${type}-${Date.now()}`
    const baseData: Record<WorkflowNodeData['type'], WorkflowNodeData> = {
      task: { type: 'task', label: '任务节点', agentId: '', task: '', timeoutSeconds: 60, requireResponse: true, requireArtifacts: false, minOutputLength: 1, successPattern: '', position: { x: 240, y: 120 } },
      condition: { type: 'condition', label: '条件节点', expression: 'true', branches: { yes: '', no: '' }, position: { x: 240, y: 120 } },
      approval: { type: 'approval', label: '审批节点', title: '请确认', description: '', approvalMode: 'human', approver: 'web-user', approverAgentId: '', timeoutMinutes: 30, onTimeout: 'reject', position: { x: 240, y: 120 } },
      join: { type: 'join', label: '汇合节点', joinMode: 'and', waitForAll: true, position: { x: 240, y: 120 } },
      parallel: { type: 'parallel', label: '汇合节点', joinMode: 'and', waitForAll: true, position: { x: 240, y: 120 } },
      meeting: { type: 'meeting', label: '会议节点', meetingType: 'brainstorm', topic: '', participants: [], position: { x: 240, y: 120 } },
      debate: { type: 'debate', label: '辩论节点', topic: '', participants: [], maxRounds: 3, position: { x: 240, y: 120 } },
    }

    const nextNode: Node = {
      id,
      type,
      position: { x: 180 + nodes.length * 30, y: 100 + nodes.length * 20 },
      data: baseData[type],
    }

    setNodes((prev) => [...prev, nextNode])
    setSelectedNodeId(id)
  }

  const handleExecute = async () => {
    if (!selected) return
    try {
      const nextExecution = await api.post<WorkflowExecution>(`/workflows/${selected.id}/execute`)
      setExecution(nextExecution)
      window.setTimeout(() => {
        void refreshExecution(nextExecution.id)
      }, 800)
      toast({ title: '工作流开始执行', description: `执行 ID: ${nextExecution.id}` })
    } catch (error) {
      toast({
        title: '执行失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  const handleStop = async () => {
    if (!selected || !execution) return
    try {
      await api.post(`/workflows/${selected.id}/stop`, { executionId: execution.id })
      await refreshExecution(execution.id)
      toast({ title: '已发送停止请求' })
    } catch (error) {
      toast({
        title: '停止失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }

  const updateSelectedNode = (patch: Partial<WorkflowNodeData>) => {
    if (!selectedNode) return
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              data: {
                ...(node.data as WorkflowNodeData),
                ...patch,
              },
            }
          : node
      )
    )
  }

  const handleDeleteSelectedNode = useCallback(() => {
    if (!selectedNode) return
    setNodes((current) => current.filter((node) => node.id !== selectedNode.id))
    setEdges((current) =>
      current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)
    )
    setSelectedNodeId(null)
  }, [selectedNode, setEdges, setNodes])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isEditable =
        target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'

      if (isEditable) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!selectedNode) return

      event.preventDefault()
      setNodes((current) => current.filter((node) => node.id !== selectedNode.id))
      setEdges((current) =>
        current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)
      )
      setSelectedNodeId(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, setEdges, setNodes])

  const selectedConditionConnections = useMemo(() => {
    if (!selectedNode || (selectedNode.data as WorkflowNodeData).type !== 'condition') return { yes: null, no: null }
    const resolveTarget = (handleId: 'yes' | 'no') => {
      const selectedNodeData = selectedNode.data as Extract<WorkflowNodeData, { type: 'condition' }>
      const edge = edges.find((item) => item.source === selectedNode.id && normalizeConditionHandle(
        typeof item.sourceHandle === 'string'
          ? item.sourceHandle
          : typeof item.label === 'string'
            ? item.label
            : undefined
      ) === handleId)
      const fallbackTargetId = handleId === 'yes'
        ? (selectedNodeData.branches?.yes || selectedNodeData.branches?.true || '')
        : (selectedNodeData.branches?.no || selectedNodeData.branches?.false || '')
      const targetId = edge?.target || fallbackTargetId
      if (!targetId) return null
      const targetNode = nodes.find((node) => node.id === targetId)
      const targetData = targetNode?.data as WorkflowNodeData | undefined
      return {
        id: targetId,
        label: targetData?.label || targetId,
        agentId: (targetData as any)?.agentId || '',
      }
    }
    return { yes: resolveTarget('yes'), no: resolveTarget('no') }
  }, [edges, nodes, selectedNode])

  useEffect(() => {
    if (!selectedNode) return
    const selectedData = selectedNode.data as WorkflowNodeData
    if ((selectedData.type !== 'join' && selectedData.type !== 'parallel') || selectedData.joinMode !== 'xor') return

    const preferredSourceNodeId = (selectedData as any).preferredSourceNodeId || ''
    if (!preferredSourceNodeId) return
    if (selectedNodeUpstreamOptions.some((option) => option.id === preferredSourceNodeId)) return

    updateSelectedNode({ preferredSourceNodeId: selectedNodeUpstreamOptions[0]?.id || '' } as Partial<WorkflowNodeData>)
  }, [selectedNode, selectedNodeUpstreamOptions])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <GitBranch className="h-4 w-4 text-cyber-amber" />
          {workflows.length} 个工作流
        </h3>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm" className="border border-cyber-amber/30 bg-cyber-amber/20 text-cyber-amber hover:bg-cyber-amber/30">
              <Plus className="mr-1 h-3.5 w-3.5" /> 新工作流
            </Button>
          </DialogTrigger>
          <DialogContent className="border-white/10 bg-cyber-surface text-white">
            <DialogHeader><DialogTitle>新建工作流</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="工作流名称" className="border-white/10 bg-cyber-bg text-white" onKeyDown={(e) => e.key === 'Enter' && void handleCreate()} autoFocus />
              <Button onClick={() => void handleCreate()} className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber" disabled={!newName.trim()}>创建</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {workflows.length === 0 && !selected ? (
        <div className="py-12 text-center">
          <GitBranch className="mx-auto mb-3 h-12 w-12 text-white/10" />
          <p className="text-white/20">暂无工作流，点击“新工作流”开始创建</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {workflows.map((workflow) => (
              <button
                key={workflow.id}
                onClick={() => loadWorkflow(workflow)}
                className={cn(
                  'flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition-all',
                  selected?.id === workflow.id
                    ? 'border border-cyber-amber/30 bg-cyber-amber/15 text-white'
                    : 'border border-transparent text-white/50 hover:bg-white/5'
                )}
              >
                <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-cyber-amber/60" />
                <span className="text-xs font-medium">{workflow.name}</span>
                <span className="text-[10px] text-white/30">{Object.keys(workflow.nodes).length} 节点</span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="flex h-[520px] overflow-hidden rounded-xl border border-white/10">
              <div className="relative h-full flex-1">
                <ReactFlow
                  nodes={executionDecorations.nodes}
                  edges={executionDecorations.edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onEdgeUpdateStart={handleEdgeUpdateStart}
                  onEdgeUpdate={handleEdgeUpdate}
                  onEdgeUpdateEnd={handleEdgeUpdateEnd}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onPaneClick={() => setSelectedNodeId(null)}
                  nodeTypes={nodeTypes}
                  defaultEdgeOptions={{ style: EDGE_STYLE, reconnectable: 'source' }}
                  edgesUpdatable
                  fitView
                  className="bg-cyber-bg"
                >
                  <Background color="#6366F120" gap={20} size={1} />
                  <Controls className="!bg-cyber-panel !border-white/10 !rounded-xl [&>button]:!bg-cyber-panel [&>button]:!border-white/10 [&>button]:!text-white/50" />
                  <MiniMap nodeColor="#6366F1" maskColor="#0F0F2390" className="!bg-cyber-panel !border-white/10 !rounded-xl" />

                  <Panel position="top-left" className="flex gap-2">
                    {WORKFLOW_NODE_BUTTONS.map(({ type, label, icon: Icon, hoverClassName, iconClassName }) => (
                      <button
                        key={type}
                        onClick={() => addNode(type)}
                        className={cn(
                          'glass flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/60 transition-all hover:text-white',
                          hoverClassName
                        )}
                      >
                        <Icon className={cn('h-3.5 w-3.5', iconClassName)} /> {label}
                      </button>
                    ))}
                  </Panel>

                  <Panel position="bottom-center" className="glass flex items-center gap-3 rounded-xl px-4 py-2">
                    <Button size="sm" onClick={() => void handleExecute()} disabled={execution?.status === 'running'} className="h-8 border border-cyber-green/30 bg-cyber-green/20 text-cyber-green hover:bg-cyber-green/30">
                      {execution?.status === 'running' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                      执行
                    </Button>
                    <Button size="sm" onClick={() => void handleStop()} disabled={!execution || execution.status !== 'running'} variant="destructive" className="h-8">
                      <Square className="mr-1 h-3.5 w-3.5" /> 停止
                    </Button>
                    <div className="h-5 w-px bg-white/10" />
                    <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="h-8 border border-cyber-purple/30 bg-cyber-purple/20 text-cyber-lavender">
                      {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                      保存
                    </Button>
                    {execution ? (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px]', execution.status === 'running' ? 'bg-cyber-green/20 text-cyber-green' : execution.status === 'completed' ? 'bg-cyber-blue/20 text-cyber-blue' : execution.status === 'failed' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/50')}>
                        {execution.status}
                      </span>
                    ) : null}
                  </Panel>
                </ReactFlow>
              </div>

              <div className="w-96 overflow-y-auto border-l border-white/5 bg-cyber-surface/30">
                <div className="border-b border-white/5 p-4">
                  <h3 className="text-sm font-semibold text-white">节点配置</h3>
                </div>
                <div className="space-y-4 p-4">
                  {selectedNode ? (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                          <Label className="text-xs text-white/60">节点名称</Label>
                          <Input value={(selectedNode.data as WorkflowNodeData).label || ''} onChange={(event) => updateSelectedNode({ label: event.target.value } as Partial<WorkflowNodeData>)} placeholder="节点名称" className="border-white/10 bg-cyber-bg text-white" />
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="mt-6 h-9 w-9"
                          onClick={handleDeleteSelectedNode}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {(selectedNode.data as WorkflowNodeData).type === 'task' ? (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">Agent ID</Label>
                            <Select value={(selectedNode.data as any).agentId || '__manual__'} onValueChange={(value) => updateSelectedNode({ agentId: value === '__manual__' ? '' : value } as Partial<WorkflowNodeData>)}>
                              <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                <SelectValue placeholder="选择一个 Agent" />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                {agents.map((agent) => (
                                  <SelectItem key={agent.id} value={agent.id}>
                                    {agent.name || agent.id} ({agent.id})
                                  </SelectItem>
                                ))}
                                <SelectItem value="__manual__">手动输入</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {(!(selectedNode.data as any).agentId || !agents.some((agent) => agent.id === (selectedNode.data as any).agentId)) ? (
                            <div className="space-y-2">
                              <Label className="text-xs text-white/60">手动填写 Agent ID</Label>
                              <Input value={(selectedNode.data as any).agentId || ''} onChange={(event) => updateSelectedNode({ agentId: event.target.value } as Partial<WorkflowNodeData>)} placeholder="例如：worker-b" className="border-white/10 bg-cyber-bg text-white" />
                            </div>
                          ) : null}
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">任务内容</Label>
                            <textarea value={(selectedNode.data as any).task || ''} onChange={(event) => updateSelectedNode({ task: event.target.value } as Partial<WorkflowNodeData>)} placeholder="要发送给 Agent 的任务内容" className="min-h-28 w-full resize-y rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">超时时间（秒）</Label>
                            <Input type="number" min={1} value={(selectedNode.data as any).timeoutSeconds ?? 60} onChange={(event) => updateSelectedNode({ timeoutSeconds: Number(event.target.value || 60) } as Partial<WorkflowNodeData>)} placeholder="timeoutSeconds" className="border-white/10 bg-cyber-bg text-white" />
                          </div>
                          <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/5 bg-cyber-bg/30 p-3">
                            <label className="flex items-center gap-2 text-xs text-white/70">
                              <input type="checkbox" checked={(selectedNode.data as any).requireResponse ?? true} onChange={(event) => updateSelectedNode({ requireResponse: event.target.checked } as Partial<WorkflowNodeData>)} />
                              要求有文本输出
                            </label>
                            <label className="flex items-center gap-2 text-xs text-white/70">
                              <input type="checkbox" checked={(selectedNode.data as any).requireArtifacts ?? false} onChange={(event) => updateSelectedNode({ requireArtifacts: event.target.checked } as Partial<WorkflowNodeData>)} />
                              要求有产物
                            </label>
                            <div className="space-y-2">
                              <Label className="text-[11px] text-white/45">最小输出长度</Label>
                              <Input type="number" min={0} value={(selectedNode.data as any).minOutputLength ?? 1} onChange={(event) => updateSelectedNode({ minOutputLength: Number(event.target.value || 0) } as Partial<WorkflowNodeData>)} placeholder="1" className="border-white/10 bg-cyber-bg text-white" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[11px] text-white/45">成功关键字</Label>
                              <Input value={(selectedNode.data as any).successPattern || ''} onChange={(event) => updateSelectedNode({ successPattern: event.target.value } as Partial<WorkflowNodeData>)} placeholder="例如：DONE" className="border-white/10 bg-cyber-bg text-white" />
                            </div>
                          </div>
                        </>
                      ) : null}
                      {(selectedNode.data as WorkflowNodeData).type === 'condition' ? (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">条件表达式</Label>
                            <textarea value={(selectedNode.data as any).expression || ''} onChange={(event) => updateSelectedNode({ expression: event.target.value } as Partial<WorkflowNodeData>)} placeholder="例如：context.lastTask.status === 'completed'" className="min-h-24 w-full resize-y rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none" />
                          </div>
                          <div className="space-y-3 rounded-lg border border-white/5 bg-cyber-bg/30 p-3">
                            <Label className="text-xs text-white/60">条件分支</Label>
                            <div className="space-y-2">
                              <Label className="text-[11px] text-white/45">命中分支</Label>
                              <div className="rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white/80">
                                {selectedConditionConnections.yes ? `${selectedConditionConnections.yes.label}${selectedConditionConnections.yes.agentId ? ` · ${selectedConditionConnections.yes.agentId}` : ''}` : '未连接'}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[11px] text-white/45">未命中分支</Label>
                              <div className="rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white/80">
                                {selectedConditionConnections.no ? `${selectedConditionConnections.no.label}${selectedConditionConnections.no.agentId ? ` · ${selectedConditionConnections.no.agentId}` : ''}` : '未连接'}
                              </div>
                            </div>
                          </div>
                          <p className="text-xs text-white/40">条件分支完全由连线决定：绿色 yes 口是命中，红色 no 口是未命中，这里只读展示。</p>
                        </>
                      ) : null}
                      {(selectedNode.data as WorkflowNodeData).type === 'approval' ? (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">审批模式</Label>
                            <Select
                              value={String((selectedNode.data as any).approvalMode || 'human')}
                              onValueChange={(value) => updateSelectedNode({
                                approvalMode: value as 'human' | 'agent',
                                approver: value === 'agent'
                                  ? (String((selectedNode.data as any).approverAgentId || '').trim() || agents[0]?.id || '')
                                  : 'web-user',
                                approverAgentId: value === 'agent'
                                  ? (String((selectedNode.data as any).approverAgentId || '').trim() || agents[0]?.id || '')
                                  : '',
                              } as Partial<WorkflowNodeData>)}
                            >
                              <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                <SelectValue placeholder="选择审批模式" />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                <SelectItem value="human">人工审批</SelectItem>
                                <SelectItem value="agent">AI 审批</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {String((selectedNode.data as any).approvalMode || 'human') === 'agent' ? (
                            <div className="space-y-2">
                              <Label className="text-xs text-white/60">审批 Agent</Label>
                              <Select
                                value={String((selectedNode.data as any).approverAgentId || '__none__')}
                                onValueChange={(value) => updateSelectedNode({
                                  approverAgentId: value === '__none__' ? '' : value,
                                  approver: value === '__none__' ? '' : value,
                                } as Partial<WorkflowNodeData>)}
                              >
                                <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                  <SelectValue placeholder="选择审批 Agent" />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                  <SelectItem value="__none__">未选择</SelectItem>
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                      {agent.name || agent.id} ({agent.id})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-white/40">执行到此节点时，会把审批请求发给指定 Agent，由它返回通过或驳回。</p>
                            </div>
                          ) : (
                            <p className="text-xs text-white/40">执行到此节点时，工作流会暂停，等待人工在通知中心或审批接口中处理。</p>
                          )}
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">审批标题</Label>
                            <Input value={(selectedNode.data as any).title || ''} onChange={(event) => updateSelectedNode({ title: event.target.value } as Partial<WorkflowNodeData>)} placeholder="审批标题" className="border-white/10 bg-cyber-bg text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">审批说明</Label>
                            <textarea value={(selectedNode.data as any).description || ''} onChange={(event) => updateSelectedNode({ description: event.target.value } as Partial<WorkflowNodeData>)} placeholder="审批说明" className="min-h-24 w-full resize-y rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">超时时间（分钟）</Label>
                            <Input type="number" min={1} value={(selectedNode.data as any).timeoutMinutes ?? 30} onChange={(event) => updateSelectedNode({ timeoutMinutes: Number(event.target.value || 30) } as Partial<WorkflowNodeData>)} placeholder="timeoutMinutes" className="border-white/10 bg-cyber-bg text-white" />
                          </div>
                          <p className="text-xs text-white/40">
                            {String((selectedNode.data as any).approvalMode || 'human') === 'agent'
                              ? 'AI 审批会向指定 Agent 发出结构化审批请求；若返回无法解析，则保留为人工待处理。'
                              : '人工审批会生成待办通知，等待你手动通过或驳回。'}
                          </p>
                        </>
                      ) : null}
                      {((selectedNode.data as WorkflowNodeData).type === 'join' || (selectedNode.data as WorkflowNodeData).type === 'parallel') ? (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">汇合模式</Label>
                            <Select
                              value={(selectedNode.data as any).joinMode || 'and'}
                              onValueChange={(value) => updateSelectedNode({ joinMode: value as any, waitForAll: value === 'and', preferredSourceNodeId: value === 'xor' ? (selectedNodeUpstreamOptions[0]?.id || '') : undefined } as Partial<WorkflowNodeData>)}
                            >
                              <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                <SelectValue placeholder="选择汇合模式" />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                <SelectItem value="and">AND：全部到齐后继续</SelectItem>
                                <SelectItem value="or">OR：任一到达即继续</SelectItem>
                                <SelectItem value="xor">XOR：仅指定上游可放行</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {((selectedNode.data as any).joinMode || 'and') === 'xor' ? (
                            <div className="space-y-2">
                              <Label className="text-xs text-white/60">允许放行的上游节点</Label>
                              <Select
                                value={(selectedNode.data as any).preferredSourceNodeId || selectedNodeUpstreamOptions[0]?.id || '__none__'}
                                onValueChange={(value) => updateSelectedNode({ preferredSourceNodeId: value === '__none__' ? '' : value } as Partial<WorkflowNodeData>)}
                              >
                                <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                  <SelectValue placeholder="选择一个上游节点" />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                  {selectedNodeUpstreamOptions.length ? selectedNodeUpstreamOptions.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      {option.label} ({option.id})
                                    </SelectItem>
                                  )) : <SelectItem value="__none__">暂无上游节点</SelectItem>}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null}
                          <p className="text-xs text-white/40">普通节点接出多条线会并行分发；汇合节点根据这里的逻辑门决定何时放行下游。</p>
                        </>
                      ) : null}
                      {(selectedNode.data as WorkflowNodeData).type === 'meeting' ? (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">会议类型</Label>
                            <Select value={(selectedNode.data as any).meetingType || 'brainstorm'} onValueChange={(value) => updateSelectedNode({ meetingType: value } as Partial<WorkflowNodeData>)}>
                              <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                <SelectValue placeholder="选择会议类型" />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                {MEETING_WORKFLOW_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>{MEETING_TYPE_LABELS[type]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">会议议题</Label>
                            <Input value={(selectedNode.data as any).topic || ''} onChange={(event) => updateSelectedNode({ topic: event.target.value } as Partial<WorkflowNodeData>)} placeholder="会议要讨论的主题" className="border-white/10 bg-cyber-bg text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">议题描述</Label>
                            <textarea value={(selectedNode.data as any).topicDescription || ''} onChange={(event) => updateSelectedNode({ topicDescription: event.target.value } as Partial<WorkflowNodeData>)} placeholder="补充背景、目标和上下文" className="min-h-20 w-full resize-y rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">参与者 Agent ID（逗号分隔）</Label>
                            <Input value={((selectedNode.data as any).participants || []).join(', ')} onChange={(event) => updateSelectedNode({ participants: event.target.value.split(',').map((item: string) => item.trim()).filter(Boolean) } as Partial<WorkflowNodeData>)} placeholder="agent-1, agent-2, agent-3" className="border-white/10 bg-cyber-bg text-white" />
                            {agents.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {agents.map((agent) => {
                                  const participants: string[] = (selectedNode.data as any).participants || []
                                  const isSelected = participants.includes(agent.id)
                                  return (
                                    <button
                                      key={agent.id}
                                      type="button"
                                      onClick={() => updateSelectedNode({
                                        participants: isSelected
                                          ? participants.filter((item) => item !== agent.id)
                                          : [...participants, agent.id],
                                      } as Partial<WorkflowNodeData>)}
                                      className={cn(
                                        'rounded border px-1.5 py-0.5 text-[10px] transition-all',
                                        isSelected
                                          ? 'border-purple-400/30 bg-purple-400/15 text-purple-200'
                                          : 'border-white/10 bg-white/5 text-white/45 hover:border-white/20'
                                      )}
                                    >
                                      {agent.name || agent.id}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">主持人 Agent</Label>
                            <Select value={(selectedNode.data as any).leadAgentId || '__auto__'} onValueChange={(value) => updateSelectedNode({ leadAgentId: value === '__auto__' ? undefined : value } as Partial<WorkflowNodeData>)}>
                              <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                <SelectValue placeholder="自动（Team Lead）" />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                <SelectItem value="__auto__">自动（Team Lead）</SelectItem>
                                {agents.map((agent) => (
                                  <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">Team ID（可选）</Label>
                            <Input value={(selectedNode.data as any).teamId || ''} onChange={(event) => updateSelectedNode({ teamId: event.target.value } as Partial<WorkflowNodeData>)} placeholder="留空则沿用工作流 Team" className="border-white/10 bg-cyber-bg text-white" />
                          </div>
                        </>
                      ) : null}
                      {(selectedNode.data as WorkflowNodeData).type === 'debate' ? (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">辩题</Label>
                            <Input value={(selectedNode.data as any).topic || ''} onChange={(event) => updateSelectedNode({ topic: event.target.value } as Partial<WorkflowNodeData>)} placeholder="需要辩论的问题" className="border-white/10 bg-cyber-bg text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">辩题描述</Label>
                            <textarea value={(selectedNode.data as any).topicDescription || ''} onChange={(event) => updateSelectedNode({ topicDescription: event.target.value } as Partial<WorkflowNodeData>)} placeholder="补充背景、规则和判断标准" className="min-h-20 w-full resize-y rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-xs text-white/60">正方 Agent</Label>
                              <Select value={((selectedNode.data as any).participants || [])[0] || '__none__'} onValueChange={(value) => {
                                const participants = [...((selectedNode.data as any).participants || ['', ''])]
                                participants[0] = value === '__none__' ? '' : value
                                updateSelectedNode({ participants } as Partial<WorkflowNodeData>)
                              }}>
                                <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                  <SelectValue placeholder="选择 Agent" />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                  <SelectItem value="__none__">未选择</SelectItem>
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-white/60">反方 Agent</Label>
                              <Select value={((selectedNode.data as any).participants || ['', ''])[1] || '__none__'} onValueChange={(value) => {
                                const participants = [...((selectedNode.data as any).participants || ['', ''])]
                                participants[1] = value === '__none__' ? '' : value
                                updateSelectedNode({ participants } as Partial<WorkflowNodeData>)
                              }}>
                                <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                  <SelectValue placeholder="选择 Agent" />
                                </SelectTrigger>
                                <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                  <SelectItem value="__none__">未选择</SelectItem>
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">最大回合数</Label>
                            <Select value={String((selectedNode.data as any).maxRounds || 3)} onValueChange={(value) => updateSelectedNode({ maxRounds: Number(value) } as Partial<WorkflowNodeData>)}>
                              <SelectTrigger className="w-24 border-white/10 bg-cyber-bg text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                {DEBATE_ROUND_OPTIONS.map((round) => (
                                  <SelectItem key={round} value={String(round)}>{round} 轮</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">裁判 Agent</Label>
                            <Select value={(selectedNode.data as any).judgeAgentId || '__auto__'} onValueChange={(value) => updateSelectedNode({ judgeAgentId: value === '__auto__' ? undefined : value } as Partial<WorkflowNodeData>)}>
                              <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
                                <SelectValue placeholder="自动（Team Lead）" />
                              </SelectTrigger>
                              <SelectContent className="border-white/10 bg-cyber-surface text-white">
                                <SelectItem value="__auto__">自动（Team Lead）</SelectItem>
                                {agents.map((agent) => (
                                  <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-white/60">Team ID（可选）</Label>
                            <Input value={(selectedNode.data as any).teamId || ''} onChange={(event) => updateSelectedNode({ teamId: event.target.value } as Partial<WorkflowNodeData>)} placeholder="留空则沿用工作流 Team" className="border-white/10 bg-cyber-bg text-white" />
                          </div>
                        </>
                      ) : null}
                    </>
                ) : (
                  <p className="text-sm text-white/35">点击画布节点后可编辑字段。</p>
                )}
              </div>

                <div className="space-y-4 border-t border-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">定时执行</h3>
                    <label className="flex items-center gap-2 text-xs text-white/60">
                      <input
                        type="checkbox"
                        checked={schedule.enabled}
                        onChange={(event) => setSchedule((current) => ({ ...current, enabled: event.target.checked }))}
                      />
                      启用
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-white/60">Cron 表达式</Label>
                    <Input
                      value={schedule.cron}
                      onChange={(event) => setSchedule((current) => ({ ...current, cron: event.target.value }))}
                      placeholder="例如：*/15 * * * *"
                      className="border-white/10 bg-cyber-bg text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-white/60">时区</Label>
                    <Input
                      value={schedule.timezone}
                      onChange={(event) => setSchedule((current) => ({ ...current, timezone: event.target.value }))}
                      placeholder="例如：Asia/Shanghai"
                      className="border-white/10 bg-cyber-bg text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-white/60">生效开始</Label>
                      <Input
                        type="datetime-local"
                        value={toDateTimeLocalValue(schedule.activeFrom)}
                        onChange={(event) => setSchedule((current) => ({ ...current, activeFrom: fromDateTimeLocalValue(event.target.value) }))}
                        className="border-white/10 bg-cyber-bg text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-white/60">生效截止</Label>
                      <Input
                        type="datetime-local"
                        value={toDateTimeLocalValue(schedule.activeUntil)}
                        onChange={(event) => setSchedule((current) => ({ ...current, activeUntil: fromDateTimeLocalValue(event.target.value) }))}
                        className="border-white/10 bg-cyber-bg text-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-white/5 bg-cyber-bg/30 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-white/60">每日时间段限制</Label>
                      <label className="flex items-center gap-2 text-[11px] text-white/50">
                        <input
                          type="checkbox"
                          checked={Boolean(schedule.window)}
                          onChange={(event) =>
                            setSchedule((current) => ({
                              ...current,
                              window: event.target.checked
                                ? { start: '09:00', end: '18:00', timezone: current.timezone || DEFAULT_WORKFLOW_TIMEZONE }
                                : null,
                            }))
                          }
                        />
                        启用时间段
                      </label>
                    </div>
                    {schedule.window ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-[11px] text-white/45">开始时间</Label>
                            <Input
                              type="time"
                              value={schedule.window.start}
                              onChange={(event) =>
                                setSchedule((current) => ({
                                  ...current,
                                  window: current.window ? { ...current.window, start: event.target.value } : null,
                                }))
                              }
                              className="border-white/10 bg-cyber-bg text-white"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[11px] text-white/45">结束时间</Label>
                            <Input
                              type="time"
                              value={schedule.window.end}
                              onChange={(event) =>
                                setSchedule((current) => ({
                                  ...current,
                                  window: current.window ? { ...current.window, end: event.target.value } : null,
                                }))
                              }
                              className="border-white/10 bg-cyber-bg text-white"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] text-white/45">时间段时区</Label>
                          <Input
                            value={schedule.window.timezone || schedule.timezone}
                            onChange={(event) =>
                              setSchedule((current) => ({
                                ...current,
                                window: current.window ? { ...current.window, timezone: event.target.value } : null,
                              }))
                            }
                            placeholder="例如：Asia/Shanghai"
                            className="border-white/10 bg-cyber-bg text-white"
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-white/40">关闭后仅按 Cron 触发，不限制每天的可执行时段。</p>
                    )}
                  </div>
                  <p className="text-xs text-white/40">启用后由后端调度器轮询执行；若当前已有运行中的流程，会跳过该次触发。</p>
                </div>

                <div className="space-y-3 border-t border-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">执行日志</h3>
                    {execution ? <span className="text-[10px] text-white/35">{execution.id}</span> : null}
                  </div>
                  {logs.length ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {logs.map((log, index) => (
                        <div key={`${log.timestamp}-${index}`} className="rounded-lg border border-white/5 bg-cyber-bg/40 p-3">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className={cn('text-[10px] uppercase', log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-yellow-300' : 'text-cyber-green')}>
                              {log.level}
                            </span>
                            <span className="text-[10px] text-white/30">{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="mb-1 text-[11px] text-white/50">节点: {log.nodeId}</p>
                          <p className="whitespace-pre-wrap text-sm text-white/80">{log.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white/35">执行后会在这里显示真实日志和失败原因。</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

