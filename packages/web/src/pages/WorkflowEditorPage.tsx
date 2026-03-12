import ReactFlow, {
  Background,
  Controls,
  MiniMap,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { GitBranch, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/brand/EmptyState'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useWorkflowEditor } from '@/hooks/use-workflow-editor'
import { NodePropertiesPanel } from '@/components/workflow/NodePropertiesPanel'
import { WorkflowToolbar } from '@/components/workflow/WorkflowToolbar'
import { TaskNodeComponent } from '@/components/workflow/TaskNode'
import { ConditionNodeComponent } from '@/components/workflow/ConditionNode'
import { ApprovalNodeComponent } from '@/components/workflow/ApprovalNode'
import { JoinNodeComponent } from '@/components/workflow/JoinNode'
import { MeetingNodeComponent } from '@/components/workflow/MeetingNode'
import { DebateNodeComponent } from '@/components/workflow/DebateNode'

const nodeTypes = {
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
  parallel: JoinNodeComponent,
  approval: ApprovalNodeComponent,
  meeting: MeetingNodeComponent,
  debate: DebateNodeComponent,
}

export function WorkflowEditorPage() {
  const editor = useWorkflowEditor()

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
          <Dialog open={editor.creating} onOpenChange={editor.setCreating}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/30 hover:text-white cursor-pointer">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/10">
              <DialogHeader><DialogTitle className="text-white">新建工作流</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  value={editor.newName}
                  onChange={(e) => editor.setNewName(e.target.value)}
                  placeholder="工作流名称"
                  className="bg-cyber-bg border-white/10 text-white"
                  onKeyDown={(e) => e.key === 'Enter' && editor.handleCreate()}
                />
                <Input
                  value={editor.newTeamId}
                  onChange={(e) => editor.setNewTeamId(e.target.value)}
                  placeholder="Team ID（默认 default）"
                  className="bg-cyber-bg border-white/10 text-white"
                />
                <Button onClick={editor.handleCreate} className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber" disabled={editor.creating || !editor.newName.trim()}>
                  {editor.creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  创建
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {editor.workflows.length === 0 ? (
            <EmptyState scene="no-workflows" className="py-8" />
          ) : (
            editor.workflows.map((wf, i) => (
              <button
                key={wf.id}
                onClick={() => editor.loadWorkflow(wf)}
                className={cn(
                  'w-full flex items-center gap-2 p-3 rounded-xl transition-all cursor-pointer text-left animate-fade-in group',
                  editor.selected?.id === wf.id
                    ? 'cartoon-card border-cyber-amber/30'
                    : 'hover:bg-white/5 border-2 border-transparent'
                )}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                  editor.selected?.id === wf.id ? 'bg-cyber-amber/15' : 'bg-white/5'
                )}>
                  <GitBranch className={cn(
                    'w-3.5 h-3.5 transition-colors',
                    editor.selected?.id === wf.id ? 'text-cyber-amber' : 'text-white/25'
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
        {!editor.selected ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <EmptyState scene="no-workflows" title="选择或创建工作流" description="从左侧列表选择工作流开始编辑，或创建一个新的" />
          </div>
        ) : (
          <div className="flex h-full">
            <div className="flex-1 h-full relative">
              <ReactFlow
                nodes={editor.nodes}
                edges={editor.edges}
                onNodesChange={editor.onNodesChange}
                onEdgesChange={editor.onEdgesChange}
                onConnect={editor.onConnect}
                onNodeClick={(_, node) => editor.setSelectedNodeId(node.id)}
                nodeTypes={nodeTypes}
                fitView
                className="bg-cyber-bg"
              >
                <Background color="#6366F110" gap={20} size={1} />
                <Controls className="!bg-cyber-panel/90 !border-white/10 !rounded-xl [&>button]:!bg-cyber-panel [&>button]:!border-white/10 [&>button]:!text-white/50 !backdrop-blur-sm" />
                <MiniMap nodeColor="#6366F1" maskColor="#0F0F2390" className="!bg-cyber-panel/90 !border-white/10 !rounded-xl !backdrop-blur-sm" />
                <WorkflowToolbar
                  execution={editor.execution}
                  saving={editor.saving}
                  onAddNode={editor.addNode}
                  onExecute={editor.handleExecute}
                  onStop={editor.handleStop}
                  onSave={editor.handleSave}
                />
              </ReactFlow>
            </div>

            {/* ── Right panel: Node config + Execution logs ── */}
            <div className="w-96 border-l border-white/5 bg-cyber-surface/30 overflow-y-auto">
              <div className="p-4 border-b border-white/5">
                <h3 className="text-white font-semibold text-sm">节点配置</h3>
              </div>
              <div className="p-4 space-y-4">
                <NodePropertiesPanel
                  selectedNode={editor.selectedNode}
                  agents={editor.agents}
                  upstreamOptions={editor.selectedNodeUpstreamOptions}
                  onUpdate={editor.updateSelectedNode}
                />
              </div>

              {/* Execution logs */}
              <div className="p-4 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm">执行日志</h3>
                  {editor.execution ? <span className="text-[10px] text-white/35">{editor.execution.id}</span> : null}
                </div>
                {editor.execution?.logs?.length ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {editor.execution.logs.map((log, index) => (
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
