import { useEffect, useState } from 'react'
import { Bell, Check, X, CheckCircle, AlertCircle, UserCheck, Zap } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMonitorStore } from '@/stores/monitor-store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'approval_required':
      return <UserCheck className="w-3 h-3" />
    case 'node_completed':
      return <Zap className="w-3 h-3" />
    case 'workflow_completed':
      return <CheckCircle className="w-3 h-3" />
    case 'workflow_error':
      return <AlertCircle className="w-3 h-3" />
    default:
      return <Bell className="w-3 h-3" />
  }
}

function getNotificationColor(type: string) {
  switch (type) {
    case 'approval_required':
      return 'text-yellow-500 bg-yellow-500'
    case 'node_completed':
      return 'text-blue-400 bg-blue-400'
    case 'workflow_completed':
      return 'text-green-500 bg-green-500'
    case 'workflow_error':
      return 'text-red-500 bg-red-500'
    default:
      return 'text-white/50 bg-white/50'
  }
}

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    setNotifications,
    setUnreadCount,
  } = useMonitorStore()
  const [open, setOpen] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)

  // Fetch notifications on mount
  useEffect(() => {
    api.get<Notification[]>('/notifications?limit=50').then((data) => {
      setNotifications(data)
    })
    api.get<{ unreadCount: number }>('/notifications/unread-count').then((data) => {
      setUnreadCount(data.unreadCount)
    })
  }, [setNotifications, setUnreadCount])

  const handleMarkAllRead = () => {
    api.put('/notifications/read-all').then(() => {
      markAllNotificationsRead()
    })
  }

  const handleMarkRead = (id: string) => {
    api.put(`/notifications/${id}/read`).then(() => {
      markNotificationRead(id)
    })
  }

  const handleApprove = async (notification: Notification) => {
    if (!notification.executionId) return
    setApproving(notification.id)

    // Find the pending approval for this execution
    const approvals = await api.get<any[]>(
      `/approvals?execution_id=${notification.executionId}`
    )
    const pending = approvals.find((a: any) => a.status === 'pending' && (a.approvalMode || 'human') === 'human')
    if (pending) {
      await api.post(`/approvals/${pending.id}/approve`)
    }
    handleMarkRead(notification.id)
    setApproving(null)
  }

  const handleReject = async (notification: Notification) => {
    if (!notification.executionId) return
    setApproving(notification.id)

    const approvals = await api.get<any[]>(
      `/approvals?execution_id=${notification.executionId}`
    )
    const pending = approvals.find((a: any) => a.status === 'pending' && (a.approvalMode || 'human') === 'human')
    if (pending) {
      await api.post(`/approvals/${pending.id}/reject`, { reject_reason: '通过通知中心驳回' })
    }
    handleMarkRead(notification.id)
    setApproving(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/30 hover:text-white/60 cursor-pointer transition-colors w-full"
          title="通知中心"
        >
          <Bell className="h-5 w-5 flex-shrink-0" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 left-[calc(50%+4px)] min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            通知
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-[320px] max-h-[480px] p-0 border-white/10 bg-cyber-panel/95 backdrop-blur-xl shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="text-white font-bold text-sm">通知中心</h3>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-white/40 hover:text-white text-[11px] transition-colors cursor-pointer"
            >
              全部已读
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="overflow-y-auto max-h-[420px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Bell className="w-8 h-8 text-white/10 mb-2" />
              <p className="text-white/30 text-xs">暂无通知</p>
            </div>
          ) : (
            notifications.map((n) => {
              const colorClass = getNotificationColor(n.type)
              const approvalMode = (n as any).approvalMode || 'human'
              const isApproval = n.type === 'approval_required' && !n.read && approvalMode === 'human'
              const isProcessing = approving === n.id

              return (
                <div
                  key={n.id}
                  className={cn(
                    'px-4 py-3 border-b border-white/5 transition-colors cursor-pointer hover:bg-white/5',
                    !n.read && 'bg-white/[0.03]'
                  )}
                  onClick={() => !n.read && handleMarkRead(n.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Color dot + icon */}
                    <div className={cn('mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0', colorClass.split(' ')[0], `${colorClass.split(' ')[1]}/20`)}>
                      {getNotificationIcon(n.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-xs font-medium truncate', n.read ? 'text-white/50' : 'text-white')}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                        )}
                      </div>
                      {n.message && (
                        <p className="text-white/30 text-[10px] truncate mt-0.5">{n.message}</p>
                      )}
                      <span className="text-white/20 text-[9px] mt-1 block">{timeAgo(n.createdAt)}</span>

                      {/* Quick approval actions */}
                      {isApproval && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleApprove(n) }}
                            disabled={isProcessing}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-500/15 text-green-500 border border-green-500/25 hover:bg-green-500/25 text-[10px] font-medium transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" /> 通过
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReject(n) }}
                            disabled={isProcessing}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500/15 text-red-500 border border-red-500/25 hover:bg-red-500/25 text-[10px] font-medium transition-all cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3 h-3" /> 驳回
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
