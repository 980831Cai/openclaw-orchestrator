import { Calendar } from 'lucide-react'
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

export function ScheduleCalendar({ schedule }: ScheduleCalendarProps) {
  return (
    <div className="relative group cursor-pointer">
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300',
        'bg-cyber-panel/40 border border-white/5',
        'group-hover:border-cyber-violet/30 group-hover:scale-105'
      )}>
        <Calendar className="w-3.5 h-3.5 text-cyber-violet/60" />
        <div>
          <span className="text-white/30 text-[10px] font-semibold block">排班表</span>
          {schedule ? (
            <span className="text-cyber-lavender/60 text-[9px]">
              {MODE_LABELS[schedule.type] || schedule.type} · {schedule.entries.length} 条
            </span>
          ) : (
            <span className="text-white/15 text-[9px] italic">未配置</span>
          )}
        </div>

        {/* Mini calendar dots */}
        <div className="grid grid-cols-7 gap-px ml-2">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-1 h-1 rounded-full',
                schedule && schedule.entries.length > i
                  ? 'bg-cyber-violet/60'
                  : 'bg-white/10'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
