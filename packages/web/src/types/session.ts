// Session and communication type definitions
// Migrated from @openclaw/shared to local types
// Enhanced with: Notification, notification/approval_update event types

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

// ─── WebSocket event types ───

export type WebSocketEventType =
  | 'agent_status'
  | 'new_message'
  | 'gateway_chat'
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
