import { useEffect } from 'react'
import { wsClient } from '@/lib/websocket'
import { useMonitorStore } from '@/stores/monitor-store'
import type { Notification } from '@/types'

export function useWebSocket() {
  const { setConnected, setGatewayConnected, setAgentStatus, addEvent, addNotification, addRealtimeMessage } = useMonitorStore()

  useEffect(() => {
    wsClient.connect()
    setConnected(true)

    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const unsubStatus = wsClient.on('agent_status', (data) => {
      setAgentStatus(data as any)
    })

    const unsubComm = wsClient.on('communication', (data) => {
      addEvent(data as any)
    })

    // Subscribe to real-time agent messages (from session_watcher + Gateway)
    const unsubMessage = wsClient.on('new_message', (data) => {
      addRealtimeMessage(data as any)
    })

    // Subscribe to Gateway connection status
    const unsubGateway = wsClient.on('gateway_status', (data) => {
      setGatewayConnected((data as any)?.connected ?? false)
    })

    // Subscribe to notification events
    const unsubNotification = wsClient.on('notification', (data) => {
      const notification = data as Notification
      addNotification(notification)

      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.id,
        })
      }
    })

    // Subscribe to approval_update events
    const unsubApproval = wsClient.on('approval_update', (data) => {
      const approval = data as any
      // Create a notification-like event for approval status changes
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
      unsubStatus()
      unsubComm()
      unsubMessage()
      unsubGateway()
      unsubNotification()
      unsubApproval()
      wsClient.disconnect()
      setConnected(false)
    }
  }, [setConnected, setGatewayConnected, setAgentStatus, addEvent, addNotification, addRealtimeMessage])
}
