import { useState, useMemo } from 'react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { DeskSlot } from './DeskSlot'
import { MeetingTable } from './MeetingTable'
import { TaskWhiteboard } from './TaskWhiteboard'
import { BookShelf } from './BookShelf'
import { ScheduleCalendar } from './ScheduleCalendar'
import { useMonitorStore } from '@/stores/monitor-store'
import type { Team, TeamMember } from '@/types'

interface StudioSceneProps {
  team: Team
  teamMd: string
  onAddMember?: () => void
  onViewAgent?: (agentId: string) => void
}

const MEMBER_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#06B6D4',
  '#F59E0B', '#22C55E', '#EF4444', '#3B82F6',
]

export function StudioScene({ team, teamMd, onAddMember, onViewAgent }: StudioSceneProps) {
  const [hoveredDesk, setHoveredDesk] = useState<string | null>(null)
  const { events } = useMonitorStore()
  const members = team.members || []
  const maxDesks = Math.max(members.length, 4)
  const deskSlots: (TeamMember | null)[] = [
    ...members,
    ...Array(maxDesks - members.length).fill(null),
  ]

  // Compute active communication links from recent events (last 60s)
  const activeLinks = useMemo(() => {
    const now = Date.now()
    const recent = events.filter((e) => now - new Date(e.timestamp).getTime() < 60000)
    const links: Map<string, { from: string; to: string; count: number }> = new Map()
    for (const e of recent) {
      const key = [e.fromAgentId, e.toAgentId].sort().join('↔')
      const existing = links.get(key)
      if (existing) {
        existing.count++
      } else {
        links.set(key, { from: e.fromAgentId, to: e.toAgentId, count: 1 })
      }
    }
    return Array.from(links.values())
  }, [events])

  // Map agent IDs to approximate desk positions (percentage-based)
  const agentPositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {}
    const half = Math.ceil(maxDesks / 2)
    deskSlots.forEach((member, i) => {
      if (!member) return
      const isLeft = i < half
      const localIdx = isLeft ? i : i - half
      const col = localIdx % 2
      const row = Math.floor(localIdx / 2)
      positions[member.agentId] = {
        x: isLeft ? 18 + col * 14 : 68 + col * 14,
        y: 40 + row * 18,
      }
    })
    return positions
  }, [deskSlots, maxDesks])

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-cyber-bg via-cyber-surface/50 to-cyber-bg overflow-hidden">
      {/* Grid floor — 纯装饰，不阻挡点击 */}
      <div className="absolute inset-0 cyber-grid opacity-40 pointer-events-none" />

      {/* Ambient particles — 纯装饰，不阻挡点击 */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-cyber-purple/30 animate-float"
            style={{
              left: `${10 + i * 12}%`,
              top: `${20 + (i % 3) * 25}%`,
              animationDelay: `${i * 0.5}s`,
              animationDuration: `${3 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      {/* Room label */}
      <div className="absolute top-4 left-6 z-10 pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
          <span className="text-white/60 text-xs font-mono tracking-widest uppercase">
            Studio — {team.name}
          </span>
        </div>
      </div>

      {/* Main scene layout — 所有交互元素在这里，z-20 确保在装饰层之上 */}
      <div className="relative w-full h-full flex items-center justify-center p-8 pt-12 z-20">
        {/* Room container with isometric feel */}
        <div className="relative w-full max-w-5xl h-full flex flex-col">

          {/* Top row: Whiteboard + Calendar */}
          <div className="flex items-start justify-between mb-6 px-4">
            <TaskWhiteboard teamId={team.id} />
            <ScheduleCalendar schedule={team.schedule} />
          </div>

          {/* Middle area: Desks + Meeting table */}
          <div className="flex-1 flex items-center gap-8">
            {/* Left desks */}
            <div className="flex-1 grid grid-cols-2 gap-4">
              {deskSlots.slice(0, Math.ceil(maxDesks / 2)).map((member, i) => (
                <DeskSlot
                  key={member?.agentId || `empty-left-${i}`}
                  member={member}
                  color={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                  isHovered={hoveredDesk === (member?.agentId || `left-${i}`)}
                  onHover={(h) => setHoveredDesk(h ? (member?.agentId || `left-${i}`) : null)}
                  onAddMember={onAddMember}
                  onViewAgent={onViewAgent}
                />
              ))}
            </div>

            {/* Center: Meeting table */}
            <div className="flex-shrink-0">
              <MeetingTable summary={teamMd} memberCount={members.length} />
            </div>

            {/* Right desks */}
            <div className="flex-1 grid grid-cols-2 gap-4">
              {deskSlots.slice(Math.ceil(maxDesks / 2)).map((member, i) => {
                const idx = Math.ceil(maxDesks / 2) + i
                return (
                  <DeskSlot
                    key={member?.agentId || `empty-right-${i}`}
                    member={member}
                    color={MEMBER_COLORS[idx % MEMBER_COLORS.length]}
                    isHovered={hoveredDesk === (member?.agentId || `right-${i}`)}
                    onHover={(h) => setHoveredDesk(h ? (member?.agentId || `right-${i}`) : null)}
                    onAddMember={onAddMember}
                    onViewAgent={onViewAgent}
                  />
                )
              })}
            </div>
          </div>

          {/* Bottom: Bookshelf */}
          <div className="flex justify-end mt-4 px-4">
            <BookShelf teamId={team.id} />
          </div>
        </div>
      </div>

      {/* Communication beams between agents — 数据驱动 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: 'screen', zIndex: 15 }}>
        <defs>
          <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {activeLinks.map((link) => {
          const fromPos = agentPositions[link.from]
          const toPos = agentPositions[link.to]
          if (!fromPos || !toPos) return null
          return (
            <line
              key={`${link.from}-${link.to}`}
              x1={`${fromPos.x}%`}
              y1={`${fromPos.y}%`}
              x2={`${toPos.x}%`}
              y2={`${toPos.y}%`}
              stroke="url(#beam-gradient)"
              strokeWidth={Math.min(link.count + 1, 4)}
              opacity={0.7}
            >
              <animate
                attributeName="opacity"
                values="0.3;0.8;0.3"
                dur="2s"
                repeatCount="indefinite"
              />
            </line>
          )
        })}
      </svg>

      {/* Bottom gradient fade — 纯装饰 */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-cyber-bg to-transparent pointer-events-none z-0" />
    </div>
  )
}
