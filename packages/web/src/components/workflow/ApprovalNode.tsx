import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Clock, UserCheck } from 'lucide-react'

export const ApprovalNodeComponent = memo(({ data, selected }: NodeProps) => {
  const executionState = String((data as any).executionState || 'idle')
  const stateClass =
    executionState === 'running'
      ? 'border-amber-400/80 shadow-lg shadow-amber-400/20'
      : executionState === 'failed'
        ? 'border-red-400/70 shadow-lg shadow-red-500/15'
        : executionState === 'success'
          ? 'border-cyber-green/60 shadow-lg shadow-cyber-green/15'
          : selected
            ? 'border-yellow-500/60 shadow-lg shadow-yellow-500/10 scale-105'
            : 'border-yellow-500/20'

  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${stateClass}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
        shadow-lg shadow-yellow-500/5
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-yellow-500/20">
            <UserCheck className="h-3.5 w-3.5 text-yellow-400" />
          </div>
          <span className="text-xs font-semibold text-white">{data.label || '审批节点'}</span>
        </div>

        {data.title && (
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-yellow-400/70">审批:</span>
            <span className="truncate text-[10px] text-white/60">{data.title}</span>
          </div>
        )}

        {data.description && <p className="mb-1 truncate text-[10px] text-white/30">{data.description}</p>}

        {data.timeoutMinutes > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <Clock className="h-3 w-3 text-yellow-500/40" />
            <span className="text-[9px] text-white/20">超时: {data.timeoutMinutes} 分钟</span>
          </div>
        )}

        {executionState !== 'idle' ? (
          <div className="mt-2 text-[9px] uppercase tracking-wide text-white/45">{executionState}</div>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-cyber-panel" />
    </div>
  )
})

ApprovalNodeComponent.displayName = 'ApprovalNodeComponent'
