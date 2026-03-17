import { useState, useMemo } from 'react'
import { useDragScroll } from '@/hooks/use-drag-scroll'
import { DeskSlot } from './DeskSlot'
import { MeetingTable } from './MeetingTable'
import { TaskWhiteboard } from './TaskWhiteboard'
import { BookShelf } from './BookShelf'
import { ScheduleCalendar } from './ScheduleCalendar'
import { useMonitorStore } from '@/stores/monitor-store'
import { useAgentStore } from '@/stores/agent-store'
import type { Team, TeamMember } from '@/types'

interface StudioSceneProps {
  team: Team
  teamMd: string
  onAddMember?: () => void
  onViewAgent?: (agentId: string) => void
}

const MEMBER_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B', '#22C55E', '#EF4444', '#3B82F6']

function OfficeWindow() {
  return (
    <div className="cartoon-window relative h-14 w-20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a2a4a] to-[#2a1f3d]">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="absolute h-0.5 w-0.5 animate-cartoon-sparkle rounded-full bg-white"
            style={{
              left: `${15 + index * 14}%`,
              top: `${15 + (index % 3) * 25}%`,
              animationDelay: `${index * 0.4}s`,
            }}
          />
        ))}
        <div className="absolute right-2 top-1.5 h-3 w-3 rounded-full bg-amber-200/40" />
        <div className="absolute right-1.5 top-1.5 h-3 w-2 rounded-full bg-[#1a2a4a]" />
      </div>
      <div className="absolute inset-0 rounded-lg border border-white/5" />
      <div className="absolute bottom-0 top-0 left-1/2 w-px bg-white/5" />
      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/5" />
    </div>
  )
}

function OfficePlant({ variant = 0 }: { variant?: number }) {
  const plants = ['🪴', '🌵', '🌱']
  return (
    <div className="flex flex-col items-center animate-cartoon-sway" style={{ animationDelay: `${variant * 0.5}s` }}>
      <span className="cartoon-plant text-lg">{plants[variant % plants.length]}</span>
    </div>
  )
}

function WallClock() {
  return (
    <div className="relative h-8 w-8">
      <div className="absolute inset-0 flex items-center justify-center rounded-full border border-white/10 bg-white/3">
        <div className="h-2.5 w-0.5 origin-bottom rounded-full bg-white/20" style={{ transform: 'rotate(30deg)' }} />
        <div className="h-1.5 w-0.5 origin-bottom rounded-full bg-cyber-purple/40" style={{ transform: 'rotate(-60deg)' }} />
        <div className="absolute h-1 w-1 rounded-full bg-white/20" />
      </div>
    </div>
  )
}

function BulletinBoard() {
  return (
    <div className="flex h-8 w-12 flex-wrap gap-0.5 rounded-md border border-amber-800/20 bg-amber-900/10 p-0.5">
      <div className="h-2 w-2 rounded-sm bg-cyber-amber/15" />
      <div className="h-2 w-3 rounded-sm bg-cyber-purple/10" />
      <div className="h-1.5 w-2.5 rounded-sm bg-cyber-green/10" />
      <div className="h-1.5 w-2 rounded-sm bg-cyber-blue/10" />
    </div>
  )
}

