import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Bot } from 'lucide-react'
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
import { useAgents } from '@/hooks/use-agents'
import { cn } from '@/lib/utils'
import type { AgentListItem } from '@/types'

export function AgentListPage() {
  const { agents, fetchAgents, createAgent } = useAgents()
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
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
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Bot className="h-8 w-8 text-cyber-violet" />
            人员档案
          </h1>
          <p className="text-white/40 mt-1">管理和配置你的 AI Agent 团队</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 Agent..."
              className="pl-10 w-64 bg-cyber-surface/50 border-white/10 text-white placeholder:text-white/30"
            />
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-cyber-purple to-cyber-violet hover:from-cyber-purple/90 hover:to-cyber-violet/90 glow-purple">
                <Plus className="h-4 w-4 mr-2" />
                创建 Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-cyber-surface border-white/10">
              <DialogHeader>
                <DialogTitle className="text-white">创建新 Agent</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="输入 Agent 名称..."
                  className="bg-cyber-bg border-white/10 text-white"
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

      {/* Agent Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32">
          <Bot className="h-20 w-20 text-white/10 mb-4" />
          <p className="text-white/30 text-lg">
            {agents.length === 0 ? '还没有 Agent，创建第一个吧' : '没有匹配的 Agent'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onClick={() => navigate(`/agents/${agent.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentCard({ agent, onClick }: { agent: AgentListItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-center gap-3 p-6 rounded-2xl',
        'bg-cyber-surface/50 border border-white/5',
        'hover:bg-cyber-surface hover:border-white/10 hover:glow-purple',
        'transition-all duration-300 cursor-pointer text-left'
      )}
    >
      <AgentAvatar
        emoji={agent.emoji}
        theme={agent.theme}
        status={agent.status}
        size="lg"
      />

      <div className="text-center">
        <p className="text-white font-semibold text-sm">{agent.name}</p>
        <p className="text-white/30 text-xs mt-0.5 capitalize">{agent.status}</p>
      </div>

      {agent.model && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyber-purple/20 text-cyber-lavender">
          {agent.model}
        </span>
      )}

      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-transparent to-cyber-purple/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </button>
  )
}
