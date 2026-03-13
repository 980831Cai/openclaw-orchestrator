import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Bot, LayoutGrid, List, ArrowRight, Zap, Clock, Users, Activity, TrendingUp, AlertCircle } from 'lucide-react'
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
import type { AgentListItem, AgentStatus } from '@/types'

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

  // 统计数据
  const stats = {
    total: agents.length,
    busy: agents.filter(a => a.status === 'busy').length,
    idle: agents.filter(a => a.status === 'idle').length,
    error: agents.filter(a => a.status === 'error').length,
    scheduled: agents.filter(a => a.status === 'scheduled').length,
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    const agent = await createAgent(newName.trim())
    setNewName('')
    setDialogOpen(false)
    navigate(`/agents/${agent.id}`)
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex gap-6">
        {/* 主内容区 */}
        <div className="flex-1">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-bold text-white">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg shadow-violet-500/25">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                人员档案
              </h1>
              <p className="mt-2 text-sm text-white/40">管理和配置你的 AI Agent 团队</p>
            </div>

            <div className="flex items-center gap-4">
              {/* View toggle */}
              <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'rounded-lg p-2 transition-all duration-300',
                    viewMode === 'grid'
                      ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                      : 'text-white/40 hover:text-white/70'
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'rounded-lg p-2 transition-all duration-300',
                    viewMode === 'list'
                      ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                      : 'text-white/40 hover:text-white/70'
                  )}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索 Agent..."
                  className="w-64 pl-11"
                />
              </div>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    创建 Agent
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-white/10 bg-gradient-to-br from-slate-900 to-slate-800">
                  <DialogHeader>
                    <DialogTitle className="text-white">创建新 Agent</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="输入 Agent 名称..."
                      onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                    />
                    <Button onClick={handleCreate} className="w-full" disabled={!newName.trim()}>
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
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
              {filtered.map((agent, i) => (
                <AgentCard key={agent.id} agent={agent} index={i} onClick={() => navigate(`/agents/${agent.id}`)} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((agent, i) => (
                <AgentListRow key={agent.id} agent={agent} index={i} onClick={() => navigate(`/agents/${agent.id}`)} />
              ))}
            </div>
          )}
        </div>

        {/* 右侧状态面板 */}
        <div className="w-72 shrink-0 space-y-4">
          {/* 状态概览 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/70">
              <Activity className="h-4 w-4 text-violet-400" />
              状态概览
            </h3>
            <div className="mt-4 space-y-3">
              <StatBar label="工作中" count={stats.busy} total={stats.total} color="emerald" icon={<Zap className="h-3 w-3" />} />
              <StatBar label="空闲" count={stats.idle} total={stats.total} color="blue" icon={<Clock className="h-3 w-3" />} />
              <StatBar label="值守中" count={stats.scheduled} total={stats.total} color="cyan" icon={<Users className="h-3 w-3" />} />
              <StatBar label="异常" count={stats.error} total={stats.total} color="red" icon={<AlertCircle className="h-3 w-3" />} />
            </div>
          </div>

          {/* 活跃智能体 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white/70">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              活跃智能体
            </h3>
            <div className="mt-4 space-y-2">
              {agents
                .filter(a => a.status === 'busy')
                .slice(0, 5)
                .map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-all hover:bg-white/5"
                  >
                    <AgentAvatar emoji={agent.emoji} theme={agent.theme} status={agent.status} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white/80">{agent.name}</p>
                      <p className="truncate text-[10px] text-emerald-400/60">{agent.currentTask || '执行中...'}</p>
                    </div>
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  </button>
                ))}
              {stats.busy === 0 && (
                <p className="py-4 text-center text-xs text-white/30">暂无活跃 Agent</p>
              )}
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <h3 className="mb-4 text-sm font-semibold text-white/70">快捷操作</h3>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/teams')}
                className="flex w-full items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left text-sm text-white/60 transition-all hover:border-violet-500/30 hover:text-white/80"
              >
                <Users className="h-4 w-4 text-violet-400" />
                <span>管理团队</span>
              </button>
              <button
                onClick={() => navigate('/workflows')}
                className="flex w-full items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-left text-sm text-white/60 transition-all hover:border-violet-500/30 hover:text-white/80"
              >
                <TrendingUp className="h-4 w-4 text-cyan-400" />
                <span>工作流编辑</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 状态进度条组件
function StatBar({
  label,
  count,
  total,
  color,
  icon,
}: {
  label: string
  count: number
  total: number
  color: 'emerald' | 'blue' | 'cyan' | 'red'
  icon: React.ReactNode
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  const colorClasses = {
    emerald: 'bg-emerald-500 text-emerald-400',
    blue: 'bg-blue-500 text-blue-400',
    cyan: 'bg-cyan-500 text-cyan-400',
    red: 'bg-red-500 text-red-400',
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-white/50">
          {icon}
          {label}
        </span>
        <span className={cn('font-medium', colorClasses[color].split(' ')[1])}>{count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClasses[color].split(' ')[0])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

function AgentCard({ agent, index, onClick }: { agent: AgentListItem; index: number; onClick: () => void }) {
  const statusConfig: Record<AgentStatus, { gradient: string; label: string; glow: string; bgClass: string }> = {
    busy: { gradient: 'from-emerald-400 to-green-500', label: '执行中', glow: 'shadow-emerald-500/30', bgClass: 'bg-emerald-500/10' },
    idle: { gradient: 'from-blue-400 to-cyan-500', label: '空闲', glow: 'shadow-blue-500/20', bgClass: 'bg-blue-500/10' },
    scheduled: { gradient: 'from-cyan-400 to-teal-500', label: '值守中', glow: 'shadow-cyan-500/20', bgClass: 'bg-cyan-500/10' },
    error: { gradient: 'from-red-400 to-rose-500', label: '异常', glow: 'shadow-red-500/30', bgClass: 'bg-red-500/10' },
    offline: { gradient: 'from-gray-400 to-gray-500', label: '离线', glow: '', bgClass: 'bg-gray-500/10' },
  }
  const cfg = statusConfig[agent.status] || statusConfig.idle
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        onClick={onClick}
        className={cn(
          'group relative flex w-full flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5',
          'transition-all duration-300 cursor-pointer text-left',
          'hover:border-purple-500/30 hover:bg-white/[0.04] hover:shadow-xl hover:shadow-purple-500/10',
          'animate-fade-in'
        )}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Glow effect on hover */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/0 via-violet-500/0 to-indigo-500/0 transition-all duration-500 group-hover:from-purple-500/5 group-hover:via-violet-500/5 group-hover:to-indigo-500/5" />

        {/* Header: Avatar + Name + Status */}
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <AgentAvatar
              emoji={agent.emoji}
              theme={agent.theme}
              status={agent.status}
              size="md"
            />
            {/* Status ring animation for busy agents */}
            {agent.status === 'busy' && (
              <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-ping" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-white/90 transition-colors group-hover:text-white">
                {agent.name}
              </h3>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                cfg.bgClass,
                `bg-gradient-to-r ${cfg.gradient} bg-clip-text text-transparent`
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full bg-gradient-to-r', cfg.gradient, agent.status === 'busy' && 'animate-pulse')} />
                {cfg.label}
              </span>
              {agent.model && (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
                  {agent.model}
                </span>
              )}
            </div>
          </div>

          <ArrowRight className="h-4 w-4 shrink-0 text-white/0 transition-all duration-300 group-hover:text-white/30" />
        </div>

        {/* Current Task */}
        {agent.currentTask && (
          <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/30">正在处理</p>
            <p className="mt-1 truncate text-xs text-white/70">{agent.currentTask}</p>
          </div>
        )}

        {/* Footer: Teams + Schedule indicator */}
        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
          <div className="flex items-center gap-1.5">
            {agent.teamIds.length > 0 ? (
              <>
                <Users className="h-3 w-3 text-white/30" />
                <span className="text-[10px] text-white/40">{agent.teamIds.length} 团队</span>
              </>
            ) : (
              <span className="text-[10px] text-white/20">未加入团队</span>
            )}
          </div>
          {agent.status === 'scheduled' && (
            <span className="flex items-center gap-1 text-[10px] text-cyan-400/60">
              <Clock className="h-3 w-3" />
              排班中
            </span>
          )}
        </div>
      </button>

      {/* Hover tooltip - 显示详细信息 */}
      {showTooltip && (
        <div className="absolute left-full top-0 z-50 ml-3 w-64 rounded-xl border border-white/10 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-sm animate-fade-in">
          <div className="flex items-center gap-3 pb-3 border-b border-white/5">
            <AgentAvatar emoji={agent.emoji} theme={agent.theme} status={agent.status} size="sm" />
            <div>
              <p className="text-sm font-semibold text-white">{agent.name}</p>
              <p className="text-xs text-white/40">{agent.emoji} {agent.model || '默认模型'}</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/40">状态</span>
              <span className={cn('font-medium', cfg.gradient.includes('emerald') ? 'text-emerald-400' : cfg.gradient.includes('blue') ? 'text-blue-400' : cfg.gradient.includes('cyan') ? 'text-cyan-400' : cfg.gradient.includes('red') ? 'text-red-400' : 'text-gray-400')}>
                {cfg.label}
              </span>
            </div>
            {agent.currentTask && (
              <div className="flex justify-between text-xs">
                <span className="text-white/40">任务</span>
                <span className="max-w-[150px] truncate text-white/70">{agent.currentTask}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-white/40">团队</span>
              <span className="text-white/70">{agent.teamIds.length > 0 ? `${agent.teamIds.length} 个团队` : '未加入'}</span>
            </div>
            {agent.status === 'scheduled' && (
              <div className="flex justify-between text-xs">
                <span className="text-white/40">排班</span>
                <span className="text-cyan-400">已安排</span>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-white/5 text-xs text-white/30">
            点击查看完整配置 →
          </div>
        </div>
      )}
    </div>
  )
}

function AgentListRow({ agent, index, onClick }: { agent: AgentListItem; index: number; onClick: () => void }) {
  const statusConfig: Record<AgentStatus, { gradient: string; label: string; bgClass: string }> = {
    busy: { gradient: 'from-emerald-400 to-green-500', label: '执行中', bgClass: 'bg-emerald-500/10' },
    idle: { gradient: 'from-blue-400 to-cyan-500', label: '空闲', bgClass: 'bg-blue-500/10' },
    scheduled: { gradient: 'from-cyan-400 to-teal-500', label: '值守中', bgClass: 'bg-cyan-500/10' },
    error: { gradient: 'from-red-400 to-rose-500', label: '异常', bgClass: 'bg-red-500/10' },
    offline: { gradient: 'from-gray-400 to-gray-500', label: '离线', bgClass: 'bg-gray-500/10' },
  }
  const cfg = statusConfig[agent.status] || statusConfig.idle

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4',
        'transition-all duration-300 cursor-pointer text-left',
        'hover:border-purple-500/20 hover:bg-white/[0.04]',
        'animate-fade-in'
      )}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex flex-col items-center gap-2">
        <AgentAvatar emoji={agent.emoji} theme={agent.theme} status={agent.status} size="sm" />
        <div
          className={cn(
            'h-0.5 rounded-full bg-gradient-to-r transition-all',
            cfg.gradient,
            agent.status === 'busy' ? 'w-7 animate-pulse' : 'w-5'
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/90 group-hover:text-white">{agent.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full bg-gradient-to-r',
              cfg.gradient,
              agent.status === 'busy' && 'animate-pulse'
            )}
          />
          <span className={cn('text-[11px] font-medium bg-gradient-to-r bg-clip-text text-transparent', cfg.gradient)}>
            {cfg.label}
          </span>
          {agent.currentTask && agent.status === 'busy' && (
            <span className="max-w-[200px] truncate text-[10px] text-emerald-400/60">
              · {agent.currentTask}
            </span>
          )}
          {agent.status === 'scheduled' && (
            <span className="flex items-center gap-1 text-[10px] text-cyan-400/60">
              · <Clock className="h-3 w-3" /> 排班中
            </span>
          )}
        </div>
      </div>

      {agent.model && (
        <span className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[10px] font-medium text-purple-300">
          {agent.model}
        </span>
      )}

      <div className="flex items-center gap-1.5 text-white/30">
        <Users className="h-3 w-3" />
        <span className="text-[11px]">{agent.teamIds.length}</span>
      </div>

      <ArrowRight className="h-4 w-4 text-white/0 transition-all duration-300 group-hover:text-white/30" />
    </button>
  )
}
