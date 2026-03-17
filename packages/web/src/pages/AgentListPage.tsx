import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Bot, LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { EmptyState } from '@/components/brand/EmptyState'
import { useAgents } from '@/hooks/use-agents'
import { cn } from '@/lib/utils'
import type { AgentListItem } from '@/types'

export function AgentListPage() {
  const { agents, fetchAgents, createAgent } = useAgents()
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const navigate = useNavigate()

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!newName.trim()) return
    const agent = await createAgent(newName.trim())
    setNewName('')
    setDialogOpen(false)
    navigate(`/agents/${agent.id}`)
  }

  return (
    <div className="h-full overflow-auto p-6 lg:p-8">
      <div className="mx-auto max-w-[1440px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white/90 flex items-center gap-2.5">
            <Bot className="h-6 w-6 text-cyber-violet" />
            人员档案
          </h1>
          <p className="text-white/30 mt-1 text-[13px]">管理和配置你的 AI Agent 团队</p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center rounded-xl bg-white/[0.03] border border-white/[0.06] p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded-lg transition-colors cursor-pointer', viewMode === 'grid' ? 'bg-cyber-purple/15 text-white/90' : 'text-white/25 hover:text-white/50')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded-lg transition-colors cursor-pointer', viewMode === 'list' ? 'bg-cyber-purple/15 text-white/90' : 'text-white/25 hover:text-white/50')}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 Agent..."
              className="pl-10 w-56 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20 rounded-xl"
            />
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-cyber-purple to-cyber-violet hover:from-cyber-purple/90 hover:to-cyber-violet/90 rounded-xl">
                <Plus className="h-4 w-4 mr-2" />
                创建 Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/[0.08]">
              <DialogHeader>
                <DialogTitle className="text-white">创建新 Agent</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入 Agent 名称..."
                  className="bg-cyber-bg border-white/[0.08] text-white"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
                <Button
                  onClick={handleCreate}
                  className="w-full bg-gradient-to-r from-cyber-purple to-cyber-violet"
                  disabled={!newName.trim()}
                >
                  创建
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Agent Grid / List */}
      {filtered.length === 0 ? (
        <EmptyState
          scene={agents.length === 0 ? 'no-agents' : 'no-results'}
          title={agents.length === 0 ? undefined : '没有匹配的 Agent'}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} index={i} onClick={() => navigate(`/agents/${agent.id}`)} />
          ))}
        </div>
      ) : (
        <div className="glass-card-static overflow-hidden divide-y divide-white/[0.04]">
          {filtered.map((agent, i) => (
            <AgentListRow key={agent.id} agent={agent} index={i} onClick={() => navigate(`/agents/${agent.id}`)} />
          ))}
        </div>
      )}
      </div>
    </div>
  )
}

function AgentCard({ agent, index, onClick }: { agent: AgentListItem; index: number; onClick: () => void }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    busy: { color: '#22C55E', label: '工作中' },
    idle: { color: '#3B82F6', label: '待命' },
    scheduled: { color: '#F59E0B', label: '值守中' },
    error: { color: '#EF4444', label: '异常' },
    offline: { color: '#6B7280', label: '离线' },
  }
  const cfg = statusConfig[agent.status] || statusConfig.idle

  return (
    <button
      onClick={onClick}
      className="glass-card group flex flex-col items-center gap-3 p-5 cursor-pointer text-left animate-fade-in"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <AgentAvatar
        emoji={agent.emoji}
        theme={agent.theme}
        status={agent.status}
        size="lg"
      />

      <div className="text-center">
        <p className="text-white/85 font-semibold text-sm">{agent.name}</p>
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <span
            className={cn('w-1.5 h-1.5 rounded-full inline-block', agent.status === 'busy' && 'animate-pulse')}
            style={{ backgroundColor: cfg.color }}
          />
          <span className="text-[10px]" style={{ color: `${cfg.color}CC` }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {agent.model && (
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyber-purple/[0.08] text-cyber-lavender/60 border border-cyber-purple/10">
          {agent.model}
        </span>
      )}

      {agent.teamIds.length > 0 && (
        <span className="text-[9px] text-white/15">{agent.teamIds.length} 团队</span>
      )}
    </button>
  )
}

function AgentListRow({ agent, index, onClick }: { agent: AgentListItem; index: number; onClick: () => void }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    busy: { color: '#22C55E', label: '工作中' },
    idle: { color: '#3B82F6', label: '待命' },
    scheduled: { color: '#F59E0B', label: '值守中' },
    error: { color: '#EF4444', label: '异常' },
    offline: { color: '#6B7280', label: '离线' },
  }
  const cfg = statusConfig[agent.status] || statusConfig.idle

  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-center gap-4 cursor-pointer text-left animate-fade-in transition-colors hover:bg-white/[0.02]"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <AgentAvatar emoji={agent.emoji} theme={agent.theme} status={agent.status} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-white/85 text-sm font-medium truncate">{agent.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span
            className={cn('w-1.5 h-1.5 rounded-full inline-block', agent.status === 'busy' && 'animate-pulse')}
            style={{ backgroundColor: cfg.color }}
          />
          <span className="text-[10px]" style={{ color: `${cfg.color}CC` }}>{cfg.label}</span>
          {agent.currentTask && agent.status === 'busy' && (
            <span className="text-[10px] text-cyber-green/40 ml-1 truncate max-w-[200px]">
              · {agent.currentTask}
            </span>
          )}
        </div>
      </div>
      {agent.model && (
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyber-purple/[0.08] text-cyber-lavender/50 border border-cyber-purple/10">
          {agent.model}
        </span>
      )}
      <span className="text-white/15 text-[10px]">{agent.teamIds.length} 团队</span>
    </button>
  )
}
