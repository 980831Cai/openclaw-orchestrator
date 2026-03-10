import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Swords } from 'lucide-react'

export const DebateNodeComponent = memo(({ data, selected }: NodeProps) => {
  const participants: string[] = data.participants || []
  const maxRounds = data.maxRounds || 3

  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${selected ? 'border-orange-400/60 shadow-lg shadow-orange-400/10 scale-105' : 'border-orange-400/20'}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-orange-400 !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md bg-orange-400/20 flex items-center justify-center">
            <Swords className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <span className="text-white text-xs font-semibold">{data.label || '辩论节点'}</span>
        </div>

        {/* Topic */}
        {data.topic && (
          <p className="text-white/40 text-[10px] truncate mb-1">
            🥊 {data.topic}
          </p>
        )}

        {/* Participants — 2 sides */}
        {participants.length === 2 && (
          <div className="flex items-center gap-1 my-1">
            <span className="text-[10px] text-orange-300/60 bg-orange-400/10 px-1.5 py-0.5 rounded truncate max-w-[70px]">
              {participants[0]}
            </span>
            <span className="text-orange-400/50 text-[10px] font-bold">VS</span>
            <span className="text-[10px] text-orange-300/60 bg-orange-400/10 px-1.5 py-0.5 rounded truncate max-w-[70px]">
              {participants[1]}
            </span>
          </div>
        )}

        {/* Rounds */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-orange-300/60">回合</span>
          <span className="rounded bg-orange-400/10 px-1.5 py-0.5 text-[10px] text-orange-300/70">
            ≤ {maxRounds} 轮
          </span>
        </div>

        {/* Judge */}
        {data.judgeAgentId && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px]">⚖️</span>
            <span className="text-white/25 text-[9px]">裁判: {data.judgeAgentId}</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-orange-400 !w-3 !h-3 !border-2 !border-cyber-panel" />
    </div>
  )
})

DebateNodeComponent.displayName = 'DebateNodeComponent'
