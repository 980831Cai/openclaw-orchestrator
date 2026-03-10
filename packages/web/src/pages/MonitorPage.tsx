import { useEffect } from 'react'
import { Activity, Radio, MessageCircle, Zap, AlertTriangle, Wifi } from 'lucide-react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { EmptyState } from '@/components/brand/EmptyState'
import { useAgents } from '@/hooks/use-agents'
import { useWebSocket } from '@/hooks/use-websocket'
import { useMonitorStore } from '@/stores/monitor-store'
import { cn } from '@/lib/utils'
import type { AgentListItem, CommunicationEvent } from '@/types'

export function MonitorPage() {
  const { agents, fetchAgents } = useAgents()
  const { agentStatuses, events, connected } = useMonitorStore()
  useWebSocket()

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const busyCount = agents.filter((a) => {
    const s = agentStatuses.get(a.id)
    return (s?.status || a.status) === 'busy'
  }).length

  const errorCount = agents.filter((a) => {
    const s = agentStatuses.get(a.id)
    return (s?.status || a.status) === 'error'
  }).length

  return (
    <div className="min-h-screen p-8 flex flex-col gap-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-cyber-green" />
            指挥中心
          </h1>
          <p className="text-white/25 text-sm mt-1">实时监控 Agent 状态与通信</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick stat badges */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl cartoon-card text-xs">
            <Zap className="w-3.5 h-3.5 text-cyber-purple" />
            <span className="text-white/50">活跃</span>
            <span className="text-cyber-purple font-bold font-mono">{busyCount}</span>
          </div>
          {errorCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl cartoon-card text-xs border-cyber-red/20">
              <AlertTriangle className="w-3.5 h-3.5 text-cyber-red" />
              <span className="text-white/50">异常</span>
              <span className="text-cyber-red font-bold font-mono">{errorCount}</span>
            </div>
          )}
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs cartoon-card',
            connected ? 'border-cyber-green/20' : 'border-cyber-red/20'
          )}>
            <Radio className={cn('w-3.5 h-3.5', connected ? 'text-cyber-green animate-pulse' : 'text-cyber-red')} />
            <span className={cn('font-medium', connected ? 'text-cyber-green' : 'text-cyber-red')}>
              {connected ? '实时监控中' : '未连接'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 flex-1">
        {/* ── Status grid — left 60% ── */}
        <div className="xl:col-span-3">
          <h2 className="text-white/50 text-sm font-semibold mb-3 flex items-center gap-2">
            <Wifi className="w-4 h-4" /> Agent 状态矩阵
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {agents.length === 0 ? (
              <div className="col-span-full">
                <EmptyState scene="no-agents" className="py-12" />
              </div>
            ) : (
              agents.map((agent, i) => {
                const statusEvt = agentStatuses.get(agent.id)
                const status = statusEvt?.status || agent.status || 'offline'
                return (
                  <AgentMonitorCard key={agent.id} agent={agent} status={status} index={i} />
                )
              })
            )}
          </div>
        </div>

        {/* ── Communication flow — right 40% ── */}
        <div className="xl:col-span-2 flex flex-col">
          <h2 className="text-white/50 text-sm font-semibold mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> 通信流向
          </h2>

          <div className="cartoon-card p-6 flex-1 flex flex-col">
            {/* Agent ring */}
            <div className="relative w-full aspect-square max-w-[280px] mx-auto mb-4">
              {/* Decorative ring */}
              <div className="absolute inset-[15%] rounded-full border border-dashed border-white/5 animate-ring-rotate" />
              <div className="absolute inset-[25%] rounded-full border border-dashed border-cyber-purple/10" style={{ animationDirection: 'reverse' }} />

              {agents.slice(0, 8).map((agent, i) => {
                const angle = (i / Math.min(agents.length, 8)) * 2 * Math.PI - Math.PI / 2
                const radius = 40
                const x = 50 + radius * Math.cos(angle)
                const y = 50 + radius * Math.sin(angle)
                const statusEvt = agentStatuses.get(agent.id)
                const status = statusEvt?.status || agent.status || 'offline'
                return (
                  <div
                    key={agent.id}
                    className={cn(
                      'absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500',
                      status === 'busy' && 'animate-cartoon-bob'
                    )}
                    style={{ left: `${x}%`, top: `${y}%` }}
                    title={`${agent.name} — ${status}`}
                  >
                    <div className="relative">
                      <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="sm" />
                      {/* Status ring glow */}
                      {status === 'busy' && (
                        <div className="absolute -inset-1 rounded-full border border-cyber-green/30 animate-status-breathe" style={{ color: 'rgba(34,197,94,0.15)' }} />
                      )}
                      {status === 'error' && (
                        <div className="absolute -inset-1 rounded-full border border-cyber-red/30 animate-pulse" />
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Center stats */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-cyber-purple font-bold text-2xl font-mono">{events.length}</span>
                <span className="text-white/25 text-[10px]">总消息</span>
              </div>
            </div>

            {/* Recent events */}
            <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[300px]">
              <h3 className="text-white/30 text-xs font-semibold mb-2 flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> 最近通信
              </h3>
              {events.length === 0 ? (
                <EmptyState scene="no-events" className="py-6" />
              ) : (
                events.slice(-20).reverse().map((evt, i) => (
                  <CommEventRow key={evt.id || i} event={evt} index={i} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentMonitorCard({ agent, status, index }: { agent: AgentListItem; status: string; index: number }) {
  const statusColors: Record<string, { border: string; glow: string; dot: string; label: string }> = {
    busy: { border: 'border-cyber-green/30', glow: 'shadow-[0_0_15px_rgba(34,197,94,0.15)]', dot: 'bg-cyber-green', label: '工作中' },
    idle: { border: 'border-white/5', glow: '', dot: 'bg-cyber-blue', label: '空闲' },
    error: { border: 'border-cyber-red/30', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]', dot: 'bg-cyber-red', label: '异常' },
    offline: { border: 'border-white/5', glow: '', dot: 'bg-white/20', label: '离线' },
  }
  const sc = statusColors[status] || statusColors.offline

  return (
    <div
      className={cn(
        'cartoon-card p-4 flex flex-col items-center gap-2.5 transition-all duration-300',
        'hover:scale-[1.03] cursor-pointer animate-fade-in',
        sc.border, sc.glow,
        status === 'busy' && 'animate-cartoon-bob'
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="relative">
        <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="md" />
        {/* Breathing status ring */}
        {status === 'busy' && (
          <div className="absolute -inset-1.5 rounded-full border-2 border-cyber-green/20 animate-status-breathe" style={{ color: 'rgba(34,197,94,0.1)' }} />
        )}
      </div>

      <p className="text-white text-xs font-medium truncate max-w-full">{agent.name}</p>

      <div className="flex items-center gap-1.5">
        <div className={cn('w-1.5 h-1.5 rounded-full transition-colors', sc.dot, status === 'busy' && 'animate-pulse')} />
        <span className="text-white/30 text-[10px]">{sc.label}</span>
      </div>

      {agent.currentTask && (
        <p className="text-white/15 text-[9px] truncate max-w-full px-2 py-0.5 rounded bg-white/3 border border-white/5">
          {agent.currentTask}
        </p>
      )}

      {agent.model && (
        <span className="text-[8px] text-cyber-lavender/30 truncate max-w-full">{agent.model}</span>
      )}
    </div>
  )
}

function CommEventRow({ event, index }: { event: CommunicationEvent; index: number }) {
  const typeConfig: Record<string, { color: string; icon: string }> = {
    message: { color: 'text-cyber-blue', icon: '💬' },
    task_assign: { color: 'text-cyber-amber', icon: '📋' },
    task_complete: { color: 'text-cyber-green', icon: '✅' },
    error: { color: 'text-cyber-red', icon: '⚠️' },
  }
  const tc = typeConfig[event.eventType ?? event.type] || { color: 'text-white/40', icon: '📨' }

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors text-[10px] animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <span className="text-xs flex-shrink-0">{tc.icon}</span>
      <span className={cn('font-medium flex-shrink-0', tc.color)}>{event.fromAgentId}</span>
      <span className="text-white/10">→</span>
      <span className="text-white/40 flex-shrink-0">{event.toAgentId}</span>
      <span className="text-white/15 truncate flex-1">{event.message ?? event.content}</span>
      <span className="text-white/10 text-[9px] flex-shrink-0">
        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}