export function StudioScene({ team, teamMd, onAddMember, onViewAgent }: StudioSceneProps) {
  const [hoveredDesk, setHoveredDesk] = useState<string | null>(null)
  const { ref: scrollRef, dragging } = useDragScroll<HTMLDivElement>()
  const { events } = useMonitorStore()
  const { agents } = useAgentStore()
  const members = team.members || []

  const enrichedMembers: TeamMember[] = useMemo(
    () =>
      members.map((member) => {
        const agentData = agents.find((agent) => agent.id === member.agentId)
        if (!agentData) return member
        return {
          ...member,
          name: member.name || agentData.name,
          emoji: member.emoji || agentData.emoji,
          theme: member.theme || agentData.theme,
          status: agentData.status || member.status || 'idle',
          currentTask: agentData.currentTask,
        }
      }),
    [members, agents],
  )

  const expandableDeskCount = Math.max(enrichedMembers.length + 1, 2)
  const deskSlots: (TeamMember | null)[] = [...enrichedMembers, ...Array(expandableDeskCount - enrichedMembers.length).fill(null)]
  const maxDesks = deskSlots.length

  const activeLinks = useMemo(() => {
    const now = Date.now()
    const recent = events.filter((event) => now - new Date(event.timestamp).getTime() < 60_000)
    const links = new Map<string, { from: string; to: string; count: number }>()

    for (const event of recent) {
      const key = [event.fromAgentId, event.toAgentId].sort().join('↔')
      const existing = links.get(key)
      if (existing) {
        existing.count += 1
      } else {
        links.set(key, { from: event.fromAgentId, to: event.toAgentId, count: 1 })
      }
    }

    return Array.from(links.values())
  }, [events])

  const agentPositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {}
    const half = Math.ceil(maxDesks / 2)
    deskSlots.forEach((member, index) => {
      if (!member) return
      const isLeft = index < half
      const localIndex = isLeft ? index : index - half
      const col = localIndex % 2
      const row = Math.floor(localIndex / 2)
      positions[member.agentId] = {
        x: isLeft ? 18 + col * 14 : 68 + col * 14,
        y: 40 + row * 18,
      }
    })
    return positions
  }, [deskSlots, maxDesks])

  return (
    <div
      ref={scrollRef}
      className={`cartoon-office-bg relative h-full w-full overflow-auto ${dragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
    >
      <div className="pointer-events-none absolute right-4 top-4 z-30 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[10px] text-white/55 backdrop-blur-sm">
        可拖动画布浏览
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 25%, rgba(139,92,246,0.03) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(99,102,241,0.03) 0%, transparent 50%)',
        }}
      />

      <div className="pointer-events-none absolute left-0 right-0 top-3 z-10">
        <div className="flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <OfficeWindow />
            <OfficeWindow />
            <OfficePlant variant={0} />
          </div>

          <div className="flex items-center gap-3">
            <BulletinBoard />
            <div className="relative rounded-xl border border-white/[0.08] bg-white/5 px-4 py-1.5">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-cyber-green" />
                <span className="text-xs font-semibold tracking-wider text-white/50">{team.name} 工作室</span>
                <WallClock />
              </div>
            </div>
            <BulletinBoard />
          </div>

          <div className="flex items-center gap-3">
            <OfficePlant variant={1} />
            <OfficeWindow />
            <OfficePlant variant={2} />
          </div>
        </div>
      </div>

      <div className="cartoon-floor pointer-events-none absolute bottom-0 left-0 right-0 h-1/3" />

      <div className="relative z-20 flex h-full min-h-[560px] min-w-[1100px] items-center justify-center p-8 pt-16">
        <div className="relative flex h-full w-full max-w-5xl flex-col">
          <div className="mb-4 flex items-start justify-between gap-4 px-4">
            <TaskWhiteboard teamId={team.id} />
            <div className="flex flex-col items-end gap-3">
              <div className="rounded-2xl border border-cyber-green/15 bg-cyber-green/5 px-4 py-2 text-right shadow-[0_10px_30px_rgba(34,197,94,0.08)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyber-green/70">Studio Capacity</p>
                <p className="mt-1 text-xs font-medium text-white/75">已入驻 {enrichedMembers.length} 名成员 · 工位会继续扩容</p>
                <p className="mt-1 text-[10px] leading-4 text-white/35">始终保留邀请入口，可持续添加新的团队 Agent。</p>
              </div>
              <ScheduleCalendar schedule={team.schedule} />
            </div>
          </div>

          <div className="flex flex-1 items-center gap-6">
            <div className="grid flex-1 grid-cols-2 gap-3">
              {deskSlots.slice(0, Math.ceil(maxDesks / 2)).map((member, index) => (
                <DeskSlot
                  key={member?.agentId || `empty-left-${index}`}
                  member={member}
                  color={MEMBER_COLORS[index % MEMBER_COLORS.length]}
                  isHovered={hoveredDesk === (member?.agentId || `left-${index}`)}
                  isLead={member?.agentId === team.leadAgentId}
                  onHover={(hovered) => setHoveredDesk(hovered ? member?.agentId || `left-${index}` : null)}
                  onAddMember={onAddMember}
                  onViewAgent={onViewAgent}
                />
              ))}
            </div>

            <div className="flex-shrink-0">
              <MeetingTable summary={teamMd} memberCount={enrichedMembers.length} />
            </div>

            <div className="grid flex-1 grid-cols-2 gap-3">
              {deskSlots.slice(Math.ceil(maxDesks / 2)).map((member, index) => {
                const slotIndex = Math.ceil(maxDesks / 2) + index
                return (
                  <DeskSlot
                    key={member?.agentId || `empty-right-${index}`}
                    member={member}
                    color={MEMBER_COLORS[slotIndex % MEMBER_COLORS.length]}
                    isHovered={hoveredDesk === (member?.agentId || `right-${index}`)}
                    isLead={member?.agentId === team.leadAgentId}
                    onHover={(hovered) => setHoveredDesk(hovered ? member?.agentId || `right-${index}` : null)}
                    onAddMember={onAddMember}
                    onViewAgent={onViewAgent}
                  />
                )
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <OfficePlant variant={0} />
              <span className="text-[10px] text-white/15">☕</span>
            </div>
            <BookShelf teamId={team.id} />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/15">📎</span>
              <OfficePlant variant={2} />
            </div>
          </div>
        </div>
      </div>

      <svg className="pointer-events-none absolute inset-0 z-[15] h-full w-full" style={{ mixBlendMode: 'screen' }}>
        <defs>
          <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
          </linearGradient>
          <filter id="beam-blur">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>
        {activeLinks.map((link) => {
          const fromPos = agentPositions[link.from]
          const toPos = agentPositions[link.to]
          if (!fromPos || !toPos) return null

          return (
            <g key={`${link.from}-${link.to}`}>
              <line
                x1={`${fromPos.x}%`}
                y1={`${fromPos.y}%`}
                x2={`${toPos.x}%`}
                y2={`${toPos.y}%`}
                stroke="url(#beam-gradient)"
                strokeWidth={Math.min(link.count + 2, 6)}
                filter="url(#beam-blur)"
                opacity={0.4}
              />
              <line
                x1={`${fromPos.x}%`}
                y1={`${fromPos.y}%`}
                x2={`${toPos.x}%`}
                y2={`${toPos.y}%`}
                stroke="url(#beam-gradient)"
                strokeWidth={Math.min(link.count + 1, 3)}
                opacity={0.7}
              >
                <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
              </line>
              <circle r="3" fill="#8B5CF6" opacity="0.6">
                <animateMotion
                  dur="1.5s"
                  repeatCount="indefinite"
                  path={`M${fromPos.x * 10},${fromPos.y * 5} L${toPos.x * 10},${toPos.y * 5}`}
                />
              </circle>
            </g>
          )
        })}
      </svg>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-6 bg-gradient-to-t from-[#1a2433] to-transparent" />
    </div>
  )
}
