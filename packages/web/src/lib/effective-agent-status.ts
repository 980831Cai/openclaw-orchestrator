import type { AgentStatus } from '@/types'

export function normalizeAgentStatus(status: AgentStatus | string | undefined): AgentStatus {
  switch (status) {
    case 'busy':
    case 'idle':
    case 'scheduled':
    case 'error':
    case 'offline':
      return status
    default:
      return 'offline'
  }
}

export function isGatewayStatusHealthy(gatewayConnected: boolean, gatewayRuntimeReady: boolean): boolean {
  return gatewayConnected && gatewayRuntimeReady
}

export function resolveEffectiveAgentStatus(
  status: AgentStatus | string | undefined,
  gatewayConnected: boolean,
  gatewayRuntimeReady: boolean,
): AgentStatus {
  if (!isGatewayStatusHealthy(gatewayConnected, gatewayRuntimeReady)) {
    return 'offline'
  }

  return normalizeAgentStatus(status)
}
