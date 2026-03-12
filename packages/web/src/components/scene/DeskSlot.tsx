import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { cn } from '@/lib/utils'
import type { TeamMember, AgentStatus } from '@/types'

interface DeskSlotProps {
  member: TeamMember | null
  color: string
  isHovered: boolean
  isLead?: boolean
  onHover: (hovered: boolean) => void
  onAddMember?: () => void
  onViewAgent?: (agentId: string) => void
}

const STATUS_CONFIG: Record<AgentStatus, { color: string; label: string; glow: string }> = {
  busy: { color: '#22C55E', label: '执行中', glow: '0 0 8px rgba(34, 197, 94, 0.5)' },
  idle: { color: '#3B82F6', label: '空闲', glow: '0 0 6px rgba(59, 130, 246, 0.3)' },
  scheduled: { color: '#06B6D4', label: '值守中', glow: '0 0 6px rgba(6, 182, 212, 0.35)' },
  error: { color: '#EF4444', label: '异常', glow: '0 0 8px rgba(239, 68, 68, 0.5)' },
  offline: { color: '#6B7280', label: '离线', glow: 'none' },
}

function DeskItems({ color }: { color: string }) {
  return (
    <div className="mt-1 flex items-end gap-1.5">
      <div className="flex flex-col items-center">
        <div
          className="h-5 w-8 rounded-sm border border-white/10"
          style={{ background: `linear-gradient(135deg, ${color}15, ${color}08)` }}
        >
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-1 w-1 animate-pulse rounded-full" style={{ background: `${color}80` }} />
          </div>
        </div>
        <div className="h-1 w-2 rounded-b-sm bg-white/5" />
      </div>

      <div className="relative">
        <div className="h-3.5 w-3 overflow-hidden rounded-b-md border border-white/10 bg-white/8">
          <div className="mt-auto h-1/2 w-full" style={{ background: `${color}20` }} />
        </div>
        <div className="absolute -top-1.5 left-0.5 flex gap-px">
          <div className="h-1.5 w-px animate-steam-rise rounded-full bg-white/10" style={{ animationDelay: '0s' }} />
          <div className="h-1.5 w-px animate-steam-rise rounded-full bg-white/10" style={{ animationDelay: '0.5s' }} />
        </div>
      </div>

      <div className="flex flex-col items-center">
        <div className="animate-cartoon-sway text-[8px]">🌿</div>
        <div className="h-1.5 w-2 rounded-sm border border-amber-800/10 bg-amber-800/20" />
      </div>
    </div>
  )
}

