import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wifi, WifiOff, Users, Zap, ClipboardList, ArrowRight, Building2 } from 'lucide-react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { Logo } from '@/components/brand/Logo'
import { EmptyState } from '@/components/brand/EmptyState'
import { useAgents } from '@/hooks/use-agents'
import { useTeams } from '@/hooks/use-teams'
import { useWebSocket } from '@/hooks/use-websocket'
import { useMonitorStore } from '@/stores/monitor-store'
import { cn } from '@/lib/utils'
import type { AgentListItem, TeamListItem, CommunicationEvent } from '@/types'

export function DashboardPage() {
  const navigate = useNavigate()
  const { agents, fetchAgents } = useAgents()
  const { teams, fetchTeams } = useTeams()
  const { connected, events } = useMonitorStore()
  useWebSocket()

  useEffect(() => {
    fetchAgents()
    fetchTeams()
  }, [fetchAgents, fetchTeams])

  const busyCount = agents.filter((a) => a.status === 'busy').length
  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="min-h-screen p-8">
      {/* ── Hero welcome ── */}
      <div className="relative rounded-2xl overflow-hidden mb-8 cartoon-card p-8">
        {/* Background decorative */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(139,92,246,0.06) 0%, transparent 60%)',
        }} />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Logo size="lg" mood={connected ? 'waving' : 'worried'} animated />
            <div>
              <h1 className="text-2xl font-bold text-white/90">
                {greeting}，指挥官 👋
              </h1>
              <p className="text-white/30 text-sm mt-1">
                {connected ? 'OpenClaw 系统运行正常' : 'Gateway 未连接，部分功能受限'}
              </p>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-6">
            <StatCard
              icon={<Wifi className={cn('w-4 h-4', connected ? 'text-cyber-green' : 'text-cyber-red')} />}
              label="Gateway"
              value={connected ? '在线' : '离线'}
              valueColor={connected ? 'text-cyber-green' : 'text-cyber-red'}
            />
            <StatCard
              icon={<Zap className="w-4 h-4 text-cyber-purple" />}
              label="活跃 Agent"
              value={String(busyCount)}
              valueColor="text-cyber-purple"
            />
            <StatCard
              icon={<Building2 className="w-4 h-4 text-cyber-cyan" />}
              label="工作室"
              value={String(teams.length)}
              valueColor="text-cyber-cyan"
            />
            <StatCard
              icon={<ClipboardList className="w-4 h-4 text-cyber-amber" />}
              label="事件"
              value={String(events.length)}
              valueColor="text-cyber-amber"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Agent Plaza — main area ── */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyber-purple" />
              Agent 广场
            </h2>
            {agents.length > 0 && (
              <button
                onClick={() => navigate('/agents')}
                className="text-white/25 text-xs hover:text-white/50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                查看全部 <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="cartoon-card p-6 min-h-[360px]">
            {agents.length === 0 ? (
              <EmptyState scene="no-agents" />
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {agents.map((agent, i) => (
                  <AgentPlazaCard
                    key={agent.id}
                    agent={agent}
                    delay={i * 50}
                    onClick={() => navigate(`/agents/${agent.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-6">
          {/* Team rooms */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-cyber-cyan" />
                工作室入口
              </h2>
              {teams.length > 0 && (
                <button
                  onClick={() => navigate('/teams')}
                  className="text-white/25 text-xs hover:text-white/50 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  全部 <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              {teams.length === 0 ? (
                <EmptyState scene="no-teams" className="py-8" />
              ) : (
                teams.map((team) => (
                  <TeamDoorMini key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />
                ))
              )}
            </div>
          </div>

          {/* Event timeline */}
          <div>
            <h2 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyber-amber" />
              实时事件流
            </h2>
            <div className="cartoon-card p-4 max-h-[240px] overflow-y-auto">
              {events.length === 0 ? (
                <EmptyState scene="no-events" className="py-6" />
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/5" />

                  <div className="space-y-3">
                    {events.slice(-10).reverse().map((evt, i) => (
                      <EventTimelineItem key={evt.id || i} event={evt} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Stat card for hero section */
function StatCard({ icon, label, value, valueColor }: {
  icon: React.ReactNode
  label: string
  value: string
  valueColor: string
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
        {icon}
      </div>
      <span className={cn('font-bold text-sm font-mono', valueColor)}>{value}</span>
      <span className="text-white/20 text-[9px]">{label}</span>
    </div>
  )
}

/** Agent card in the plaza */
function AgentPlazaCard({ agent, delay, onClick }: { agent: AgentListItem; delay: number; onClick: () => void }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    busy: { color: '#22C55E', label: '执行中' },
    idle: { color: '#3B82F6', label: '空闲' },
    error: { color: '#EF4444', label: '异常' },
    offline: { color: '#6B7280', label: '离线' },
  }
  const cfg = statusConfig[agent.status] || statusConfig.idle

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-white/5 transition-all group cursor-pointer animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <AgentAvatar
        emoji={agent.emoji || '🤖'}
        theme={agent.theme}
        status={agent.status}
        size="md"
      />
      {/* Status bar under avatar */}
      <div
        className={cn(
          'h-[3px] rounded-full transition-all duration-500',
          agent.status === 'busy' ? 'w-8 animate-pulse' : 'w-5',
        )}
        style={{
          backgroundColor: cfg.color,
          boxShadow: agent.status === 'busy' ? `0 0 8px ${cfg.color}80` : 'none',
        }}
      />
      <span className="text-white/50 text-[10px] truncate max-w-full group-hover:text-white/80 transition-colors">
        {agent.name}
      </span>
      <span className="text-[9px] flex items-center gap-1" style={{ color: `${cfg.color}CC` }}>
        <span
          className={cn('w-1.5 h-1.5 rounded-full inline-block', agent.status === 'busy' && 'animate-pulse')}
          style={{ backgroundColor: cfg.color }}
        />
        {cfg.label}
      </span>
      {agent.currentTask && agent.status === 'busy' && (
        <span className="text-[8px] text-cyber-green/60 truncate max-w-full px-1">
          {agent.currentTask.length > 20 ? `${agent.currentTask.slice(0, 20)}...` : agent.currentTask}
        </span>
      )}
    </button>
  )
}

/** Team door card */
function TeamDoorMini({ team, onClick }: { team: TeamListItem; onClick: () => void }) {
  const hasActivity = (team.activeTaskCount ?? 0) > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full cartoon-card p-3 flex items-center gap-3 transition-all cursor-pointer group text-left',
        hasActivity && 'border-cyber-amber/20'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center border border-white/5 transition-colors',
        hasActivity ? 'bg-cyber-amber/10' : 'bg-white/5'
      )}>
        <Building2 className={cn(
          'w-4 h-4 transition-colors',
          hasActivity ? 'text-cyber-amber' : 'text-cyber-lavender/60'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm font-medium truncate group-hover:text-white transition-colors">{team.name}</p>
        <p className="text-white/20 text-[10px]">{team.memberCount} 成员</p>
      </div>
      <div className="flex items-center gap-2">
        {hasActivity && (
          <span className="px-1.5 py-0.5 rounded-md bg-cyber-amber/10 text-cyber-amber text-[9px] border border-cyber-amber/20">
            {team.activeTaskCount}
          </span>
        )}
        <ArrowRight className="w-3 h-3 text-white/10 group-hover:text-white/30 transition-colors" />
      </div>
    </button>
  )
}

/** Timeline-style event item */
function EventTimelineItem({ event }: { event: CommunicationEvent }) {
  const typeColors: Record<string, string> = {
    message: 'bg-cyber-blue',
    task_assign: 'bg-cyber-amber',
    task_complete: 'bg-cyber-green',
    error: 'bg-cyber-red',
  }
  const dotColor = typeColors[event.eventType ?? event.type] || 'bg-white/30'

  return (
    <div className="flex items-start gap-3 pl-1 animate-slide-in">
      {/* Timeline dot */}
      <div className={cn('w-[9px] h-[9px] rounded-full mt-1 flex-shrink-0 ring-2 ring-cyber-bg', dotColor)} />

      {/* Content */}
      <div className="flex-1 min-w-0 -mt-0.5">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-white/50 font-medium">{event.fromAgentId}</span>
          <span className="text-white/15">→</span>
          <span className="text-white/40">{event.toAgentId}</span>
        </div>
        <p className="text-white/20 text-[10px] truncate mt-0.5">{event.message ?? event.content}</p>
      </div>

      {/* Time */}
      <span className="text-white/10 text-[9px] flex-shrink-0 mt-0.5">
        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}
