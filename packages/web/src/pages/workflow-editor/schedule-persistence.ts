import type { WorkflowSchedule } from '../../types/workflow.ts'
import { DEFAULT_WORKFLOW_TIMEZONE, normalizeSchedule } from './graph'

type ComparableWorkflowSchedule = {
  enabled: boolean
  cron: string
  timezone: string
  window: {
    start: string
    end: string
    timezone: string
  } | null
  activeFrom: string | null
  activeUntil: string | null
}

export type PrepareWorkflowScheduleResult =
  | { ok: true; schedule: ComparableWorkflowSchedule | null }
  | { ok: false; error: string }

function toComparableWorkflowSchedule(schedule?: WorkflowSchedule | null): ComparableWorkflowSchedule {
  const normalized = normalizeSchedule(schedule)
  const timezone = normalized.timezone.trim() || DEFAULT_WORKFLOW_TIMEZONE
  const window =
    normalized.window?.start && normalized.window?.end
      ? {
          start: normalized.window.start,
          end: normalized.window.end,
          timezone: normalized.window.timezone?.trim() || timezone,
        }
      : null

  return {
    enabled: Boolean(normalized.enabled),
    cron: normalized.cron.trim(),
    timezone,
    window,
    activeFrom: normalized.activeFrom || null,
    activeUntil: normalized.activeUntil || null,
  }
}

export function prepareWorkflowScheduleForSave(
  schedule?: WorkflowSchedule | null,
): PrepareWorkflowScheduleResult {
  const comparable = toComparableWorkflowSchedule(schedule)
  if (!comparable.enabled) {
    return { ok: true, schedule: null }
  }
  if (!comparable.cron) {
    return { ok: false, error: '开启定时执行后必须填写 Cron 表达式' }
  }
  return {
    ok: true,
    schedule: comparable,
  }
}

export function haveWorkflowScheduleChanges(
  draft?: WorkflowSchedule | null,
  persisted?: WorkflowSchedule | null,
): boolean {
  return JSON.stringify(toComparableWorkflowSchedule(draft)) !== JSON.stringify(toComparableWorkflowSchedule(persisted))
}
