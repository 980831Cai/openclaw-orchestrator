// Team-related type definitions
// Migrated from @openclaw/shared to local types

export type TeamTheme = 'tech-lab' | 'creative-studio' | 'command-center' | 'default'

export type ScheduleMode = 'round-robin' | 'priority' | 'time-based' | 'custom'

export interface ScheduleEntry {
  agentId: string
  order?: number
  priority?: number
  timeSlot?: string
  startTime?: string
  endTime?: string
  customRule?: string
}

export interface TeamSchedule {
  type: ScheduleMode
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
  activeTaskCount?: number
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
  schedule?: TeamSchedule
}
