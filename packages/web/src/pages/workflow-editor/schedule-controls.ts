export const WORKFLOW_TIMEZONE_CUSTOM_VALUE = '__custom__'

export const COMMON_WORKFLOW_TIMEZONES = [
  'Asia/Shanghai',
  'UTC',
  'Etc/GMT-8',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo',
] as const

export function resolveTimezoneSelectValue(value?: string | null): string {
  const normalized = String(value || '').trim()
  return COMMON_WORKFLOW_TIMEZONES.includes(normalized as (typeof COMMON_WORKFLOW_TIMEZONES)[number])
    ? normalized
    : WORKFLOW_TIMEZONE_CUSTOM_VALUE
}
