/**
 * ScheduleConfig component - configuration for scheduled workflow execution
 * Extracted from TeamWorkflowEditor.tsx
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createDefaultSchedule, DEFAULT_WORKFLOW_TIMEZONE } from '@/lib/workflow-utils'
import type { WorkflowSchedule } from '@/types'

interface ScheduleConfigProps {
  schedule: WorkflowSchedule
  onChange: (schedule: WorkflowSchedule) => void
}

export function ScheduleConfig({ schedule, onChange }: ScheduleConfigProps) {
  const updateSchedule = (updates: Partial<WorkflowSchedule>) => {
    onChange({ ...schedule, ...updates })
  }

  return (
    <div className="space-y-4 border-t border-white/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">定时执行</h3>
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(event) => updateSchedule({ enabled: event.target.checked })}
          />
          启用
        </label>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">Cron 表达式</Label>
        <Input
          value={schedule.cron}
          onChange={(event) => updateSchedule({ cron: event.target.value })}
          placeholder="例如：*/15 * * * *"
          className="border-white/10 bg-cyber-bg text-white"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">时区</Label>
        <Input
          value={schedule.timezone}
          onChange={(event) => updateSchedule({ timezone: event.target.value })}
          placeholder="例如：Asia/Shanghai"
          className="border-white/10 bg-cyber-bg text-white"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs text-white/60">生效开始</Label>
          <Input
            type="datetime-local"
            value={schedule.activeFrom ? toLocalDateTime(schedule.activeFrom) : ''}
            onChange={(event) => updateSchedule({ activeFrom: fromLocalDateTime(event.target.value) })}
            className="border-white/10 bg-cyber-bg text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-white/60">生效截止</Label>
          <Input
            type="datetime-local"
            value={schedule.activeUntil ? toLocalDateTime(schedule.activeUntil) : ''}
            onChange={(event) => updateSchedule({ activeUntil: fromLocalDateTime(event.target.value) })}
            className="border-white/10 bg-cyber-bg text-white"
          />
        </div>
      </div>
      <div className="space-y-3 rounded-lg border border-white/5 bg-cyber-bg/30 p-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-white/60">每日时间段限制</Label>
          <label className="flex items-center gap-2 text-[11px] text-white/50">
            <input
              type="checkbox"
              checked={Boolean(schedule.window)}
              onChange={(event) =>
                updateSchedule({
                  window: event.target.checked
                    ? { start: '09:00', end: '18:00', timezone: schedule.timezone || DEFAULT_WORKFLOW_TIMEZONE }
                    : null,
                })
              }
            />
            启用时间段
          </label>
        </div>
        {schedule.window ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[11px] text-white/45">开始时间</Label>
                <Input
                  type="time"
                  value={schedule.window.start}
                  onChange={(event) =>
                    onChange({
                      ...schedule,
                      window: schedule.window ? { ...schedule.window, start: event.target.value } : null,
                    })
                  }
                  className="border-white/10 bg-cyber-bg text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] text-white/45">结束时间</Label>
                <Input
                  type="time"
                  value={schedule.window.end}
                  onChange={(event) =>
                    onChange({
                      ...schedule,
                      window: schedule.window ? { ...schedule.window, end: event.target.value } : null,
                    })
                  }
                  className="border-white/10 bg-cyber-bg text-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] text-white/45">时区</Label>
              <Input
                value={schedule.window.timezone}
                onChange={(event) =>
                  onChange({
                    ...schedule,
                    window: schedule.window ? { ...schedule.window, timezone: event.target.value } : null,
                  })
                }
                placeholder="例如：Asia/Shanghai"
                className="border-white/10 bg-cyber-bg text-white"
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// Helper functions
function toLocalDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromLocalDateTime(value: string): string | null {
  if (!value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
