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
  /** ISO timestamp of last successful sync to OpenClaw runtime */
  syncedAt?: string
  /** Next scheduled trigger time (for time-based/custom modes) */
  nextTriggerAt?: string
}

/** Result returned by PUT /api/teams/:id/schedule */
export interface ScheduleSyncResult {
  saved: boolean
  synced: boolean
  mode?: string
  jobCount?: number
  agentCount?: number
  syncedAt?: string
  syncError?: string
  agents?: Array<{
    agentId: string
    startTime?: string
    endTime?: string
    startCron?: string
  }>
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
  currentTask?: string
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
  leadAgentId?: string | null
  scheduleConfig?: TeamSchedule
  schedule?: TeamSchedule
}

// ── Meeting types ──

export type MeetingType = 'standup' | 'kickoff' | 'review' | 'brainstorm' | 'decision' | 'retro' | 'debate'
export type MeetingStatus = 'preparing' | 'in_progress' | 'concluded' | 'cancelled'

export interface Meeting {
  id: string
  teamId: string
  meetingType: MeetingType
  topic: string
  topicDescription: string
  leadAgentId: string
  participants: string[]
  status: MeetingStatus
  filePath: string
  summary: string | null
  maxRounds: number
  currentRound: number
  createdAt: string
  concludedAt: string | null
}

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  standup: '站会',
  kickoff: '启动会',
  review: '评审会',
  brainstorm: '头脑风暴',
  decision: '决策会',
  retro: '复盘会',
  debate: '辩论',
}

export const MEETING_TYPE_ICONS: Record<MeetingType, string> = {
  standup: '🧍',
  kickoff: '🚀',
  review: '🔍',
  brainstorm: '💡',
  decision: '⚖️',
  retro: '🔄',
  debate: '🥊',
}

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  preparing: '准备中',
  in_progress: '进行中',
  concluded: '已结束',
  cancelled: '已取消',
}
