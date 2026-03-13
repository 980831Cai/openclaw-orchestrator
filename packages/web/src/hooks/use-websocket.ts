import { useEffect } from 'react'
import { api } from '@/lib/api'
import {
  gatewayRuntimeFromHealth,
  mergeGatewayRuntimeStatus,
  type GatewayStatusPayload,
} from '@/lib/gateway-status'
import { wsClient } from '@/lib/websocket'
import { useAgentStore } from '@/stores/agent-store'
import { useMonitorStore } from '@/stores/monitor-store'
import type {
  AgentStatus,
  ApprovalUpdatePayload,
  GatewayRuntimeStatus,
  LiveFeedSnapshot,
  Notification,
  SessionMessage,
  WorkflowRuntimeSignal,
} from '@/types'

function coerceTimestamp(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000
    return new Date(milliseconds).toISOString()
  }
  return new Date().toISOString()
}

function parseAgentSessionKey(value: string): { agentId?: string; sessionId?: string } {
  if (value.startsWith('agent:')) {
    const parts = value.split(':')
    if (parts.length >= 3) {
      return {
        agentId: parts[1],
        sessionId: parts.slice(2).join(':'),
      }
    }
  }

  if (value.startsWith('agent/')) {
    const parts = value.split('/')
    if (parts.length >= 3) {
      return {
        agentId: parts[1],
        sessionId: parts.slice(2).join('/'),
      }
    }
  }

  return {}
}

function coerceContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const text = (item as Record<string, unknown>).text ?? (item as Record<string, unknown>).content
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (typeof record.content === 'string') return record.content
  }
  return ''
}

function normalizeRealtimeMessage(payload: unknown): SessionMessage | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const envelope =
    record.message && typeof record.message === 'object'
      ? (record.message as Record<string, unknown>)
      : record

  const directRole = envelope.role ?? record.role
  const role =
    directRole === 'user' || directRole === 'assistant' || directRole === 'system'
      ? directRole
      : ((envelope.authorRole
          ?? record.authorRole
          ?? envelope.senderRole
          ?? record.senderRole
          ?? 'assistant') as SessionMessage['role'])

  const nestedSession =
    envelope.session && typeof envelope.session === 'object'
      ? (envelope.session as Record<string, unknown>)
      : record.session && typeof record.session === 'object'
        ? (record.session as Record<string, unknown>)
        : null

  const sessionKey =
    typeof envelope.sessionKey === 'string'
      ? envelope.sessionKey
      : typeof record.sessionKey === 'string'
        ? record.sessionKey
        : typeof envelope.scope === 'string'
          ? envelope.scope
          : typeof record.scope === 'string'
            ? record.scope
            : typeof nestedSession?.key === 'string'
              ? nestedSession.key
              : typeof nestedSession?.id === 'string'
                ? nestedSession.id
                : ''

  let sessionId =
    typeof envelope.sessionId === 'string'
      ? envelope.sessionId
      : typeof record.sessionId === 'string'
        ? record.sessionId
        : typeof nestedSession?.id === 'string'
          ? nestedSession.id
          : ''
  let agentId =
    typeof envelope.agentId === 'string'
      ? envelope.agentId
      : typeof record.agentId === 'string'
        ? record.agentId
        : typeof nestedSession?.agentId === 'string'
          ? nestedSession.agentId
          : typeof envelope.agent === 'string'
            ? envelope.agent
            : typeof record.agent === 'string'
              ? record.agent
              : ''

  const parsedFromSessionKey = sessionKey ? parseAgentSessionKey(sessionKey) : {}
  if (!agentId && parsedFromSessionKey.agentId) {
    agentId = parsedFromSessionKey.agentId
  }
  if (!sessionId && parsedFromSessionKey.sessionId) {
    sessionId = parsedFromSessionKey.sessionId
  }

  const content = coerceContent(
    envelope.content
      ?? record.content
      ?? envelope.text
      ?? record.text
      ?? envelope.message
      ?? record.message
      ?? envelope.parts
      ?? record.parts
      ?? '',
  )
  if (!content) return null

  return {
    id:
      (typeof envelope.id === 'string' && envelope.id)
      || (typeof record.id === 'string' && record.id)
      || (typeof envelope.messageId === 'string' && envelope.messageId)
      || (typeof record.messageId === 'string' && record.messageId)
      || `rt-${agentId || 'unknown'}-${sessionId || 'main'}-${String(record.timestamp ?? Date.now())}`,
    sessionId: sessionId || 'main',
    sessionKey: sessionKey || undefined,
    agentId,
    role,
    content,
    timestamp: coerceTimestamp(
      envelope.timestamp
        ?? record.timestamp
        ?? envelope.createdAt
        ?? record.createdAt
        ?? envelope.updatedAt
        ?? record.updatedAt,
    ),
  }
}

