import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Split } from 'lucide-react'

export const ConditionNodeComponent = memo(({ data, selected }: NodeProps) => {
  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${selected ? 'border-cyber-amber/60 shadow-lg shadow-cyber-amber/10 scale-105' : 'border-cyber-amber/20'}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyber-amber !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md bg-cyber-amber/20 flex items-center justify-center">
            <Split className="w-3.5 h-3.5 text-cyber-amber" />
          </div>
          <span className="text-white text-xs font-semibold">{data.label || '条件分支'}</span>
        </div>

        {data.expression && (
          <div className="bg-cyber-bg/50 rounded-md px-2 py-1 mb-1">
            <p className="text-cyber-amber/70 text-[10px] font-mono truncate">{data.expression}</p>
          </div>
        )}

        {data.branches && Object.keys(data.branches).length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {Object.keys(data.branches).map((branch) => (
              <span key={branch} className="text-[9px] px-1.5 py-0.5 rounded bg-cyber-amber/10 text-cyber-amber/60">
                {branch}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-cyber-green !w-3 !h-3 !border-2 !border-cyber-panel" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="no" className="!bg-cyber-red !w-3 !h-3 !border-2 !border-cyber-panel" style={{ left: '70%' }} />
    </div>
  )
})

ConditionNodeComponent.displayName = 'ConditionNodeComponent'
