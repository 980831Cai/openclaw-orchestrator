// Team-related type definitions
// Migrated from @openclaw/shared to local types

export type TeamTheme = 'tech-lab' | 'creative-studio' | 'command-center' | 'default'

export type ScheduleMode = 'round-robin' | 'priority' | 'time-based'

export interface ScheduleEntry {
  agentId: string
  order?: number
  priority?: number
  timeSlot?: string
}

export interface TeamSchedule {
  mode: ScheduleMode
  entries: ScheduleEntry[]
  interval?: number
}

export interface TeamMember {
  agentId: string
  role: string
  joinOrder: number
  // Populated fields from agent
  name?: string
  emoji?: string
  theme?: string
  status?: string
}

export interface TeamListItem {
  id: string
  name: string
  description: string
  goal?: string
  theme: TeamTheme
  memberCount: number
  createdAt: string
  members?: TeamMember[]
}

export interface Team {
  id: string
  name: string
  description: string
  goal: string
  theme: TeamTheme
  teamDir: string
  createdAt: string
  members: TeamMember[]
  scheduleConfig?: TeamSchedule
}