export function DeskSlot({ member, color, isHovered, isLead, onHover, onAddMember, onViewAgent }: DeskSlotProps) {
  if (!member) {
    return (
      <div className="relative group">
        <button
          type="button"
          className="cartoon-empty-desk flex min-h-[140px] w-full cursor-pointer flex-col items-center justify-center p-5 focus:outline-none focus:ring-2 focus:ring-cyber-green/30 animate-invite-glow"
          onClick={onAddMember}
        >
          <div className="relative mb-2">
            <svg viewBox="0 0 48 48" className="h-12 w-12 opacity-30 transition-opacity group-hover:opacity-60">
              <ellipse cx="24" cy="40" rx="12" ry="3" fill="white" fillOpacity="0.1" />
              <path
                d="M14 12 Q14 6, 24 6 Q34 6, 34 12 L34 28 Q34 30, 32 30 L16 30 Q14 30, 14 28 Z"
                fill="white"
                fillOpacity="0.05"
                stroke="white"
                strokeWidth="1"
                strokeOpacity="0.12"
              />
              <rect x="12" y="30" width="24" height="4" rx="2" fill="white" fillOpacity="0.06" stroke="white" strokeWidth="0.8" strokeOpacity="0.1" />
              <line x1="24" y1="34" x2="24" y2="38" stroke="white" strokeWidth="1.5" strokeOpacity="0.1" />
            </svg>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-white/15 transition-all duration-300 group-hover:border-cyber-green/50 group-hover:bg-cyber-green/10">
                <svg className="h-4 w-4 text-white/20 transition-colors group-hover:text-cyber-green/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
          </div>

          <span className="text-xs font-medium text-white/20 transition-colors group-hover:text-cyber-green/60">邀请成员</span>
          <span className="mt-0.5 text-[10px] text-white/10 transition-colors group-hover:text-white/30">点击添加 Agent 到工位</span>
        </button>
      </div>
    )
  }

  const agentStatus: AgentStatus = (member.status as AgentStatus) || 'idle'
  const statusCfg = STATUS_CONFIG[agentStatus]

  return (
    <div className="relative group" onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <div
        className={cn('cartoon-desk flex min-h-[140px] cursor-pointer flex-col items-center gap-1 p-4', isHovered && 'border-opacity-60')}
        style={{
          borderColor: isHovered ? color : undefined,
          boxShadow: isHovered ? `0 10px 40px ${color}25, inset 0 1px 0 rgba(255,255,255,0.1)` : undefined,
        }}
        onClick={() => onViewAgent?.(member.agentId)}
      >
        <div className="relative">
          {isLead ? (
            <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 animate-cartoon-bob">
              <span className="text-sm drop-shadow-lg">👑</span>
            </div>
          ) : null}
          <AgentAvatar emoji={member.emoji || '🤖'} theme={member.theme || color} status={agentStatus} size="md" />
        </div>

        <div className="mt-1 flex items-center justify-center gap-1.5">
          <div
            className={cn('h-[3px] rounded-full transition-all duration-500', agentStatus === 'busy' ? 'w-10 animate-pulse' : 'w-6')}
            style={{ backgroundColor: statusCfg.color, boxShadow: statusCfg.glow }}
          />
        </div>

        <div className="mt-0.5 text-center">
          <p className="max-w-[90px] truncate text-xs font-semibold text-white/90">{member.name || member.agentId}</p>
          <div className="mt-0.5 flex items-center justify-center gap-1">
            <div
              className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full', agentStatus === 'busy' && 'animate-pulse')}
              style={{ backgroundColor: statusCfg.color }}
            />
            <p className="text-[10px]" style={{ color: `${statusCfg.color}CC` }}>
              {isLead ? `👑 ${statusCfg.label}` : statusCfg.label}
            </p>
          </div>
        </div>

        {agentStatus === 'busy' ? (
          <div className="mt-0.5 rounded-full border border-cyber-green/20 bg-cyber-green/10 px-2 py-0.5 animate-pulse">
            <span className="flex items-center gap-1 text-[8px] font-medium text-cyber-green">
              <span className="inline-block h-1 w-1 rounded-full bg-cyber-green" />
              工作中...
            </span>
          </div>
        ) : null}

        <DeskItems color={color} />
      </div>

      {isHovered ? (
        <div className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-full animate-fade-in">
          <div className="cartoon-card px-4 py-3 text-center whitespace-nowrap">
            <p className="text-xs font-semibold text-white">{member.name || member.agentId}</p>
            <p className="mt-0.5 text-[10px] text-cyber-lavender">角色: {isLead ? '👑 Team Lead' : member.role || 'member'}</p>
            <div className="mt-1 flex items-center justify-center gap-1">
              <div className={cn('h-2 w-2 rounded-full', agentStatus === 'busy' && 'animate-pulse')} style={{ backgroundColor: statusCfg.color }} />
              <span className="text-[10px] font-medium" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
            </div>
            <p className="mt-0.5 text-[10px] text-white/25">加入顺序: #{member.joinOrder}</p>
            <div className="mt-1.5 flex items-center justify-center gap-1">
              <div className="h-1 w-1 animate-pulse rounded-full bg-cyber-purple" />
              <p className="text-[10px] font-medium text-cyber-purple">查看工作空间 →</p>
            </div>
          </div>
          <div className="absolute bottom-0 left-1/2 h-0 w-0 translate-y-full -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-white/10" />
        </div>
      ) : null}
    </div>
  )
}
