// Agent-related type definitions
// Migrated from @openclaw/shared to local types

export type AgentStatus = 'idle' | 'busy' | 'offline' | 'error'

export interface AgentListItem {
  id: string
  name: string
  emoji: string
  theme?: string
  status: AgentStatus
  teamIds: string[]
  model?: string
}

export interface AgentIdentity {
  name: string
  emoji: string
  theme?: string
  description?: string
  version?: string
}

export interface AgentSoul {
  personality?: string
  communication_style?: string
  values?: string
  background?: string
  quirks?: string
}

export interface AgentRules {
  autorun?: string[]
  constraints?: string[]
  safe_operations?: string[]
  tools?: string[]
}

export interface AgentConfig {
  id: string
  name: string
  model?: string
  workspace: string
  identity: AgentIdentity
  soul: AgentSoul
  rules: AgentRules
  skills: string[]
}

export interface AgentStatusEvent {
  agentId: string
  status: AgentStatus
  timestamp?: string
}
