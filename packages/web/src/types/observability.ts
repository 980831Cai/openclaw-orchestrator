export interface UsageWindow {
  startAt: string
  endAt: string
}

export interface TeamUsageSummary {
  teamId: string
  rangeDays: number
  window: UsageWindow
  executionCount: number
  successCount: number
  successRate: number
  avgDurationMs: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  coveredExecutionCount: number
  coverageRate: number
}

export interface TeamUsageTrendPoint {
  date: string
  executionCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  usageSamplesCount: number
}

export interface TeamUsageTrendResponse {
  teamId: string
  rangeDays: number
  items: TeamUsageTrendPoint[]
}

export interface TeamUsageModelBreakdownItem {
  model: string
  executionCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  avgDurationMs: number
}

export interface TeamUsageAgentBreakdownItem {
  agentId: string
  executionCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  avgDurationMs: number
}

export interface TeamUsageWorkflowBreakdownItem {
  workflowId: string
  workflowName: string
  executionCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
  avgDurationMs: number
}

export type TeamUsageBreakdownDimension = 'model' | 'agent' | 'workflow'

export interface TeamUsageBreakdownResponse<T> {
  teamId: string
  dimension: TeamUsageBreakdownDimension
  rangeDays: number
  items: T[]
}

export interface TeamAuditLog {
  id: string
  teamId: string | null
  actor: string
  action: string
  resourceType: string
  resourceId: string | null
  detail: string
  metadata: Record<string, unknown>
  ok: boolean
  requestId: string | null
  createdAt: string
}

export interface TeamAuditResponse {
  teamId: string
  items: TeamAuditLog[]
  total: number
  limit: number
  offset: number
}
