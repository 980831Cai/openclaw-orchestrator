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

/** Small desk items for decoration */
function DeskItems({ color }: { color: string }) {
  return (
    <div className="flex items-end gap-1.5 mt-1">
      {/* Monitor */}
      <div className="flex flex-col items-center">
        <div
          className="w-8 h-5 rounded-sm border border-white/10"
          style={{ background: `linear-gradient(135deg, ${color}15, ${color}08)` }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: `${color}80` }} />
          </div>
        </div>
        <div className="w-2 h-1 bg-white/5 rounded-b-sm" />
      </div>

      {/* Coffee mug */}
      <div className="relative">
        <div className="w-3 h-3.5 rounded-b-md bg-white/8 border border-white/10 overflow-hidden">
          <div className="w-full h-1/2 mt-auto" style={{ background: `${color}20` }} />
        </div>
        {/* Steam */}
        <div className="absolute -top-1.5 left-0.5 flex gap-px">
          <div className="w-px h-1.5 bg-white/10 rounded-full animate-steam-rise" style={{ animationDelay: '0s' }} />
          <div className="w-px h-1.5 bg-white/10 rounded-full animate-steam-rise" style={{ animationDelay: '0.5s' }} />
        </div>
      </div>

      {/* Small plant */}
      <div className="flex flex-col items-center">
        <div className="text-[8px] animate-cartoon-sway">🌿</div>
        <div className="w-2 h-1.5 rounded-sm bg-amber-800/20 border border-amber-800/10" />
      </div>
    </div>
  )
}

export function DeskSlot({ member, color, isHovered, onHover, onAddMember, onViewAgent }: DeskSlotProps) {
  if (!member) {
    return (
      <div className="relative group">
        <button
          type="button"
          className="cartoon-empty-desk w-full p-5 flex flex-col items-center justify-center min-h-[140px] cursor-pointer animate-invite-glow focus:outline-none focus:ring-2 focus:ring-cyber-green/30"
          onClick={onAddMember}
        >
          {/* Empty chair icon */}
          <div className="relative mb-2">
            <svg viewBox="0 0 48 48" className="w-12 h-12 opacity-30 group-hover:opacity-60 transition-opacity">
              {/* Chair base */}
              <ellipse cx="24" cy="40" rx="12" ry="3" fill="white" fillOpacity="0.1" />
              {/* Chair back */}
              <path
                d="M14 12 Q14 6, 24 6 Q34 6, 34 12 L34 28 Q34 30, 32 30 L16 30 Q14 30, 14 28 Z"
                fill="white"
                fillOpacity="0.05"
                stroke="white"
                strokeWidth="1"
                strokeOpacity="0.12"
              />
              {/* Chair seat */}
              <rect x="12" y="30" width="24" height="4" rx="2" fill="white" fillOpacity="0.06" stroke="white" strokeWidth="0.8" strokeOpacity="0.1" />
              {/* Chair leg */}
              <line x1="24" y1="34" x2="24" y2="38" stroke="white" strokeWidth="1.5" strokeOpacity="0.1" />
            </svg>

            {/* Plus icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/15 flex items-center justify-center group-hover:border-cyber-green/50 group-hover:bg-cyber-green/10 transition-all duration-300">
                <svg className="w-4 h-4 text-white/20 group-hover:text-cyber-green/70 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
          </div>

          <span className="text-white/20 text-xs font-medium group-hover:text-cyber-green/60 transition-colors">
            邀请成员
          </span>
          <span className="text-white/10 text-[10px] group-hover:text-white/30 transition-colors mt-0.5">
            点击添加 Agent 到工位
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative group"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Desk surface with cartoon style */}
      <div
        className={cn(
          'cartoon-desk p-4 flex flex-col items-center gap-1 min-h-[140px] cursor-pointer',
          isHovered && 'border-opacity-60'
        )}
        style={{
          borderColor: isHovered ? color : undefined,
          boxShadow: isHovered ? `0 10px 40px ${color}25, inset 0 1px 0 rgba(255,255,255,0.1)` : undefined,
        }}
        onClick={() => onViewAgent?.(member.agentId)}
      >
        {/* Agent cartoon avatar */}
        <AgentAvatar
          emoji="🤖"
          theme={color}
          status="idle"
          size="md"
        />

        {/* Agent info */}
        <div className="text-center mt-1">
          <p className="text-white/90 text-xs font-semibold truncate max-w-[90px]">
            {member.agentId}
          </p>
          <p className="text-white/30 text-[10px]">{member.role || 'member'}</p>
        </div>

        {/* Desk items decoration */}
        <DeskItems color={color} />
      </div>

      {/* Hover tooltip */}
      {isHovered && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 animate-fade-in">
          <div className="cartoon-card px-4 py-3 text-center whitespace-nowrap">
            <p className="text-white text-xs font-semibold">{member.agentId}</p>
            <p className="text-cyber-lavender text-[10px] mt-0.5">角色: {member.role || 'member'}</p>
            <p className="text-white/25 text-[10px]">加入顺序: #{member.joinOrder}</p>
            <div className="flex items-center justify-center gap-1 mt-1.5">
              <div className="w-1 h-1 rounded-full bg-cyber-purple animate-pulse" />
              <p className="text-cyber-purple text-[10px] font-medium">查看工作空间 →</p>
            </div>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-white/10" />
        </div>
      )}
    </div>
  )
}
