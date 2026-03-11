import { useEffect, useMemo, useState } from 'react'
import type {
  AgentListItem,
  CommunicationEvent,
  Notification,
  SessionMessage,
  TeamListItem,
  WorkflowRuntimeSignal,
} from '@/types'

export type EmpireStatus =
  | 'idle'
  | 'working'
  | 'delegating'
  | 'reviewing'
  | 'meeting'
  | 'approval'
  | 'returning'
  | 'break'
  | 'offline'

export interface ResolvedAgent extends AgentListItem {
  resolvedStatus: AgentListItem['status']
  statusLabel: string
  score: number
  empireStatus: EmpireStatus
  empireLabel: string
  empireReason?: string
}

export interface TeamRoom {
  id: string
  name: string
  description: string
  memberCount: number
  activeCount: number
  agents: ResolvedAgent[]
  accent: { bar: string; badge: string; glow: string }
}

export interface AgentRoom {
  id: string
  agentId: string
  name: string
  description: string
  teamId?: string
  teamName?: string
  agent: ResolvedAgent
  accent: { bar: string; badge: string; glow: string }
}

export interface HudStat {
  id: string
  label: string
  value: number | string
  sub: string
  color: string
  icon: string
}

export interface RankedAgent {
  id: string
  name: string
  emoji: string
  theme?: string
  status: AgentListItem['status']
  currentTask?: string
  score: number
}

export interface LiveFeedItem {
  id: string
  kind: 'communication' | 'message'
  title: string
  summary: string
  timestamp: string
  accentClass: string
}

