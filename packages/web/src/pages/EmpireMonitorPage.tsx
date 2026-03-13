import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityRankingBoard, DashboardHeroHeader, DashboardHudStats } from '@/components/empire-dashboard/HeroSections'
import { EmpireLiveFeed, EmpireRoomGrid } from '@/components/empire-dashboard/OpsSections'
import {
  buildHudStats,
  buildLiveFeed,
  buildRankedAgents,
  buildTeamRooms,
  resolveAgents,
  useNow,
  useNumberFormatter,
} from '@/components/empire-dashboard/model'
import { useAgents } from '@/hooks/use-agents'
import { useTeams } from '@/hooks/use-teams'
import { useWebSocket } from '@/hooks/use-websocket'
import { useMonitorStore } from '@/stores/monitor-store'

export function EmpireMonitorPage() {
  const navigate = useNavigate()
  const { agents, fetchAgents } = useAgents()
  const { teams, fetchTeams } = useTeams()
  const {
    agentStatuses,
    events,
    gatewayConnected,
    notifications,
    realtimeMessages,
    unreadCount,
    workflowSignals,
  } = useMonitorStore()

  useWebSocket()

  useEffect(() => {
    fetchAgents()
    fetchTeams()
  }, [fetchAgents, fetchTeams])

  const resolvedAgents = useMemo(
    () =>
      resolveAgents(agents, agentStatuses, {
        events,
        messages: realtimeMessages,
        notifications,
        workflowSignals,
      }),
    [agents, agentStatuses, events, notifications, realtimeMessages, workflowSignals],
  )
  const teamRooms = useMemo(() => buildTeamRooms(teams, resolvedAgents), [teams, resolvedAgents])
  const rankedAgents = useMemo(() => buildRankedAgents(resolvedAgents), [resolvedAgents])
  const liveFeedItems = useMemo(() => buildLiveFeed(events, realtimeMessages), [events, realtimeMessages])

  const activeCount = resolvedAgents.filter((agent) => agent.resolvedStatus === 'busy').length
  const hudStats = useMemo(
    () =>
      buildHudStats({
        agentCount: resolvedAgents.length,
        activeCount,
        roomCount: teamRooms.length,
        eventCount: events.length,
        gatewayConnected,
        messageCount: realtimeMessages.length,
      }),
    [activeCount, events.length, gatewayConnected, realtimeMessages.length, resolvedAgents.length, teamRooms.length],
  )

  const { date, time, briefing } = useNow()
  const numberFormatter = useNumberFormatter()

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.09),transparent_26%),radial-gradient(circle_at_80%_0%,rgba(168,85,247,0.1),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,1))] p-6 sm:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <DashboardHeroHeader
          title="帝国态势面板"
          subtitle={`实时聚合 ${teamRooms.length} 个工作室、${resolvedAgents.length} 个 Agent 和 ${liveFeedItems.length} 条近期动态`}
          time={time}
          date={date}
          briefing={briefing}
          reviewQueue={unreadCount}
          primaryCtaLabel="打开通信频道"
          primaryCtaDescription="从这里跳到通信频道，直接和单个 Agent 对话或查看会话细节。"
          onPrimaryCtaClick={() => navigate('/chat')}
        />

        <DashboardHudStats hudStats={hudStats} numberFormatter={numberFormatter} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]">
          <div className="space-y-5">
            <EmpireRoomGrid
              rooms={teamRooms}
              onOpenRoom={(roomId) => navigate(`/teams/${roomId}`)}
              onOpenAgent={(agentId) => navigate(`/chat?agent=${encodeURIComponent(agentId)}`)}
            />
          </div>

          <div className="space-y-5">
            <ActivityRankingBoard agents={rankedAgents} numberFormatter={numberFormatter} />
            <EmpireLiveFeed items={liveFeedItems} gatewayConnected={gatewayConnected} />
          </div>
        </div>
      </div>
    </div>
  )
}
