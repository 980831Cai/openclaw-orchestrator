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

export function isGatewayStatusHealthy(gatewayConnected: boolean, gatewayRuntimeRunning: boolean): boolean {
  return gatewayConnected && gatewayRuntimeRunning
}

export function resolveEffectiveAgentStatus(
  status: AgentStatus | string | undefined,
  gatewayConnected: boolean,
  gatewayRuntimeRunning: boolean,
): AgentStatus {
  if (!isGatewayStatusHealthy(gatewayConnected, gatewayRuntimeRunning)) {
    return 'offline'
  }

  return normalizeAgentStatus(status)
}
