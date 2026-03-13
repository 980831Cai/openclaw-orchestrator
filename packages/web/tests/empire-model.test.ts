import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgents } from '../src/components/empire-dashboard/model.tsx'
import type { AgentListItem } from '../src/types/index.ts'

const baseAgent: AgentListItem = {
  id: 'agent-1',
  name: 'Agent One',
  emoji: '🤖',
  status: 'idle',
  teamIds: [],
}

test('resolveAgents forces offline status when gateway rpc and runtime are both unavailable', () => {
  const resolved = resolveAgents(
    [baseAgent],
    new Map([['agent-1', { status: 'busy' }]]),
    {
      gatewayConnected: false,
      gatewayRuntimeRunning: false,
    },
  )

  assert.equal(resolved[0].resolvedStatus, 'offline')
  assert.equal(resolved[0].statusLabel, '离线')
})

test('resolveAgents keeps gateway status when gateway health is good', () => {
  const resolved = resolveAgents(
    [baseAgent],
    new Map([['agent-1', { status: 'busy' }]]),
    {
      gatewayConnected: true,
      gatewayRuntimeRunning: true,
    },
  )

  assert.equal(resolved[0].resolvedStatus, 'busy')
  assert.equal(resolved[0].statusLabel, '忙碌')
})