export function useWebSocket() {
  const {
    setConnected,
    setGatewayConnected,
    setGatewayError,
    setGatewayRuntime,
    setAgentStatus,
    addEvent,
    syncEvents,
    addNotification,
    syncNotifications,
    addRealtimeMessage,
    syncRealtimeMessages,
    setWorkflowSignal,
    clearWorkflowSignal,
    syncWorkflowSignals,
    syncScheduledWorkflows,
  } = useMonitorStore()
  const updateAgentStatus = useAgentStore((state) => state.updateAgentStatus)

  const applyAgentStatus = (agentId: string, status: AgentStatus, timestamp?: string) => {
    setAgentStatus({ agentId, status, timestamp })
    updateAgentStatus(agentId, status)
  }

  useEffect(() => {
    wsClient.connect()

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const unsubConnected = wsClient.on('connected', () => {
      setConnected(true)
    })

    const unsubStatus = wsClient.on('agent_status', (data) => {
      const event = data as { agentId?: string; status?: AgentStatus; timestamp?: string }
      if (!event.agentId || !event.status) return
      applyAgentStatus(event.agentId, event.status, event.timestamp)
    })

    const unsubComm = wsClient.on('communication', (raw) => {
      addEvent(raw as any)
    })

    const unsubMessage = wsClient.on('new_message', (data) => {
      const normalized = normalizeRealtimeMessage(data)
      if (normalized) {
        addRealtimeMessage(normalized)
      }
    })

    const unsubGatewayChat = wsClient.on('gateway_chat', (data) => {
      const normalized = normalizeRealtimeMessage(data)
      if (normalized) {
        addRealtimeMessage(normalized)
      }
    })

    const unsubGateway = wsClient.on('gateway_status', (data) => {
      const payload = (data ?? {}) as GatewayStatusPayload & {
        connected?: boolean
        error?: string | null
        authRequired?: boolean
      }

      setGatewayConnected(payload.connected ?? false)
      setGatewayError(payload.error ?? null, payload.authRequired ?? false)

      const currentRuntime = useMonitorStore.getState().gatewayRuntime
      const nextRuntime = mergeGatewayRuntimeStatus(currentRuntime, payload)
      if (nextRuntime !== currentRuntime) {
        setGatewayRuntime(nextRuntime)
      }
    })

    const unsubWorkflow = wsClient.on('workflow_update', (data) => {
      const signal = data as WorkflowRuntimeSignal
      if (!signal?.executionId) {
        return
      }
      const nextSignal: WorkflowRuntimeSignal = {
        ...signal,
        updatedAt: signal.updatedAt ?? new Date().toISOString(),
      }
      if (['completed', 'failed', 'stopped'].includes(nextSignal.status)) {
        clearWorkflowSignal(nextSignal.executionId)
        return
      }
      setWorkflowSignal(nextSignal)
    })

    const unsubNotification = wsClient.on('notification', (data) => {
      const notification = data as Notification
      addNotification(notification)

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.id,
        })
      }
    })

    const unsubApproval = wsClient.on('approval_update', (data) => {
      const approval = data as ApprovalUpdatePayload
      if (approval.status === 'approved' || approval.status === 'rejected') {
        addNotification({
          id: `approval-${approval.id}-${Date.now()}`,
          type: approval.status === 'approved' ? 'workflow_completed' : 'workflow_error',
          title: approval.status === 'approved' ? '审批已通过' : '审批已驳回',
          message: approval.rejectReason || (approval.status === 'approved' ? '工作流将继续执行' : '工作流已终止'),
          executionId: approval.executionId,
          nodeId: approval.nodeId ?? undefined,
          read: false,
          createdAt: approval.updatedAt ?? approval.resolvedAt ?? new Date().toISOString(),
        })
      }
    })

    return () => {
      unsubConnected()
      unsubStatus()
      unsubComm()
      unsubMessage()
      unsubGatewayChat()
      unsubGateway()
      unsubWorkflow()
      unsubNotification()
      unsubApproval()
      wsClient.disconnect()
      setConnected(false)
    }
  }, [
    setConnected,
    setGatewayConnected,
    setGatewayError,
    setGatewayRuntime,
    setAgentStatus,
    updateAgentStatus,
    addEvent,
    syncEvents,
    addNotification,
    syncNotifications,
    addRealtimeMessage,
    syncRealtimeMessages,
    setWorkflowSignal,
    clearWorkflowSignal,
    syncWorkflowSignals,
    syncScheduledWorkflows,
  ])

  useEffect(() => {
    let disposed = false

    const syncSnapshot = async () => {
      try {
        const [snapshot, runtime] = await Promise.all([
          api.get<LiveFeedSnapshot>('/monitor/live-feed-snapshot'),
          api.get<GatewayRuntimeStatus>('/runtime/gateway'),
        ])
        if (disposed) return

        syncEvents(snapshot.events ?? [])
        syncRealtimeMessages(snapshot.messages ?? [])
        syncWorkflowSignals(snapshot.workflowSignals ?? [])
        syncScheduledWorkflows(snapshot.scheduledWorkflows ?? [])
        syncNotifications(snapshot.notifications ?? [], snapshot.unreadCount ?? 0)
        setGatewayRuntime(gatewayRuntimeFromHealth(runtime))
      } catch {
        // Ignore initial snapshot failures and rely on websocket / other polling.
      }
    }

    void syncSnapshot()

    return () => {
      disposed = true
    }
  }, [
    setGatewayRuntime,
    syncEvents,
    syncNotifications,
    syncRealtimeMessages,
    syncScheduledWorkflows,
    syncWorkflowSignals,
  ])

  useEffect(() => {
    let disposed = false

    const syncStatuses = async () => {
      try {
        const statuses = await api.get<Record<string, AgentStatus>>('/monitor/statuses')
        if (disposed) return
        const timestamp = new Date().toISOString()
        Object.entries(statuses || {}).forEach(([agentId, status]) => {
          applyAgentStatus(agentId, status, timestamp)
        })
      } catch {
        // Ignore polling failures; websocket remains the primary source.
      }
    }

    void syncStatuses()
    const timer = window.setInterval(() => {
      void syncStatuses()
    }, 5000)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [setAgentStatus, updateAgentStatus])
}
