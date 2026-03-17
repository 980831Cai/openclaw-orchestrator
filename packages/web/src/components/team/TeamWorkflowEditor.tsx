import { useCallback, useEffect, useMemo, useState } from 'react'

import { GitBranch, Loader2, Plus } from 'lucide-react'
import { useEdgesState, useNodesState, type Connection, type Edge } from 'reactflow'

import { NodePropertiesPanel } from '@/components/workflow/NodePropertiesPanel'
import { WorkflowCanvas } from '@/components/workflow/editor/WorkflowCanvas'
import { WorkflowCanvasDock } from '@/components/workflow/editor/WorkflowCanvasDock'
import { WorkflowCanvasTopbar } from '@/components/workflow/editor/WorkflowCanvasTopbar'
import { WorkflowEditorShell } from '@/components/workflow/editor/WorkflowEditorShell'
import { WorkflowNodePalette } from '@/components/workflow/editor/WorkflowNodePalette'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ACTIVE_EXECUTION_STATUSES, isExecutionActive, reconcileExecutionSelection } from '@/pages/workflow-editor/execution-state'
import {
  DEFAULT_WORKFLOW_TIMEZONE,
  createWorkflowFlowNode,
  fromDateTimeLocalValue,
  getExecutionBadge,
  normalizeConditionHandle,
  normalizeSchedule,
  toDateTimeLocalValue,
  toFlowEdges,
  toFlowNodes,
  upsertConnectedEdge,
} from '@/pages/workflow-editor/graph'
import { prepareWorkflowGraphForSave } from '@/pages/workflow-editor/graph-persistence'
import { prepareWorkflowScheduleForSave } from '@/pages/workflow-editor/schedule-persistence'
import { buildTeamScopedAgentOptions, collectNodeRelatedAgentIds, resolveWorkflowTeam } from '@/pages/workflow-editor/team-agent-options'
import type { AgentListItem, TeamListItem, WorkflowDefinition, WorkflowExecution, WorkflowLog, WorkflowNodeData, WorkflowSchedule } from '@/types'

interface TeamWorkflowEditorProps {
  teamId: string
}

function ToggleButton({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-colors',
        checked ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white/45',
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', checked ? 'bg-emerald-300' : 'bg-white/25')} />
      {label}
    </button>
  )
}

