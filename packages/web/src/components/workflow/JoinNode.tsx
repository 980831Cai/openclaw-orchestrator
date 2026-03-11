import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Merge } from 'lucide-react'

const MODE_LABELS: Record<string, string> = {
  and: 'AND',
  or: 'OR',
  xor: 'XOR',
}

export const JoinNodeComponent = memo(({ data, selected }: NodeProps) => {
  const mode = MODE_LABELS[String(data.joinMode || 'and').toLowerCase()] || 'AND'
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
            ? 'border-cyber-green/60 shadow-lg shadow-cyber-green/10 scale-105'
            : 'border-cyber-green/20'

  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${stateClass}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyber-green !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyber-green/20">
            <Merge className="h-3.5 w-3.5 text-cyber-green" />
          </div>
          <span className="text-xs font-semibold text-white">{data.label || '汇合节点'}</span>
        </div>

        <div className="mb-1 flex items-center gap-1.5">
          <span className="text-[10px] text-cyber-green/70">模式</span>
          <span className="rounded bg-cyber-green/10 px-1.5 py-0.5 text-[10px] text-cyber-green/80">{mode}</span>
        </div>

        <p className="text-[10px] text-white/35">等待上游分支满足条件后再继续向下执行</p>
        {String(data.joinMode || 'and').toLowerCase() === 'xor' && data.preferredSourceNodeId ? (
          <p className="mt-1 text-[10px] text-cyber-green/65">指定上游：{String(data.preferredSourceNodeId)}</p>
        ) : null}
        {executionStateLabel ? (
          <div className="mt-2 text-[9px] tracking-wide text-white/45">{executionStateLabel}</div>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-cyber-green !w-3 !h-3 !border-2 !border-cyber-panel" />
    </div>
  )
})

JoinNodeComponent.displayName = 'JoinNodeComponent'