export const ROOM_COLORS = [
  { bar: 'from-blue-500 to-cyan-400', badge: 'bg-blue-500/20 text-blue-200 border-blue-400/30', glow: 'rgba(59,130,246,0.22)' },
  { bar: 'from-violet-500 to-fuchsia-400', badge: 'bg-violet-500/20 text-violet-200 border-violet-400/30', glow: 'rgba(168,85,247,0.22)' },
  { bar: 'from-emerald-500 to-teal-400', badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30', glow: 'rgba(16,185,129,0.22)' },
  { bar: 'from-amber-500 to-orange-400', badge: 'bg-amber-500/20 text-amber-100 border-amber-400/30', glow: 'rgba(245,158,11,0.22)' },
  { bar: 'from-rose-500 to-pink-400', badge: 'bg-rose-500/20 text-rose-100 border-rose-400/30', glow: 'rgba(244,63,94,0.22)' },
  { bar: 'from-cyan-500 to-sky-400', badge: 'bg-cyan-500/20 text-cyan-100 border-cyan-400/30', glow: 'rgba(6,182,212,0.22)' },
] as const

const STATUS_LABELS: Record<AgentListItem['status'], string> = {
  busy: '执行中',
  idle: '待命',
  scheduled: '值守中',
  error: '异常',
  offline: '离线',
}

const STATUS_SCORES: Record<AgentListItem['status'], number> = {
  busy: 100,
  idle: 45,
  scheduled: 55,
  error: 20,
  offline: 0,
}

const EMPIRE_STATUS_LABELS: Record<EmpireStatus, string> = {
  idle: '待命',
  working: '专注执行',
  delegating: '协同分发',
  reviewing: '复核结果',
  meeting: '会议协作',
  approval: '等待审批',
  returning: '返回工位',
  break: '暂停恢复',
  offline: '离线',
}

const RANK_TIERS = [
  { name: '待命', minScore: 0, color: '#94A3B8', glow: 'rgba(148,163,184,0.24)', icon: '🥚' },
  { name: '在线', minScore: 35, color: '#38BDF8', glow: 'rgba(56,189,248,0.24)', icon: '📡' },
  { name: '活跃', minScore: 60, color: '#A78BFA', glow: 'rgba(167,139,250,0.28)', icon: '⚡' },
  { name: '高负载', minScore: 90, color: '#22C55E', glow: 'rgba(34,197,94,0.28)', icon: '🚀' },
] as const

function normalizeResolvedStatus(status: string | undefined): AgentListItem['status'] {
  switch (status) {
    case 'busy':
    case 'idle':
    case 'scheduled':
    case 'error':
    case 'offline':
      return status
    default:
      return 'offline'
  }
}

function containsApprovalKeyword(value?: string | null) {
  if (!value) return false
  return /(审批|approve|approval|review request|待审核)/i.test(value)
}

function notificationMatchesAgent(notification: Notification, agent: AgentListItem) {
  const haystack = `${notification.title} ${notification.message}`.toLowerCase()
  return haystack.includes(agent.id.toLowerCase()) || haystack.includes(agent.name.toLowerCase())
}

function recentMsWithin(timestamp: string | number | Date | undefined, thresholdMs: number) {
  if (!timestamp) return false
  const value = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp instanceof Date ? timestamp.getTime() : timestamp
  if (!Number.isFinite(value)) return false
  return Date.now() - value <= thresholdMs
}

function formatWorkflowReason(signal: WorkflowRuntimeSignal, fallback: string) {
  return signal.nodeLabel ? `${fallback}（节点：${signal.nodeLabel}）` : fallback
}

function deriveEmpireStatus(params: {
  agent: AgentListItem
  resolvedStatus: AgentListItem['status']
  relatedEvents: CommunicationEvent[]
  relatedMessages: SessionMessage[]
  notifications: Notification[]
  workflowSignals: WorkflowRuntimeSignal[]
}): Pick<ResolvedAgent, 'empireStatus' | 'empireLabel' | 'empireReason'> {
  const { agent, resolvedStatus, relatedEvents, relatedMessages, notifications, workflowSignals } = params

  if (resolvedStatus === 'offline') {
    return { empireStatus: 'offline', empireLabel: EMPIRE_STATUS_LABELS.offline, empireReason: 'Agent 当前不在线' }
  }

  if (resolvedStatus === 'error') {
    return { empireStatus: 'break', empireLabel: EMPIRE_STATUS_LABELS.break, empireReason: '最近出现错误或执行失败' }
  }

  const explicitApprovalSignal = workflowSignals.find(
    (signal) => signal.status === 'waiting_approval' && (signal.approverAgentId === agent.id || signal.agentId === agent.id),
  )
  if (explicitApprovalSignal) {
    return {
      empireStatus: 'approval',
      empireLabel: EMPIRE_STATUS_LABELS.approval,
      empireReason: formatWorkflowReason(explicitApprovalSignal, '工作流正在等待审批'),
    }
  }

  const explicitMeetingSignal = workflowSignals.find((signal) => signal.nodeType === 'meeting' || signal.nodeType === 'debate')
  if (explicitMeetingSignal) {
    return {
      empireStatus: 'meeting',
      empireLabel: EMPIRE_STATUS_LABELS.meeting,
      empireReason: formatWorkflowReason(explicitMeetingSignal, '工作流正在执行会议/辩论节点'),
    }
  }

  const hasApprovalSignal =
    containsApprovalKeyword(agent.currentTask)
    || relatedMessages.some((message) => containsApprovalKeyword(message.content))
    || notifications.some((notification) => containsApprovalKeyword(notification.title) || containsApprovalKeyword(notification.message))

  if (hasApprovalSignal) {
    return { empireStatus: 'approval', empireLabel: EMPIRE_STATUS_LABELS.approval, empireReason: '任务或消息中出现审批信号' }
  }

  const latestMessage = relatedMessages[0]
  if (recentMsWithin(latestMessage?.timestamp, 45_000) && latestMessage?.role === 'assistant' && relatedEvents.length === 0) {
    return { empireStatus: 'returning', empireLabel: EMPIRE_STATUS_LABELS.returning, empireReason: '刚刚回复消息，正在返回工位' }
  }

  const veryRecentEvents = relatedEvents.filter((event) => recentMsWithin(event.timestamp, 120_000))
  const incomingCount = veryRecentEvents.filter((event) => event.toAgentId === agent.id).length
  const outgoingCount = veryRecentEvents.filter((event) => event.fromAgentId === agent.id).length

  if (veryRecentEvents.length >= 2 && incomingCount > 0 && outgoingCount > 0) {
    return { empireStatus: 'meeting', empireLabel: EMPIRE_STATUS_LABELS.meeting, empireReason: '短时间内发生双向协作通信' }
  }
  if (incomingCount > 0 && outgoingCount === 0) {
    return { empireStatus: 'reviewing', empireLabel: EMPIRE_STATUS_LABELS.reviewing, empireReason: '最近主要在接收他人结果' }
  }
  if (outgoingCount > 0) {
    return { empireStatus: 'delegating', empireLabel: EMPIRE_STATUS_LABELS.delegating, empireReason: '最近正在向外分发或请求协作' }
  }

  const latestWorkflowSignal = workflowSignals[0]
  if (latestWorkflowSignal?.nodeType === 'task' && latestWorkflowSignal.agentId === agent.id) {
    return {
      empireStatus: 'working',
      empireLabel: EMPIRE_STATUS_LABELS.working,
      empireReason: formatWorkflowReason(latestWorkflowSignal, agent.currentTask || '工作流任务执行中'),
    }
  }

  const latestNotification = notifications[0]
  if (latestNotification && recentMsWithin(latestNotification.createdAt, 60_000)) {
    return { empireStatus: 'reviewing', empireLabel: EMPIRE_STATUS_LABELS.reviewing, empireReason: '刚收到最新执行通知' }
  }

  if (
    agent.currentTask
    || relatedMessages.some((message) => recentMsWithin(message.timestamp, 5 * 60_000))
    || notifications.some((notification) => recentMsWithin(notification.createdAt, 5 * 60_000))
  ) {
    return {
      empireStatus: 'working',
      empireLabel: EMPIRE_STATUS_LABELS.working,
      empireReason: agent.currentTask || '存在近期任务或消息活动',
    }
  }

  if (resolvedStatus === 'scheduled') {
    return { empireStatus: 'idle', empireLabel: '值守中', empireReason: '当前处于排班值守时段，等待新任务' }
  }

  return { empireStatus: 'idle', empireLabel: EMPIRE_STATUS_LABELS.idle, empireReason: '没有活跃任务' }
}

export function resolveAgents(
  agents: AgentListItem[],
  statuses: Map<string, { status: AgentListItem['status'] }>,
  context?: {
    events?: CommunicationEvent[]
    messages?: SessionMessage[]
    notifications?: Notification[]
    workflowSignals?: Map<string, WorkflowRuntimeSignal> | WorkflowRuntimeSignal[]
  },
): ResolvedAgent[] {
  const events = context?.events ?? []
  const messages = context?.messages ?? []
  const notifications = context?.notifications ?? []
  const workflowSignals =
    context?.workflowSignals instanceof Map
      ? Array.from(context.workflowSignals.values())
      : context?.workflowSignals ?? []

  return agents.map((agent) => {
    const gatewayStatus = normalizeResolvedStatus(statuses.get(agent.id)?.status ?? agent.status)
    const relatedEvents = events
      .filter((event) => event.fromAgentId === agent.id || event.toAgentId === agent.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8)
    const relatedMessages = messages
      .filter((message) => message.agentId === agent.id)
      .sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime())
      .slice(0, 8)
    const relatedNotifications = notifications
      .filter((notification) => notificationMatchesAgent(notification, agent))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4)
    const relatedWorkflowSignals = workflowSignals
      .filter((signal) => {
        const participantIds = signal.participantIds ?? []
        return signal.agentId === agent.id || signal.approverAgentId === agent.id || participantIds.includes(agent.id)
      })
      .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
      .slice(0, 6)

    const hasWorkflowActivity = relatedWorkflowSignals.some((signal) => signal.status === 'running' || signal.status === 'waiting_approval')
    const resolvedStatus = gatewayStatus === 'idle' && hasWorkflowActivity ? 'busy' : gatewayStatus
    const score = STATUS_SCORES[resolvedStatus] + (agent.currentTask ? 8 : 0) + (hasWorkflowActivity ? 10 : 0)
    const empire = deriveEmpireStatus({
      agent,
      resolvedStatus,
      relatedEvents,
      relatedMessages,
      notifications: relatedNotifications,
      workflowSignals: relatedWorkflowSignals,
    })

    return {
      ...agent,
      resolvedStatus,
      statusLabel: STATUS_LABELS[resolvedStatus],
      score,
      empireStatus: empire.empireStatus,
      empireLabel: empire.empireLabel,
      empireReason: empire.empireReason,
    }
  })
}

