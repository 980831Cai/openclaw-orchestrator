import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { GitBranch, Loader2, Merge, Play, Plus, Save, Square, Split, UserCheck, Zap, MessageSquare, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/brand/EmptyState'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { TaskNodeComponent } from '@/components/workflow/TaskNode'
import { ConditionNodeComponent } from '@/components/workflow/ConditionNode'
import { ApprovalNodeComponent } from '@/components/workflow/ApprovalNode'
import { JoinNodeComponent } from '@/components/workflow/JoinNode'
import { MeetingNodeComponent } from '@/components/workflow/MeetingNode'
import { DebateNodeComponent } from '@/components/workflow/DebateNode'
import { MEETING_TYPE_LABELS } from '@/types'
import type { WorkflowDefinition, WorkflowExecution, WorkflowNodeData, WorkflowEdge, AgentListItem, MeetingType } from '@/types'

const nodeTypes = {
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
  parallel: JoinNodeComponent,
  approval: ApprovalNodeComponent,
  meeting: MeetingNodeComponent,
  debate: DebateNodeComponent,
}

function toFlowNodes(workflow: WorkflowDefinition): Node[] {
  return Object.entries(workflow.nodes).map(([id, data], index) => ({
    id,
    type: data.type === 'parallel' ? 'join' : data.type,
    position: data.position ?? { x: 120 + index * 40, y: 120 + index * 30 },
    data: data.type === 'parallel'
      ? { ...data, type: 'join', label: data.label || '汇合节点', joinMode: data.joinMode || 'and' }
      : data,
  }))
}

function toFlowEdges(workflow: WorkflowDefinition): Edge[] {
  return workflow.edges.map((edge, index) => ({
    id: `${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.condition,
    sourceHandle: edge.condition && edge.condition !== 'default' ? edge.condition : undefined,
  }))
}

function serializeNodes(nodes: Node[]): Record<string, WorkflowNodeData> {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        ...(node.data as WorkflowNodeData),
        position: node.position,
      },
    ])
  )
}

function serializeEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    condition: typeof edge.label === 'string' ? edge.label : edge.sourceHandle || undefined,
  }))
}

export function WorkflowEditorPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [saving, setSaving] = useState(false)
  const [execution, setExecution] = useState<WorkflowExecution | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTeamId, setNewTeamId] = useState('default')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const selectedWorkflowId = selected?.id ?? null

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId])
  const selectedNodeUpstreamOptions = useMemo(() => {
    if (!selectedNodeId) return []
    const upstreamIds = edges.filter((edge) => edge.target === selectedNodeId).map((edge) => edge.source)
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

  const loadWorkflow = useCallback((workflow: WorkflowDefinition) => {
    setSelected(workflow)
    setNodes(toFlowNodes(workflow))
    setEdges(toFlowEdges(workflow))
    setSelectedNodeId(null)
    setExecution(null)
  }, [setEdges, setNodes])

  const fetchWorkflows = useCallback(async () => {
    try {
      const data = await api.get<WorkflowDefinition[]>('/workflows')
      setWorkflows(data)
      if (!selectedWorkflowId && data[0]) {
        loadWorkflow(data[0])
      } else if (selectedWorkflowId) {
        const next = data.find((workflow) => workflow.id === selectedWorkflowId)
        if (next) {
          setSelected(next)
          setNodes(toFlowNodes(next))
          setEdges(toFlowEdges(next))
          setSelectedNodeId((current) => (current && next.nodes[current] ? current : null))
        }
      }
    } catch (error) {
      toast({ title: '工作流加载失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }, [loadWorkflow, selectedWorkflowId, setEdges, setNodes])

  const refreshExecution = useCallback(async (executionId: string) => {
    try {
      const data = await api.get<WorkflowExecution>(`/executions/${executionId}`)
      setExecution(data)
    } catch {
      // ignore polling errors, the next tick may succeed
    }
  }, [])

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  useEffect(() => {
    const fetchAgentOptions = async () => {
      try {
        const data = await api.get<AgentListItem[]>('/agents')
        setAgents(data)
      } catch {
        // keep manual input fallback available even if agent list fails
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

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, label: connection.sourceHandle ?? undefined }, current))
  }, [setEdges])

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await api.put<WorkflowDefinition>(`/workflows/${selected.id}`, {
        name: selected.name,
        nodes: serializeNodes(nodes),
        edges: serializeEdges(edges),
      })
      setSelected(updated)
      setWorkflows((current) => current.map((workflow) => (workflow.id === updated.id ? updated : workflow)))
      toast({ title: '工作流已保存' })
    } catch (error) {
      toast({ title: '保存失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
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
      toast({ title: '执行失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }

  const handleStop = async () => {
    if (!selected || !execution) return
    try {
      await api.post(`/workflows/${selected.id}/stop`, { executionId: execution.id })
      await refreshExecution(execution.id)
      toast({ title: '已发送停止请求' })
    } catch (error) {
      toast({ title: '停止失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const workflow = await api.post<WorkflowDefinition>('/workflows', { teamId: newTeamId.trim() || 'default', name: newName.trim(), nodes: {}, edges: [] })
      setWorkflows((current) => [workflow, ...current])
      loadWorkflow(workflow)
      setNewName('')
      toast({ title: '工作流已创建' })
    } catch (error) {
      toast({ title: '创建失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
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

    const nextNode: Node = {
      id: nodeId,
      type,
      position: { x: 180 + nodes.length * 30, y: 100 + nodes.length * 20 },
      data: baseData[type],
    }

    setNodes((current) => [...current, nextNode])
    setSelectedNodeId(nodeId)
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

  const updateConditionBranch = (branchKey: string, value: string) => {
    if (!selectedNode || (selectedNode.data as WorkflowNodeData).type !== 'condition') return
    const currentBranches = { ...(((selectedNode.data as any).branches || {}) as Record<string, string>) }
    currentBranches[branchKey] = value
    updateSelectedNode({ branches: currentBranches } as Partial<WorkflowNodeData>)
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Sidebar: Workflow list ── */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-cyber-surface/20">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-white font-bold text-sm flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-cyber-amber" />
              工作流
            </h2>
            <p className="text-white/20 text-[10px] mt-0.5">编排 Agent 协作任务</p>
          </div>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/30 hover:text-white cursor-pointer">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/10">
              <DialogHeader><DialogTitle className="text-white">新建工作流</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="工作流名称"
                  className="bg-cyber-bg border-white/10 text-white"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <Input
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  placeholder="Team ID（默认 default）"
                  className="bg-cyber-bg border-white/10 text-white"
                />
                <Button onClick={handleCreate} className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber" disabled={creating || !newName.trim()}>
                  {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  创建
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {workflows.length === 0 ? (
            <EmptyState scene="no-workflows" className="py-8" />
          ) : (
            workflows.map((wf, i) => (
              <button
                key={wf.id}
                onClick={() => loadWorkflow(wf)}
                className={cn(
                  'w-full flex items-center gap-2 p-3 rounded-xl transition-all cursor-pointer text-left animate-fade-in group',
                  selected?.id === wf.id
                    ? 'cartoon-card border-cyber-amber/30'
                    : 'hover:bg-white/5 border-2 border-transparent'
                )}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                  selected?.id === wf.id ? 'bg-cyber-amber/15' : 'bg-white/5'
                )}>
                  <GitBranch className={cn(
                    'w-3.5 h-3.5 transition-colors',
                    selected?.id === wf.id ? 'text-cyber-amber' : 'text-white/25'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate group-hover:text-white/90">{wf.name}</p>
                  <p className="text-white/20 text-[10px]">{Object.keys(wf.nodes).length} 节点</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <EmptyState
              scene="no-workflows"
              title="选择或创建工作流"
              description="从左侧列表选择工作流开始编辑，或创建一个新的"
            />
          </div>
        ) : (
          <div className="flex h-full">
            <div className="flex-1 h-full relative">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                nodeTypes={nodeTypes}
                fitView
                className="bg-cyber-bg"
              >
                <Background color="#6366F110" gap={20} size={1} />
                <Controls className="!bg-cyber-panel/90 !border-white/10 !rounded-xl [&>button]:!bg-cyber-panel [&>button]:!border-white/10 [&>button]:!text-white/50 !backdrop-blur-sm" />
                <MiniMap nodeColor="#6366F1" maskColor="#0F0F2390" className="!bg-cyber-panel/90 !border-white/10 !rounded-xl !backdrop-blur-sm" />

                {/* Top toolbar — cartoon-card style */}
                <Panel position="top-left" className="flex gap-2">
                  <button
                    onClick={() => addNode('task')}
                    className="cartoon-card flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white transition-all cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-cyber-blue" /> 任务
                  </button>
                  <button
                    onClick={() => addNode('condition')}
                    className="cartoon-card flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white transition-all cursor-pointer"
                  >
                    <Split className="w-3.5 h-3.5 text-cyber-amber" /> 条件
                  </button>
                  <button
                    onClick={() => addNode('approval')}
                    className="cartoon-card flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white transition-all cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-yellow-400" /> 审批
                  </button>
                  <button onClick={() => addNode('join')} className="cartoon-card flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white hover:border-cyber-green/30 transition-all cursor-pointer">
                    <Merge className="w-3.5 h-3.5 text-cyber-green" /> 汇合
                  </button>
                  <button
                    onClick={() => addNode('meeting')}
                    className="cartoon-card flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white hover:border-purple-400/30 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-purple-400" /> 会议
                  </button>
                  <button
                    onClick={() => addNode('debate')}
                    className="cartoon-card flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white hover:border-orange-400/30 transition-all cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5 text-orange-400" /> 辩论
                  </button>
                </Panel>

                {/* Bottom controls — cartoon-card style */}
                <Panel position="bottom-center" className="flex items-center gap-3 cartoon-card px-4 py-2.5">
                  <Button
                    size="sm"
                    onClick={handleExecute}
                    disabled={execution?.status === 'running'}
                    className="bg-cyber-green/15 text-cyber-green border border-cyber-green/25 hover:bg-cyber-green/25 h-8 rounded-lg"
                  >
                    {execution?.status === 'running'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      : <Play className="w-3.5 h-3.5 mr-1" />
                    }
                    执行
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleStop}
                    disabled={!execution || execution.status !== 'running'}
                    variant="destructive"
                    className="h-8 rounded-lg"
                  >
                    <Square className="w-3.5 h-3.5 mr-1" /> 停止
                  </Button>
                  <div className="w-px h-5 bg-white/8" />
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-cyber-purple/15 text-cyber-lavender border border-cyber-purple/25 hover:bg-cyber-purple/25 h-8 rounded-lg"
                  >
                    {saving
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      : <Save className="w-3.5 h-3.5 mr-1" />
                    }
                    保存
                  </Button>
                  {execution && (
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border',
                      execution.status === 'running'
                        ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/20 animate-pulse'
                        : execution.status === 'completed'
                          ? 'bg-cyber-blue/10 text-cyber-blue border-cyber-blue/20'
                          : execution.status === 'failed'
                            ? 'bg-red-500/10 text-red-300 border-red-500/20'
                            : 'bg-white/5 text-white/40 border-white/10'
                    )}>
                      {execution.status === 'running' ? '运行中' : execution.status === 'completed' ? '已完成' : execution.status === 'failed' ? '失败' : execution.status}
                    </span>
                  )}
                </Panel>
              </ReactFlow>
            </div>

            <div className="w-96 border-l border-white/5 bg-cyber-surface/30 overflow-y-auto">
              <div className="p-4 border-b border-white/5">
                <h3 className="text-white font-semibold text-sm">节点配置</h3>
              </div>
              <div className="p-4 space-y-4">
                {selectedNode ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs text-white/60">节点名称</Label>
                      <Input value={(selectedNode.data as WorkflowNodeData).label || ''} onChange={(event) => updateSelectedNode({ label: event.target.value } as Partial<WorkflowNodeData>)} placeholder="节点名称" className="bg-cyber-bg border-white/10 text-white" />
                    </div>
                    {(selectedNode.data as WorkflowNodeData).type === 'task' ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">Agent ID</Label>
                          <Select value={(selectedNode.data as any).agentId || '__manual__'} onValueChange={(value) => updateSelectedNode({ agentId: value === '__manual__' ? '' : value } as Partial<WorkflowNodeData>)}>
                            <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                              <SelectValue placeholder="选择一个 Agent" />
                            </SelectTrigger>
                            <SelectContent className="bg-cyber-panel border-white/10 text-white">
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
                            <Input value={(selectedNode.data as any).agentId || ''} onChange={(event) => updateSelectedNode({ agentId: event.target.value } as Partial<WorkflowNodeData>)} placeholder="例如：worker-b" className="bg-cyber-bg border-white/10 text-white" />
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">任务内容</Label>
                          <textarea value={(selectedNode.data as any).task || ''} onChange={(event) => updateSelectedNode({ task: event.target.value } as Partial<WorkflowNodeData>)} placeholder="要发送给 Agent 的任务内容" className="w-full min-h-28 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">超时时间（秒）</Label>
                          <Input type="number" min={1} value={(selectedNode.data as any).timeoutSeconds ?? 60} onChange={(event) => updateSelectedNode({ timeoutSeconds: Number(event.target.value || 60) } as Partial<WorkflowNodeData>)} placeholder="timeoutSeconds" className="bg-cyber-bg border-white/10 text-white" />
                        </div>
                      </>
                    ) : null}
                    {(selectedNode.data as WorkflowNodeData).type === 'condition' ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">条件表达式</Label>
                          <textarea value={(selectedNode.data as any).expression || ''} onChange={(event) => updateSelectedNode({ expression: event.target.value } as Partial<WorkflowNodeData>)} placeholder="例如：latest.status == 'sent'" className="w-full min-h-24 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y" />
                        </div>
                        <div className="space-y-3 rounded-lg border border-white/5 bg-cyber-bg/30 p-3">
                          <Label className="text-xs text-white/60">条件分支</Label>
                          <div className="space-y-2">
                            <Label className="text-[11px] text-white/45">yes 分支目标节点 ID</Label>
                            <Input value={(selectedNode.data as any).branches?.yes || ''} onChange={(event) => updateConditionBranch('yes', event.target.value)} placeholder="命中 yes 时跳到哪个节点" className="bg-cyber-bg border-white/10 text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[11px] text-white/45">no 分支目标节点 ID</Label>
                            <Input value={(selectedNode.data as any).branches?.no || ''} onChange={(event) => updateConditionBranch('no', event.target.value)} placeholder="命中 no 时跳到哪个节点" className="bg-cyber-bg border-white/10 text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[11px] text-white/45">default 分支目标节点 ID</Label>
                            <Input value={(selectedNode.data as any).branches?.default || ''} onChange={(event) => updateConditionBranch('default', event.target.value)} placeholder="表达式失败或未命中时走这里" className="bg-cyber-bg border-white/10 text-white" />
                          </div>
                        </div>
                        <p className="text-xs text-white/40">边上的标签或 source handle 会作为分支条件保存。</p>
                      </>
                    ) : null}
                    {(selectedNode.data as WorkflowNodeData).type === 'approval' ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">审批标题</Label>
                          <Input value={(selectedNode.data as any).title || ''} onChange={(event) => updateSelectedNode({ title: event.target.value } as Partial<WorkflowNodeData>)} placeholder="审批标题" className="bg-cyber-bg border-white/10 text-white" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">审批说明</Label>
                          <textarea value={(selectedNode.data as any).description || ''} onChange={(event) => updateSelectedNode({ description: event.target.value } as Partial<WorkflowNodeData>)} placeholder="审批说明" className="w-full min-h-24 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">超时时间（分钟）</Label>
                          <Input type="number" min={1} value={(selectedNode.data as any).timeoutMinutes ?? 30} onChange={(event) => updateSelectedNode({ timeoutMinutes: Number(event.target.value || 30) } as Partial<WorkflowNodeData>)} placeholder="timeoutMinutes" className="bg-cyber-bg border-white/10 text-white" />
                        </div>
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
                            <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                              <SelectValue placeholder="选择汇合模式" />
                            </SelectTrigger>
                            <SelectContent className="bg-cyber-panel border-white/10 text-white">
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
                              <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                                <SelectValue placeholder="选择一个上游节点" />
                              </SelectTrigger>
                              <SelectContent className="bg-cyber-panel border-white/10 text-white">
                                {selectedNodeUpstreamOptions.length ? selectedNodeUpstreamOptions.map((option) => (
                                  <SelectItem key={option.id} value={option.id}>
                                    {option.label} ({option.id})
                                  </SelectItem>
                                )) : <SelectItem value="__none__">暂无上游节点</SelectItem>}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                        <p className="text-xs text-white/40">普通节点接出多条线时会并行分发；汇合节点根据这里的逻辑门决定何时放行下游。</p>
                      </>
                    ) : null}
                    {(selectedNode.data as WorkflowNodeData).type === 'meeting' ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">会议类型</Label>
                          <Select value={(selectedNode.data as any).meetingType || 'brainstorm'} onValueChange={(value) => updateSelectedNode({ meetingType: value } as Partial<WorkflowNodeData>)}>
                            <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                              <SelectValue placeholder="选择会议类型" />
                            </SelectTrigger>
                            <SelectContent className="bg-cyber-panel border-white/10 text-white">
                              {(['standup', 'kickoff', 'review', 'brainstorm', 'decision', 'retro'] as MeetingType[]).map((t) => (
                                <SelectItem key={t} value={t}>{MEETING_TYPE_LABELS[t]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">会议议题</Label>
                          <Input value={(selectedNode.data as any).topic || ''} onChange={(event) => updateSelectedNode({ topic: event.target.value } as Partial<WorkflowNodeData>)} placeholder="会议要讨论的主题" className="bg-cyber-bg border-white/10 text-white" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">议题描述（可选）</Label>
                          <textarea value={(selectedNode.data as any).topicDescription || ''} onChange={(event) => updateSelectedNode({ topicDescription: event.target.value } as Partial<WorkflowNodeData>)} placeholder="提供更多背景信息..." className="w-full min-h-20 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">参与者 Agent ID（逗号分隔）</Label>
                          <Input value={((selectedNode.data as any).participants || []).join(', ')} onChange={(event) => updateSelectedNode({ participants: event.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) } as Partial<WorkflowNodeData>)} placeholder="agent-1, agent-2, agent-3" className="bg-cyber-bg border-white/10 text-white" />
                          {agents.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {agents.map((agent) => {
                                const participants: string[] = (selectedNode.data as any).participants || []
                                const isIn = participants.includes(agent.id)
                                return (
                                  <button key={agent.id} onClick={() => {
                                    const currentParticipants: string[] = [...((selectedNode.data as any).participants || [])]
                                    if (isIn) {
                                      updateSelectedNode({ participants: currentParticipants.filter((p: string) => p !== agent.id) } as Partial<WorkflowNodeData>)
                                    } else {
                                      updateSelectedNode({ participants: [...currentParticipants, agent.id] } as Partial<WorkflowNodeData>)
                                    }
                                  }} className={cn('text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-all', isIn ? 'bg-purple-400/15 text-purple-300 border-purple-400/30' : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20')}>
                                    {agent.name || agent.id}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">主持人 Agent ID（可选，默认 Team Lead）</Label>
                          <Select value={(selectedNode.data as any).leadAgentId || '__auto__'} onValueChange={(value) => updateSelectedNode({ leadAgentId: value === '__auto__' ? undefined : value } as Partial<WorkflowNodeData>)}>
                            <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                              <SelectValue placeholder="自动（Team Lead）" />
                            </SelectTrigger>
                            <SelectContent className="bg-cyber-panel border-white/10 text-white">
                              <SelectItem value="__auto__">自动（Team Lead）</SelectItem>
                              {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">Team ID（可选，自动推断）</Label>
                          <Input value={(selectedNode.data as any).teamId || ''} onChange={(event) => updateSelectedNode({ teamId: event.target.value } as Partial<WorkflowNodeData>)} placeholder="留空则使用工作流所属团队" className="bg-cyber-bg border-white/10 text-white" />
                        </div>
                        <p className="text-xs text-white/40">会议节点会创建并执行一场 Agent 会议，会议结论将作为节点产物传递给下游。</p>
                      </>
                    ) : null}
                    {(selectedNode.data as WorkflowNodeData).type === 'debate' ? (
                      <>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">辩题</Label>
                          <Input value={(selectedNode.data as any).topic || ''} onChange={(event) => updateSelectedNode({ topic: event.target.value } as Partial<WorkflowNodeData>)} placeholder="辩论的核心问题" className="bg-cyber-bg border-white/10 text-white" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">辩题描述（可选）</Label>
                          <textarea value={(selectedNode.data as any).topicDescription || ''} onChange={(event) => updateSelectedNode({ topicDescription: event.target.value } as Partial<WorkflowNodeData>)} placeholder="提供辩论的背景和具体要求..." className="w-full min-h-20 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">辩手（恰好 2 个 Agent ID）</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[10px] text-orange-300/60 mb-1">正方</Label>
                              <Select value={((selectedNode.data as any).participants || [])[0] || '__none__'} onValueChange={(value) => {
                                const participants: string[] = [...((selectedNode.data as any).participants || ['', ''])]
                                participants[0] = value === '__none__' ? '' : value
                                updateSelectedNode({ participants } as Partial<WorkflowNodeData>)
                              }}>
                                <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                                  <SelectValue placeholder="选择 Agent" />
                                </SelectTrigger>
                                <SelectContent className="bg-cyber-panel border-white/10 text-white">
                                  <SelectItem value="__none__">未选择</SelectItem>
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[10px] text-orange-300/60 mb-1">反方</Label>
                              <Select value={((selectedNode.data as any).participants || ['', ''])[1] || '__none__'} onValueChange={(value) => {
                                const participants: string[] = [...((selectedNode.data as any).participants || ['', ''])]
                                participants[1] = value === '__none__' ? '' : value
                                updateSelectedNode({ participants } as Partial<WorkflowNodeData>)
                              }}>
                                <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                                  <SelectValue placeholder="选择 Agent" />
                                </SelectTrigger>
                                <SelectContent className="bg-cyber-panel border-white/10 text-white">
                                  <SelectItem value="__none__">未选择</SelectItem>
                                  {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">最大回合数</Label>
                          <Select value={String((selectedNode.data as any).maxRounds || 3)} onValueChange={(value) => updateSelectedNode({ maxRounds: Number(value) } as Partial<WorkflowNodeData>)}>
                            <SelectTrigger className="bg-cyber-bg border-white/10 text-white w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-cyber-panel border-white/10 text-white">
                              {[2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={String(n)}>{n} 轮</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">裁判 Agent ID（可选，默认 Team Lead）</Label>
                          <Select value={(selectedNode.data as any).judgeAgentId || '__auto__'} onValueChange={(value) => updateSelectedNode({ judgeAgentId: value === '__auto__' ? undefined : value } as Partial<WorkflowNodeData>)}>
                            <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                              <SelectValue placeholder="自动（Team Lead）" />
                            </SelectTrigger>
                            <SelectContent className="bg-cyber-panel border-white/10 text-white">
                              <SelectItem value="__auto__">自动（Team Lead）</SelectItem>
                              {agents.map((agent) => (
                                <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-white/60">Team ID（可选）</Label>
                          <Input value={(selectedNode.data as any).teamId || ''} onChange={(event) => updateSelectedNode({ teamId: event.target.value } as Partial<WorkflowNodeData>)} placeholder="留空则使用工作流所属团队" className="bg-cyber-bg border-white/10 text-white" />
                        </div>
                        <p className="text-xs text-white/40">辩论节点让两个 Agent 就特定话题进行多轮对抗，裁判 Agent 最终评判胜方，辩论结论作为节点产物传递。</p>
                      </>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-white/35">点击画布中的节点后可编辑其字段。</p>
                )}
              </div>

              <div className="p-4 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm">执行日志</h3>
                  {execution ? <span className="text-[10px] text-white/35">{execution.id}</span> : null}
                </div>
                {execution?.logs?.length ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {execution.logs.map((log, index) => (
                      <div key={`${log.timestamp}-${index}`} className="rounded-lg border border-white/5 bg-cyber-bg/40 p-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className={cn('text-[10px] uppercase', log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-yellow-300' : 'text-cyber-green')}>{log.level}</span>
                          <span className="text-[10px] text-white/30">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-[11px] text-white/50 mb-1">节点: {log.nodeId}</p>
                        <p className="text-sm text-white/80 whitespace-pre-wrap">{log.message}</p>
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
      </div>
    </div>
  )
}
