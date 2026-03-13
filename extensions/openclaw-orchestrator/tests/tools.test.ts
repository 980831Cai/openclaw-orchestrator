import assert from 'node:assert/strict'
import test from 'node:test'

import { ORCHESTRATOR_TOOL_NAMES, createOrchestratorTools } from '../src/tools.ts'

type FetchCall = {
  url: string
  method: string
  body?: unknown
}

function createToolMap() {
  const tools = createOrchestratorTools(
    {} as never,
    { baseUrl: 'http://127.0.0.1:3721' },
    {},
  )

  return new Map(tools.map((tool) => [tool.name, tool]))
}

function installFetchMock(calls: FetchCall[]) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

test('ORCHESTRATOR_TOOL_NAMES includes runtime, monitor and active workflow tools', () => {
  const expected = [
    'orchestrator_list_active_workflows',
    'orchestrator_list_workflow_executions',
    'orchestrator_stop_workflow',
    'orchestrator_gateway_status',
    'orchestrator_start_gateway',
    'orchestrator_stop_gateway',
    'orchestrator_restart_gateway',
    'orchestrator_monitor_statuses',
    'orchestrator_live_feed_snapshot',
  ]

  for (const name of expected) {
    assert.ok(ORCHESTRATOR_TOOL_NAMES.includes(name as (typeof ORCHESTRATOR_TOOL_NAMES)[number]))
  }
})

test('runtime tools call runtime gateway endpoints', async () => {
  const calls: FetchCall[] = []
  const restoreFetch = installFetchMock(calls)
  const tools = createToolMap()

  try {
    await tools.get('orchestrator_gateway_status')?.execute()
    await tools.get('orchestrator_start_gateway')?.execute()
    await tools.get('orchestrator_stop_gateway')?.execute()
    await tools.get('orchestrator_restart_gateway')?.execute()
  } finally {
    restoreFetch()
  }

  assert.deepEqual(calls, [
    { url: 'http://127.0.0.1:3721/api/runtime/gateway', method: 'GET', body: undefined },
    { url: 'http://127.0.0.1:3721/api/runtime/gateway/start', method: 'POST', body: undefined },
    { url: 'http://127.0.0.1:3721/api/runtime/gateway/stop', method: 'POST', body: undefined },
    { url: 'http://127.0.0.1:3721/api/runtime/gateway/restart', method: 'POST', body: undefined },
  ])
})

test('workflow operation tools call active list, execution list and stop endpoints', async () => {
  const calls: FetchCall[] = []
  const restoreFetch = installFetchMock(calls)
  const tools = createToolMap()

  try {
    await tools.get('orchestrator_list_active_workflows')?.execute()
    await tools.get('orchestrator_list_workflow_executions')?.execute('tool-1', { workflowId: 'wf-1' })
    await tools.get('orchestrator_stop_workflow')?.execute('tool-2', {
      workflowId: 'wf-1',
      executionId: 'exec-1',
    })
  } finally {
    restoreFetch()
  }

  assert.deepEqual(calls, [
    { url: 'http://127.0.0.1:3721/api/workflows/active-executions', method: 'GET', body: undefined },
    { url: 'http://127.0.0.1:3721/api/workflows/wf-1/executions', method: 'GET', body: undefined },
    {
      url: 'http://127.0.0.1:3721/api/workflows/wf-1/stop',
      method: 'POST',
      body: { executionId: 'exec-1' },
    },
  ])
})

test('monitor tools call monitor status and live feed snapshot endpoints', async () => {
  const calls: FetchCall[] = []
  const restoreFetch = installFetchMock(calls)
  const tools = createToolMap()

  try {
    await tools.get('orchestrator_monitor_statuses')?.execute()
    await tools.get('orchestrator_live_feed_snapshot')?.execute()
  } finally {
    restoreFetch()
  }

  assert.deepEqual(calls, [
    { url: 'http://127.0.0.1:3721/api/monitor/statuses', method: 'GET', body: undefined },
    { url: 'http://127.0.0.1:3721/api/monitor/live-feed-snapshot', method: 'GET', body: undefined },
  ])
})
