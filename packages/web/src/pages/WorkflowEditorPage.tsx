import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GitBranch, Loader2, Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useEdgesState, useNodesState, type Connection, type Edge } from 'reactflow'

import { EmptyState } from '@/components/brand/EmptyState'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitor-store'
import type { AgentListItem, ApprovalRecord, TeamListItem, WorkflowDefinition, WorkflowExecution, WorkflowNodeData, WorkflowSchedule } from '@/types'

import { resolveApprovalQueryId, selectPendingApproval } from './workflow-editor/approval-selection'
import { ACTIVE_EXECUTION_STATUSES, isExecutionActive, mergeExecutionWithSignal, reconcileExecutionSelection } from './workflow-editor/execution-state'
import { haveWorkflowGraphChanges, prepareWorkflowGraphForSave } from './workflow-editor/graph-persistence'
import { createDefaultSchedule } from './workflow-editor/graph'
import { createWorkflowFlowNode, fromDateTimeLocalValue, getExecutionBadge, normalizeConditionHandle, normalizeSchedule, toDateTimeLocalValue, toFlowEdges, toFlowNodes, upsertConnectedEdge } from './workflow-editor/graph'
import { getWorkflowNodeInstructionManual } from './workflow-editor/node-instructions'
import { haveWorkflowScheduleChanges, prepareWorkflowScheduleForSave } from './workflow-editor/schedule-persistence'
import { buildTeamScopedAgentOptions, collectNodeRelatedAgentIds, resolveWorkflowTeam } from './workflow-editor/team-agent-options'

function ToggleButton({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-colors', checked ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-200' : 'border-white/10 bg-white/5 text-white/45')}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', checked ? 'bg-emerald-300' : 'bg-white/25')} />
      {label}
    </button>
  )
}

