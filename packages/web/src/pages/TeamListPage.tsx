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
import type { TeamListItem } from '@/types'

export function TeamListPage() {
  const { teams, fetchTeams, createTeam } = useTeams()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const navigate = useNavigate()

  useEffect(() => { fetchTeams() }, [fetchTeams])

  const filtered = teams.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  const handleCreate = async () => {
    if (!newName.trim()) return
    const team = await createTeam(newName.trim(), newDesc.trim(), newGoal.trim())
    setNewName('')
    setNewDesc('')
    setNewGoal('')
    setDialogOpen(false)
    navigate(`/teams/${team.id}`)
  }

  return (
    <div className="h-full overflow-auto p-6 lg:p-8">
      <div className="mx-auto max-w-[1440px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white/90 flex items-center gap-2.5">
            <DoorOpen className="h-6 w-6 text-cyber-cyan" />
            工作室
          </h1>
          <p className="text-white/30 mt-1 text-[13px]">每间工作室是一个 Agent 协作团队</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索工作室..." className="pl-10 w-56 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20 rounded-xl" />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-cyber-purple to-cyber-violet hover:from-cyber-purple/90 hover:to-cyber-violet/90 rounded-xl">
                <Plus className="h-4 w-4 mr-2" />
                新建工作室
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/[0.08]">
              <DialogHeader><DialogTitle className="text-white">新建工作室</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="工作室名称" className="bg-cyber-bg border-white/[0.08] text-white" />
                <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="描述（可选）" rows={3} className="w-full bg-cyber-bg border border-white/[0.08] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyber-purple/40 resize-none" />
                <textarea value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder="团队目标 / 职责摘要（可选）" rows={3} className="w-full bg-cyber-bg border border-white/[0.08] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyber-purple/40 resize-none" />
                <p className="text-[11px] leading-5 text-white/30">该信息会注入默认 Lead 的负责人身份与协作规则，建议写清团队职责、目标和管理范围。</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((team) => <RoomDoorCard key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />)}
        </div>
      )}
      </div>
    </div>
  )
}

function RoomDoorCard({ team, onClick }: { team: TeamListItem; onClick: () => void }) {
  const hasActivity = (team.activeTaskCount ?? 0) > 0

  return (
    <button onClick={onClick} className={cn('glass-card group relative p-5 text-left', hasActivity && 'border-cyber-amber/15')}>
      {/* Activity indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5">
        {hasActivity && (
          <span className="px-1.5 py-0.5 rounded-md bg-cyber-amber/[0.08] text-cyber-amber text-[9px] border border-cyber-amber/15 font-medium">
            {team.activeTaskCount} 任务
          </span>
        )}
        <div className={cn('w-2 h-2 rounded-full', hasActivity ? 'bg-cyber-amber animate-pulse' : 'bg-white/[0.08]')} />
      </div>

      <div className="flex items-start gap-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center border border-white/[0.06] flex-shrink-0', hasActivity ? 'bg-cyber-amber/[0.06]' : 'bg-white/[0.03]')}>
          <Users className={cn('h-5 w-5', hasActivity ? 'text-cyber-amber' : 'text-white/25')} />
        </div>
        <div className="flex-1 min-w-0 pr-12">
          <h3 className="text-white/85 font-semibold text-[15px] truncate group-hover:text-white transition-colors">{team.name}</h3>
          <p className="text-white/25 text-[12px] mt-1 line-clamp-2">{team.description || '暂无描述'}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.04]">
        <div className="flex -space-x-2">
          {(team.members ?? []).slice(0, 5).map((m, i) => (
            <div key={i} className="w-7 h-7 rounded-full bg-cyber-surface border-2 border-cyber-bg flex items-center justify-center text-xs overflow-hidden">
              <AgentAvatar emoji={m.emoji || '🤖'} theme={m.theme} size="sm" />
            </div>
          ))}
          {team.memberCount > 5 && (
            <div className="w-7 h-7 rounded-full bg-cyber-surface border-2 border-cyber-bg flex items-center justify-center text-[10px] text-white/30">
              +{team.memberCount - 5}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-white/15 group-hover:text-white/30 transition-colors">
          <span className="text-[11px]">{team.memberCount} 成员</span>
          <ArrowRight className="w-3 h-3" />
        </div>
      </div>
    </button>
  )
}
