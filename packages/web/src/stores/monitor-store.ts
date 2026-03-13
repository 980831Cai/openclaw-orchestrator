import { create } from 'zustand'
import type {
  CommunicationEvent,
  AgentStatusEvent,
  GatewayRuntimeStatus,
  Notification,
  SessionMessage,
  WorkflowRuntimeSignal,
} from '@/types'
import type { WorkflowDefinition } from '@/types/workflow'

type ActiveWorkflowStatus = 'running' | 'waiting_approval'

const ACTIVE_WORKFLOW_STATUSES = new Set<ActiveWorkflowStatus>(['running', 'waiting_approval'])
const RECENT_WORKFLOW_SIGNAL_RETENTION_MS = 6 * 60 * 60 * 1000
const MAX_RECENT_WORKFLOW_SIGNALS = 200

function toTimestamp(value: string | undefined) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getWorkflowSignalTimestamp(signal: WorkflowRuntimeSignal) {
  const timestamp = signal.updatedAt ? new Date(signal.updatedAt).getTime() : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isActiveWorkflowSignal(signal: WorkflowRuntimeSignal) {
  return ACTIVE_WORKFLOW_STATUSES.has(signal.status as ActiveWorkflowStatus)
}

function pruneWorkflowSignals(signals: Map<string, WorkflowRuntimeSignal>) {
  const next = new Map(signals)
  const now = Date.now()
  const recentCompleted = Array.from(next.values())
    .filter((signal) => !isActiveWorkflowSignal(signal))
    .sort((left, right) => getWorkflowSignalTimestamp(right) - getWorkflowSignalTimestamp(left))

  recentCompleted.forEach((signal, index) => {
    const timestamp = getWorkflowSignalTimestamp(signal)
    const expired = timestamp > 0 && now - timestamp > RECENT_WORKFLOW_SIGNAL_RETENTION_MS
    const overflow = index >= MAX_RECENT_WORKFLOW_SIGNALS
    if (expired || overflow) {
      next.delete(signal.executionId)
    }
  })

  return next
}

function mergeByKey<T>(
  current: T[],
  incoming: T[],
  options: {
    getKey: (item: T, index: number) => string
    compare: (left: T, right: T) => number
    limit: number
  },
) {
  const merged = new Map<string, T>()
  current.forEach((item, index) => {
    merged.set(options.getKey(item, index), item)
  })
  incoming.forEach((item, index) => {
    merged.set(options.getKey(item, index), item)
  })
  return Array.from(merged.values()).sort(options.compare).slice(0, options.limit)
}

function getMessageKey(message: SessionMessage, index: number) {
  return message.id || `${message.agentId || 'unknown'}-${message.sessionId || 'main'}-${message.timestamp || index}`
}

interface MonitorStore {
  agentStatuses: Map<string, AgentStatusEvent>;
  events: CommunicationEvent[];
  connected: boolean;
  gatewayConnected: boolean;
  gatewayRuntime: GatewayRuntimeStatus | null;
  gatewayLastError: string | null;
  notifications: Notification[];
  unreadCount: number;
  realtimeMessages: SessionMessage[];
  workflowSignals: Map<string, WorkflowRuntimeSignal>;
  scheduledWorkflows: WorkflowDefinition[];
  setAgentStatus: (event: AgentStatusEvent) => void;
  addEvent: (event: CommunicationEvent) => void;
  setEvents: (events: CommunicationEvent[]) => void;
  syncEvents: (events: CommunicationEvent[]) => void;
  setConnected: (connected: boolean) => void;
  setGatewayConnected: (connected: boolean) => void;
  setGatewayRuntime: (runtime: GatewayRuntimeStatus | null) => void;
  setGatewayLastError: (error: string | null) => void;
  addNotification: (notification: Notification) => void;
  addRealtimeMessage: (message: SessionMessage) => void;
  setRealtimeMessages: (messages: SessionMessage[]) => void;
  syncRealtimeMessages: (messages: SessionMessage[]) => void;
  setWorkflowSignal: (signal: WorkflowRuntimeSignal) => void;
  syncActiveWorkflowSignals: (signals: WorkflowRuntimeSignal[]) => void;
  syncScheduledWorkflows: (workflows: WorkflowDefinition[]) => void;
  clearWorkflowSignal: (executionId: string) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  setUnreadCount: (count: number) => void;
  setNotifications: (notifications: Notification[]) => void;
  syncNotifications: (notifications: Notification[], unreadFloor?: number) => void;
}

export const useMonitorStore = create<MonitorStore>((set) => ({
  agentStatuses: new Map(),
  events: [],
  connected: false,
  gatewayConnected: false,
  gatewayRuntime: null,
  gatewayLastError: null,
  notifications: [],
  unreadCount: 0,
  realtimeMessages: [],
  workflowSignals: new Map(),
  scheduledWorkflows: [],
  setAgentStatus: (event) =>
    set((state) => {
      const newMap = new Map(state.agentStatuses);
      newMap.set(event.agentId, event);
      return { agentStatuses: newMap };
    }),
  addEvent: (event) =>
    set((state) => ({
      events: [...state.events.slice(-99), event],
    })),
  setEvents: (events) => set({ events: [...events].slice(-100) }),
  syncEvents: (events) =>
    set((state) => ({
      events: mergeByKey(state.events, events, {
        getKey: (event) => event.id,
        compare: (left, right) => toTimestamp(left.timestamp) - toTimestamp(right.timestamp),
        limit: 100,
      }),
    })),
  setConnected: (connected) => set({ connected }),
  setGatewayConnected: (connected) => set({ gatewayConnected: connected }),
  setGatewayRuntime: (gatewayRuntime) => set({ gatewayRuntime }),
  setGatewayLastError: (gatewayLastError) => set({ gatewayLastError }),
  addRealtimeMessage: (message) =>
    set((state) => {
      // Dedup by message id
      if (state.realtimeMessages.some((m) => m.id === message.id)) {
        return state
      }
      return {
        realtimeMessages: [...state.realtimeMessages.slice(-199), message],
      }
    }),
  setRealtimeMessages: (messages) =>
    set(() => {
      const deduped = new Map<string, SessionMessage>()
      messages.forEach((message, index) => {
        const key = getMessageKey(message, index)
        if (!deduped.has(key)) {
          deduped.set(key, message)
        }
      })
      return {
        realtimeMessages: Array.from(deduped.values()).slice(-200),
      }
    }),
  syncRealtimeMessages: (messages) =>
    set((state) => ({
      realtimeMessages: mergeByKey(state.realtimeMessages, messages, {
        getKey: getMessageKey,
        compare: (left, right) => toTimestamp(left.timestamp) - toTimestamp(right.timestamp),
        limit: 200,
      }),
    })),
  setWorkflowSignal: (signal) =>
    set((state) => {
      const next = new Map(state.workflowSignals)
      const previous = next.get(signal.executionId)
      next.set(signal.executionId, {
        ...previous,
        ...signal,
        executionId: signal.executionId,
        updatedAt: signal.updatedAt ?? previous?.updatedAt ?? new Date().toISOString(),
      })
      return { workflowSignals: pruneWorkflowSignals(next) }
    }),
  syncActiveWorkflowSignals: (signals) =>
    set((state) => {
      const next = new Map(state.workflowSignals)
      const incomingIds = new Set(signals.map((signal) => signal.executionId))

      for (const [executionId, signal] of next.entries()) {
        if (isActiveWorkflowSignal(signal) && !incomingIds.has(executionId)) {
          next.delete(executionId)
        }
      }

      signals.forEach((signal) => {
        const previous = next.get(signal.executionId)
        next.set(signal.executionId, {
          ...previous,
          ...signal,
          executionId: signal.executionId,
          updatedAt: signal.updatedAt ?? previous?.updatedAt ?? new Date().toISOString(),
        })
      })

      return { workflowSignals: pruneWorkflowSignals(next) }
    }),
  syncScheduledWorkflows: (scheduledWorkflows) =>
    set(() => ({
      scheduledWorkflows: [...scheduledWorkflows],
    })),
  clearWorkflowSignal: (executionId) =>
    set((state) => {
      if (!state.workflowSignals.has(executionId)) {
        return state
      }
      const next = new Map(state.workflowSignals)
      next.delete(executionId)
      return { workflowSignals: next }
    }),
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 100),
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    })),
  markNotificationRead: (notificationId) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      );
      const unreadCount = notifications.filter((n) => !n.read).length;
      return { notifications, unreadCount };
    }),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  setUnreadCount: (count) => set({ unreadCount: count }),
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    }),
  syncNotifications: (notifications, unreadFloor = 0) =>
    set((state) => {
      const merged = mergeByKey(state.notifications, notifications, {
        getKey: (notification) => notification.id,
        compare: (left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt),
        limit: 100,
      })
      return {
        notifications: merged,
        unreadCount: Math.max(
          merged.filter((notification) => !notification.read).length,
          unreadFloor,
        ),
      }
    }),
}))
