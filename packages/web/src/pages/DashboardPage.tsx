import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Wifi, WifiOff, Users, Zap, ClipboardList } from 'lucide-react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
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

  return (
    <div className="min-h-screen p-8">
      {/* Status bar */}
      <div className="glass rounded-2xl px-6 py-3 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-cyber-green" />
            ) : (
              <WifiOff className="w-4 h-4 text-cyber-red" />
            )}
            <span className={cn('text-xs', connected ? 'text-cyber-green' : 'text-cyber-red')}>
              {connected ? 'OpenClaw 在线' : '未连接'}
            </span>
          </div>
          <span className="text-white/20 text-xs">{new Date().toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-6">
          <StatBadge icon={<Users className="w-3.5 h-3.5" />} label="活跃 Agent" value={busyCount} color="green" />
          <StatBadge icon={<Building2 className="w-3.5 h-3.5" />} label="工作室" value={teams.length} color="purple" />
          <StatBadge icon={<ClipboardList className="w-3.5 h-3.5" />} label="运行任务" value={0} color="amber" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Agent Plaza - main area */}
        <div className="lg:col-span-2">
          <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyber-purple" />
            Agent 广场
          </h2>
          <div className="glass rounded-2xl p-6 min-h-[400px]">
            {agents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20">
                <Building2 className="w-16 h-16 text-white/10 mb-4" />
                <p className="text-white/30">暂无 Agent，去人员档案创建一个</p>
              </div>
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

        {/* Right sidebar: Teams + Events */}
        <div className="space-y-6">
          {/* Team rooms */}
          <div>
            <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-cyber-cyan" />
              工作室入口
            </h2>
            <div className="space-y-3">
              {teams.length === 0 ? (
                <div className="glass rounded-xl p-6 text-center text-white/20 text-sm">暂无工作室</div>
              ) : (
                teams.map((team) => (
                  <TeamDoorMini key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />
                ))
              )}
              <button
                onClick={() => navigate('/teams')}
                className="w-full py-3 rounded-xl border-2 border-dashed border-white/10 text-white/20 text-sm hover:border-cyber-purple/30 hover:text-cyber-lavender/50 transition-all cursor-pointer"
              >
                + 查看全部
              </button>
            </div>
          </div>

          {/* Event stream */}
          <div>
            <h2 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyber-amber" />
              实时事件流
            </h2>
            <div className="glass rounded-xl p-4 max-h-[200px] overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-white/15 text-xs text-center py-4">等待事件...</p>
              ) : (
                <div className="space-y-2">
                  {events.slice(-10).reverse().map((evt, i) => (
                    <EventItem key={evt.id || i} event={evt} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBadge({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`text-cyber-${color}`}>{icon}</div>
      <span className="text-white/40 text-xs">{label}</span>
      <span className={`text-cyber-${color} font-bold text-sm font-mono`}>{value}</span>
    </div>
  )
}

function AgentPlazaCard({ agent, delay, onClick }: { agent: AgentListItem; delay: number; onClick: () => void }) {
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
      <span className="text-white/60 text-[10px] truncate max-w-full group-hover:text-white transition-colors">
        {agent.name}
      </span>
      {agent.teamIds.length > 0 && (
        <span className="text-cyber-purple/40 text-[8px]">{agent.teamIds.length} 团队</span>
      )}
    </button>
  )
}

function TeamDoorMini({ team, onClick }: { team: TeamListItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full glass rounded-xl p-3 flex items-center gap-3 hover:border-cyber-purple/30 transition-all cursor-pointer group text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-cyber-purple/10 flex items-center justify-center">
        <Building2 className="w-4 h-4 text-cyber-lavender" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate group-hover:text-cyber-lavender transition-colors">{team.name}</p>
        <p className="text-white/30 text-[10px]">{team.memberCount} 成员</p>
      </div>
      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: (team.activeTaskCount ?? 0) > 0 ? '#F59E0B' : '#475569' }} />
    </button>
  )
}

function EventItem({ event }: { event: CommunicationEvent }) {
  const typeColors: Record<string, string> = {
    message: 'bg-cyber-blue',
    task_assign: 'bg-cyber-amber',
    task_complete: 'bg-cyber-green',
    error: 'bg-cyber-red',
  }

  return (
    <div className="flex items-start gap-2 text-[10px] animate-slide-in">
      <div className={cn('w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0', typeColors[event.eventType ?? event.type] || 'bg-white/30')} />
      <div className="flex-1 min-w-0">
        <span className="text-white/50">{event.fromAgentId}</span>
        <span className="text-white/20 mx-1">→</span>
        <span className="text-white/50">{event.toAgentId}</span>
        <p className="text-white/30 truncate">{event.message ?? event.content}</p>
      </div>
      <span className="text-white/15 flex-shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</span>
    </div>
  )
}
