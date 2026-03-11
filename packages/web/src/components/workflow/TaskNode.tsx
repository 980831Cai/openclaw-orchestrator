import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Zap } from 'lucide-react'

export const TaskNodeComponent = memo(({ data, selected }: NodeProps) => {
  const executionState = String((data as any).executionState || 'idle')
  const executionStateLabel =
    executionState === 'running' ? '进行中' :
    executionState === 'failed' ? '失败' :
    executionState === 'success' ? '成功' :
    null
  const stateClass =
    executionState === 'running'
      ? 'border-amber-400/80 shadow-lg shadow-amber-400/20'
      : executionState === 'failed'
        ? 'border-red-400/70 shadow-lg shadow-red-500/15'
        : executionState === 'success'
          ? 'border-cyber-green/60 shadow-lg shadow-cyber-green/15'
          : selected
            ? 'border-cyber-blue/60 glow-blue scale-105'
            : 'border-cyber-blue/20'

  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${stateClass}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
        shadow-lg shadow-cyber-blue/5
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyber-blue !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyber-blue/20">
            <Zap className="h-3.5 w-3.5 text-cyber-blue" />
          </div>
          <span className="text-xs font-semibold text-white">{data.label || '任务节点'}</span>
        </div>

        {data.agentId && (
          <div className="mb-1 flex items-center gap-1.5">
            <div className="flex h-4 w-4 items-center justify-center rounded bg-cyber-purple/20 text-[8px] text-cyber-lavender">AI</div>
            <span className="text-[10px] text-white/50">{data.agentId}</span>
          </div>
        )}

        {data.task && <p className="truncate text-[10px] text-white/30">{data.task}</p>}
        {data.timeoutSeconds && <span className="text-[9px] text-white/15">超时: {data.timeoutSeconds}s</span>}
        {executionStateLabel ? (
          <div className="mt-2 text-[9px] tracking-wide text-white/45">{executionStateLabel}</div>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-cyber-blue !w-3 !h-3 !border-2 !border-cyber-panel" />
    </div>
  )
})

TaskNodeComponent.displayName = 'TaskNodeComponent'
