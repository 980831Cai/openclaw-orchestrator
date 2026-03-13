import { create } from 'zustand'
import type {
  AgentStatusEvent,
  CommunicationEvent,
  GatewayRuntimeStatus,
  Notification,
  SessionMessage,
  WorkflowDefinition,
  WorkflowRuntimeSignal,
} from '@/types'

const MAX_EVENTS = 100
const MAX_MESSAGES = 200
const MAX_NOTIFICATIONS = 100

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function buildMessageKey(message: SessionMessage): string {
  return (
    message.id
    ?? [
      message.sessionKey ?? message.sessionId ?? 'main',
      message.agentId ?? 'unknown',
      message.role,
      message.timestamp ?? '',
      message.content,
    ].join('|')
  )
}

function buildEventKey(event: CommunicationEvent): string {
  return (
    event.id
    ?? [
      event.fromAgentId,
      event.toAgentId,
      event.type,
      event.timestamp,
      event.content,
    ].join('|')
  )
}

function buildNotificationKey(notification: Notification): string {
  return (
    notification.id
    ?? [
      notification.type,
      notification.executionId ?? '',
      notification.nodeId ?? '',
      notification.createdAt,
      notification.title,
      notification.message,
    ].join('|')
  )
}

function mergeByKey<T>(sources: Iterable<T>[], getKey: (item: T) => string): T[] {
  const merged = new Map<string, T>()
  sources.forEach((source) => {
    for (const item of source) {
      merged.set(getKey(item), item)
    }
  })
  return Array.from(merged.values())
}

function sortEvents(items: CommunicationEvent[]): CommunicationEvent[] {
  return [...items].sort((left, right) => toTimestamp(left.timestamp) - toTimestamp(right.timestamp))
}

function sortMessages(items: SessionMessage[]): SessionMessage[] {
  return [...items].sort((left, right) => toTimestamp(left.timestamp) - toTimestamp(right.timestamp))
}

function sortNotifications(items: Notification[]): Notification[] {
  return [...items].sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
}

interface MonitorStore {
  agentStatuses: Map<string, AgentStatusEvent>
  events: CommunicationEvent[]
  connected: boolean
  gatewayConnected: boolean
  gatewayError: string | null
  gatewayLastError: string | null
  gatewayAuthRequired: boolean
  gatewayRuntime: GatewayRuntimeStatus | null
  notifications: Notification[]
  unreadCount: number
  realtimeMessages: SessionMessage[]
  workflowSignals: Map<string, WorkflowRuntimeSignal>
  scheduledWorkflows: WorkflowDefinition[]
  setAgentStatus: (event: AgentStatusEvent) => void
  addEvent: (event: CommunicationEvent) => void
  syncEvents: (events: CommunicationEvent[]) => void
  setConnected: (connected: boolean) => void
  setGatewayConnected: (connected: boolean) => void
  setGatewayError: (error: string | null, authRequired?: boolean) => void
  setGatewayRuntime: (runtime: GatewayRuntimeStatus | null) => void
  addNotification: (notification: Notification) => void
  syncNotifications: (notifications: Notification[], unreadFloor?: number) => void
  addRealtimeMessage: (message: SessionMessage) => void
  syncRealtimeMessages: (messages: SessionMessage[]) => void
  setWorkflowSignal: (signal: WorkflowRuntimeSignal) => void
  clearWorkflowSignal: (executionId: string) => void
  syncWorkflowSignals: (signals: WorkflowRuntimeSignal[]) => void
  markNotificationRead: (notificationId: string) => void
  markAllNotificationsRead: () => void
  setUnreadCount: (count: number) => void
  setNotifications: (notifications: Notification[]) => void
  syncScheduledWorkflows: (workflows: WorkflowDefinition[]) => void
}

