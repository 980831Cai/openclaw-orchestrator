// Agent-related type definitions
// Migrated from @openclaw/shared to local types

export type AgentStatus = 'idle' | 'busy' | 'scheduled' | 'offline' | 'error'

export interface AgentListItem {
  id: string
  name: string
  emoji: string
  theme?: string
  status: AgentStatus
  teamIds: string[]
  model?: string
  currentTask?: string
}

export interface AgentIdentity {
  name: string
  emoji: string
  theme?: string
  description?: string
  version?: string
  vibe?: string
  greeting?: string
}

export interface AgentSoul {
  personality?: string
  communication_style?: string
  values?: string
  background?: string
  quirks?: string
  vibe?: string
  coreTruths?: string
  boundaries?: string
  continuity?: string
}

export interface AgentRules {
  autorun?: string[]
  constraints?: string[]
  safe_operations?: string[]
  tools?: string[]
  startupFlow?: string
  memoryRules?: string
  securityRules?: string
  toolProtocols?: string
}

export interface AgentConfig {
  id: string
  name: string
  model?: string
  status?: AgentStatus
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
