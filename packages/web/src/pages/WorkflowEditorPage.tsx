import { useCallback, useState, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { GitBranch, Play, Square, Plus, Save, Loader2, Zap, Split, Layers, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { WorkflowDefinition, WorkflowExecution } from '@/types'

import { TaskNodeComponent } from '@/components/workflow/TaskNode'
import { ConditionNodeComponent } from '@/components/workflow/ConditionNode'
import { ApprovalNodeComponent } from '@/components/workflow/ApprovalNode'

const nodeTypes: NodeTypes = {
  taskNode: TaskNodeComponent,
  conditionNode: ConditionNodeComponent,
  approvalNode: ApprovalNodeComponent,
}

export function WorkflowEditorPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selected, setSelected] = useState<WorkflowDefinition | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [execution, setExecution] = useState<WorkflowExecution | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<WorkflowDefinition[]>('/workflows').then(setWorkflows)
  }, [])

  const loadWorkflow = useCallback((wf: WorkflowDefinition) => {
    setSelected(wf)
    const flowNodes: Node[] = Object.entries(wf.nodes).map(([id, node]) => ({
      id,
      type: node.type === 'task' ? 'taskNode' : node.type === 'condition' ? 'conditionNode' : node.type === 'approval' ? 'approvalNode' : 'taskNode',
      position: node.position || { x: 250, y: 100 },
      data: { ...node },
    }))
    const flowEdges: Edge[] = wf.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.from,
      target: e.to,
      label: e.condition,
      animated: true,
      style: { stroke: '#6366F1', strokeWidth: 2 },
    }))
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [setNodes, setEdges])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#6366F1', strokeWidth: 2 } }, eds))
  }, [setEdges])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const wf = await api.post<WorkflowDefinition>('/workflows', { teamId: 'default', name: newName.trim() })
    setWorkflows((prev) => [wf, ...prev])
    loadWorkflow(wf)
    setNewName('')
    setCreating(false)
  }

  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    const nodeMap: Record<string, any> = {}
    nodes.forEach((n) => {
      nodeMap[n.id] = { ...n.data, id: n.id, position: n.position, label: n.data.label || n.id }
    })
    const edgeList = edges.map((e) => ({ from: e.source, to: e.target, condition: e.label as string | undefined }))
    await api.put(`/workflows/${selected.id}`, { nodes: nodeMap, edges: edgeList })
    setSaving(false)
  }

  const addNode = (type: string) => {
    const id = `node-${Date.now()}`
    let nodeType = 'taskNode'
    let data: Record<string, any> = {
      type,
      label: '新任务',
      agentId: '',
      task: '',
      timeoutSeconds: 60,
      expression: '',
      branches: {},
    }

    if (type === 'condition') {
      nodeType = 'conditionNode'
      data.label = '条件分支'
    } else if (type === 'approval') {
      nodeType = 'approvalNode'
      data = {
        type: 'approval',
        label: '审批节点',
        title: '审批',
        description: '',
        approver: '',
        timeoutMinutes: 30,
        onTimeout: 'reject',
      }
    }

    const newNode: Node = {
      id,
      type: nodeType,
      position: { x: 250 + Math.random() * 100, y: 150 + nodes.length * 80 },
      data,
    }
    setNodes((prev) => [...prev, newNode])
  }

  const handleExecute = async () => {
    if (!selected) return
    const exec = await api.post<WorkflowExecution>(`/workflows/${selected.id}/execute`)
    setExecution(exec)
  }

  const handleStop = async () => {
    if (!selected || !execution) return
    await api.post(`/workflows/${selected.id}/stop`, { executionId: execution.id })
    setExecution((prev) => prev ? { ...prev, status: 'stopped' } : null)
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar: Workflow list */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-cyber-surface/30">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-cyber-amber" />
            工作流
          </h2>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/30 hover:text-white">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/10">
              <DialogHeader><DialogTitle className="text-white">新建工作流</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="工作流名称" className="bg-cyber-bg border-white/10 text-white" />
                <Button onClick={handleCreate} className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber" disabled={!newName.trim()}>创建</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {workflows.map((wf) => (
            <button
              key={wf.id}
              onClick={() => loadWorkflow(wf)}
              className={cn(
                'w-full flex items-center gap-2 p-3 rounded-xl transition-all cursor-pointer text-left',
                selected?.id === wf.id ? 'bg-cyber-amber/15 border border-cyber-amber/30' : 'hover:bg-white/5 border border-transparent'
              )}
            >
              <GitBranch className="w-4 h-4 text-cyber-amber/60 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{wf.name}</p>
                <p className="text-white/30 text-[10px]">{Object.keys(wf.nodes).length} 节点</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <GitBranch className="w-16 h-16 text-white/10 mb-4" />
            <p className="text-white/30">选择或创建工作流开始编辑</p>
          </div>
        ) : (
          <>
            <div className="h-full relative">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                className="bg-cyber-bg"
              >
                <Background color="#6366F120" gap={20} size={1} />
                <Controls className="!bg-cyber-panel !border-white/10 !rounded-xl [&>button]:!bg-cyber-panel [&>button]:!border-white/10 [&>button]:!text-white/50" />
                <MiniMap nodeColor="#6366F1" maskColor="#0F0F2390" className="!bg-cyber-panel !border-white/10 !rounded-xl" />

                {/* Top toolbar */}
                <Panel position="top-left" className="flex gap-2">
                  <button onClick={() => addNode('task')} className="glass flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:border-cyber-blue/30 transition-all cursor-pointer">
                    <Zap className="w-3.5 h-3.5 text-cyber-blue" /> 任务
                  </button>
                  <button onClick={() => addNode('condition')} className="glass flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:border-cyber-amber/30 transition-all cursor-pointer">
                    <Split className="w-3.5 h-3.5 text-cyber-amber" /> 条件
                  </button>
                  <button onClick={() => addNode('approval')} className="glass flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:border-yellow-500/30 transition-all cursor-pointer">
                    <UserCheck className="w-3.5 h-3.5 text-yellow-400" /> 审批
                  </button>
                </Panel>

                {/* Bottom controls */}
                <Panel position="bottom-center" className="flex items-center gap-3 glass rounded-xl px-4 py-2">
                  <Button size="sm" onClick={handleExecute} disabled={execution?.status === 'running'} className="bg-cyber-green/20 text-cyber-green border border-cyber-green/30 hover:bg-cyber-green/30 h-8">
                    {execution?.status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                    执行
                  </Button>
                  <Button size="sm" onClick={handleStop} disabled={execution?.status !== 'running'} variant="destructive" className="h-8">
                    <Square className="w-3.5 h-3.5 mr-1" /> 停止
                  </Button>
                  <div className="w-px h-5 bg-white/10" />
                  <Button size="sm" onClick={handleSave} disabled={saving} className="bg-cyber-purple/20 text-cyber-lavender border border-cyber-purple/30 h-8">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                    保存
                  </Button>
                  {execution && (
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full', execution.status === 'running' ? 'bg-cyber-green/20 text-cyber-green' : execution.status === 'completed' ? 'bg-cyber-blue/20 text-cyber-blue' : 'bg-white/10 text-white/40')}>
                      {execution.status}
                    </span>
                  )}
                </Panel>
              </ReactFlow>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
