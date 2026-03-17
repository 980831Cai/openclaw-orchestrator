import type { AgentListItem, TeamListItem, WorkflowNodeData } from '@/types'

function normalizeAgentId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('agent:') ? trimmed.slice('agent:'.length) : trimmed
}

export function resolveWorkflowTeam(
  teams: TeamListItem[],
  teamId?: string | null,
): TeamListItem | null {
  const normalizedTeamId = String(teamId || '').trim()
  if (!normalizedTeamId) return null
  return teams.find((team) => team.id === normalizedTeamId) ?? null
}

export function collectNodeRelatedAgentIds(
  node?: WorkflowNodeData | null,
): string[] {
  if (!node) return []

  const ids = new Set<string>()
  const push = (value?: string | null) => {
    const normalized = normalizeAgentId(String(value || ''))
    if (normalized) {
      ids.add(normalized)
    }
  }

  if (node.type === 'task') {
    push(node.agentId)
  }

  if (node.type === 'approval') {
    push(node.approver)
  }

  if (node.type === 'meeting') {
    node.participants.forEach(push)
    push(node.leadAgentId)
  }

  if (node.type === 'debate') {
    node.participants.forEach(push)
    push(node.judgeAgentId)
  }

  return Array.from(ids)
}

export function buildTeamScopedAgentOptions({
  team,
  allAgents,
  extraAgentIds = [],
}: {
  team: TeamListItem | null
  allAgents: AgentListItem[]
  extraAgentIds?: string[]
}): AgentListItem[] {
  const allAgentMap = new Map(allAgents.map((agent) => [agent.id, agent]))
  const merged: AgentListItem[] = []
  const seen = new Set<string>()

  const append = (agentId: string, fallbackName?: string) => {
    const normalizedId = normalizeAgentId(agentId)
    if (!normalizedId || seen.has(normalizedId)) return
    const matched = allAgentMap.get(normalizedId)
    merged.push({
      id: normalizedId,
      name: matched?.name || fallbackName || normalizedId,
      emoji: matched?.emoji || '🤖',
      theme: matched?.theme,
      status: matched?.status || 'offline',
      teamIds: matched?.teamIds || (team ? [team.id] : []),
      model: matched?.model,
      currentTask: matched?.currentTask,
    })
    seen.add(normalizedId)
  }

  if (team) {
    team.members?.forEach((member) => append(member.agentId, member.name))
  } else {
    allAgents.forEach((agent) => append(agent.id, agent.name))
  }

  extraAgentIds.forEach((agentId) => append(agentId, `${normalizeAgentId(agentId)}（历史配置）`))

  return merged
}
