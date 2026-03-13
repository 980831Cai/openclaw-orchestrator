import type { GatewayRuntimeStatus } from '@/types'

export interface GatewayStatusPayload {
  runtimeRunning?: boolean
  running?: boolean
  responsive?: boolean
  ready?: boolean
  state?: string
  manageable?: boolean
  cliInstalled?: boolean
  cliPath?: string | null
  host?: string
  port?: number
  gatewayUrl?: string
  rpcGatewayUrl?: string
  probeError?: string | null
  pid?: number | null
  detectionSource?: string | null
  processCommand?: string | null
  logFile?: string
  logTail?: string | null
  errorLogFile?: string
  errorLogTail?: string | null
  message?: string | null
}

export interface GatewayHealthSnapshot {
  gatewayConnected?: boolean
  gateway?: {
    connected?: boolean
  } | null
}

export function resolveGatewayConnectedFromHealth(
  health: GatewayHealthSnapshot | null | undefined,
): boolean {
  if (typeof health?.gatewayConnected === 'boolean') {
    return health.gatewayConnected
  }

  if (typeof health?.gateway?.connected === 'boolean') {
    return health.gateway.connected
  }

  return false
}

export function gatewayRuntimeFromHealth(
  runtime: GatewayRuntimeStatus | null | undefined,
): GatewayRuntimeStatus | null {
  if (
    !runtime ||
    typeof runtime.manageable !== 'boolean' ||
    typeof runtime.cliInstalled !== 'boolean' ||
    typeof runtime.running !== 'boolean' ||
    typeof runtime.host !== 'string' ||
    typeof runtime.port !== 'number' ||
    typeof runtime.gatewayUrl !== 'string' ||
    typeof runtime.logFile !== 'string' ||
    typeof runtime.errorLogFile !== 'string'
  ) {
    return null
  }

  return {
    manageable: runtime.manageable,
    cliInstalled: runtime.cliInstalled,
    running: runtime.running,
    responsive: runtime.responsive,
    ready: runtime.ready,
    state: runtime.state,
    host: runtime.host,
    port: runtime.port,
    gatewayUrl: runtime.gatewayUrl,
    rpcGatewayUrl: runtime.rpcGatewayUrl,
    cliPath: runtime.cliPath ?? null,
    pid: runtime.pid ?? null,
    detectionSource: runtime.detectionSource ?? null,
    processCommand: runtime.processCommand ?? null,
    probeError: runtime.probeError ?? null,
    logFile: runtime.logFile,
    logTail: runtime.logTail ?? null,
    errorLogFile: runtime.errorLogFile,
    errorLogTail: runtime.errorLogTail ?? null,
    message: runtime.message ?? null,
  }
}

export function mergeGatewayRuntimeStatus(
  current: GatewayRuntimeStatus | null,
  payload: GatewayStatusPayload,
): GatewayRuntimeStatus | null {
  const runtimeRunning =
    typeof payload.running === 'boolean'
      ? payload.running
      : typeof payload.runtimeRunning === 'boolean'
        ? payload.runtimeRunning
        : undefined

  if (
    typeof runtimeRunning !== 'boolean' ||
    typeof payload.manageable !== 'boolean' ||
    typeof payload.cliInstalled !== 'boolean' ||
    typeof payload.host !== 'string' ||
    typeof payload.port !== 'number' ||
    typeof payload.gatewayUrl !== 'string'
  ) {
    return current
  }

  return {
    manageable: payload.manageable,
    cliInstalled: payload.cliInstalled,
    running: runtimeRunning,
    responsive: payload.responsive ?? current?.responsive,
    ready:
      payload.ready
      ?? (typeof payload.responsive === 'boolean'
        ? Boolean((payload.running ?? payload.runtimeRunning) && payload.responsive)
        : current?.ready),
    state: payload.state ?? current?.state,
    host: payload.host,
    port: payload.port,
    gatewayUrl: payload.gatewayUrl,
    rpcGatewayUrl: payload.rpcGatewayUrl ?? current?.rpcGatewayUrl,
    cliPath: payload.cliPath ?? current?.cliPath ?? null,
    pid: payload.pid ?? current?.pid ?? null,
    detectionSource: payload.detectionSource ?? current?.detectionSource ?? null,
    processCommand: payload.processCommand ?? current?.processCommand ?? null,
    probeError: payload.probeError ?? current?.probeError ?? null,
    logFile: payload.logFile ?? current?.logFile ?? '',
    logTail: payload.logTail ?? current?.logTail ?? null,
    errorLogFile: payload.errorLogFile ?? current?.errorLogFile ?? '',
    errorLogTail: payload.errorLogTail ?? current?.errorLogTail ?? null,
    message: payload.message ?? current?.message ?? null,
  }
}

export function isGatewayRuntimeProcessRunning(runtime: GatewayRuntimeStatus | null | undefined): boolean {
  return runtime?.running === true
}

export function isGatewayRuntimeReady(runtime: GatewayRuntimeStatus | null | undefined): boolean {
  if (!runtime) {
    return false
  }
  if (typeof runtime.ready === 'boolean') {
    return runtime.ready
  }
  if (typeof runtime.responsive === 'boolean') {
    return runtime.running === true && runtime.responsive
  }
  if (typeof runtime.state === 'string') {
    return runtime.state === 'ready'
  }
  return runtime.running === true
}
