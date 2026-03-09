import { useEffect, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { TaskListItem } from '@/types'

interface TaskWhiteboardProps {
  teamId: string
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-cyber-green/30 border-cyber-green/40',
  completed: 'bg-cyber-blue/20 border-cyber-blue/30',
  archived: 'bg-white/5 border-white/10',
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-cyber-green',
  completed: 'bg-cyber-blue',
  archived: 'bg-white/30',
}

export function TaskWhiteboard({ teamId }: TaskWhiteboardProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([])

  useEffect(() => {
    api.get<TaskListItem[]>(`/teams/${teamId}/tasks`).then(setTasks)
  }, [teamId])

  const activeTasks = tasks.filter((t) => t.status === 'active')

  return (
    <div className="relative group cursor-pointer">
      {/* Whiteboard frame */}
      <div className={cn(
        'w-64 rounded-xl overflow-hidden transition-all duration-300',
        'bg-cyber-panel/60 border border-white/10',
        'group-hover:border-cyber-amber/30 group-hover:scale-[1.02]'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-cyber-amber" />
            <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">
              任务白板
            </span>
          </div>
          {activeTasks.length > 0 && (
            <span className="text-cyber-amber text-[10px] font-mono">
              {activeTasks.length} 进行中
            </span>
          )}
        </div>

        {/* Task sticky notes */}
        <div className="p-2 space-y-1.5 max-h-[120px] overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="text-white/15 text-[10px] text-center py-3 italic">暂无任务</p>
          ) : (
            tasks.slice(0, 5).map((task, i) => (
              <div
                key={task.id}
                className={cn(
                  'px-2.5 py-1.5 rounded-md border text-[10px] transition-all',
                  STATUS_COLORS[task.status],
                  task.status === 'active' && 'animate-[wiggle_3s_ease-in-out_infinite]'
                )}
                style={{
                  animationDelay: task.status === 'active' ? `${i * 0.3}s` : undefined,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT[task.status])} />
                  <span className="text-white/70 truncate font-medium">{task.title}</span>
                </div>
              </div>
            ))
          )}
          {tasks.length > 5 && (
            <p className="text-white/20 text-[9px] text-center">+{tasks.length - 5} 更多</p>
          )}
        </div>

        {/* New task button */}
        <div className="px-2 pb-2">
          <button className="w-full flex items-center justify-center gap-1 py-1 rounded-md border border-dashed border-white/10 text-white/20 text-[10px] hover:border-cyber-amber/30 hover:text-cyber-amber/60 transition-colors cursor-pointer">
            <Plus className="w-3 h-3" />
            新任务
          </button>
        </div>
      </div>
    </div>
  )
}
