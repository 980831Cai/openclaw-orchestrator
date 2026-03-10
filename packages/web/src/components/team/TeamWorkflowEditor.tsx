import { useCallback, useState, useEffect } from 'react'
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
import { GitBranch, Play, Square, Plus, Save, Loader2, Zap, Split, UserCheck } from 'lucide-react'
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

interface TeamWorkflowEditorProps {
  teamId: string
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

  useEffect(() => {
    api.get<WorkflowDefinition[]>('/workflows').then((all) => {
      // 只保留属于当前团队的工作流
      const teamWfs = all.filter((w) => w.teamId === teamId)
      setWorkflows(teamWfs)
    })
  }, [teamId])

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
    const wf = await api.post<WorkflowDefinition>('/workflows', { teamId, name: newName.trim() })
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
    <div className="space-y-4">
      {/* 顶部：工作流选择 + 创建 */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-cyber-amber" />
          {workflows.length} 个工作流
        </h3>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-cyber-amber/20 text-cyber-amber border border-cyber-amber/30 hover:bg-cyber-amber/30">
              <Plus className="h-3.5 w-3.5 mr-1" /> 新工作流
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-cyber-surface border-white/10">
            <DialogHeader><DialogTitle className="text-white">新建工作流</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="工作流名称" className="bg-cyber-bg border-white/10 text-white" onKeyDown={(e) => e.key === 'Enter' && handleCreate()} autoFocus />
              <Button onClick={handleCreate} className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber" disabled={!newName.trim()}>创建</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 工作流列表 + 选中后展示编辑器 */}
      {workflows.length === 0 && !selected ? (
        <div className="text-center py-12">
          <GitBranch className="w-12 h-12 text-white/10 mx-auto mb-3" />
          <p className="text-white/20">暂无工作流，点击"新工作流"开始创建</p>
        </div>
      ) : (
        <>
          {/* 工作流卡片列表 */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {workflows.map((wf) => (
              <button
                key={wf.id}
                onClick={() => loadWorkflow(wf)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex-shrink-0',
                  selected?.id === wf.id
                    ? 'bg-cyber-amber/15 border border-cyber-amber/30 text-white'
                    : 'hover:bg-white/5 border border-transparent text-white/50'
                )}
              >
                <GitBranch className="w-3.5 h-3.5 text-cyber-amber/60 flex-shrink-0" />
                <span className="text-xs font-medium">{wf.name}</span>
                <span className="text-[10px] text-white/30">{Object.keys(wf.nodes).length}节点</span>
              </button>
            ))}
          </div>

          {/* ReactFlow 编辑器画布 */}
          {selected && (
            <div className="h-[400px] rounded-xl overflow-hidden border border-white/10">
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

                {/* Top toolbar: 添加节点 */}
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

                {/* Bottom controls: 执行 / 停止 / 保存 */}
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
          )}
        </>
      )}
    </div>
  )
}
