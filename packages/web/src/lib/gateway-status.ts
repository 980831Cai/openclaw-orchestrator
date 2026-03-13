import type { GatewayRuntimeStatus } from '@/types'

export interface GatewayStatusPayload {
  runtimeRunning?: boolean
  manageable?: boolean
  cliInstalled?: boolean
  host?: string
  port?: number
  gatewayUrl?: string
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
    host: runtime.host,
    port: runtime.port,
    gatewayUrl: runtime.gatewayUrl,
    logFile: runtime.logFile,
    errorLogFile: runtime.errorLogFile,
    message: runtime.message ?? null,
  }
}

export function mergeGatewayRuntimeStatus(
  current: GatewayRuntimeStatus | null,
  payload: GatewayStatusPayload,
): GatewayRuntimeStatus | null {
  if (
    typeof payload.runtimeRunning !== 'boolean' ||
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
    running: payload.runtimeRunning,
    host: payload.host,
    port: payload.port,
    gatewayUrl: payload.gatewayUrl,
    logFile: current?.logFile ?? '',
    errorLogFile: current?.errorLogFile ?? '',
    message: current?.message ?? null,
  }
}
