import { useState } from 'react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { DeskSlot } from './DeskSlot'
import { MeetingTable } from './MeetingTable'
import { TaskWhiteboard } from './TaskWhiteboard'
import { BookShelf } from './BookShelf'
import { ScheduleCalendar } from './ScheduleCalendar'
import type { Team, TeamMember } from '@/types'

interface StudioSceneProps {
  team: Team
  teamMd: string
}

const MEMBER_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#06B6D4',
  '#F59E0B', '#22C55E', '#EF4444', '#3B82F6',
]

export function StudioScene({ team, teamMd }: StudioSceneProps) {
  const [hoveredDesk, setHoveredDesk] = useState<string | null>(null)
  const members = team.members || []
  const maxDesks = Math.max(members.length, 4)
  const deskSlots: (TeamMember | null)[] = [
    ...members,
    ...Array(maxDesks - members.length).fill(null),
  ]

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-cyber-bg via-cyber-surface/50 to-cyber-bg overflow-hidden">
      {/* Grid floor */}
      <div className="absolute inset-0 cyber-grid opacity-40" />

      {/* Ambient particles */}
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
      <div className="absolute top-4 left-6 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
          <span className="text-white/60 text-xs font-mono tracking-widest uppercase">
            Studio — {team.name}
          </span>
        </div>
      </div>

      {/* Main scene layout */}
      <div className="relative w-full h-full flex items-center justify-center p-8 pt-12">
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

      {/* Communication beams between agents */}
      {members.length >= 2 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ mixBlendMode: 'screen' }}>
          <defs>
            <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0" />
              <stop offset="50%" stopColor="#8B5CF6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      )}

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-cyber-bg to-transparent pointer-events-none" />
    </div>
  )
}
