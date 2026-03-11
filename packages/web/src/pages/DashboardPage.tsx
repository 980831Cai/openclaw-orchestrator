import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wifi, Zap, ClipboardList, ArrowRight, Building2 } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { EmptyState } from '@/components/brand/EmptyState'
import { EmpireOfficeBoard } from '@/components/empire-dashboard/EmpireOfficeBoard'
import { buildAgentRooms, resolveAgents } from '@/components/empire-dashboard/model'
import { useAgents } from '@/hooks/use-agents'
import { useTeams } from '@/hooks/use-teams'
import { useWebSocket } from '@/hooks/use-websocket'
import { useMonitorStore } from '@/stores/monitor-store'
import { cn } from '@/lib/utils'
import type { TeamListItem, CommunicationEvent } from '@/types'

export function DashboardPage() {
  const navigate = useNavigate()
  const { agents, fetchAgents } = useAgents()
  const { teams, fetchTeams } = useTeams()
  const { connected, events, agentStatuses, realtimeMessages, notifications, workflowSignals } = useMonitorStore()
  useWebSocket()

  useEffect(() => {
    fetchAgents()
    fetchTeams()
  }, [fetchAgents, fetchTeams])

  const resolvedAgents = resolveAgents(agents, agentStatuses, {
    events,
    messages: realtimeMessages,
    notifications,
    workflowSignals,
  })
  const busyCount = resolvedAgents.filter((agent) => agent.resolvedStatus === 'busy').length
  const agentRooms = buildAgentRooms(teams, resolvedAgents)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="h-full overflow-auto p-8">
      <div className="cartoon-card relative mb-8 overflow-hidden p-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(139,92,246,0.06) 0%, transparent 60%)',
          }}
        />

        <div className="relative z-10 flex items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Logo size="lg" mood={connected ? 'waving' : 'worried'} animated />
            <div>
              <h1 className="text-2xl font-bold text-white/90">{greeting}，指挥官 👋</h1>
              <p className="mt-1 text-sm text-white/30">{connected ? 'OpenClaw 系统运行正常' : 'Gateway 未连接，部分功能受限'}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <StatCard
              icon={<Wifi className={cn('h-4 w-4', connected ? 'text-cyber-green' : 'text-cyber-red')} />}
              label="Gateway"
              value={connected ? '在线' : '离线'}
              valueColor={connected ? 'text-cyber-green' : 'text-cyber-red'}
            />
            <StatCard icon={<Zap className="h-4 w-4 text-cyber-purple" />} label="活跃 Agent" value={String(busyCount)} valueColor="text-cyber-purple" />
            <StatCard icon={<Building2 className="h-4 w-4 text-cyber-cyan" />} label="工作室" value={String(teams.length)} valueColor="text-cyber-cyan" />
            <StatCard icon={<ClipboardList className="h-4 w-4 text-cyber-amber" />} label="事件" value={String(events.length)} valueColor="text-cyber-amber" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.9fr)_340px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Zap className="h-5 w-5 text-cyber-purple" />
              Agent 广场
            </h2>
            {agents.length > 0 ? (
              <button
                onClick={() => navigate('/agents')}
                className="flex cursor-pointer items-center gap-1 text-xs text-white/25 transition-colors hover:text-white/50"
              >
                查看全部 <ArrowRight className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <div className="cartoon-card min-h-[420px] p-4 sm:p-6 xl:min-h-[760px]">
            {agents.length === 0 ? (
              <EmptyState scene="no-agents" />
            ) : (
              <EmpireOfficeBoard
                rooms={agentRooms}
                onOpenRoom={(roomId) => navigate(`/teams/${roomId}`)}
                onOpenAgent={(agentId) => navigate(`/chat?agent=${encodeURIComponent(agentId)}`)}
              />
            )}
          </div>
        </div>

        <div className="space-y-6 xl:max-h-[calc(100vh-220px)] xl:overflow-y-auto xl:pr-1">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Building2 className="h-5 w-5 text-cyber-cyan" />
                工作室入口
              </h2>
              {teams.length > 0 ? (
                <button
                  onClick={() => navigate('/teams')}
                  className="flex cursor-pointer items-center gap-1 text-xs text-white/25 transition-colors hover:text-white/50"
                >
                  全部 <ArrowRight className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              {teams.length === 0 ? (
                <EmptyState scene="no-teams" className="py-8" />
              ) : (
                teams.map((team) => <TeamDoorMini key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />)
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Zap className="h-4 w-4 text-cyber-amber" />
              实时事件流
            </h2>
            <div className="cartoon-card max-h-[240px] overflow-y-auto p-4">
              {events.length === 0 ? (
                <EmptyState scene="no-events" className="py-6" />
              ) : (
                <div className="relative">
                  <div className="absolute bottom-2 left-[7px] top-2 w-px bg-white/5" />
                  <div className="space-y-3">
                    {events.slice(-10).reverse().map((evt, index) => (
                      <EventTimelineItem key={evt.id || index} event={evt} />
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

function StatCard({ icon, label, value, valueColor }: { icon: ReactNode; label: string; value: string; valueColor: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5">{icon}</div>
      <span className={cn('font-mono text-sm font-bold', valueColor)}>{value}</span>
      <span className="text-[9px] text-white/20">{label}</span>
    </div>
  )
}

function TeamDoorMini({ team, onClick }: { team: TeamListItem; onClick: () => void }) {
  const hasActivity = (team.activeTaskCount ?? 0) > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'cartoon-card group flex w-full cursor-pointer items-center gap-3 p-3 text-left transition-all',
        hasActivity && 'border-cyber-amber/20'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 transition-colors',
          hasActivity ? 'bg-cyber-amber/10' : 'bg-white/5'
        )}
      >
        <Building2 className={cn('h-4 w-4 transition-colors', hasActivity ? 'text-cyber-amber' : 'text-cyber-lavender/60')} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/80 transition-colors group-hover:text-white">{team.name}</p>
        <p className="text-[10px] text-white/20">{team.memberCount} 成员</p>
      </div>
      <div className="flex items-center gap-2">
        {hasActivity ? (
          <span className="rounded-md border border-cyber-amber/20 bg-cyber-amber/10 px-1.5 py-0.5 text-[9px] text-cyber-amber">
            {team.activeTaskCount}
          </span>
        ) : null}
        <ArrowRight className="h-3 w-3 text-white/10 transition-colors group-hover:text-white/30" />
      </div>
    </button>
  )
}

function EventTimelineItem({ event }: { event: CommunicationEvent }) {
  const typeColors: Record<string, string> = {
    message: 'bg-cyber-blue',
    task_assign: 'bg-cyber-amber',
    task_complete: 'bg-cyber-green',
    error: 'bg-cyber-red',
  }
  const dotColor = typeColors[event.eventType ?? event.type] || 'bg-white/30'

  return (
    <div className="animate-slide-in flex items-start gap-3 pl-1">
      <div className={cn('mt-1 h-[9px] w-[9px] flex-shrink-0 rounded-full ring-2 ring-cyber-bg', dotColor)} />
      <div className="mt-[-2px] min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="font-medium text-white/50">{event.fromAgentId}</span>
          <span className="text-white/15">→</span>
          <span className="text-white/40">{event.toAgentId}</span>
        </div>
        <p className="mt-0.5 truncate text-[10px] text-white/20">{event.message ?? event.content}</p>
      </div>
      <span className="mt-0.5 flex-shrink-0 text-[9px] text-white/10">
        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}
