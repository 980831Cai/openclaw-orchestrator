import type { GatewayRuntimeStatus } from '@/types'

export type GatewayRuntimeAction = 'start' | 'stop' | 'restart'

export interface GatewayRuntimeActionState {
  action: GatewayRuntimeAction
  label: string
  visible: boolean
  disabled: boolean
}

export function getGatewayRuntimeActions(
  runtime: GatewayRuntimeStatus | null | undefined,
  busy: boolean,
): GatewayRuntimeActionState[] {
  const manageable = Boolean(runtime?.manageable && runtime?.cliInstalled)
  const running = Boolean(runtime?.running)

  return [
    {
      action: 'start',
      label: '\u542f\u52a8',
      visible: !running,
      disabled: busy || running || !manageable,
    },
    {
      action: 'stop',
      label: '\u505c\u6b62',
      visible: running,
      disabled: busy || !running || !manageable,
    },
    {
      action: 'restart',
      label: '\u91cd\u542f',
      visible: running,
      disabled: busy || !running || !manageable,
    },
  ]
}
