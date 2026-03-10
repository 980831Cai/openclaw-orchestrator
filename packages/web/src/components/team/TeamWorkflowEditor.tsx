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
import { GitBranch, Loader2, Merge, Play, Plus, Save, Split, Square, UserCheck, Zap } from 'lucide-react'

import { TaskNodeComponent } from '@/components/workflow/TaskNode'
import { ConditionNodeComponent } from '@/components/workflow/ConditionNode'
import { ApprovalNodeComponent } from '@/components/workflow/ApprovalNode'
import { JoinNodeComponent } from '@/components/workflow/JoinNode'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { AgentListItem, WorkflowDefinition, WorkflowExecution, WorkflowLog, WorkflowNodeData } from '@/types'

const nodeTypes: NodeTypes = {
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
  parallel: JoinNodeComponent,
  approval: ApprovalNodeComponent,
}

interface TeamWorkflowEditorProps {
  teamId: string
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
    animated: true,
    style: { stroke: '#6366F1', strokeWidth: 2 },
  }))
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
  const logs: WorkflowLog[] = execution?.logs ?? []

  const loadWorkflow = useCallback((workflow: WorkflowDefinition) => {
    setSelected(workflow)
    setNodes(toFlowNodes(workflow))
    setEdges(toFlowEdges(workflow))
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
    setEdges((current) => addEdge({
      ...params,
      label: params.sourceHandle ?? undefined,
      animated: true,
      style: { stroke: '#6366F1', strokeWidth: 2 },
    }, current))
  }, [setEdges])

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
    const nodeMap: Record<string, WorkflowNodeData> = {}
    nodes.forEach((node) => {
      nodeMap[node.id] = {
        ...(node.data as WorkflowNodeData),
        label: ((node.data as WorkflowNodeData).label || node.id).trim(),
        position: node.position,
      }
    })
    const edgeList = edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      condition: typeof edge.label === 'string' ? edge.label : edge.sourceHandle || undefined,
    }))

    try {
      const updated = await api.put<WorkflowDefinition>(`/workflows/${selected.id}`, {
        name: selected.name,
        nodes: nodeMap,
        edges: edgeList,
      })
      setSelected(updated)
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
      task: { type: 'task', label: '任务节点', agentId: '', task: '', timeoutSeconds: 60, position: { x: 240, y: 120 } },
      condition: { type: 'condition', label: '条件节点', expression: 'true', branches: { yes: '', no: '' }, position: { x: 240, y: 120 } },
      approval: { type: 'approval', label: '审批节点', title: '请确认', description: '', approver: 'web-user', timeoutMinutes: 30, onTimeout: 'reject', position: { x: 240, y: 120 } },
      join: { type: 'join', label: '汇合节点', joinMode: 'and', waitForAll: true, position: { x: 240, y: 120 } },
      parallel: { type: 'parallel', label: '汇合节点', joinMode: 'and', waitForAll: true, position: { x: 240, y: 120 } },
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

  const updateConditionBranch = (branchKey: string, value: string) => {
    if (!selectedNode || (selectedNode.data as WorkflowNodeData).type !== 'condition') return
    const currentBranches = { ...((((selectedNode.data as any).branches) || {}) as Record<string, string>) }
    currentBranches[branchKey] = value
    updateSelectedNode({ branches: currentBranches } as Partial<WorkflowNodeData>)
  }

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
                  <Background color="#6366F120" gap={20} size={1} />
                  <Controls className="!bg-cyber-panel !border-white/10 !rounded-xl [&>button]:!bg-cyber-panel [&>button]:!border-white/10 [&>button]:!text-white/50" />
                  <MiniMap nodeColor="#6366F1" maskColor="#0F0F2390" className="!bg-cyber-panel !border-white/10 !rounded-xl" />

                  <Panel position="top-left" className="flex gap-2">
                    <button onClick={() => addNode('task')} className="glass flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/60 transition-all hover:border-cyber-blue/30 hover:text-white">
                      <Zap className="h-3.5 w-3.5 text-cyber-blue" /> 任务
                    </button>
                    <button onClick={() => addNode('condition')} className="glass flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/60 transition-all hover:border-cyber-amber/30 hover:text-white">
                      <Split className="h-3.5 w-3.5 text-cyber-amber" /> 条件
                    </button>
                    <button onClick={() => addNode('approval')} className="glass flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/60 transition-all hover:border-yellow-500/30 hover:text-white">
                      <UserCheck className="h-3.5 w-3.5 text-yellow-400" /> 审批
                    </button>
                    <button onClick={() => addNode('join')} className="glass flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/60 transition-all hover:border-cyber-green/30 hover:text-white">
                      <Merge className="h-3.5 w-3.5 text-cyber-green" /> 汇合
                    </button>
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
                      <div className="space-y-2">
                        <Label className="text-xs text-white/60">节点名称</Label>
                        <Input value={(selectedNode.data as WorkflowNodeData).label || ''} onChange={(event) => updateSelectedNode({ label: event.target.value } as Partial<WorkflowNodeData>)} placeholder="节点名称" className="border-white/10 bg-cyber-bg text-white" />
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
                              <Label className="text-[11px] text-white/45">yes 分支目标节点 ID</Label>
                              <Input value={(selectedNode.data as any).branches?.yes || ''} onChange={(event) => updateConditionBranch('yes', event.target.value)} placeholder="命中 yes 时跳到哪个节点" className="border-white/10 bg-cyber-bg text-white" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[11px] text-white/45">no 分支目标节点 ID</Label>
                              <Input value={(selectedNode.data as any).branches?.no || ''} onChange={(event) => updateConditionBranch('no', event.target.value)} placeholder="命中 no 时跳到哪个节点" className="border-white/10 bg-cyber-bg text-white" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[11px] text-white/45">default 分支目标节点 ID</Label>
                              <Input value={(selectedNode.data as any).branches?.default || ''} onChange={(event) => updateConditionBranch('default', event.target.value)} placeholder="表达式失败或未命中时走这里" className="border-white/10 bg-cyber-bg text-white" />
                            </div>
                          </div>
                          <p className="text-xs text-white/40">连线标签会作为条件分支保存。</p>
                        </>
                      ) : null}
                      {(selectedNode.data as WorkflowNodeData).type === 'approval' ? (
                        <>
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
                    </>
                  ) : (
                    <p className="text-sm text-white/35">点击画布节点后可编辑字段。</p>
                  )}
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