export function buildTeamRooms(teams: TeamListItem[], agents: ResolvedAgent[]): TeamRoom[] {
  const assignedAgentIds = new Set<string>()

  const rooms = teams.map((team, index) => {
    const memberIds = new Set((team.members ?? []).map((member) => member.agentId))
    const roomAgents = agents.filter((agent) => {
      if (memberIds.size > 0) return memberIds.has(agent.id)
      return agent.teamIds.includes(team.id)
    })

    roomAgents.forEach((agent) => assignedAgentIds.add(agent.id))

    return {
      id: team.id,
      name: team.name,
      description: team.description,
      memberCount: roomAgents.length,
      activeCount: roomAgents.filter((agent) => agent.resolvedStatus === 'busy').length,
      agents: roomAgents,
      accent: ROOM_COLORS[index % ROOM_COLORS.length],
    }
  })

  const unassigned = agents.filter((agent) => !assignedAgentIds.has(agent.id))
  if (unassigned.length > 0) {
    rooms.push({
      id: '__unassigned__',
      name: '未分配房间',
      description: '暂时未加入任何工作室的 Agent',
      memberCount: unassigned.length,
      activeCount: unassigned.filter((agent) => agent.resolvedStatus === 'busy').length,
      agents: unassigned,
      accent: ROOM_COLORS[rooms.length % ROOM_COLORS.length],
    })
  }

  return [...rooms].sort((left, right) => {
    const leftWeight = (left.memberCount > 0 ? 1000 : 0) + left.activeCount * 100 + left.memberCount
    const rightWeight = (right.memberCount > 0 ? 1000 : 0) + right.activeCount * 100 + right.memberCount
    return rightWeight - leftWeight || left.name.localeCompare(right.name, 'zh-CN')
  })
}

