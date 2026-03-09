// Session and communication type definitions
// Migrated from @openclaw/shared to local types
// Enhanced with: Notification, notification/approval_update event types

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
}

export interface CommunicationEvent {
  id: string
  fromAgentId: string
  toAgentId: string
  type: 'request' | 'response' | 'broadcast'
  content: string
  timestamp: string
}

// ─── WebSocket event types ───

export type WebSocketEventType =
  | 'agent_status'
  | 'new_message'
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
