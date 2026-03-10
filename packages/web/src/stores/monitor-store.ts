import { create } from 'zustand'
import type { CommunicationEvent, AgentStatusEvent, Notification, SessionMessage } from '@/types'

interface MonitorStore {
  agentStatuses: Map<string, AgentStatusEvent>;
  events: CommunicationEvent[];
  connected: boolean;
  gatewayConnected: boolean;
  notifications: Notification[];
  unreadCount: number;
  realtimeMessages: SessionMessage[];
  setAgentStatus: (event: AgentStatusEvent) => void;
  addEvent: (event: CommunicationEvent) => void;
  setConnected: (connected: boolean) => void;
  setGatewayConnected: (connected: boolean) => void;
  addNotification: (notification: Notification) => void;
  addRealtimeMessage: (message: SessionMessage) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  setUnreadCount: (count: number) => void;
  setNotifications: (notifications: Notification[]) => void;
}

export const useMonitorStore = create<MonitorStore>((set) => ({
  agentStatuses: new Map(),
  events: [],
  connected: false,
  gatewayConnected: false,
  notifications: [],
  unreadCount: 0,
  realtimeMessages: [],
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
  setConnected: (connected) => set({ connected }),
  setGatewayConnected: (connected) => set({ gatewayConnected: connected }),
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
}))
