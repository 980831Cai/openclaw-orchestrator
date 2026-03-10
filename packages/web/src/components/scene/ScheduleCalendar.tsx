import { cn } from '@/lib/utils'
import type { TeamSchedule } from '@/types'

interface ScheduleCalendarProps {
  schedule?: TeamSchedule
}

const MODE_LABELS: Record<string, string> = {
  'round-robin': '轮询',
  'time-based': '时段',
  'custom': '自定义',
}

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export function ScheduleCalendar({ schedule }: ScheduleCalendarProps) {
  return (
    <div className="relative group cursor-pointer">
      <div className={cn(
        'flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all duration-300',
        'cartoon-card',
      )}>
        {/* Calendar emoji */}
        <span className="text-sm">📅</span>

        <div>
          <span className="text-white/40 text-[10px] font-bold block">排班表</span>
          {schedule ? (
            <span className="text-cyber-lavender/50 text-[9px]">
              {MODE_LABELS[schedule.type] || schedule.type} · {schedule.entries.length} 条
            </span>
          ) : (
            <span className="text-white/15 text-[9px] italic">未配置</span>
          )}
        </div>

        {/* Mini week calendar */}
        <div className="flex gap-0.5 ml-1">
          {DAY_LABELS.map((day, i) => (
            <div key={day} className="flex flex-col items-center gap-0.5">
              <span className="text-white/15 text-[6px]">{day}</span>
              <div
                className={cn(
                  'w-2 h-2 rounded-sm transition-colors',
                  schedule && schedule.entries.length > i
                    ? 'bg-cyber-violet/40 group-hover:bg-cyber-violet/60'
                    : 'bg-white/5 group-hover:bg-white/8'
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