export function buildAgentRooms(teams: TeamListItem[], agents: ResolvedAgent[]): AgentRoom[] {
  const teamById = new Map(teams.map((team) => [team.id, team]))
  const memberTeamByAgentId = new Map<string, TeamListItem>()

  teams.forEach((team) => {
    for (const member of team.members ?? []) {
      if (!memberTeamByAgentId.has(member.agentId)) {
        memberTeamByAgentId.set(member.agentId, team)
      }
    }
  })

  return [...agents]
    .map((agent, index) => {
      const primaryTeam =
        memberTeamByAgentId.get(agent.id)
        ?? agent.teamIds.map((teamId) => teamById.get(teamId)).find(Boolean)
        ?? null

      const teamName = primaryTeam?.name
      const baseDescription = agent.currentTask
        ? `当前任务：${agent.currentTask}`
        : teamName
          ? `所属工作室：${teamName}`
          : '未加入工作室，当前待命'

      return {
        id: `agent-room:${agent.id}`,
        agentId: agent.id,
        name: agent.name,
        description: `${agent.empireLabel} · ${baseDescription}`,
        teamId: primaryTeam?.id,
        teamName,
        agent,
        accent: ROOM_COLORS[index % ROOM_COLORS.length],
      }
    })
    .sort((left, right) => {
      const leftWeight = (left.agent.resolvedStatus === 'busy' ? 1000 : 0) + left.agent.score
      const rightWeight = (right.agent.resolvedStatus === 'busy' ? 1000 : 0) + right.agent.score
      return rightWeight - leftWeight || left.name.localeCompare(right.name, 'zh-CN')
    })
}

