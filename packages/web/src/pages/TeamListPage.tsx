import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, DoorOpen, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { EmptyState } from '@/components/brand/EmptyState'
import { useTeams } from '@/hooks/use-teams'
import { cn } from '@/lib/utils'
import type { TeamListItem, TeamTheme } from '@/types'

const THEME_STYLES: Record<TeamTheme, { gradient: string; border: string; label: string }> = {
  'tech-lab': { gradient: 'from-indigo-500/10 to-purple-500/5', border: 'border-indigo-500/20', label: '科技实验室' },
  'creative-studio': { gradient: 'from-orange-500/10 to-amber-500/5', border: 'border-orange-500/20', label: '创意工作室' },
  'command-center': { gradient: 'from-slate-500/10 to-gray-500/5', border: 'border-slate-400/20', label: '指挥中心' },
  'default': { gradient: 'from-purple-500/10 to-violet-500/5', border: 'border-purple-500/15', label: '标准办公室' },
}

export function TeamListPage() {
  const { teams, fetchTeams, createTeam } = useTeams()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchTeams() }, [fetchTeams])

  const filtered = teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  const handleCreate = async () => {
    if (!newName.trim()) return
    const team = await createTeam(newName.trim(), newDesc.trim())
    setNewName('')
    setNewDesc('')
    setDialogOpen(false)
    navigate(`/teams/${team.id}`)
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 shadow-lg shadow-cyan-500/25">
              <DoorOpen className="h-6 w-6 text-white" />
            </div>
            工作室
          </h1>
          <p className="mt-2 text-sm text-white/40">每间工作室是一个 Agent 协作团队</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工作室..."
              className="w-64 pl-11"
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                新建工作室
              </Button>
            </DialogTrigger>
            <DialogContent className="border-white/10 bg-gradient-to-br from-slate-900 to-slate-800">
              <DialogHeader>
                <DialogTitle className="text-white">新建工作室</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="工作室名称"
                />
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="描述（可选）"
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 transition-all focus:border-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 resize-none"
                />
                <Button onClick={handleCreate} className="w-full" disabled={!newName.trim()}>
                  创建
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          scene={teams.length === 0 ? 'no-teams' : 'no-results'}
          title={teams.length === 0 ? undefined : '没有匹配的工作室'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team, i) => (
            <RoomDoorCard key={team.id} team={team} index={i} onClick={() => navigate(`/teams/${team.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function RoomDoorCard({ team, index, onClick }: { team: TeamListItem; index: number; onClick: () => void }) {
  const style = THEME_STYLES[team.theme] || THEME_STYLES.default
  const hasActivity = (team.activeTaskCount ?? 0) > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer animate-fade-in',
        'border bg-gradient-to-br',
        hasActivity
          ? 'border-amber-500/20 from-amber-500/10 to-orange-500/5'
          : cn('border-white/5 from-white/[0.02] to-white/[0.01]', style.gradient),
        'hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/10'
      )}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Activity indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {hasActivity && (
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/20 px-2 py-1 text-[10px] font-medium text-amber-400">
            {team.activeTaskCount} 任务
          </span>
        )}
        <div
          className={cn(
            'h-2.5 w-2.5 rounded-full transition-all',
            hasActivity
              ? 'bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50'
              : 'bg-white/10 group-hover:bg-cyan-400/50'
          )}
        />
      </div>

      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-xl border transition-all duration-300',
            hasActivity
              ? 'border-amber-500/30 bg-amber-500/20'
              : 'border-white/10 bg-white/5 group-hover:border-cyan-500/30 group-hover:bg-cyan-500/10'
          )}
        >
          <Users
            className={cn(
              'h-6 w-6 transition-colors',
              hasActivity
                ? 'text-amber-400'
                : 'text-white/40 group-hover:text-cyan-400'
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-white/90 transition-colors group-hover:text-white">
            {team.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-white/30">
            {team.description || '暂无描述'}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
        <div className="flex -space-x-2">
          {(team.members ?? []).slice(0, 5).map((m, i) => (
            <div
              key={i}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-slate-900 bg-white/5"
            >
              <AgentAvatar emoji={m.emoji || '🤖'} theme={m.theme} size="sm" />
            </div>
          ))}
          {team.memberCount > 5 && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900 bg-white/10 text-[10px] text-white/50">
              +{team.memberCount - 5}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/20 transition-colors group-hover:text-white/40">
          <span>{team.memberCount} 成员</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </button>
  )
}
