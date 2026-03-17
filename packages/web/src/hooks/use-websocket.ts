import { createElement, useCallback, useEffect, useRef } from 'react'
import { ToastAction, type ToastActionElement } from '@/components/ui/toast'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { buildHumanApprovalReminder, getApprovalReminderKey } from '@/lib/approval-reminders'
import { gatewayRuntimeFromHealth, mergeGatewayRuntimeStatus, resolveGatewayConnectedFromHealth } from '@/lib/gateway-status'
import { normalizeRealtimeMessage, parseRealtimeSessionKey } from '@/lib/realtime-message'
import { wsClient } from '@/lib/websocket'
import { useAgentStore } from '@/stores/agent-store'
import { useMonitorStore } from '@/stores/monitor-store'
import type { AgentStatus, GatewayRuntimeStatus, LiveFeedSnapshot, Notification, SessionMessage, WorkflowRuntimeSignal } from '@/types'

const GATEWAY_MESSAGE_EVENTS = new Set([
  'message',
  'chat.message',
  'agent.message',
  'agent.output',
  'session.message',
])

const GATEWAY_STATUS_EVENTS = new Set(['agent.status', 'agent.update', 'agent.state'])

interface HealthResponse {
  gatewayConnected?: boolean
  gatewayRuntime?: GatewayRuntimeStatus
  gateway?: {
    connected?: boolean
    runtimeRunning?: boolean
    manageable?: boolean
    cliInstalled?: boolean
    host?: string
    port?: number
    gatewayUrl?: string
    error?: string | null
  }
}

interface UnreadCountResponse {
  unreadCount: number
}

function coerceTimestamp(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000
    return new Date(milliseconds).toISOString()
  }
  return new Date().toISOString()
}


