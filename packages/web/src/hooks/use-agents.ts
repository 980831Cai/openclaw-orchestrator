import { useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { resolveEffectiveAgentStatus } from '@/lib/effective-agent-status'
import { useAgentStore } from '@/stores/agent-store'
import { useMonitorStore } from '@/stores/monitor-store'
import type { AgentListItem, AgentConfig } from '@/types'

export function useAgents() {
  const { agents, loading, setAgents, setLoading, setSelectedAgent } = useAgentStore()
  const gatewayConnected = useMonitorStore((state) => state.gatewayConnected)
  const gatewayRuntimeRunning = useMonitorStore((state) => state.gatewayRuntime?.running === true)

  const effectiveAgents = useMemo(
    () =>
      agents.map((agent) => ({
        ...agent,
        status: resolveEffectiveAgentStatus(agent.status, gatewayConnected, gatewayRuntimeRunning),
      })),
    [agents, gatewayConnected, gatewayRuntimeRunning],
  )

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<AgentListItem[]>('/agents')
      setAgents(data)
    } finally {
      setLoading(false)
    }
  }, [setAgents, setLoading])

  const fetchAgent = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const data = await api.get<AgentConfig>(`/agents/${id}`)
      setSelectedAgent(data)
    } finally {
      setLoading(false)
    }
  }, [setSelectedAgent, setLoading])

  const createAgent = useCallback(async (name: string) => {
    const data = await api.post<AgentConfig>('/agents', { name })
    await fetchAgents()
    return data
  }, [fetchAgents])

  const updateAgent = useCallback(async (id: string, config: Partial<AgentConfig>) => {
    const data = await api.put<AgentConfig>(`/agents/${id}`, config)
    setSelectedAgent(data)
    await fetchAgents()
    return data
  }, [fetchAgents, setSelectedAgent])

  const deleteAgent = useCallback(async (id: string) => {
    await api.delete(`/agents/${id}`)
    await fetchAgents()
  }, [fetchAgents])

  return { agents: effectiveAgents, loading, fetchAgents, fetchAgent, createAgent, updateAgent, deleteAgent }
}
