// Agent-related type definitions
// Migrated from @openclaw/shared to local types

export type AgentStatus = 'idle' | 'busy' | 'scheduled' | 'offline' | 'error'
export type SkillCatalogSource = 'builtin' | 'platform' | 'agent-config'
export type OpenClawPluginKind = 'plugin' | 'tool' | 'mcp'

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

export interface SkillCatalogItem {
  id: string
  name: string
  description: string
  configuredCount: number
  configuredAgents: string[]
  sources: SkillCatalogSource[]
}

export interface OpenClawPluginField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'object' | string
  label: string
  description: string
  required: boolean
}

export interface OpenClawPluginItem {
  id: string
  name: string
  description: string
  kind: OpenClawPluginKind
  installed: boolean
  enabled: boolean
  manifestPath?: string | null
  config: Record<string, unknown>
  fields: OpenClawPluginField[]
  restartRequired: boolean
}

export interface AgentStatusEvent {
  agentId: string
  status: AgentStatus
  timestamp?: string
}
