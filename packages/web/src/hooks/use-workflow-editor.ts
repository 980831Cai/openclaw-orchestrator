import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import type {
  AgentListItem,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowNodeData,
} from '@/types'

// ─── Conversion helpers ───

function toFlowNodes(workflow: WorkflowDefinition): Node<WorkflowNodeData>[] {
  return Object.entries(workflow.nodes).map(([id, data], index) => ({
    id,
    type: data.type === 'parallel' ? 'join' : data.type,
    position: data.position ?? { x: 120 + index * 40, y: 120 + index * 30 },
    data:
      data.type === 'parallel'
        ? { ...data, type: 'join' as const, label: data.label || '汇合节点', joinMode: data.joinMode || 'and' }
        : data,
  }))
}

function toFlowEdges(workflow: WorkflowDefinition): Edge[] {
  return workflow.edges.map((edge, index) => ({
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.condition,
    sourceHandle:
      edge.condition && edge.condition !== 'default' ? edge.condition : undefined,
  }))
}

function serializeNodes(nodes: Node<WorkflowNodeData>[]): Record<string, WorkflowNodeData> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        ...node.data,
        position: node.position,
      },
    ])
  )
}

function serializeEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    condition:
      typeof edge.label === 'string' ? edge.label : edge.sourceHandle || undefined,
  }))
}

// ─── Hook ───

