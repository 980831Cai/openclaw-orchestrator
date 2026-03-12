import React from 'react'
import { Panel } from 'reactflow'
import { Loader2, Merge, MessageSquare, Play, Save, Split, Square, Swords, UserCheck, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WorkflowExecution, WorkflowNodeData } from '@/types'

interface WorkflowToolbarProps {
  execution: WorkflowExecution | null
  saving: boolean
  onAddNode: (type: WorkflowNodeData['type']) => void
  onExecute: () => void
  onStop: () => void
  onSave: () => void
}

const NODE_BUTTONS: { type: WorkflowNodeData['type']; icon: React.ReactNode; label: string; hoverClass?: string }[] = [
  { type: 'task', icon: <Zap className="w-3.5 h-3.5 text-cyber-blue" />, label: '任务' },
  { type: 'condition', icon: <Split className="w-3.5 h-3.5 text-cyber-amber" />, label: '条件' },
  { type: 'approval', icon: <UserCheck className="w-3.5 h-3.5 text-yellow-400" />, label: '审批' },
  { type: 'join', icon: <Merge className="w-3.5 h-3.5 text-cyber-green" />, label: '汇合', hoverClass: 'hover:border-cyber-green/30' },
  { type: 'meeting', icon: <MessageSquare className="w-3.5 h-3.5 text-purple-400" />, label: '会议', hoverClass: 'hover:border-purple-400/30' },
  { type: 'debate', icon: <Swords className="w-3.5 h-3.5 text-orange-400" />, label: '辩论', hoverClass: 'hover:border-orange-400/30' },
]

export const WorkflowToolbar = React.memo(function WorkflowToolbar({
  execution,
  saving,
  onAddNode,
  onExecute,
  onStop,
  onSave,
}: WorkflowToolbarProps) {
  return (
    <>
      {/* Top toolbar — node add buttons */}
      <Panel position="top-left" className="flex gap-2">
        {NODE_BUTTONS.map(({ type, icon, label, hoverClass }) => (
          <button
            key={type}
            onClick={() => onAddNode(type)}
            className={cn(
              'cartoon-card flex items-center gap-1.5 px-3 py-2 text-xs text-white/50 hover:text-white transition-all cursor-pointer',
              hoverClass
            )}
          >
            {icon} {label}
          </button>
        ))}
      </Panel>

      {/* Bottom controls — execute / stop / save */}
      <Panel position="bottom-center" className="flex items-center gap-3 cartoon-card px-4 py-2.5">
        <Button
          size="sm"
          onClick={onExecute}
          disabled={execution?.status === 'running'}
          className="bg-cyber-green/15 text-cyber-green border border-cyber-green/25 hover:bg-cyber-green/25 h-8 rounded-lg"
        >
          {execution?.status === 'running' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1" />
          )}
          执行
        </Button>
        <Button
          size="sm"
          onClick={onStop}
          disabled={!execution || execution.status !== 'running'}
          variant="destructive"
          className="h-8 rounded-lg"
        >
          <Square className="w-3.5 h-3.5 mr-1" /> 停止
        </Button>
        <div className="w-px h-5 bg-white/8" />
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="bg-cyber-purple/15 text-cyber-lavender border border-cyber-purple/25 hover:bg-cyber-purple/25 h-8 rounded-lg"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1" />
          )}
          保存
        </Button>
        {execution && (
          <span
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border',
              execution.status === 'running'
                ? 'bg-cyber-green/10 text-cyber-green border-cyber-green/20 animate-pulse'
                : execution.status === 'completed'
                  ? 'bg-cyber-blue/10 text-cyber-blue border-cyber-blue/20'
                  : execution.status === 'failed'
                    ? 'bg-red-500/10 text-red-300 border-red-500/20'
                    : 'bg-white/5 text-white/40 border-white/10'
            )}
          >
            {execution.status === 'running'
              ? '运行中'
              : execution.status === 'completed'
                ? '已完成'
                : execution.status === 'failed'
                  ? '失败'
                  : execution.status}
          </span>
        )}
      </Panel>
    </>
  )
})
