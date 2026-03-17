import { useMemo } from 'react'
import { useAgents } from '@/hooks/use-agents'
import { useTeams } from '@/hooks/use-teams'
import { useMonitorStore } from '@/stores/monitor-store'
import {
  buildAgentRooms,
  resolveAgents,
  type AgentRoom,
  type ResolvedAgent,
} from '@/components/empire-dashboard/model'

/**
 * Shared hook that resolves agents into empire-office–friendly data.
 * Used by TeamDetailPage's "办公室实景" tab to render EmpireOfficeBoard.
 */
export function useEmpireOffice() {
  const { agents } = useAgents()
  const { teams } = useTeams()
  const {
    connected,
    events,
    agentStatuses,
    gatewayConnected,
    gatewayRuntime,
    realtimeMessages,
    notifications,
    workflowSignals,
  } = useMonitorStore()

  const workflowSignalList = useMemo(
    () =>
      Array.from(workflowSignals.values()).sort(
        (left, right) =>
          new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime(),
      ),
    [workflowSignals],
  )

  const gatewayRuntimeRunning = gatewayRuntime?.running === true

  const resolvedAgents: ResolvedAgent[] = useMemo(
    () =>
      resolveAgents(agents, agentStatuses, {
        events,
        messages: realtimeMessages,
        notifications,
        workflowSignals: workflowSignalList,
        gatewayConnected,
        gatewayRuntimeRunning,
      }),
    [agents, agentStatuses, events, realtimeMessages, notifications, workflowSignalList, gatewayConnected, gatewayRuntimeRunning],
  )

  const agentRooms: AgentRoom[] = useMemo(
    () => buildAgentRooms(teams, resolvedAgents),
    [teams, resolvedAgents],
  )

  return {
    agents,
    teams,
    resolvedAgents,
    agentRooms,
    connected,
  }
}