export function TeamWorkflowEditor({ teamId }: TeamWorkflowEditorProps) {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [execution, setExecution] = useState<WorkflowExecution | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [teamOptions, setTeamOptions] = useState<TeamListItem[]>([])
  const [schedule, setSchedule] = useState<WorkflowSchedule>({ enabled: false, cron: '', timezone: DEFAULT_WORKFLOW_TIMEZONE, window: null, activeFrom: null, activeUntil: null })
  const [edgeReconnectSuccessful, setEdgeReconnectSuccessful] = useState(true)

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId])
  const executionIsActive = useMemo(() => isExecutionActive(execution?.status), [execution?.status])
  const currentTeam = useMemo(() => resolveWorkflowTeam(teamOptions, teamId), [teamId, teamOptions])
  const scopedAgents = useMemo(() => buildTeamScopedAgentOptions({ team: currentTeam, allAgents: agents, extraAgentIds: collectNodeRelatedAgentIds(selectedNode?.data as WorkflowNodeData | undefined) }), [agents, currentTeam, selectedNode])
  const selectedNodeUpstreamOptions = useMemo(() => edges.filter((edge) => edge.target === selectedNodeId).map((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source)
    const sourceData = sourceNode?.data as WorkflowNodeData | undefined
    return { id: edge.source, label: sourceData?.label || edge.source, type: sourceData?.type || 'task' }
  }), [edges, nodes, selectedNodeId])
  const logs: WorkflowLog[] = execution?.logs ?? []
  const statusBadge = execution ? getExecutionBadge(execution.status) : null

  const executionDecorations = useMemo(() => {
    const failedNodeIds = new Set<string>()
    const successfulNodeIds = new Set<string>()
    if (execution) {
      execution.logs.forEach((log) => {
        if (!log.nodeId || log.nodeId.startsWith('__')) return
        if (log.level === 'error') {
          failedNodeIds.add(log.nodeId)
          successfulNodeIds.delete(log.nodeId)
          return
        }
        if (!failedNodeIds.has(log.nodeId)) successfulNodeIds.add(log.nodeId)
      })
    }

    return {
      nodes: nodes.map((node) => ({ ...node, data: { ...(node.data as WorkflowNodeData), executionState: execution?.currentNodeId === node.id && executionIsActive ? 'running' : failedNodeIds.has(node.id) ? 'failed' : successfulNodeIds.has(node.id) ? 'success' : 'idle' } })),
      edges: edges.map((edge) => ({ ...edge, animated: execution?.currentNodeId === edge.source && executionIsActive })),
    }
  }, [edges, execution, executionIsActive, nodes])

  const selectedConditionConnections = useMemo(() => {
    if (!selectedNode || (selectedNode.data as WorkflowNodeData).type !== 'condition') return { yes: null, no: null }
    const resolveTarget = (handleId: 'yes' | 'no') => {
      const edge = edges.find((item) => item.source === selectedNode.id && normalizeConditionHandle(String(item.sourceHandle || item.label || '')) === handleId)
      if (!edge) return null
      const targetNode = nodes.find((node) => node.id === edge.target)
      const targetData = targetNode?.data as WorkflowNodeData | undefined
      return { label: targetData?.label || edge.target, agentId: targetData && 'agentId' in targetData ? targetData.agentId : undefined }
    }
    return { yes: resolveTarget('yes'), no: resolveTarget('no') }
  }, [edges, nodes, selectedNode])

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
          execution?.currentNodeId === node.id && executionIsActive
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
          execution?.currentNodeId === edge.source && executionIsActive
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
  }, [edges, execution, executionIsActive, nodes])

  const loadWorkflow = useCallback((workflow: WorkflowDefinition) => {
    setSelected(workflow)
    setNodes(toFlowNodes(workflow))
    setEdges(toFlowEdges(workflow))
    setSchedule(normalizeSchedule(workflow.schedule))
    setSelectedNodeId(null)
    setExecution(null)
  }, [setEdges, setNodes])

  const fetchWorkflows = useCallback(async () => {
    const all = await api.get<WorkflowDefinition[]>('/workflows')
    const teamWorkflows = all.filter((workflow) => workflow.teamId === teamId)
    setWorkflows(teamWorkflows)
    if (!selected && teamWorkflows[0]) loadWorkflow(teamWorkflows[0])
    if (selected) {
      const refreshed = teamWorkflows.find((workflow) => workflow.id === selected.id)
      if (refreshed) setSelected(refreshed)
    }
  }, [loadWorkflow, selected, teamId])

  const refreshExecution = useCallback(async (executionId: string) => {
    const data = await api.get<WorkflowExecution>(`/executions/${executionId}`)
    setExecution(data)
  }, [])

  useEffect(() => { void fetchWorkflows().catch((error) => { console.error(error); toast({ title: '工作流加载失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' }) }) }, [fetchWorkflows])
  useEffect(() => { void Promise.all([api.get<AgentListItem[]>('/agents'), api.get<TeamListItem[]>('/teams')]).then(([agentData, teamData]) => { setAgents(agentData); setTeamOptions(teamData) }).catch((error) => console.error(error)) }, [])
  useEffect(() => {
    if (!selected?.id) { setExecution(null); return }
    void api.get<WorkflowExecution[]>(`/workflows/${selected.id}/executions`).then((executions) => setExecution((current) => reconcileExecutionSelection({ workflowId: selected.id, currentExecution: current, executions, preserveCurrentExecution: true }))).catch((error) => console.error(error))
  }, [selected?.id])
  useEffect(() => {
    if (!execution || !ACTIVE_EXECUTION_STATUSES.includes(execution.status)) return
    const timer = window.setInterval(() => { void refreshExecution(execution.id).catch((error) => console.error(error)) }, 2500)
    return () => window.clearInterval(timer)
  }, [execution, refreshExecution])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      if (target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select') return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!selectedNode) return
      event.preventDefault()
      setNodes((current) => current.filter((node) => node.id !== selectedNode.id))
      setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id))
      setSelectedNodeId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, setEdges, setNodes])

  const addNode = useCallback((type: WorkflowNodeData['type'], position?: { x: number; y: number }) => {
    const nextNode = createWorkflowFlowNode(type, nodes.length, position)
    setNodes((current) => [...current, nextNode])
    setSelectedNodeId(nextNode.id)
  }, [nodes.length, setNodes])

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target && connection.source === connection.target) {
      toast({ title: '连线无效', description: '节点不能连接到自身', variant: 'destructive' })
      return
    }
    setEdges((current) => upsertConnectedEdge(current, connection, nodes))
  }, [nodes, setEdges])

  const handleEdgeUpdateStart = useCallback(() => setEdgeReconnectSuccessful(false), [])
  const handleEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    if (!newConnection.source || !newConnection.target) return
    if (newConnection.source === newConnection.target) {
      setEdgeReconnectSuccessful(true)
      toast({ title: '重连无效', description: '节点不能连接到自身', variant: 'destructive' })
      return
    }
    setEdgeReconnectSuccessful(true)
    setEdges((current) => upsertConnectedEdge(current, newConnection, nodes, oldEdge.id))
  }, [nodes, setEdges])
  const handleEdgeUpdateEnd = useCallback((_: unknown, edge: Edge) => { if (!edgeReconnectSuccessful) setEdges((current) => current.filter((item) => item.id !== edge.id)) }, [edgeReconnectSuccessful, setEdges])
  const updateSelectedNode = useCallback((patch: Partial<WorkflowNodeData>) => { if (!selectedNode) return; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...(node.data as WorkflowNodeData), ...patch } } : node)) }, [selectedNode, setNodes])
  const handleDeleteSelectedNode = useCallback(() => { if (!selectedNode) return; setNodes((current) => current.filter((node) => node.id !== selectedNode.id)); setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)); setSelectedNodeId(null) }, [selectedNode, setEdges, setNodes])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const workflow = await api.post<WorkflowDefinition>('/workflows', { teamId, name: newName.trim(), nodes: {}, edges: [] })
      setWorkflows((prev) => [workflow, ...prev])
      loadWorkflow(workflow)
      setNewName('')
      setCreateDialogOpen(false)
      toast({ title: '工作流已创建' })
    } catch (error) {
      console.error(error)
      toast({ title: '创建失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async () => {
    if (!selected) return
    const preparedSchedule = prepareWorkflowScheduleForSave(schedule)
    if (!preparedSchedule.ok) return toast({ title: '保存失败', description: preparedSchedule.error, variant: 'destructive' })
    setSaving(true)
    try {
      const preparedGraph = prepareWorkflowGraphForSave(nodes, edges)
      const updated = await api.put<WorkflowDefinition>(`/workflows/${selected.id}`, { name: selected.name, nodes: preparedGraph.nodes, edges: preparedGraph.edges, schedule: preparedSchedule.schedule })
      setSelected(updated)
      setSchedule(normalizeSchedule(updated.schedule))
      setWorkflows((prev) => prev.map((workflow) => workflow.id === updated.id ? updated : workflow))
      toast({ title: '工作流已保存' })
    } catch (error) {
      console.error(error)
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
      window.setTimeout(() => { void refreshExecution(nextExecution.id).catch((error) => console.error(error)) }, 800)
      toast({ title: '工作流开始执行', description: `执行 ID: ${nextExecution.id}` })
    } catch (error) {
      console.error(error)
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
      console.error(error)
      toast({ title: '停止失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><GitBranch className="h-4 w-4 text-cyber-amber" />{workflows.length} 个工作流</h3>
          <p className="mt-1 text-xs text-white/40">团队域内工作流统一使用共享画布壳层与拖拽建图方式。</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild><Button size="sm" className="border border-cyber-amber/30 bg-cyber-amber/20 text-cyber-amber hover:bg-cyber-amber/30"><Plus className="mr-1 h-3.5 w-3.5" /> 新工作流</Button></DialogTrigger>
          <DialogContent className="border-white/10 bg-cyber-surface text-white"><DialogHeader><DialogTitle>新建团队工作流</DialogTitle></DialogHeader><div className="space-y-4 pt-4"><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="工作流名称" className="border-white/10 bg-cyber-bg text-white" onKeyDown={(e) => e.key === 'Enter' && void handleCreate()} autoFocus /><Button onClick={() => void handleCreate()} className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber" disabled={creating || !newName.trim()}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}创建</Button></div></DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        {workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => loadWorkflow(workflow)} className={cn('rounded-2xl border px-3 py-2 text-left text-xs transition-all', selected?.id === workflow.id ? 'border-cyber-amber/35 bg-cyber-amber/15 text-white' : 'border-white/[0.08] bg-white/[0.03] text-white/55 hover:bg-white/[0.06]')}><span className="font-medium">{workflow.name}</span><span className="ml-2 text-[10px] text-white/30">{Object.keys(workflow.nodes).length} 节点</span></button>)}
      </div>

      <div className="min-h-0 flex-1">
        <WorkflowEditorShell
          hasSelection={Boolean(selected)}
          palette={<WorkflowNodePalette onCreateNode={(type) => addNode(type)} />}
          topbar={<WorkflowCanvasTopbar eyebrow="Team Workflow Studio" title={selected?.name || '选择一个团队工作流'} subtitle={selected ? `当前团队：${currentTeam?.name || teamId}` : '先创建或切换工作流，再开始拖拽节点建图。'} badges={statusBadge ? <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', statusBadge.tone)}>{statusBadge.label}</span> : null} />}
          canvas={<WorkflowCanvas nodes={executionDecorations.nodes} edges={executionDecorations.edges} selectedNodeId={selectedNodeId} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onEdgeUpdateStart={handleEdgeUpdateStart} onEdgeUpdate={handleEdgeUpdate} onEdgeUpdateEnd={handleEdgeUpdateEnd} onNodeSelect={setSelectedNodeId} onCreateNodeAt={addNode} />}
          dock={<WorkflowCanvasDock saving={saving} executionActive={executionIsActive} onExecute={() => void handleExecute()} onStop={() => void handleStop()} onSave={() => void handleSave()} statusBadge={statusBadge ? <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', statusBadge.tone)}>{statusBadge.label}</span> : null} />}
          inspector={<NodePropertiesPanel selectedNode={selectedNode as any} agents={scopedAgents} upstreamOptions={selectedNodeUpstreamOptions} selectedConditionConnections={selectedConditionConnections} onUpdate={updateSelectedNode} onDelete={handleDeleteSelectedNode}><div className="workflow-frost-panel rounded-3xl p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white">定时执行</h3><ToggleButton checked={schedule.enabled} onToggle={() => setSchedule((current) => ({ ...current, enabled: !current.enabled }))} label={schedule.enabled ? '已启用' : '已关闭'} /></div>{schedule.enabled ? <div className="mt-4 space-y-3"><div className="space-y-2"><Label className="text-xs text-white/60">Cron 表达式</Label><Input value={schedule.cron} onChange={(event) => setSchedule((current) => ({ ...current, cron: event.target.value }))} className="border-white/10 bg-cyber-bg text-white" /></div><div className="space-y-2"><Label className="text-xs text-white/60">时区</Label><Input value={schedule.timezone} onChange={(event) => setSchedule((current) => ({ ...current, timezone: event.target.value }))} className="border-white/10 bg-cyber-bg text-white" /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label className="text-xs text-white/60">生效开始</Label><Input type="datetime-local" value={toDateTimeLocalValue(schedule.activeFrom)} onChange={(event) => setSchedule((current) => ({ ...current, activeFrom: fromDateTimeLocalValue(event.target.value) }))} className="border-white/10 bg-cyber-bg text-white" /></div><div className="space-y-2"><Label className="text-xs text-white/60">生效截止</Label><Input type="datetime-local" value={toDateTimeLocalValue(schedule.activeUntil)} onChange={(event) => setSchedule((current) => ({ ...current, activeUntil: fromDateTimeLocalValue(event.target.value) }))} className="border-white/10 bg-cyber-bg text-white" /></div></div></div> : <p className="mt-3 text-xs text-white/40">关闭后仅支持手动触发执行。</p>}</div><div className="workflow-frost-panel rounded-3xl p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">执行日志</h3>{execution ? <span className="text-[10px] text-white/35">{execution.id}</span> : null}</div>{logs.length ? <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{logs.map((log, index) => <div key={`${log.timestamp}-${index}`} className="rounded-2xl border border-white/6 bg-cyber-bg/45 p-3"><div className="mb-1 flex items-center justify-between gap-3"><span className={cn('text-[10px] uppercase', log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-yellow-300' : 'text-emerald-300')}>{log.level}</span><span className="text-[10px] text-white/30">{new Date(log.timestamp).toLocaleString()}</span></div><p className="mb-1 text-[11px] text-white/45">节点: {log.nodeId}</p><p className="whitespace-pre-wrap text-sm text-white/80">{log.message}</p></div>)}</div> : <p className="mt-3 text-sm text-white/35">执行后会在这里显示真实日志和失败原因。</p>}</div></NodePropertiesPanel>}
          emptyState={<div className="flex h-full items-center justify-center rounded-[26px] border border-dashed border-white/10 bg-white/[0.02]"><div className="max-w-md text-center"><p className="text-lg font-medium text-white">先选择一个团队工作流</p><p className="mt-2 text-sm leading-6 text-white/45">上方切换已有工作流，或新建一个后进入拖拽式画布编辑。</p></div></div>}
        />
      </div>
    </div>
  )
}
