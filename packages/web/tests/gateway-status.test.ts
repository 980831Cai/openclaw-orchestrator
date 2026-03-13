import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveGatewayConnectedFromHealth } from '../src/lib/gateway-status.ts'

test('resolveGatewayConnectedFromHealth prefers explicit top-level health flag', () => {
  assert.equal(resolveGatewayConnectedFromHealth({ gatewayConnected: false, gateway: { connected: true } }), false)
  assert.equal(resolveGatewayConnectedFromHealth({ gatewayConnected: true, gateway: { connected: false } }), true)
})

test('resolveGatewayConnectedFromHealth falls back to nested gateway payload', () => {
  assert.equal(resolveGatewayConnectedFromHealth({ gateway: { connected: false } }), false)
  assert.equal(resolveGatewayConnectedFromHealth({ gateway: { connected: true } }), true)
})

test('resolveGatewayConnectedFromHealth defaults to false when health payload omits gateway state', () => {
  assert.equal(resolveGatewayConnectedFromHealth({}), false)
  assert.equal(resolveGatewayConnectedFromHealth(null), false)
})
