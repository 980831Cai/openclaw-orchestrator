import { useCallback } from 'react'
import { api } from '@/lib/api'
import { useAgentStore } from '@/stores/agent-store'
import type { AgentListItem, AgentConfig } from '@/types'

export function useAgents() {
  const { agents, setAgents, setLoading, setSelectedAgent } = useAgentStore()

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const data = await api.get<AgentListItem[]>('/agents')
    setAgents(data)
    setLoading(false)
  }, [setAgents, setLoading])

  const fetchAgent = useCallback(async (id: string) => {
    setLoading(true)
    const data = await api.get<AgentConfig>(`/agents/${id}`)
    setSelectedAgent(data)
    setLoading(false)
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

  return { agents, fetchAgents, fetchAgent, createAgent, updateAgent, deleteAgent }
}
