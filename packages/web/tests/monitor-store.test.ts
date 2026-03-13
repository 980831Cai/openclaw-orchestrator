import assert from 'node:assert/strict'
import test from 'node:test'
import { useMonitorStore } from '../src/stores/monitor-store.ts'
import type { WorkflowDefinition } from '../src/types/workflow.ts'

function resetMonitorStore() {
  useMonitorStore.setState({
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
  })
}

function buildWorkflow(id: string, nextRunAt?: string | null): WorkflowDefinition {
  return {
    id,
    name: id,
    teamId: 'team-1',
    nodes: {},
    edges: [],
    schedule: {
      enabled: true,
      cron: '*/5 * * * *',
      timezone: 'Asia/Shanghai',
      nextRunAt: nextRunAt ?? null,
    },
  }
}

test('syncRealtimeMessages keeps websocket additions that are newer than snapshot contents', () => {
  resetMonitorStore()
  const store = useMonitorStore.getState()

  store.addRealtimeMessage({
    id: 'msg-live',
    agentId: 'agent-a',
    sessionId: 'main',
    role: 'assistant',
    content: 'live message',
    timestamp: '2026-03-13T10:01:00Z',
  })

  useMonitorStore.getState().syncRealtimeMessages([
    {
      id: 'msg-snapshot',
      agentId: 'agent-a',
      sessionId: 'main',
      role: 'assistant',
      content: 'snapshot message',
      timestamp: '2026-03-13T10:00:00Z',
    },
  ])

  assert.deepEqual(
    useMonitorStore.getState().realtimeMessages.map((item) => item.id),
    ['msg-snapshot', 'msg-live'],
  )
})

test('syncEvents keeps websocket events when snapshot arrives without them', () => {
  resetMonitorStore()
  const store = useMonitorStore.getState()

  store.addEvent({
    id: 'evt-live',
    fromAgentId: 'agent-a',
    toAgentId: 'agent-b',
    type: 'broadcast',
    eventType: 'broadcast',
    content: 'live event',
    timestamp: '2026-03-13T10:01:00Z',
  })

  useMonitorStore.getState().syncEvents([
    {
      id: 'evt-snapshot',
      fromAgentId: 'agent-a',
      toAgentId: 'agent-b',
      type: 'broadcast',
      eventType: 'broadcast',
      content: 'snapshot event',
      timestamp: '2026-03-13T10:00:00Z',
    },
  ])

  assert.deepEqual(
    useMonitorStore.getState().events.map((item) => item.id),
    ['evt-snapshot', 'evt-live'],
  )
})

test('syncNotifications keeps live notifications that are missing from snapshot', () => {
  resetMonitorStore()
  const store = useMonitorStore.getState()

  store.addNotification({
    id: 'notif-live',
    type: 'workflow_completed',
    title: 'live',
    message: 'live notification',
    read: false,
    createdAt: '2026-03-13T10:01:00Z',
  })

  useMonitorStore.getState().syncNotifications([
    {
      id: 'notif-snapshot',
      type: 'approval_required',
      title: 'snapshot',
      message: 'snapshot notification',
      read: false,
      createdAt: '2026-03-13T10:00:00Z',
    },
  ])

  assert.deepEqual(
    useMonitorStore.getState().notifications.map((item) => item.id),
    ['notif-live', 'notif-snapshot'],
  )
  assert.equal(useMonitorStore.getState().unreadCount, 2)
})

test('syncNotifications preserves higher snapshot unread count when local list is truncated', () => {
  resetMonitorStore()

  useMonitorStore.getState().syncNotifications(
    [
      {
        id: 'notif-snapshot',
        type: 'approval_required',
        title: 'snapshot',
        message: 'snapshot notification',
        read: false,
        createdAt: '2026-03-13T10:00:00Z',
      },
    ],
    5,
  )

  assert.equal(useMonitorStore.getState().unreadCount, 5)
})

test('syncNotifications preserves the higher unread floor from backend snapshot', () => {
  resetMonitorStore()

  useMonitorStore.getState().syncNotifications(
    [
      {
        id: 'notif-snapshot',
        type: 'approval_required',
        title: 'snapshot',
        message: 'snapshot notification',
        read: false,
        createdAt: '2026-03-13T10:00:00Z',
      },
    ],
    3,
  )

  assert.equal(useMonitorStore.getState().unreadCount, 3)
})

test('syncScheduledWorkflows replaces stale schedule metadata with snapshot payload', () => {
  resetMonitorStore()

  useMonitorStore.getState().syncScheduledWorkflows([
    buildWorkflow('workflow-a', '2026-03-13T10:00:00Z'),
  ])

  useMonitorStore.getState().syncScheduledWorkflows([
    buildWorkflow('workflow-a', '2026-03-13T10:05:00Z'),
    buildWorkflow('workflow-b', '2026-03-13T10:10:00Z'),
  ])

  assert.deepEqual(
    useMonitorStore.getState().scheduledWorkflows.map((workflow) => [
      workflow.id,
      workflow.schedule?.nextRunAt ?? null,
    ]),
    [
      ['workflow-a', '2026-03-13T10:05:00Z'],
      ['workflow-b', '2026-03-13T10:10:00Z'],
    ],
  )
})
