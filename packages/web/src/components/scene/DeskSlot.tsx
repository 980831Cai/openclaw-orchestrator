import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { cn } from '@/lib/utils'
import type { TeamMember } from '@/types'

interface DeskSlotProps {
  member: TeamMember | null
  color: string
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onAddMember?: () => void
  onViewAgent?: (agentId: string) => void
}

export function DeskSlot({ member, color, isHovered, onHover, onAddMember, onViewAgent }: DeskSlotProps) {
  if (!member) {
    return (
      <div className="relative group">
        <div
          className="glass rounded-xl p-4 border-dashed border-white/10 flex flex-col items-center justify-center min-h-[100px] transition-all duration-300 hover:border-cyber-purple/30 cursor-pointer"
          onClick={onAddMember}
        >
          <div className="w-10 h-10 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-white/15 group-hover:border-cyber-purple/30 group-hover:text-cyber-lavender/40 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-white/15 text-[10px] mt-2 group-hover:text-white/30 transition-colors">
            点击邀请
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative group"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Desk surface */}
      <div
        className={cn(
          'glass rounded-xl p-4 flex flex-col items-center gap-2 min-h-[100px] transition-all duration-300 cursor-pointer',
          isHovered && 'scale-105 glow-purple border-cyber-purple/40'
        )}
        onClick={() => onViewAgent?.(member.agentId)}
      >
        {/* Agent avatar */}
        <AgentAvatar
          emoji="🤖"
          theme={color}
          status="idle"
          size="md"
        />

        {/* Agent info */}
        <div className="text-center">
          <p className="text-white text-xs font-medium truncate max-w-[80px]">
            {member.agentId}
          </p>
          <p className="text-white/30 text-[10px]">{member.role || 'member'}</p>
        </div>

        {/* Keyboard light effect when busy */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />
      </div>

      {/* Hover tooltip */}
      {isHovered && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 animate-fade-in">
          <div className="glass-strong rounded-lg px-3 py-2 text-center whitespace-nowrap">
            <p className="text-white text-xs font-semibold">{member.agentId}</p>
            <p className="text-cyber-lavender text-[10px]">角色: {member.role || 'member'}</p>
            <p className="text-white/30 text-[10px]">加入顺序: #{member.joinOrder}</p>
            <p className="text-cyber-purple text-[10px] mt-1">点击查看工作空间 →</p>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-white/10" />
        </div>
      )}
    </div>
  )
}
