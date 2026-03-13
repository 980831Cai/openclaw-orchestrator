import assert from 'node:assert/strict'
import test from 'node:test'

import { getGatewayRuntimeActions } from '../src/lib/gateway-runtime-controls.ts'

test('未运行时只显示启动按钮', () => {
  const actions = getGatewayRuntimeActions(
    {
      manageable: true,
      cliInstalled: true,
      running: false,
      responsive: false,
      host: '127.0.0.1',
      port: 18789,
      gatewayUrl: 'ws://127.0.0.1:18789',
      logFile: 'gateway.log',
      errorLogFile: 'gateway.err.log',
    },
    false,
  )

  assert.deepEqual(actions, [
    { action: 'start', label: '启动', visible: true, disabled: false },
    { action: 'stop', label: '停止', visible: false, disabled: true },
    { action: 'restart', label: '重启', visible: false, disabled: true },
  ])
})

test('运行中时隐藏启动按钮并显示停止和重启', () => {
  const actions = getGatewayRuntimeActions(
    {
      manageable: true,
      cliInstalled: true,
      running: true,
      responsive: false,
      host: '127.0.0.1',
      port: 18789,
      gatewayUrl: 'ws://127.0.0.1:18789',
      logFile: 'gateway.log',
      errorLogFile: 'gateway.err.log',
    },
    false,
  )

  assert.deepEqual(actions, [
    { action: 'start', label: '启动', visible: false, disabled: true },
    { action: 'stop', label: '停止', visible: true, disabled: false },
    { action: 'restart', label: '重启', visible: true, disabled: false },
  ])
})