export function useWorkflowEditor() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [saving, setSaving] = useState(false)
  const [execution, setExecution] = useState<WorkflowExecution | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTeamId, setNewTeamId] = useState('default')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])

  const selectedWorkflowId = selected?.id ?? null

  const selectedNode = useMemo(
    () => (nodes.find((n) => n.id === selectedNodeId) ?? null) as Node<WorkflowNodeData> | null,
    [nodes, selectedNodeId]
  )

  const selectedNodeUpstreamOptions = useMemo(() => {
    if (!selectedNodeId) return []
    const upstreamIds = edges
      .filter((e) => e.target === selectedNodeId)
      .map((e) => e.source)
    return upstreamIds.map((sourceId) => {
      const sourceNode = nodes.find((n) => n.id === sourceId)
      const sourceData = sourceNode?.data as WorkflowNodeData | undefined
      return {
        id: sourceId,
        label: sourceData?.label || sourceId,
        type: sourceData?.type || 'task',
      }
    })
  }, [edges, nodes, selectedNodeId])

  // ─── Data loading ───

  const loadWorkflow = useCallback(
    (workflow: WorkflowDefinition) => {
      setSelected(workflow)
      setNodes(toFlowNodes(workflow))
      setEdges(toFlowEdges(workflow))
      setSelectedNodeId(null)
      setExecution(null)
    },
    [setEdges, setNodes]
  )

  const fetchWorkflows = useCallback(async () => {
    try {
      const data = await api.get<WorkflowDefinition[]>('/workflows')
      setWorkflows(data)
      if (!selectedWorkflowId && data[0]) {
        loadWorkflow(data[0])
      } else if (selectedWorkflowId) {
        const next = data.find((w) => w.id === selectedWorkflowId)
        if (next) {
          setSelected(next)
          setNodes(toFlowNodes(next))
          setEdges(toFlowEdges(next))
          setSelectedNodeId((cur) => (cur && next.nodes[cur] ? cur : null))
        }
      }
    } catch (error) {
      toast({
        title: '工作流加载失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    }
  }, [loadWorkflow, selectedWorkflowId, setEdges, setNodes])

  const refreshExecution = useCallback(async (executionId: string) => {
    try {
      const data = await api.get<WorkflowExecution>(`/executions/${executionId}`)
      setExecution(data)
    } catch {
      // ignore polling errors
    }
  }, [])

  useEffect(() => { fetchWorkflows() }, [fetchWorkflows])

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<AgentListItem[]>('/agents')
        setAgents(data)
      } catch { /* keep manual input fallback */ }
    })()
  }, [])

  useEffect(() => {
    if (!execution || !['running', 'waiting_approval'].includes(execution.status)) return undefined
    const timer = window.setInterval(() => { void refreshExecution(execution.id) }, 2500)
    return () => window.clearInterval(timer)
  }, [execution, refreshExecution])

  // ─── Actions ───

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((cur) =>
        addEdge({ ...connection, label: connection.sourceHandle ?? undefined }, cur)
      )
    },
    [setEdges]
  )

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.put<WorkflowDefinition>(`/workflows/${selected.id}`, {
        name: selected.name,
        nodes: serializeNodes(nodes as Node<WorkflowNodeData>[]),
        edges: serializeEdges(edges),
      })
      setSelected(updated)
      setWorkflows((cur) => cur.map((w) => (w.id === updated.id ? updated : w)))
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

  const handleExecute = async () => {
    if (!selected) return
    try {
      const nextExecution = await api.post<WorkflowExecution>(
        `/workflows/${selected.id}/execute`
      )
      setExecution(nextExecution)
      window.setTimeout(() => { void refreshExecution(nextExecution.id) }, 800)
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

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const workflow = await api.post<WorkflowDefinition>('/workflows', {
        teamId: newTeamId.trim() || 'default',
        name: newName.trim(),
        nodes: {},
        edges: [],
      })
      setWorkflows((cur) => [workflow, ...cur])
      loadWorkflow(workflow)
      setNewName('')
      toast({ title: '工作流已创建' })
    } catch (error) {
      toast({
        title: '创建失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  const addNode = (type: WorkflowNodeData['type']) => {
    const nodeId = `${type}-${Date.now()}`
    const baseData: Record<WorkflowNodeData['type'], WorkflowNodeData> = {
      task: { type: 'task', label: '任务节点', agentId: '', task: '', timeoutSeconds: 60, position: { x: 240, y: 120 } },
      condition: { type: 'condition', label: '条件节点', expression: 'true', branches: { yes: '', no: '' }, position: { x: 240, y: 120 } },
      approval: { type: 'approval', label: '审批节点', title: '请确认', description: '', approver: 'web-user', timeoutMinutes: 30, onTimeout: 'reject', position: { x: 240, y: 120 } },
      join: { type: 'join', label: '汇合节点', joinMode: 'and', waitForAll: true, position: { x: 240, y: 120 } },
      parallel: { type: 'parallel', label: '汇合节点', joinMode: 'and', waitForAll: true, position: { x: 240, y: 120 } },
      meeting: { type: 'meeting', label: '会议节点', meetingType: 'brainstorm', topic: '', participants: [], position: { x: 240, y: 120 } },
      debate: { type: 'debate', label: '辩论节点', topic: '', participants: [], maxRounds: 3, position: { x: 240, y: 120 } },
    }

    const nextNode: Node<WorkflowNodeData> = {
      id: nodeId,
      type,
      position: { x: 180 + nodes.length * 30, y: 100 + nodes.length * 20 },
      data: baseData[type],
    }

    setNodes((cur) => [...cur, nextNode])
    setSelectedNodeId(nodeId)
  }

  const updateSelectedNode = (patch: Partial<WorkflowNodeData>) => {
    if (!selectedNode) return
    setNodes((cur) =>
      cur.map((node) =>
        node.id === selectedNode.id
          ? { ...node, data: { ...node.data, ...patch } as WorkflowNodeData }
          : node
      )
    )
  }

  return {
    // State
    workflows,
    selected,
    nodes,
    edges,
    saving,
    execution,
    creating,
    setCreating,
    newName,
    setNewName,
    newTeamId,
    setNewTeamId,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    selectedNodeUpstreamOptions,
    agents,

    // ReactFlow handlers
    onNodesChange,
    onEdgesChange,
    onConnect,

    // Actions
    loadWorkflow,
    handleSave,
    handleExecute,
    handleStop,
    handleCreate,
    addNode,
    updateSelectedNode,
  }
}
