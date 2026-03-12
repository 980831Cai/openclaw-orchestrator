import type { CliStatusMap } from './types'

export interface CliUsageWindow {
  label: string
  utilization: number
  resetsAt?: number | null
}

export interface CliUsageEntry {
  error?: 'unauthenticated' | 'not_implemented' | string
  windows: CliUsageWindow[]
}

export async function getCliStatus(): Promise<CliStatusMap> {
  return {} as CliStatusMap
}

export async function getCliUsage(): Promise<{ ok: true; usage: Record<string, CliUsageEntry> }> {
  return { ok: true, usage: {} }
}

export async function refreshCliUsage(): Promise<{ ok: true; usage: Record<string, CliUsageEntry> }> {
  return { ok: true, usage: {} }
}
