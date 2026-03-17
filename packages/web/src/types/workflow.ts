// Workflow-related type definitions
// Migrated from @openclaw/shared to local types
// Enhanced with ApprovalNode and waiting_approval status

import type { MeetingType } from './team'

export type WorkflowNodeType = 'task' | 'condition' | 'join' | 'parallel' | 'approval' | 'meeting' | 'debate'
export type WorkflowJoinMode = 'and' | 'or' | 'xor'

export interface TaskNodeData {
  type: 'task'
  label: string
  agentId: string
  task: string
  timeoutSeconds: number
  requireResponse?: boolean
  requireArtifacts?: boolean
  minOutputLength?: number
  successPattern?: string
  position?: { x: number; y: number }
  maxRetries?: number
  retryDelayMs?: number
}

export interface ConditionNodeData {
  type: 'condition'
  label: string
  expression: string
  branches: Record<string, string>
  position?: { x: number; y: number }
}

export interface JoinNodeData {
  type: 'join'
  label: string
  waitForAll?: boolean
  joinMode?: WorkflowJoinMode
  preferredSourceNodeId?: string
  position?: { x: number; y: number }
}

export interface ParallelNodeData {
  type: 'parallel'
  label: string
  waitForAll?: boolean
  joinMode?: WorkflowJoinMode
  preferredSourceNodeId?: string
  position?: { x: number; y: number }
}

export interface ApprovalNodeData {
  type: 'approval'
  label: string
  title: string
  description: string
  approver: string
  timeoutMinutes: number
  onTimeout: 'reject'
  position?: { x: number; y: number }
}

export interface MeetingNodeData {
  type: 'meeting'
  label: string
  meetingType: Exclude<MeetingType, 'debate'>
  topic: string
  topicDescription?: string
  participants: string[]
  teamId?: string
  leadAgentId?: string
  position?: { x: number; y: number }
}

export interface DebateNodeData {
  type: 'debate'
  label: string
  topic: string
  topicDescription?: string
  participants: string[]
  teamId?: string
  judgeAgentId?: string
  maxRounds: number
  position?: { x: number; y: number }
}

export type WorkflowNodeData =
  | TaskNodeData
  | ConditionNodeData
  | JoinNodeData
  | ParallelNodeData
  | ApprovalNodeData
  | MeetingNodeData
  | DebateNodeData

export interface WorkflowEdge {
  from: string
  to: string
  condition?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  teamId: string
  nodes: Record<string, WorkflowNodeData>
  edges: WorkflowEdge[]
  maxIterations?: number
  schedule?: WorkflowSchedule | null
}

export interface WorkflowScheduleWindow {
  start: string
  end: string
  timezone?: string
}

export interface WorkflowSchedule {
  enabled: boolean
  cron: string
  timezone: string
  expression?: string
  tz?: string
  window?: WorkflowScheduleWindow | null
  activeFrom?: string | null
  activeUntil?: string | null
  nextRunAt?: string | null
}

export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'waiting_approval'

export interface WorkflowExecutionModelSummaryItem {
  sampleCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  status: WorkflowExecutionStatus
  currentNodeId?: string | null
  startedAt: string
  completedAt?: string | null
  logs: WorkflowLog[]
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  usageMetricsCount?: number
  usageSamplesCount?: number
  usageCoverageRatio?: number
  modelSummary?: Record<string, WorkflowExecutionModelSummaryItem>
}

export interface WorkflowLog {
  timestamp: string
  nodeId: string
  message: string
  level: 'info' | 'warn' | 'error'
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalRecord {
  id: string
  executionId: string
  nodeId: string
  title: string
  description: string
  status: ApprovalStatus
  rejectReason?: string
  createdAt: string
  resolvedAt?: string
}