export function useWebSocket() {
  const shownApprovalReminderKeysRef = useRef(new Set<string>())
  const {
    setConnected,
    setGatewayConnected,
    setGatewayRuntime,
    setGatewayLastError,
    setAgentStatus,
    addEvent,
    syncEvents,
    addNotification,
    addRealtimeMessage,
    syncRealtimeMessages,
    setWorkflowSignal,
    syncActiveWorkflowSignals,
    syncScheduledWorkflows,
    syncNotifications,
    setUnreadCount,
  } = useMonitorStore()
  const updateAgentStatus = useAgentStore((state) => state.updateAgentStatus)

  const applyAgentStatus = (agentId: string, status: AgentStatus, timestamp?: string) => {
    setAgentStatus({ agentId, status, timestamp })
    updateAgentStatus(agentId, status)
  }

  const applyHealthSnapshot = useCallback((health: HealthResponse) => {
    setGatewayConnected(resolveGatewayConnectedFromHealth(health))
    setGatewayLastError(health.gateway?.error ?? null)
    const nextRuntime = gatewayRuntimeFromHealth(health.gatewayRuntime ?? null)
    setGatewayRuntime(nextRuntime)
  }, [setGatewayConnected, setGatewayLastError, setGatewayRuntime])

  const applyLiveFeedSnapshot = useCallback((snapshot: LiveFeedSnapshot) => {
    syncEvents(snapshot.events ?? [])
    syncRealtimeMessages(snapshot.messages ?? [])
    syncActiveWorkflowSignals(snapshot.workflowSignals ?? [])
    syncScheduledWorkflows(snapshot.scheduledWorkflows ?? [])
    syncNotifications(snapshot.notifications ?? [], snapshot.unreadCount ?? 0)
  }, [syncActiveWorkflowSignals, syncEvents, syncNotifications, syncRealtimeMessages, syncScheduledWorkflows])

  useEffect(() => {
    const handleGatewayRealtimeEvent = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') {
        return
      }

      const record = raw as { event?: string; data?: unknown; payload?: unknown; timestamp?: unknown }
      const eventName =
        typeof record.event === 'string'
          ? record.event
          : typeof (record as Record<string, unknown>).type === 'string'
            ? ((record as Record<string, unknown>).type as string)
            : ''
      const data = record.data ?? record.payload ?? record

      if (GATEWAY_MESSAGE_EVENTS.has(eventName) || (!eventName && data)) {
        const normalized = normalizeRealtimeMessage(data)
        if (normalized) {
          addRealtimeMessage(normalized)
        }
      }

      if (GATEWAY_STATUS_EVENTS.has(eventName) && data && typeof data === 'object') {
        const eventData = data as Record<string, unknown>
        const status = eventData.status as AgentStatus | undefined
        const explicitAgent = eventData.agentId as string | undefined
        const parsed = typeof eventData.sessionKey === 'string' ? parseRealtimeSessionKey(eventData.sessionKey) : {}
        const agentId = explicitAgent || parsed.agentId
        if (agentId && typeof status === 'string') {
          const timestamp = coerceTimestamp(eventData.timestamp ?? record.timestamp)
          applyAgentStatus(agentId, status, timestamp)
        }
      }
    }

    const unsubConnection = wsClient.onConnectionChange((connected) => {
      setConnected(connected)
      if (!connected) {
        setGatewayConnected(false)
        return
      }

      void Promise.all([
        api.get<HealthResponse>('/health').then(applyHealthSnapshot),
        api.get<LiveFeedSnapshot>('/monitor/live-feed-snapshot?limit=50').then(applyLiveFeedSnapshot),
      ]).catch(() => {})
    })
    wsClient.connect()

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

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

    const unsubGateway = wsClient.on('gateway_status', (data) => {
      const payload = (data ?? {}) as {
        connected?: boolean
        runtimeRunning?: boolean
        manageable?: boolean
        cliInstalled?: boolean
        host?: string
        port?: number
        gatewayUrl?: string
        error?: string | null
      }
      setGatewayConnected(Boolean(payload.connected))
      setGatewayLastError(payload.error ?? null)
      const current = useMonitorStore.getState().gatewayRuntime
      const nextRuntime = mergeGatewayRuntimeStatus(current, payload)
      if (nextRuntime !== current) {
        setGatewayRuntime(nextRuntime)
      }
    })

    const unsubGatewayEvent = wsClient.on('gateway_event', (data) => {
      handleGatewayRealtimeEvent(data)
    })

    const unsubGatewayChat = wsClient.on('gateway_chat', (data) => {
      handleGatewayRealtimeEvent({ event: 'chat.message', data })
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
      setWorkflowSignal(nextSignal)

      const reminderKey = getApprovalReminderKey(nextSignal)
      if (nextSignal.status !== 'waiting_approval') {
        shownApprovalReminderKeysRef.current.delete(reminderKey)
        return
      }

      const reminder = buildHumanApprovalReminder(nextSignal)
      if (!reminder || shownApprovalReminderKeysRef.current.has(reminderKey)) {
        return
      }

      shownApprovalReminderKeysRef.current.add(reminderKey)
      const action = createElement(
        ToastAction,
        {
          altText: '前往审批',
          onClick: () => window.location.assign(reminder.workflowUrl),
        },
        '去审批',
      ) as unknown as ToastActionElement

      toast({
        title: reminder.title,
        description: reminder.description,
        action,
      })
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
      const approval = data as any
      const reminderKey = approval?.id || `${approval?.executionId || 'unknown'}:${approval?.nodeId || '__approval__'}`
      shownApprovalReminderKeysRef.current.delete(reminderKey)
      if (approval.status === 'approved' || approval.status === 'rejected') {
        addNotification({
          id: `approval-${approval.id}-${Date.now()}`,
          type: approval.status === 'approved' ? 'workflow_completed' : 'workflow_error',
          title: approval.status === 'approved' ? '审批已通过' : '审批已驳回',
          message: approval.rejectReason || (approval.status === 'approved' ? '工作流将继续执行' : '工作流已终止'),
          executionId: approval.executionId,
          nodeId: approval.nodeId,
          read: false,
          createdAt: new Date().toISOString(),
        })
      }
    })

    return () => {
      shownApprovalReminderKeysRef.current.clear()
      unsubStatus()
      unsubComm()
      unsubMessage()
      unsubGatewayEvent()
      unsubGatewayChat()
      unsubGateway()
      unsubWorkflow()
      unsubNotification()
      unsubApproval()
      const didDisconnect = wsClient.disconnect()
      if (didDisconnect) {
        setConnected(false)
      }
      unsubConnection()
    }
  }, [
    setConnected,
    setGatewayConnected,
    setGatewayRuntime,
    setGatewayLastError,
    setAgentStatus,
    updateAgentStatus,
    addEvent,
    addNotification,
    addRealtimeMessage,
    setWorkflowSignal,
    applyHealthSnapshot,
  ])

  useEffect(() => {
    let disposed = false

    const syncHealth = async () => {
      try {
        const health = await api.get<HealthResponse>('/health')
        if (disposed) return
        applyHealthSnapshot(health)
      } catch {
        if (disposed) return
      }
    }

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

    const syncLiveFeedSnapshot = async () => {
      try {
        const snapshot = await api.get<LiveFeedSnapshot>('/monitor/live-feed-snapshot?limit=50')
        if (disposed) return
        applyLiveFeedSnapshot(snapshot)
      } catch {
        // Ignore polling failures; websocket remains the primary source.
      }
    }

    void syncHealth()
    void syncStatuses()
    void syncLiveFeedSnapshot()
    const healthTimer = window.setInterval(() => {
      void syncHealth()
    }, 10000)
    const timer = window.setInterval(() => {
      void syncStatuses()
    }, 5000)
    const liveFeedTimer = window.setInterval(() => {
      void syncLiveFeedSnapshot()
    }, 5000)

    return () => {
      disposed = true
      window.clearInterval(healthTimer)
      window.clearInterval(timer)
      window.clearInterval(liveFeedTimer)
    }
  }, [
    setAgentStatus,
    setGatewayConnected,
    setGatewayLastError,
    setGatewayRuntime,
    updateAgentStatus,
    applyHealthSnapshot,
    applyLiveFeedSnapshot,
  ])
}
