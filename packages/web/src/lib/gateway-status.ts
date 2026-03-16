import type { GatewayRuntimeStatus } from '@/types'

export interface GatewayStatusPayload {
  runtimeRunning?: boolean
  manageable?: boolean
  cliInstalled?: boolean
  responsive?: boolean
  host?: string
  port?: number
  gatewayUrl?: string
  rpcGatewayUrl?: string | null
  pid?: number | null
  detectionSource?: string | null
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

export interface GatewayDisplayState {
  localProcessOk: boolean
  tone: 'green' | 'amber' | 'red'
  label: string
  summary: string
}

export function resolveGatewayDisplayState(params: {
  realtimeConnected: boolean
  connectionReady?: boolean
  gatewayRpcConnected: boolean
  gatewayRuntimeRunning: boolean
}): GatewayDisplayState {
  const localProcessOk = params.gatewayRuntimeRunning
  if (params.connectionReady === false) {
    return {
      localProcessOk,
      tone: 'amber',
      label: '状态同步中',
      summary: '正在同步实时通道和 Gateway 状态，请稍候。',
    }
  }

  if (!params.realtimeConnected) {
    return {
      localProcessOk,
      tone: 'red',
      label: '实时通道断开',
      summary: '实时通道未连接，首页状态可能不完整',
    }
  }

  if (!params.gatewayRpcConnected) {
    return {
      localProcessOk,
      tone: 'red',
      label: 'Gateway 离线',
      summary: 'Gateway RPC 未连接，Agent 在线态与任务执行将降级为离线。',
    }
  }

  if (localProcessOk) {
    return {
      localProcessOk,
      tone: 'green',
      label: '系统状态正常',
      summary: '实时通道、Gateway RPC 和本机进程都正常',
    }
  }

  return {
    localProcessOk,
    tone: 'amber',
    label: '部分服务未就绪',
    summary: '实时通道与 Gateway RPC 正常，但本机 Gateway 进程未运行',
  }
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
    typeof runtime.gatewayUrl !== 'string'
  ) {
    return null
  }

  return {
    manageable: runtime.manageable,
    cliInstalled: runtime.cliInstalled,
    running: runtime.running,
    responsive: runtime.responsive ?? undefined,
    host: runtime.host,
    port: runtime.port,
    gatewayUrl: runtime.gatewayUrl,
    rpcGatewayUrl: runtime.rpcGatewayUrl ?? undefined,
    pid: runtime.pid ?? null,
    detectionSource: runtime.detectionSource ?? null,
    logFile: typeof runtime.logFile === 'string' ? runtime.logFile : '',
    logTail: runtime.logTail ?? null,
    errorLogFile: typeof runtime.errorLogFile === 'string' ? runtime.errorLogFile : '',
    errorLogTail: runtime.errorLogTail ?? null,
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

  const logFile =
    typeof payload.logFile === 'string'
      ? payload.logFile
      : current?.logFile ?? ''
  const errorLogFile =
    typeof payload.errorLogFile === 'string'
      ? payload.errorLogFile
      : current?.errorLogFile ?? ''
  const logTail =
    typeof payload.logTail === 'string'
      ? payload.logTail
      : current?.logTail ?? null
  const errorLogTail =
    typeof payload.errorLogTail === 'string'
      ? payload.errorLogTail
      : current?.errorLogTail ?? null
  const rpcGatewayUrl =
    payload.rpcGatewayUrl ?? current?.rpcGatewayUrl ?? undefined
  const pid = payload.pid ?? current?.pid ?? null
  const detectionSource =
    payload.detectionSource ?? current?.detectionSource ?? null
  const message = payload.message ?? current?.message ?? null
  const responsive = payload.responsive ?? current?.responsive

  return {
    manageable: payload.manageable,
    cliInstalled: payload.cliInstalled,
    running: payload.runtimeRunning,
    responsive,
    host: payload.host,
    port: payload.port,
    gatewayUrl: payload.gatewayUrl,
    rpcGatewayUrl,
    pid,
    detectionSource,
    logFile,
    logTail,
    errorLogFile,
    errorLogTail,
    message,
  }
}
