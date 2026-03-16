import type { AgentListItem } from '@/types'

export function findSelectedAgentById(
  agents: AgentListItem[],
  selectedAgentId: string | null,
): AgentListItem | null {
  if (!selectedAgentId) {
    return null
  }

  return agents.find((agent) => agent.id === selectedAgentId) ?? null
}

export function resolveSelectedAgentIdFromQuery(
  agents: AgentListItem[],
  agentParam: string | null,
): string | null {
  if (!agentParam) {
    return null
  }

  return agents.find((agent) => agent.id === agentParam || agent.name === agentParam)?.id ?? null
}
