import assert from 'node:assert/strict'
import test from 'node:test'
import { isGatewayStatusHealthy, resolveEffectiveAgentStatus } from '../src/lib/effective-agent-status.ts'

test('isGatewayStatusHealthy requires rpc connected and runtime running', () => {
  assert.equal(isGatewayStatusHealthy(true, true), true)
  assert.equal(isGatewayStatusHealthy(false, true), false)
  assert.equal(isGatewayStatusHealthy(true, false), false)
  assert.equal(isGatewayStatusHealthy(false, false), false)
})

test('resolveEffectiveAgentStatus degrades to offline when gateway is unavailable', () => {
  assert.equal(resolveEffectiveAgentStatus('busy', false, false), 'offline')
  assert.equal(resolveEffectiveAgentStatus('idle', false, true), 'offline')
  assert.equal(resolveEffectiveAgentStatus('scheduled', true, false), 'offline')
})

test('resolveEffectiveAgentStatus keeps normalized status only when gateway is healthy', () => {
  assert.equal(resolveEffectiveAgentStatus('busy', true, true), 'busy')
  assert.equal(resolveEffectiveAgentStatus('idle', true, true), 'idle')
  assert.equal(resolveEffectiveAgentStatus('unknown', true, true), 'offline')
})