export function buildRankedAgents(agents: ResolvedAgent[]): RankedAgent[] {
  return [...agents]
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, 5)
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      theme: agent.theme,
      status: agent.resolvedStatus,
      currentTask: agent.currentTask,
      score: agent.score,
    }))
}

export function buildLiveFeed(events: CommunicationEvent[], messages: SessionMessage[]): LiveFeedItem[] {
  const eventItems: LiveFeedItem[] = events.slice(-12).map((event) => ({
    id: `evt-${event.id}`,
    kind: 'communication',
    title: `${event.fromAgentId} → ${event.toAgentId}`,
    summary: event.message ?? event.content,
    timestamp: event.timestamp,
    accentClass:
      event.type === 'request'
        ? 'border-blue-400/30 bg-blue-500/10 text-blue-200'
        : event.type === 'response'
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          : 'border-violet-400/30 bg-violet-500/10 text-violet-200',
  }))

  const messageItems: LiveFeedItem[] = messages.slice(-12).map((message, index) => ({
    id: `msg-${message.id ?? index}`,
    kind: 'message',
    title: `${message.agentId ?? '未知 Agent'} · ${message.role === 'assistant' ? '回复' : message.role === 'user' ? '输入' : '系统'}`,
    summary: message.content,
    timestamp: message.timestamp ?? new Date().toISOString(),
    accentClass: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200',
  }))

  return [...eventItems, ...messageItems]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 14)
}

export function buildHudStats(params: {
  agentCount: number
  activeCount: number
  roomCount: number
  eventCount: number
  gatewayConnected: boolean
  messageCount: number
}): HudStat[] {
  return [
    {
      id: 'gateway',
      label: 'GATEWAY',
      value: params.gatewayConnected ? '在线' : '离线',
      sub: params.gatewayConnected ? '实时事件已接入' : '当前不可用',
      color: params.gatewayConnected ? '#34D399' : '#F87171',
      icon: params.gatewayConnected ? '📡' : '📴',
    },
    {
      id: 'agents',
      label: 'AGENTS',
      value: params.agentCount,
      sub: `活跃 ${params.activeCount} / 总数 ${params.agentCount}`,
      color: '#8B5CF6',
      icon: '🤖',
    },
    {
      id: 'rooms',
      label: 'ROOMS',
      value: params.roomCount,
      sub: '按工作室分区展示',
      color: '#38BDF8',
      icon: '🏢',
    },
    {
      id: 'events',
      label: 'EVENTS',
      value: params.eventCount,
      sub: `消息 ${params.messageCount} · 通信 ${params.eventCount}`,
      color: '#F59E0B',
      icon: '🛰️',
    },
  ]
}

export function useNow() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const date = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const time = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const hour = now.getHours()
  const briefing = hour < 12 ? '上午态势简报' : hour < 18 ? '下午运行巡检' : '晚间收尾巡检'

  return { date, time, briefing }
}

export function timeAgo(value: string | number | Date) {
  const timestamp = typeof value === 'string' ? new Date(value).getTime() : value instanceof Date ? value.getTime() : value
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

  if (seconds < 60) return rtf.format(-seconds, 'second')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-Math.floor(hours / 24), 'day')
}

export function getRankTier(score: number) {
  for (let index = RANK_TIERS.length - 1; index >= 0; index -= 1) {
    if (score >= RANK_TIERS[index].minScore) {
      return { ...RANK_TIERS[index], level: index }
    }
  }
  return { ...RANK_TIERS[0], level: 0 }
}

export function useNumberFormatter() {
  return useMemo(() => new Intl.NumberFormat('zh-CN'), [])
}
