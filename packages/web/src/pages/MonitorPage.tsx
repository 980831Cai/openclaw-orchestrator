import { useEffect } from 'react'
import { Activity, Radio, MessageCircle } from 'lucide-react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
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

  return (
    <div className="min-h-screen p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Activity className="w-7 h-7 text-cyber-green" />
          指挥中心
        </h1>
        <div className="flex items-center gap-3">
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs', connected ? 'bg-cyber-green/10 text-cyber-green' : 'bg-cyber-red/10 text-cyber-red')}>
            <Radio className={cn('w-3 h-3', connected && 'animate-pulse')} />
            {connected ? '实时监控中' : '未连接'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 flex-1">
        {/* Status grid - left 60% */}
        <div className="xl:col-span-3">
          <h2 className="text-white/60 text-sm font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Agent 状态矩阵
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {agents.length === 0 ? (
              <div className="col-span-full glass rounded-xl p-12 text-center text-white/20">暂无 Agent</div>
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

        {/* Communication flow - right 40% */}
        <div className="xl:col-span-2 flex flex-col">
          <h2 className="text-white/60 text-sm font-semibold mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> 通信流向
          </h2>

          {/* Flow visualization */}
          <div className="glass rounded-xl p-6 flex-1 flex flex-col">
            {/* Agent ring */}
            <div className="relative w-full aspect-square max-w-[300px] mx-auto mb-4">
              {agents.slice(0, 8).map((agent, i) => {
                const angle = (i / Math.min(agents.length, 8)) * 2 * Math.PI - Math.PI / 2
                const radius = 40
                const x = 50 + radius * Math.cos(angle)
                const y = 50 + radius * Math.sin(angle)
                return (
                  <div
                    key={agent.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="sm" />
                  </div>
                )
              })}
              {/* Center stats */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-cyber-purple font-bold text-2xl font-mono">{events.length}</span>
                <span className="text-white/30 text-[10px]">总消息</span>
              </div>
            </div>

            {/* Recent events */}
            <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[300px]">
              <h3 className="text-white/40 text-xs font-semibold mb-2">最近通信</h3>
              {events.length === 0 ? (
                <p className="text-white/15 text-xs text-center py-6">等待通信事件...</p>
              ) : (
                events.slice(-20).reverse().map((evt, i) => (
                  <CommEventRow key={evt.id || i} event={evt} />
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
  const borderColor: Record<string, string> = {
    busy: 'border-cyber-green/40',
    idle: 'border-white/5',
    error: 'border-cyber-red/40',
    offline: 'border-white/5',
  }

  return (
    <div
      className={cn(
        'glass rounded-xl p-4 flex flex-col items-center gap-2 transition-all duration-300 hover:scale-105 cursor-pointer animate-fade-in',
        borderColor[status] || 'border-white/5',
        status === 'busy' && 'glow-green',
        status === 'error' && 'glow-red'
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="md" />
      <p className="text-white text-xs font-medium truncate max-w-full">{agent.name}</p>
      <div className="flex items-center gap-1.5">
        <div className={cn('w-1.5 h-1.5 rounded-full', status === 'busy' ? 'bg-cyber-green animate-pulse' : status === 'error' ? 'bg-cyber-red' : 'bg-white/20')} />
        <span className="text-white/30 text-[10px]">
          {status === 'busy' ? '工作中' : status === 'error' ? '异常' : status === 'idle' ? '空闲' : '离线'}
        </span>
      </div>
      {agent.currentTask && (
        <p className="text-white/20 text-[9px] truncate max-w-full animate-typing">{agent.currentTask}</p>
      )}
    </div>
  )
}

function CommEventRow({ event }: { event: CommunicationEvent }) {
  const colors: Record<string, string> = {
    message: 'text-cyber-blue',
    task_assign: 'text-cyber-amber',
    task_complete: 'text-cyber-green',
    error: 'text-cyber-red',
  }

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-white/5 transition-colors text-[10px]">
      <span className={cn('font-medium', colors[event.eventType ?? event.type])}>{event.fromAgentId}</span>
      <span className="text-white/15">→</span>
      <span className="text-white/50">{event.toAgentId}</span>
      <span className="text-white/20 truncate flex-1">{event.message ?? event.content}</span>
    </div>
  )
}
