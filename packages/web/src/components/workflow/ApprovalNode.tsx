import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { UserCheck, Clock } from 'lucide-react'

export const ApprovalNodeComponent = memo(({ data, selected }: NodeProps) => {
  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${selected ? 'border-yellow-500/60 shadow-lg shadow-yellow-500/10 scale-105' : 'border-yellow-500/20'}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
        shadow-lg shadow-yellow-500/5
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-cyber-panel"
      />

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md bg-yellow-500/20 flex items-center justify-center">
            <UserCheck className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <span className="text-white text-xs font-semibold">
            {data.label || '审批节点'}
          </span>
        </div>

        {data.title && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-yellow-400/70 text-[10px] font-medium">审批:</span>
            <span className="text-white/60 text-[10px] truncate">{data.title}</span>
          </div>
        )}

        {data.description && (
          <p className="text-white/30 text-[10px] truncate mb-1">{data.description}</p>
        )}

        {data.timeoutMinutes > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 text-yellow-500/40" />
            <span className="text-white/20 text-[9px]">
              超时: {data.timeoutMinutes}分钟
            </span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-yellow-500 !w-3 !h-3 !border-2 !border-cyber-panel"
      />
    </div>
  )
})

ApprovalNodeComponent.displayName = 'ApprovalNodeComponent'
