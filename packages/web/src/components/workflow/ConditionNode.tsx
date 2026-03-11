import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Split } from 'lucide-react'

export const ConditionNodeComponent = memo(({ data, selected }: NodeProps) => {
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
            ? 'border-cyber-amber/60 shadow-lg shadow-cyber-amber/10 scale-105'
            : 'border-cyber-amber/20'

  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${stateClass}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyber-amber !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyber-amber/20">
            <Split className="h-3.5 w-3.5 text-cyber-amber" />
          </div>
          <span className="text-xs font-semibold text-white">{data.label || '条件分支'}</span>
        </div>

        {data.expression && (
          <div className="mb-1 rounded-md bg-cyber-bg/50 px-2 py-1">
            <p className="truncate font-mono text-[10px] text-cyber-amber/70">{data.expression}</p>
          </div>
        )}
        <div className="flex items-center justify-between text-[9px] tracking-wide text-white/35">
          <span>命中</span>
          <span>未命中</span>
        </div>

        {executionStateLabel ? (
          <div className="mt-2 text-[9px] tracking-wide text-white/45">{executionStateLabel}</div>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-cyber-green !w-3 !h-3 !border-2 !border-cyber-panel" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-cyber-red !w-3 !h-3 !border-2 !border-cyber-panel" style={{ left: '70%' }} />
    </div>
  )
})

ConditionNodeComponent.displayName = 'ConditionNodeComponent'
