import { useState, useMemo } from 'react'
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

const MEMBER_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#06B6D4',
  '#F59E0B', '#22C55E', '#EF4444', '#3B82F6',
]

/** Cartoon office window with night sky */
function OfficeWindow() {
  return (
    <div className="cartoon-window w-20 h-14 relative overflow-hidden">
      {/* Night sky */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a2a4a] to-[#2a1f3d]">
        {/* Stars */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 rounded-full bg-white animate-cartoon-sparkle"
            style={{
              left: `${15 + i * 14}%`,
              top: `${15 + (i % 3) * 25}%`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
        {/* Moon */}
        <div className="absolute top-1.5 right-2 w-3 h-3 rounded-full bg-amber-200/40" />
        <div className="absolute top-1.5 right-1.5 w-2 h-3 rounded-full bg-[#1a2a4a]" />
      </div>
      {/* Window frame */}
      <div className="absolute inset-0 border border-white/5 rounded-lg" />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/5" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5" />
    </div>
  )
}

/** Decorative plant */
function OfficePlant({ variant = 0 }: { variant?: number }) {
  const plants = ['🪴', '🌵', '🌱']
  return (
    <div className="flex flex-col items-center animate-cartoon-sway" style={{ animationDelay: `${variant * 0.5}s` }}>
      <span className="text-lg cartoon-plant">{plants[variant % plants.length]}</span>
    </div>
  )
}

/** Wall clock */
function WallClock() {
  return (
    <div className="relative w-8 h-8">
      <div className="absolute inset-0 rounded-full border border-white/10 bg-white/3 flex items-center justify-center">
        <div className="w-0.5 h-2.5 bg-white/20 origin-bottom rounded-full" style={{ transform: 'rotate(30deg)' }} />
        <div className="w-0.5 h-1.5 bg-cyber-purple/40 origin-bottom rounded-full" style={{ transform: 'rotate(-60deg)' }} />
        <div className="absolute w-1 h-1 rounded-full bg-white/20" />
      </div>
    </div>
  )
}

/** Bulletin board */
function BulletinBoard() {
  return (
    <div className="w-12 h-8 rounded-md border border-amber-800/20 bg-amber-900/10 p-0.5 flex flex-wrap gap-0.5">
      <div className="w-2 h-2 rounded-sm bg-cyber-amber/15" />
      <div className="w-3 h-2 rounded-sm bg-cyber-purple/10" />
      <div className="w-2.5 h-1.5 rounded-sm bg-cyber-green/10" />
      <div className="w-2 h-1.5 rounded-sm bg-cyber-blue/10" />
    </div>
  )
}

export function StudioScene({ team, teamMd, onAddMember, onViewAgent }: StudioSceneProps) {
  const [hoveredDesk, setHoveredDesk] = useState<string | null>(null)
  const { events } = useMonitorStore()
  const { agents } = useAgentStore()
  const members = team.members || []

  // Enrich members with real-time agent data from the store
  const enrichedMembers: TeamMember[] = useMemo(() => {
    return members.map((m) => {
      const agentData = agents.find((a) => a.id === m.agentId)
      if (!agentData) return m
      return {
        ...m,
        name: m.name || agentData.name,
        emoji: m.emoji || agentData.emoji,
        theme: m.theme || agentData.theme,
        status: agentData.status || m.status || 'idle',
        currentTask: agentData.currentTask,
      }
    })
  }, [members, agents])

  const maxDesks = Math.max(enrichedMembers.length, 4)
  const deskSlots: (TeamMember | null)[] = [
    ...enrichedMembers,
    ...Array(maxDesks - enrichedMembers.length).fill(null),
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
    <div className="relative w-full h-full cartoon-office-bg overflow-hidden">
      {/* Office wall texture — subtle pattern */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(139,92,246,0.03) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(99,102,241,0.03) 0%, transparent 50%)',
      }} />

      {/* Top wall decorations */}
      <div className="absolute top-3 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between px-6">
          {/* Left: Windows + plant */}
          <div className="flex items-center gap-3">
            <OfficeWindow />
            <OfficeWindow />
            <OfficePlant variant={0} />
          </div>

          {/* Center: Room name sign */}
          <div className="flex items-center gap-3">
            <BulletinBoard />
            <div className="relative px-4 py-1.5 rounded-xl bg-white/5 border border-white/8">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
                <span className="text-white/50 text-xs font-semibold tracking-wider">
                  {team.name} 工作室
                </span>
                <WallClock />
              </div>
            </div>
            <BulletinBoard />
          </div>

          {/* Right: More decorations */}
          <div className="flex items-center gap-3">
            <OfficePlant variant={1} />
            <OfficeWindow />
            <OfficePlant variant={2} />
          </div>
        </div>
      </div>

      {/* Floor gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 cartoon-floor pointer-events-none" />

      {/* Main scene layout */}
      <div className="relative w-full h-full flex items-center justify-center p-8 pt-16 z-20">
        <div className="relative w-full max-w-5xl h-full flex flex-col">

          {/* Top row: Whiteboard + Calendar */}
          <div className="flex items-start justify-between mb-4 px-4">
            <TaskWhiteboard teamId={team.id} />
            <ScheduleCalendar schedule={team.schedule} />
          </div>

          {/* Middle area: Desks + Meeting table */}
          <div className="flex-1 flex items-center gap-6">
            {/* Left desks */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              {deskSlots.slice(0, Math.ceil(maxDesks / 2)).map((member, i) => (
                <DeskSlot
                  key={member?.agentId || `empty-left-${i}`}
                  member={member}
                  color={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                  isHovered={hoveredDesk === (member?.agentId || `left-${i}`)}
                  isLead={member?.agentId === team.leadAgentId}
                  onHover={(h) => setHoveredDesk(h ? (member?.agentId || `left-${i}`) : null)}
                  onAddMember={onAddMember}
                  onViewAgent={onViewAgent}
                />
              ))}
            </div>

            {/* Center: Meeting table */}
            <div className="flex-shrink-0">
              <MeetingTable summary={teamMd} memberCount={enrichedMembers.length} />
            </div>

            {/* Right desks */}
            <div className="flex-1 grid grid-cols-2 gap-3">
              {deskSlots.slice(Math.ceil(maxDesks / 2)).map((member, i) => {
                const idx = Math.ceil(maxDesks / 2) + i
                return (
                  <DeskSlot
                    key={member?.agentId || `empty-right-${i}`}
                    member={member}
                    color={MEMBER_COLORS[idx % MEMBER_COLORS.length]}
                    isHovered={hoveredDesk === (member?.agentId || `right-${i}`)}
                    isLead={member?.agentId === team.leadAgentId}
                    onHover={(h) => setHoveredDesk(h ? (member?.agentId || `right-${i}`) : null)}
                    onAddMember={onAddMember}
                    onViewAgent={onViewAgent}
                  />
                )
              })}
            </div>
          </div>

          {/* Bottom: Bookshelf + floor decoration */}
          <div className="flex items-center justify-between mt-3 px-4">
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

      {/* Communication beams between agents — data-driven */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ mixBlendMode: 'screen', zIndex: 15 }}>
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
              {/* Glow line */}
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
              {/* Core line */}
              <line
                x1={`${fromPos.x}%`}
                y1={`${fromPos.y}%`}
                x2={`${toPos.x}%`}
                y2={`${toPos.y}%`}
                stroke="url(#beam-gradient)"
                strokeWidth={Math.min(link.count + 1, 3)}
                opacity={0.7}
              >
                <animate
                  attributeName="opacity"
                  values="0.4;0.8;0.4"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </line>
              {/* Message indicator bubble */}
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

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[#1a2433] to-transparent pointer-events-none z-0" />
    </div>
  )
}
