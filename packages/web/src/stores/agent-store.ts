import { create } from 'zustand'
import type { AgentListItem, AgentConfig, AgentStatus } from '@/types'

interface AgentStore {
  agents: AgentListItem[];
  selectedAgentId: string | null;
  selectedAgent: AgentConfig | null;
  loading: boolean;
  setAgents: (agents: AgentListItem[]) => void;
  setSelectedAgentId: (id: string | null) => void;
  setSelectedAgent: (agent: AgentConfig | null) => void;
  setLoading: (loading: boolean) => void;
  updateAgentStatus: (agentId: string, status: AgentStatus) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  selectedAgentId: null,
  selectedAgent: null,
  loading: false,
  setAgents: (agents) => set({ agents }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
  setLoading: (loading) => set({ loading }),
  updateAgentStatus: (agentId, status) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, status } : a
      ),
      selectedAgent:
        state.selectedAgent?.id === agentId
          ? { ...state.selectedAgent, status }
          : state.selectedAgent,
    })),
}))