export const useMonitorStore = create<MonitorStore>((set) => ({
  agentStatuses: new Map(),
  events: [],
  connected: false,
  gatewayConnected: false,
  gatewayError: null,
  gatewayLastError: null,
  gatewayAuthRequired: false,
  gatewayRuntime: null,
  notifications: [],
  unreadCount: 0,
  realtimeMessages: [],
  workflowSignals: new Map(),
  scheduledWorkflows: [],
  setAgentStatus: (event) =>
    set((state) => {
      const next = new Map(state.agentStatuses)
      next.set(event.agentId, event)
      return { agentStatuses: next }
    }),
  addEvent: (event) =>
    set((state) => {
      const events = sortEvents(mergeByKey([state.events, [event]], buildEventKey)).slice(-MAX_EVENTS)
      return { events }
    }),
  syncEvents: (events) =>
    set((state) => ({
      events: sortEvents(mergeByKey([events, state.events], buildEventKey)).slice(-MAX_EVENTS),
    })),
  setConnected: (connected) => set({ connected }),
  setGatewayConnected: (connected) => set({ gatewayConnected: connected }),
  setGatewayError: (error, authRequired = false) =>
    set({
      gatewayError: error,
      gatewayLastError: error,
      gatewayAuthRequired: authRequired,
    }),
  setGatewayRuntime: (gatewayRuntime) => set({ gatewayRuntime }),
  addRealtimeMessage: (message) =>
    set((state) => ({
      realtimeMessages: sortMessages(
        mergeByKey([state.realtimeMessages, [message]], buildMessageKey),
      ).slice(-MAX_MESSAGES),
    })),
  syncRealtimeMessages: (messages) =>
    set((state) => ({
      realtimeMessages: sortMessages(
        mergeByKey([messages, state.realtimeMessages], buildMessageKey),
      ).slice(-MAX_MESSAGES),
    })),
  setWorkflowSignal: (signal) =>
    set((state) => {
      const next = new Map(state.workflowSignals)
      next.set(signal.executionId, signal)
      return { workflowSignals: next }
    }),
  clearWorkflowSignal: (executionId) =>
    set((state) => {
      if (!state.workflowSignals.has(executionId)) {
        return state
      }
      const next = new Map(state.workflowSignals)
      next.delete(executionId)
      return { workflowSignals: next }
    }),
  syncWorkflowSignals: (signals) =>
    set({
      workflowSignals: new Map(
        signals
          .filter((signal) => Boolean(signal?.executionId))
          .map((signal) => [signal.executionId, signal]),
      ),
    }),
  addNotification: (notification) =>
    set((state) => {
      const notifications = sortNotifications(
        mergeByKey([[notification], state.notifications], buildNotificationKey),
      ).slice(0, MAX_NOTIFICATIONS)
      return {
        notifications,
        unreadCount: notifications.filter((item) => !item.read).length,
      }
    }),
  syncNotifications: (notifications, unreadFloor = 0) =>
    set((state) => {
      const merged = sortNotifications(
        mergeByKey([notifications, state.notifications], buildNotificationKey),
      ).slice(0, MAX_NOTIFICATIONS)
      const unreadCount = Math.max(
        unreadFloor,
        merged.filter((item) => !item.read).length,
      )
      return { notifications: merged, unreadCount }
    }),
  markNotificationRead: (notificationId) =>
    set((state) => {
      const notifications = state.notifications.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification,
      )
      return {
        notifications,
        unreadCount: notifications.filter((notification) => !notification.read).length,
      }
    }),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, read: true })),
      unreadCount: 0,
    })),
  setUnreadCount: (count) => set({ unreadCount: count }),
  setNotifications: (notifications) =>
    set({
      notifications: sortNotifications(notifications).slice(0, MAX_NOTIFICATIONS),
      unreadCount: notifications.filter((notification) => !notification.read).length,
    }),
  syncScheduledWorkflows: (scheduledWorkflows) =>
    set({
      scheduledWorkflows: [...scheduledWorkflows],
    }),
}))
