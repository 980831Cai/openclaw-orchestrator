import type { Notification, WorkflowRuntimeSignal } from '@/types'
import {
  buildHumanApprovalReminder,
  getApprovalReminderKey,
  type ApprovalReminder,
} from './approval-reminders'

export type MonitorPollKind = 'health' | 'statuses' | 'liveFeed'

const MONITOR_POLL_BASELINES: Record<MonitorPollKind, { visible: number; hidden: number; disconnected: number }> = {
  health: {
    visible: 10_000,
    hidden: 30_000,
    disconnected: 5_000,
  },
  statuses: {
    visible: 5_000,
    hidden: 15_000,
    disconnected: 3_000,
  },
  liveFeed: {
    visible: 5_000,
    hidden: 15_000,
    disconnected: 3_000,
  },
}

const MAX_POLL_INTERVAL_MS = 60_000
const SNAPSHOT_NOTIFICATION_WINDOW_MS = 90_000
const SNAPSHOT_NOTIFICATION_TYPES = new Set<Notification['type']>([
  'approval_required',
  'workflow_error',
])

export interface ResolveMonitorPollIntervalInput {
  kind: MonitorPollKind
  visible: boolean
  connected: boolean
  consecutiveFailures?: number
}

export interface ApprovalReminderSurface {
  key: string
  reminder: ApprovalReminder
  signal: WorkflowRuntimeSignal
}

export interface ApprovalReminderCollectionResult {
  reminders: ApprovalReminderSurface[]
  nextShownKeys: Set<string>
}

export interface SnapshotNotificationCollectionResult {
  notifications: Notification[]
  nextSeenIds: Set<string>
}

export function resolveMonitorPollInterval(input: ResolveMonitorPollIntervalInput) {
  const baseline = MONITOR_POLL_BASELINES[input.kind]
  const failures = Math.max(0, Math.trunc(input.consecutiveFailures ?? 0))

  let interval = input.connected
    ? input.visible
      ? baseline.visible
      : baseline.hidden
    : baseline.disconnected

  if (failures > 0) {
    interval = Math.min(interval * 2 ** failures, MAX_POLL_INTERVAL_MS)
  }

  return interval
}

export function collectHumanApprovalReminderSurfaces(
  signals: Iterable<WorkflowRuntimeSignal>,
  shownKeys: Iterable<string> = [],
): ApprovalReminderCollectionResult {
  const seenKeys = new Set(shownKeys)
  const activeSignals = Array.from(signals)
    .filter((signal) => signal.status === 'waiting_approval' && signal.approvalMode === 'human')
    .sort((left, right) => toTimestamp(left.updatedAt) - toTimestamp(right.updatedAt))

  const nextShownKeys = new Set(activeSignals.map((signal) => getApprovalReminderKey(signal)))
  const reminders: ApprovalReminderSurface[] = []

  activeSignals.forEach((signal) => {
    const key = getApprovalReminderKey(signal)
    if (seenKeys.has(key)) {
      return
    }

    const reminder = buildHumanApprovalReminder(signal)
    if (!reminder) {
      return
    }

    reminders.push({ key, reminder, signal })
  })

  return { reminders, nextShownKeys }
}

export function collectRecentUnreadSnapshotNotifications(
  notifications: Iterable<Notification>,
  seenIds: Iterable<string> = [],
  nowMs = Date.now(),
  recentWindowMs = SNAPSHOT_NOTIFICATION_WINDOW_MS,
): SnapshotNotificationCollectionResult {
  const nextSeenIds = new Set(seenIds)
  const surfaced: Notification[] = []
  const lowerBound = nowMs - Math.max(0, recentWindowMs)
  const ordered = Array.from(notifications).sort(
    (left, right) => toTimestamp(left.createdAt) - toTimestamp(right.createdAt),
  )

  ordered.forEach((notification) => {
    const id = String(notification.id || '').trim()
    if (!id) {
      return
    }

    const alreadySeen = nextSeenIds.has(id)
    nextSeenIds.add(id)
    if (alreadySeen || notification.read || !SNAPSHOT_NOTIFICATION_TYPES.has(notification.type)) {
      return
    }

    const createdAt = toTimestamp(notification.createdAt)
    if (createdAt < lowerBound) {
      return
    }

    surfaced.push(notification)
  })

  return { notifications: surfaced, nextSeenIds }
}

function toTimestamp(value?: string | null) {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}
