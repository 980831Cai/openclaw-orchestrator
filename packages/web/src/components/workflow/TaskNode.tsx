import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Zap } from 'lucide-react'

export const TaskNodeComponent = memo(({ data, selected }: NodeProps) => {
  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${selected ? 'border-cyber-blue/60 glow-blue scale-105' : 'border-cyber-blue/20'}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
        shadow-lg shadow-cyber-blue/5
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyber-blue !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md bg-cyber-blue/20 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-cyber-blue" />
          </div>
          <span className="text-white text-xs font-semibold">{data.label || '任务节点'}</span>
        </div>

        {data.agentId && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-4 h-4 rounded bg-cyber-purple/20 text-[8px] flex items-center justify-center">🤖</div>
            <span className="text-white/50 text-[10px]">{data.agentId}</span>
          </div>
        )}

        {data.task && (
          <p className="text-white/30 text-[10px] truncate">{data.task}</p>
        )}

        {data.timeoutSeconds && (
          <span className="text-white/15 text-[9px]">超时: {data.timeoutSeconds}s</span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-cyber-blue !w-3 !h-3 !border-2 !border-cyber-panel" />
    </div>
  )
})

TaskNodeComponent.displayName = 'TaskNodeComponent'
