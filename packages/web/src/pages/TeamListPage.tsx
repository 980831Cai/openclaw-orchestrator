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

const THEME_STYLES: Record<TeamTheme, { bg: string; accent: string; label: string }> = {
  'tech-lab': { bg: 'from-indigo-900/20 to-purple-900/10', accent: 'border-indigo-500/20', label: '科技实验室' },
  'creative-studio': { bg: 'from-orange-900/20 to-amber-900/10', accent: 'border-orange-500/20', label: '创意工作室' },
  'command-center': { bg: 'from-slate-900/30 to-gray-900/20', accent: 'border-slate-400/20', label: '指挥中心' },
  'default': { bg: 'from-cyber-purple/10 to-cyber-violet/5', accent: 'border-cyber-purple/15', label: '标准办公室' },
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
    <div className="p-8 min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <DoorOpen className="h-8 w-8 text-cyber-cyan" />
            工作室
          </h1>
          <p className="text-white/40 mt-1">每间工作室是一个 Agent 协作团队</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索工作室..." className="pl-10 w-64 bg-cyber-surface/50 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-cyber-purple to-cyber-violet glow-purple">
                <Plus className="h-4 w-4 mr-2" />
                新建工作室
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/10">
              <DialogHeader><DialogTitle className="text-white">新建工作室</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="工作室名称" className="bg-cyber-bg border-white/10 text-white" />
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="描述（可选）" rows={3} className="w-full bg-cyber-bg border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyber-purple/50 resize-none" />
                <Button onClick={handleCreate} className="w-full bg-gradient-to-r from-cyber-purple to-cyber-violet" disabled={!newName.trim()}>创建</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          scene={teams.length === 0 ? 'no-teams' : 'no-results'}
          title={teams.length === 0 ? undefined : '没有匹配的工作室'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((team) => <RoomDoorCard key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />)}
        </div>
      )}
    </div>
  )
}

function RoomDoorCard({ team, onClick }: { team: TeamListItem; onClick: () => void }) {
  const style = THEME_STYLES[team.theme] || THEME_STYLES.default
  const hasActivity = (team.activeTaskCount ?? 0) > 0

  return (
    <button onClick={onClick} className={cn('group relative rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer cartoon-card', hasActivity && 'border-cyber-amber/20')}>
      {/* Activity indicator */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {hasActivity && (
          <span className="px-1.5 py-0.5 rounded-md bg-cyber-amber/10 text-cyber-amber text-[9px] border border-cyber-amber/20 font-medium">
            {team.activeTaskCount} 任务
          </span>
        )}
        <div className={cn('w-2 h-2 rounded-full', hasActivity ? 'bg-cyber-amber animate-pulse' : 'bg-white/10')} />
      </div>

      <div className="flex items-start gap-4">
        <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center border border-white/5', hasActivity ? 'bg-cyber-amber/10' : 'bg-white/5')}>
          <Users className={cn('h-6 w-6', hasActivity ? 'text-cyber-amber' : 'text-cyber-lavender/60')} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white/90 font-bold text-lg truncate group-hover:text-white transition-colors">{team.name}</h3>
          <p className="text-white/25 text-sm mt-1 line-clamp-2">{team.description || '暂无描述'}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
        <div className="flex -space-x-2">
          {(team.members ?? []).slice(0, 5).map((m, i) => (
            <div key={i} className="w-7 h-7 rounded-full bg-cyber-panel border-2 border-cyber-bg flex items-center justify-center text-xs overflow-hidden">
              <AgentAvatar emoji={m.emoji || '🤖'} theme={m.theme} size="sm" />
            </div>
          ))}
          {team.memberCount > 5 && (
            <div className="w-7 h-7 rounded-full bg-cyber-panel border-2 border-cyber-bg flex items-center justify-center text-[10px] text-white/40">
              +{team.memberCount - 5}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-white/15 group-hover:text-white/30 transition-colors">
          <span className="text-xs">{team.memberCount} 成员</span>
          <ArrowRight className="w-3 h-3" />
        </div>
      </div>
    </button>
  )
}
