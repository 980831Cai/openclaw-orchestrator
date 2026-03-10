import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { TaskListItem } from '@/types'

interface TaskWhiteboardProps {
  teamId: string
}

const STATUS_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  active: { bg: 'bg-cyber-green/8', border: 'border-cyber-green/20', dot: 'bg-cyber-green' },
  completed: { bg: 'bg-cyber-blue/8', border: 'border-cyber-blue/15', dot: 'bg-cyber-blue' },
  archived: { bg: 'bg-white/3', border: 'border-white/8', dot: 'bg-white/30' },
}

const STICKY_ROTATIONS = ['-1deg', '0.5deg', '-0.3deg', '0.8deg', '-0.6deg']

export function TaskWhiteboard({ teamId }: TaskWhiteboardProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    api.get<TaskListItem[]>(`/teams/${teamId}/tasks`).then(setTasks)
  }, [teamId])

  const activeTasks = tasks.filter((t) => t.status === 'active')

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    await api.post(`/teams/${teamId}/tasks`, { title: newTitle.trim(), description: '' })
    const updated = await api.get<TaskListItem[]>(`/teams/${teamId}/tasks`)
    setTasks(updated)
    setNewTitle('')
    setCreateOpen(false)
  }

  return (
    <div className="relative">
      {/* Whiteboard frame — cartoon corkboard style */}
      <div className={cn(
        'w-64 rounded-2xl overflow-hidden transition-all duration-300',
        'cartoon-card',
      )}>
        {/* Header — looks like a whiteboard marker title */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-sm">📌</span>
            <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">
              任务白板
            </span>
          </div>
          {activeTasks.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-md bg-cyber-amber/10 border border-cyber-amber/20 text-cyber-amber text-[10px] font-mono">
              {activeTasks.length} 进行中
            </span>
          )}
        </div>

        {/* Task sticky notes */}
        <div className="p-2.5 space-y-1.5 max-h-[120px] overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center py-3">
              <span className="text-xl opacity-20 mb-1">📋</span>
              <p className="text-white/15 text-[10px]">暂无任务</p>
            </div>
          ) : (
            tasks.slice(0, 5).map((task, i) => {
              const colors = STATUS_COLORS[task.status] || STATUS_COLORS.archived
              return (
                <div
                  key={task.id}
                  className={cn(
                    'px-2.5 py-2 rounded-lg border text-[10px] transition-all hover:scale-[1.02]',
                    colors.bg,
                    colors.border,
                  )}
                  style={{
                    transform: `rotate(${STICKY_ROTATIONS[i % STICKY_ROTATIONS.length]})`,
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', colors.dot)} />
                    <span className="text-white/60 truncate font-medium">{task.title}</span>
                    {task.status === 'completed' && <span className="text-[8px] ml-auto">✓</span>}
                  </div>
                </div>
              )
            })
          )}
          {tasks.length > 5 && (
            <p className="text-white/20 text-[9px] text-center">+{tasks.length - 5} 更多</p>
          )}
        </div>

        {/* New task button */}
        <div className="px-2.5 pb-2.5">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-white/10 text-white/20 text-[10px] hover:border-cyber-amber/30 hover:text-cyber-amber/60 hover:bg-cyber-amber/5 transition-all cursor-pointer">
                <Plus className="w-3 h-3" />
                新任务
              </button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/10">
              <DialogHeader><DialogTitle className="text-white">快速创建任务</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="任务标题"
                  className="bg-cyber-bg border-white/10 text-white"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
                <Button
                  onClick={handleCreate}
                  className="w-full bg-gradient-to-r from-cyber-amber/80 to-cyber-amber"
                  disabled={!newTitle.trim()}
                >
                  创建
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
