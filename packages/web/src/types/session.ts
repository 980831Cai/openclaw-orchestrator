// Session and communication type definitions
// Migrated from @openclaw/shared to local types
// Enhanced with: Notification, notification/approval_update event types

import type { WorkflowDefinition } from './workflow'

export interface SessionMessage {
  id?: string
  sessionId?: string
  sessionKey?: string
  agentId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

export interface CommunicationEvent {
  id: string
  fromAgentId: string
  toAgentId: string
  type: 'request' | 'response' | 'broadcast'
  eventType?: 'request' | 'response' | 'broadcast'
  content: string
  message?: string
  timestamp: string
}

export type WorkflowRuntimeStatus = 'running' | 'waiting_approval' | 'completed' | 'failed' | 'stopped'

export interface WorkflowRuntimeSignal {
  executionId: string
  workflowId?: string
  workflowName?: string
  status: WorkflowRuntimeStatus
  currentNodeId?: string | null
  nodeType?: 'task' | 'condition' | 'join' | 'parallel' | 'approval' | 'meeting' | 'debate' | string
  nodeLabel?: string | null
  agentId?: string | null
  participantIds?: string[]
  approvalId?: string | null
  approvalMode?: 'human' | 'agent' | string | null
  approverAgentId?: string | null
  upstreamArtifactCount?: number
  totalArtifacts?: number
  updatedAt?: string
}

export interface ApprovalUpdatePayload {
  id?: string
  executionId: string
  nodeId?: string | null
  status: 'pending' | 'approved' | 'rejected' | string
  rejectReason?: string | null
  updatedAt?: string
  resolvedAt?: string
}

export interface GatewayRuntimeStatus {
  manageable: boolean
  cliInstalled: boolean
  running: boolean
  responsive?: boolean
  host: string
  port: number
  gatewayUrl: string
  rpcGatewayUrl?: string
  pid?: number | null
  detectionSource?: string | null
  logFile: string
  logTail?: string | null
  errorLogFile: string
  errorLogTail?: string | null
  message?: string | null
}

export interface LiveFeedSnapshot {
  events: CommunicationEvent[]
  messages: SessionMessage[]
  workflowSignals: WorkflowRuntimeSignal[]
  scheduledWorkflows: WorkflowDefinition[]
  notifications: Notification[]
  unreadCount: number
}

// ─── WebSocket event types ───

export type WebSocketEventType =
  | 'agent_status'
  | 'new_message'
  | 'gateway_chat'
  | 'gateway_event'
  | 'communication'
  | 'task_update'
  | 'workflow_update'
  | 'notification'
  | 'approval_update'

// ─── Notification types ───

export type NotificationType =
  | 'approval_required'
  | 'node_completed'
  | 'workflow_completed'
  | 'workflow_error'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  executionId?: string
  nodeId?: string
  read: boolean
  createdAt: string
}
