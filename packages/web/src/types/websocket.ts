/**
 * WebSocket message type definitions for strong typing.
 */
import type { AgentStatusEvent } from '@/types/agent'
import type { CommunicationEvent, Notification, SessionMessage } from '@/types/session'
import type { GatewayStatusPayload } from '@/lib/gateway-status'

/** Payload map: event type → payload shape */
export interface WsPayloadMap {
  agent_status: AgentStatusEvent
  communication: CommunicationEvent
  new_message: SessionMessage
  gateway_status: GatewayStatusPayload & { connected: boolean; error?: string | null }
  notification: Notification
  approval_update: {
    id: string
    executionId: string
    nodeId: string
    status: 'approved' | 'rejected'
    rejectReason?: string
  }
  connected: { message: string }
  ping: { timestamp?: string }
  pong: { timestamp?: string }
}

export type WsEventType = keyof WsPayloadMap