export function WorkflowEditorPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [execution, setExecution] = useState<WorkflowExecution | null>(null)
  const [pendingApproval, setPendingApproval] = useState<ApprovalRecord | null>(null)
  const [approvalBusy, setApprovalBusy] = useState<'approve' | 'reject' | null>(null)
  const [creating, setCreating] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTeamId, setNewTeamId] = useState('')
  const [teamOptions, setTeamOptions] = useState<TeamListItem[]>([])
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [schedule, setSchedule] = useState<WorkflowSchedule>(createDefaultSchedule())
  const [edgeReconnectSuccessful, setEdgeReconnectSuccessful] = useState(true)
  const autosaveRequestIdRef = useRef(0)

  const requestedWorkflowId = searchParams.get('workflowId')
  const requestedExecutionId = searchParams.get('executionId')
  const requestedApprovalId = searchParams.get('approvalId')
  const workflowSignals = useMonitorStore((state) => state.workflowSignals)

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId])
  const selectedNodeInstructionManual = useMemo(() => getWorkflowNodeInstructionManual((selectedNode?.data as WorkflowNodeData | undefined)?.type), [selectedNode])
  const executionIsActive = useMemo(() => isExecutionActive(execution?.status), [execution?.status])
  const currentWorkflowTeam = useMemo(() => resolveWorkflowTeam(teamOptions, selected?.teamId || newTeamId), [newTeamId, selected?.teamId, teamOptions])
  const scopedAgents = useMemo(() => buildTeamScopedAgentOptions({ team: currentWorkflowTeam, allAgents: agents, extraAgentIds: collectNodeRelatedAgentIds(selectedNode?.data as WorkflowNodeData | undefined) }), [agents, currentWorkflowTeam, selectedNode])
  const selectedNodeUpstreamOptions = useMemo(() => edges.filter((edge) => edge.target === selectedNodeId).map((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source)
    const sourceData = sourceNode?.data as WorkflowNodeData | undefined
    return { id: edge.source, label: sourceData?.label || edge.source, type: sourceData?.type || 'task' }
  }), [edges, nodes, selectedNodeId])
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
  const statusBadge = execution ? getExecutionBadge(execution.status) : null
  const autosaveLabel = autosaveState === 'saving' ? '自动保存中' : autosaveState === 'saved' ? '已自动保存' : autosaveState === 'error' ? '草稿待保存' : '等待修改'

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
      edges,
    }
  }, [edges, execution, executionIsActive, nodes])

  const loadWorkflow = useCallback((workflow: WorkflowDefinition) => {
    setSelected(workflow)
    setNodes(toFlowNodes(workflow))
    setEdges(toFlowEdges(workflow))
    setSchedule(normalizeSchedule(workflow.schedule))
    setSelectedNodeId(null)
    setExecution(null)
    setPendingApproval(null)
    setAutosaveState('idle')
  }, [setEdges, setNodes])

  const replaceSelectionQuery = useCallback((workflowId?: string | null, executionId?: string | null, approvalId?: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (workflowId) next.set('workflowId', workflowId)
      else next.delete('workflowId')
      if (executionId) next.set('executionId', executionId)
      else next.delete('executionId')
      if (approvalId) next.set('approvalId', approvalId)
      else next.delete('approvalId')
      return next
    })
  }, [setSearchParams])

  const openWorkflow = useCallback((workflow: WorkflowDefinition, executionId?: string | null, approvalId?: string | null) => {
    replaceSelectionQuery(workflow.id, executionId, approvalId)
    loadWorkflow(workflow)
  }, [loadWorkflow, replaceSelectionQuery])

  const fetchWorkflows = useCallback(async () => {
    const data = await api.get<WorkflowDefinition[]>('/workflows')
    setWorkflows(data)
    const requested = requestedWorkflowId ? data.find((workflow) => workflow.id === requestedWorkflowId) : null
    if (requested) {
      if (selected?.id !== requested.id) loadWorkflow(requested)
      return
    }
    if (selected?.id) {
      const refreshed = data.find((workflow) => workflow.id === selected.id)
      if (refreshed) setSelected(refreshed)
      return
    }
    if (data[0]) openWorkflow(data[0])
  }, [loadWorkflow, openWorkflow, requestedWorkflowId, selected?.id])

  const refreshExecution = useCallback(async (executionId: string) => {
    const data = await api.get<WorkflowExecution>(`/executions/${executionId}`)
    setExecution(data)
  }, [])

  const persistWorkflow = useCallback(async (showToastMessage: boolean) => {
    if (!selected) return false
    const preparedSchedule = prepareWorkflowScheduleForSave(schedule)
    if (!preparedSchedule.ok) {
      setAutosaveState('error')
      if (showToastMessage) toast({ title: '保存失败', description: preparedSchedule.error, variant: 'destructive' })
      return false
    }
    try {
      const preparedGraph = prepareWorkflowGraphForSave(nodes, edges)
      const updated = await api.put<WorkflowDefinition>(`/workflows/${selected.id}`, { name: selected.name, nodes: preparedGraph.nodes, edges: preparedGraph.edges, schedule: preparedSchedule.schedule })
      setSelected(updated)
      setWorkflows((current) => current.map((workflow) => workflow.id === updated.id ? updated : workflow))
      setSchedule(normalizeSchedule(updated.schedule))
      setAutosaveState('saved')
      if (showToastMessage) toast({ title: '工作流已保存' })
      return true
    } catch (error) {
      console.error(error)
      setAutosaveState('error')
      if (showToastMessage) toast({ title: '保存失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
      return false
    }
  }, [edges, nodes, schedule, selected])

  useEffect(() => { void fetchWorkflows().catch((error) => { console.error(error); toast({ title: '工作流加载失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' }) }) }, [fetchWorkflows])
  useEffect(() => { void Promise.all([api.get<AgentListItem[]>('/agents'), api.get<TeamListItem[]>('/teams')]).then(([agentData, teamData]) => { setAgents(agentData); setTeamOptions(teamData); if (!newTeamId && teamData[0]) setNewTeamId(teamData[0].id) }).catch((error) => console.error(error)) }, [newTeamId])
  useEffect(() => {
    if (!selected?.id) { setExecution(null); return }
    void api.get<WorkflowExecution[]>(`/workflows/${selected.id}/executions`).then((executions) => setExecution((current) => reconcileExecutionSelection({ workflowId: selected.id, requestedExecutionId, currentExecution: current, executions }))).catch((error) => console.error(error))
  }, [requestedExecutionId, selected?.id])
  useEffect(() => {
    if (!execution || !ACTIVE_EXECUTION_STATUSES.includes(execution.status)) return
    const timer = window.setInterval(() => { void refreshExecution(execution.id).catch((error) => console.error(error)) }, 2500)
    return () => window.clearInterval(timer)
  }, [execution, refreshExecution])
  useEffect(() => {
    if (!execution?.id) return
    const signal = workflowSignals.get(execution.id)
    if (!signal) return
    setExecution((current) => current ? mergeExecutionWithSignal(current, signal) : current)
  }, [execution?.id, workflowSignals])
  useEffect(() => {
    if (!execution?.id || execution.status !== 'waiting_approval') { setPendingApproval(null); return }
    let cancelled = false
    const syncApprovals = async () => {
      const approvals = await api.get<ApprovalRecord[]>(`/approvals?execution_id=${execution.id}`)
      if (cancelled) return
      const nextPending = selectPendingApproval(approvals, requestedApprovalId)
      setPendingApproval(nextPending)
      replaceSelectionQuery(selected?.id || null, execution.id, resolveApprovalQueryId(approvals, requestedApprovalId))
    }
    void syncApprovals().catch((error) => console.error(error))
    const timer = window.setInterval(() => { void syncApprovals().catch((error) => console.error(error)) }, 2500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [execution?.id, execution?.status, requestedApprovalId, replaceSelectionQuery, selected?.id])
  useEffect(() => {
    if (!selected?.id) return
    if (!haveWorkflowGraphChanges(nodes, edges, selected) && !haveWorkflowScheduleChanges(schedule, selected.schedule)) return
    const preparedSchedule = prepareWorkflowScheduleForSave(schedule)
    if (!preparedSchedule.ok) { setAutosaveState('error'); return }
    const requestId = ++autosaveRequestIdRef.current
    setAutosaveState('saving')
    const timer = window.setTimeout(() => { if (requestId === autosaveRequestIdRef.current) void persistWorkflow(false) }, 800)
    return () => window.clearTimeout(timer)
  }, [edges, nodes, persistWorkflow, schedule, selected])
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
    if (connection.source && connection.target && connection.source === connection.target) return toast({ title: '连线无效', description: '节点不能连接到自身', variant: 'destructive' })
    setEdges((current) => upsertConnectedEdge(current, connection, nodes))
  }, [nodes, setEdges])
  const handleEdgeUpdateStart = useCallback(() => setEdgeReconnectSuccessful(false), [])
  const handleEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    if (!newConnection.source || !newConnection.target) return
    if (newConnection.source === newConnection.target) {
      setEdgeReconnectSuccessful(true)
      return toast({ title: '重连无效', description: '节点不能连接到自身', variant: 'destructive' })
    }
    setEdgeReconnectSuccessful(true)
    setEdges((current) => upsertConnectedEdge(current, newConnection, nodes, oldEdge.id))
  }, [nodes, setEdges])
  const handleEdgeUpdateEnd = useCallback((_: unknown, edge: Edge) => { if (!edgeReconnectSuccessful) setEdges((current) => current.filter((item) => item.id !== edge.id)) }, [edgeReconnectSuccessful, setEdges])
  const updateSelectedNode = useCallback((patch: Partial<WorkflowNodeData>) => { if (!selectedNode) return; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...(node.data as WorkflowNodeData), ...patch } } : node)) }, [selectedNode, setNodes])
  const handleDeleteSelectedNode = useCallback(() => { if (!selectedNode) return; setNodes((current) => current.filter((node) => node.id !== selectedNode.id)); setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)); setSelectedNodeId(null) }, [selectedNode, setEdges, setNodes])

  const handleSave = async () => { setSaving(true); await persistWorkflow(true); setSaving(false) }
  const handleExecute = async () => {
    if (!selected) return
    try {
      const nextExecution = await api.post<WorkflowExecution>(`/workflows/${selected.id}/execute`)
      setExecution(nextExecution)
      replaceSelectionQuery(selected.id, nextExecution.id, null)
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
  const handleResolveApproval = async (approved: boolean) => {
    if (!pendingApproval) return
    setApprovalBusy(approved ? 'approve' : 'reject')
    try {
      if (approved) await api.post(`/approvals/${pendingApproval.id}/approve`)
      else await api.post(`/approvals/${pendingApproval.id}/reject`, { reject_reason: '通过工作流页面驳回' })
      setPendingApproval(null)
      if (execution?.id) await refreshExecution(execution.id)
      toast({ title: approved ? '审批已通过' : '审批已驳回' })
    } catch (error) {
      console.error(error)
      toast({ title: approved ? '审批通过失败' : '审批驳回失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    } finally {
      setApprovalBusy(null)
    }
  }
  const handleCreate = async () => {
    if (!newName.trim()) return
    const resolvedTeamId = newTeamId.trim() || teamOptions[0]?.id || ''
    if (!resolvedTeamId) return toast({ title: '创建失败', description: '请先创建至少一个工作室', variant: 'destructive' })
    setCreating(true)
    try {
      const workflow = await api.post<WorkflowDefinition>('/workflows', { teamId: resolvedTeamId, name: newName.trim(), nodes: {}, edges: [] })
      setWorkflows((current) => [workflow, ...current])
      setNewName('')
      setCreateDialogOpen(false)
      openWorkflow(workflow)
      toast({ title: '工作流已创建' })
    } catch (error) {
      console.error(error)
      toast({ title: '创建失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkflowEditorShell
        hasSelection={Boolean(selected)}
        sidebar={<div className="flex h-full w-72 flex-col overflow-hidden bg-cyber-surface/20"><div className="flex items-center justify-between border-b border-white/6 p-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">Workflow Hub</p><h3 className="mt-1 text-base font-semibold text-white">工作流列表</h3></div><Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}><DialogTrigger asChild><Button size="sm" className="border border-cyber-amber/30 bg-cyber-amber/20 text-cyber-amber hover:bg-cyber-amber/30"><Plus className="mr-1 h-3.5 w-3.5" /> 新建</Button></DialogTrigger><DialogContent className="border-white/10 bg-cyber-surface text-white"><DialogHeader><DialogTitle>新建工作流</DialogTitle></DialogHeader><div className="space-y-4 pt-4"><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="工作流名称" className="border-white/10 bg-cyber-bg text-white" onKeyDown={(event) => event.key === 'Enter' && void handleCreate()} autoFocus /><div className="space-y-2"><Label className="text-xs text-white/60">所属工作室</Label><Select value={newTeamId || teamOptions[0]?.id || '__none__'} onValueChange={(value) => setNewTeamId(value === '__none__' ? '' : value)}><SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="选择一个工作室" /></SelectTrigger><SelectContent className="border-white/10 bg-cyber-panel text-white">{teamOptions.length ? teamOptions.map((team) => <SelectItem key={team.id} value={team.id}>{team.name}（{team.memberCount} 成员）</SelectItem>) : <SelectItem value="__none__">暂无可用工作室</SelectItem>}</SelectContent></Select></div><Button onClick={() => void handleCreate()} className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber" disabled={creating || !newName.trim()}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}创建</Button></div></DialogContent></Dialog></div><div className="min-h-0 flex-1 overflow-y-auto p-3">{workflows.length === 0 ? <EmptyState scene="no-workflows" className="py-10" /> : <div className="space-y-2">{workflows.map((workflow) => <button key={workflow.id} type="button" onClick={() => openWorkflow(workflow)} className={cn('group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all', selected?.id === workflow.id ? 'border-cyber-amber/35 bg-cyber-amber/12 text-white' : 'border-transparent bg-white/[0.02] text-white/55 hover:border-white/[0.08] hover:bg-white/[0.05]')}><span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><GitBranch className="h-4 w-4 text-cyber-amber/70" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{workflow.name}</span><span className="block text-[10px] text-white/30">{Object.keys(workflow.nodes).length} 节点</span></span></button>)}</div>}</div></div>}
        palette={<WorkflowNodePalette onCreateNode={(type) => addNode(type)} />}
        topbar={<WorkflowCanvasTopbar eyebrow="Workflow Studio" title={selected?.name || '选择或创建一个工作流'} subtitle={selected ? `画布优先编辑模式 · 当前团队：${currentWorkflowTeam?.name || selected.teamId}` : '从左侧列表选择工作流后，即可在中央画布拖拽节点。'} badges={<>{statusBadge ? <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', statusBadge.tone)}>{statusBadge.label}</span> : null}<span className={cn('rounded-full border px-2 py-0.5 text-[10px]', autosaveState === 'error' ? 'border-amber-400/20 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-white/5 text-white/55')}>{autosaveLabel}</span></>} />}
        canvas={<WorkflowCanvas nodes={executionDecorations.nodes} edges={executionDecorations.edges} selectedNodeId={selectedNodeId} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onEdgeUpdateStart={handleEdgeUpdateStart} onEdgeUpdate={handleEdgeUpdate} onEdgeUpdateEnd={handleEdgeUpdateEnd} onNodeSelect={setSelectedNodeId} onCreateNodeAt={addNode} />}
        dock={<WorkflowCanvasDock saving={saving} executionActive={executionIsActive} onExecute={() => void handleExecute()} onStop={() => void handleStop()} onSave={() => void handleSave()} statusBadge={statusBadge ? <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', statusBadge.tone)}>{statusBadge.label}</span> : null} />}
        inspector={<NodePropertiesPanel selectedNode={selectedNode as any} agents={scopedAgents} upstreamOptions={selectedNodeUpstreamOptions} selectedConditionConnections={selectedConditionConnections} instructionManual={selectedNodeInstructionManual} onUpdate={updateSelectedNode} onDelete={handleDeleteSelectedNode}><div className="workflow-frost-panel rounded-3xl p-4">{execution?.status === 'waiting_approval' ? <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4"><div className="flex items-start justify-between gap-3"><div className="space-y-1"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-200">等待审批</p><p className="text-sm font-medium text-white">{pendingApproval?.title || '当前执行正在等待审批'}</p><p className="text-xs text-white/45">执行：{execution.id}{execution.currentNodeId ? ` · 节点：${execution.currentNodeId}` : ''}</p></div><span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-100">waiting_approval</span></div><p className="mt-3 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-xs text-white/70">{pendingApproval?.description || '当前执行已暂停，等待人工审批后继续。'}</p>{pendingApproval ? <div className="mt-3 flex items-center gap-2"><Button size="sm" onClick={() => void handleResolveApproval(true)} disabled={approvalBusy !== null} className="border border-emerald-400/25 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25">{approvalBusy === 'approve' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}通过</Button><Button size="sm" variant="destructive" onClick={() => void handleResolveApproval(false)} disabled={approvalBusy !== null}>{approvalBusy === 'reject' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}驳回</Button></div> : null}</div> : <div><h3 className="text-sm font-semibold text-white">流程配置</h3><p className="mt-1 text-sm text-white/45">全局调度、执行日志和审批状态从这里统一查看。</p></div>}</div><div className="workflow-frost-panel rounded-3xl p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white">定时执行</h3><ToggleButton checked={schedule.enabled} onToggle={() => setSchedule((current) => ({ ...current, enabled: !current.enabled }))} label={schedule.enabled ? '已启用' : '已关闭'} /></div>{schedule.enabled ? <div className="mt-4 space-y-3"><div className="space-y-2"><Label className="text-xs text-white/60">Cron 表达式</Label><Input value={schedule.cron} onChange={(event) => setSchedule((current) => ({ ...current, cron: event.target.value }))} className="border-white/10 bg-cyber-bg text-white" /></div><div className="space-y-2"><Label className="text-xs text-white/60">时区</Label><Input value={schedule.timezone} onChange={(event) => setSchedule((current) => ({ ...current, timezone: event.target.value }))} className="border-white/10 bg-cyber-bg text-white" /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label className="text-xs text-white/60">生效开始</Label><Input type="datetime-local" value={toDateTimeLocalValue(schedule.activeFrom)} onChange={(event) => setSchedule((current) => ({ ...current, activeFrom: fromDateTimeLocalValue(event.target.value) }))} className="border-white/10 bg-cyber-bg text-white" /></div><div className="space-y-2"><Label className="text-xs text-white/60">生效截止</Label><Input type="datetime-local" value={toDateTimeLocalValue(schedule.activeUntil)} onChange={(event) => setSchedule((current) => ({ ...current, activeUntil: fromDateTimeLocalValue(event.target.value) }))} className="border-white/10 bg-cyber-bg text-white" /></div></div></div> : <p className="mt-3 text-sm text-white/35">关闭后不会自动调度执行，仅支持手动触发。</p>}</div><div className="workflow-frost-panel rounded-3xl p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">执行日志</h3>{execution ? <span className="text-[10px] text-white/35">{execution.id}</span> : null}</div>{execution?.logs?.length ? <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{execution.logs.map((log, index) => <div key={`${log.timestamp}-${index}`} className="rounded-2xl border border-white/6 bg-cyber-bg/45 p-3"><div className="mb-1 flex items-center justify-between gap-3"><span className={cn('text-[10px] uppercase', log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-yellow-300' : 'text-emerald-300')}>{log.level}</span><span className="text-[10px] text-white/30">{new Date(log.timestamp).toLocaleString()}</span></div><p className="mb-1 text-[11px] text-white/45">节点: {log.nodeId}</p><p className="whitespace-pre-wrap text-sm text-white/80">{log.message}</p></div>)}</div> : <p className="mt-3 text-sm text-white/35">执行后会在这里显示真实日志和失败原因。</p>}</div></NodePropertiesPanel>}
        emptyState={<div className="flex h-full items-center justify-center rounded-[26px] border border-dashed border-white/10 bg-white/[0.02]"><div className="max-w-xl text-center"><p className="text-lg font-medium text-white">画布已准备好，先选择一个工作流</p><p className="mt-2 text-sm leading-6 text-white/45">左侧管理工作流，选中后可在中间画布拖拽节点、连接分支，并在右侧检查器里配置参数。</p></div></div>}
      />
    </div>
  )
}
