import { useEffect } from 'react'
import { wsClient } from '@/lib/websocket'
import { useMonitorStore } from '@/stores/monitor-store'
import type { Notification } from '@/types'
import type { WsPayloadMap } from '@/types/websocket'

export function useWebSocket() {
  const { setConnected, setGatewayConnected, setAgentStatus, addEvent, addNotification, addRealtimeMessage } = useMonitorStore()

  useEffect(() => {
    wsClient.connect()
    setConnected(true)

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const unsubStatus = wsClient.on('agent_status', (raw) => {
      setAgentStatus(raw as WsPayloadMap['agent_status'])
    })

    const unsubComm = wsClient.on('communication', (raw) => {
      addEvent(raw as WsPayloadMap['communication'])
    })

    const unsubMessage = wsClient.on('new_message', (raw) => {
      addRealtimeMessage(raw as WsPayloadMap['new_message'])
    })

    const unsubGateway = wsClient.on('gateway_status', (raw) => {
      const payload = raw as WsPayloadMap['gateway_status']
      setGatewayConnected(payload?.connected ?? false)
    })

    const unsubNotification = wsClient.on('notification', (raw) => {
      const notification = raw as WsPayloadMap['notification']
      addNotification(notification)

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          tag: notification.id,
        })
      }
    })

    const unsubApproval = wsClient.on('approval_update', (raw) => {
      const approval = raw as WsPayloadMap['approval_update']
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
