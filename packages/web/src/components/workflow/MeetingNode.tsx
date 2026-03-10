import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Users } from 'lucide-react'
import { MEETING_TYPE_LABELS, MEETING_TYPE_ICONS } from '@/types'
import type { MeetingType } from '@/types'

export const MeetingNodeComponent = memo(({ data, selected }: NodeProps) => {
  const meetingType = (data.meetingType || 'standup') as MeetingType
  const icon = MEETING_TYPE_ICONS[meetingType] || '📋'
  const typeLabel = MEETING_TYPE_LABELS[meetingType] || '会议'
  const participants: string[] = data.participants || []

  return (
    <div
      className={`
        min-w-[180px] rounded-xl border-2 transition-all
        ${selected ? 'border-purple-400/60 shadow-lg shadow-purple-400/10 scale-105' : 'border-purple-400/20'}
        bg-gradient-to-br from-cyber-panel to-cyber-surface
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400 !w-3 !h-3 !border-2 !border-cyber-panel" />

      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-md bg-purple-400/20 flex items-center justify-center">
            <span className="text-sm">{icon}</span>
          </div>
          <span className="text-white text-xs font-semibold">{data.label || `${typeLabel}节点`}</span>
        </div>

        {/* Meeting type badge */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] text-purple-300/70">类型</span>
          <span className="rounded bg-purple-400/10 px-1.5 py-0.5 text-[10px] text-purple-300/80">
            {typeLabel}
          </span>
        </div>

        {/* Topic */}
        {data.topic && (
          <p className="text-white/40 text-[10px] truncate mb-1">
            📌 {data.topic}
          </p>
        )}

        {/* Participants */}
        {participants.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Users className="w-3 h-3 text-purple-300/40" />
            <span className="text-white/30 text-[9px]">
              {participants.length} 名参与者
            </span>
          </div>
        )}

        {/* Lead indicator */}
        {data.leadAgentId && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[9px]">👑</span>
            <span className="text-white/25 text-[9px]">{data.leadAgentId}</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-purple-400 !w-3 !h-3 !border-2 !border-cyber-panel" />
    </div>
  )
})

MeetingNodeComponent.displayName = 'MeetingNodeComponent'
