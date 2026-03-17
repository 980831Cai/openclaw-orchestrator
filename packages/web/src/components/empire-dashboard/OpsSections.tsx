import { useEffect, useMemo, useState } from 'react'
import { StudioScene } from '@/components/scene/StudioScene'
import { cn } from '@/lib/utils'
import type { Team } from '@/types'
import { timeAgo, type LiveFeedItem, type TeamRoom } from './model'

interface EmpireRoomGridProps {
  rooms: TeamRoom[]
  onOpenRoom: (roomId: string) => void
  onOpenAgent: (agentId: string) => void
}

export function EmpireRoomGrid({ rooms, onOpenRoom, onOpenAgent }: EmpireRoomGridProps) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  useEffect(() => {
    if (rooms.length === 0) {
      setSelectedRoomId(null)
      return
    }
    if (selectedRoomId && rooms.some((room) => room.id === selectedRoomId)) {
      return
    }
    const preferredRoom = rooms.find((room) => room.memberCount > 0) ?? rooms[0]
    setSelectedRoomId(preferredRoom.id)
  }, [rooms, selectedRoomId])

  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId) ?? null, [rooms, selectedRoomId])
  const sceneTeam = useMemo(() => (selectedRoom ? toSceneTeam(selectedRoom) : null), [selectedRoom])
  const teamMd = useMemo(() => (selectedRoom ? buildRoomMarkdown(selectedRoom) : ''), [selectedRoom])

  return (
    <div className="game-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black tracking-wider text-white/90">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15 text-sm" style={{ boxShadow: '0 0 8px rgba(59,130,246,0.3)' }}>🏢</span>
            办公室实景
          </h2>
          <p className="mt-1 text-[10px] text-white/45">使用办公室场景查看工作室内部席位与 Agent 状态。</p>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
          <p className="text-[10px] text-white/40">房间数</p>
          <p className="text-sm font-black text-white/85">{rooms.length}</p>
        </div>
      </div>

      {selectedRoom && sceneTeam ? (
        <>
          <div className="mb-4 overflow-hidden rounded-[28px] border border-white/[0.08] bg-slate-950/45 shadow-[0_16px_40px_rgba(2,6,23,0.35)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-black/20 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-black text-white/90">{selectedRoom.name}</h3>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${selectedRoom.accent.badge}`}>{selectedRoom.activeCount} 忙碌</span>
                  {selectedRoom.id === '__unassigned__' ? (
                    <span className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">未分配</span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-white/45">{selectedRoom.description || '暂无说明'}</p>
              </div>
              {selectedRoom.id !== '__unassigned__' ? (
                <button
                  type="button"
                  onClick={() => onOpenRoom(selectedRoom.id)}
                  className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:border-cyan-300/40 hover:bg-cyan-500/15"
                >
                  打开工作室
                </button>
              ) : null}
            </div>
            <div className="h-[540px] min-h-[540px]">
              <StudioScene team={sceneTeam} teamMd={teamMd} onViewAgent={(agentId) => onOpenAgent(agentId)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rooms.map((room) => {
              const selected = room.id === selectedRoomId
              return (
                <div
                  key={room.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRoomId(room.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedRoomId(room.id)
                    }
                  }}
                  className={cn(
                    'rounded-2xl border p-3 transition-all duration-200',
                    selected
                      ? 'border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.14)]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/12 hover:bg-white/[0.04]',
                  )}
                >
                  <div className={`mb-3 h-1 rounded-full bg-gradient-to-r ${room.accent.bar}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-black text-white/90">{room.name}</p>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${room.accent.badge}`}>{room.activeCount} 活跃</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[10px] text-white/45">{room.description || '暂无说明'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-white/40">席位</p>
                      <p className="text-base font-black text-white/85">{room.memberCount}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {room.agents.length > 0 ? (
                      room.agents.slice(0, 6).map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onOpenAgent(agent.id)
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition',
                            agent.resolvedStatus === 'busy'
                              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                              : agent.resolvedStatus === 'error'
                                ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                                : agent.resolvedStatus === 'offline'
                                  ? 'border-slate-500/30 bg-slate-500/10 text-slate-300'
                                  : 'border-sky-400/30 bg-sky-500/10 text-sky-200',
                          )}
                        >
                          <span>{agent.emoji || '🤖'}</span>
                          <span className="max-w-[90px] truncate">{agent.name}</span>
                        </button>
                      ))
                    ) : (
                      <span className="text-[10px] text-white/30">当前没有 Agent</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-sm text-white/45">
          <span className="text-4xl opacity-30">🏢</span>
          <p>还没有工作室数据</p>
        </div>
      )}
    </div>
  )
}

function toSceneTeam(room: TeamRoom): Team {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    goal: room.description,
    theme: 'default',
    teamDir: '',
    createdAt: new Date(0).toISOString(),
    leadAgentId: room.agents[0]?.id ?? null,
    members: room.agents.map((agent, index) => ({
      agentId: agent.id,
      role: index === 0 ? 'lead' : 'member',
      joinOrder: index + 1,
      name: agent.name,
      emoji: agent.emoji,
      theme: agent.theme,
      status: agent.resolvedStatus,
      currentTask: agent.currentTask,
    })),
    schedule: {
      type: 'round-robin',
      mode: 'round-robin',
      entries: room.agents.map((agent, index) => ({ agentId: agent.id, order: index + 1 })),
    },
  }
}

function buildRoomMarkdown(room: TeamRoom) {
  const lines = [
    `# ${room.name}`,
    room.description || '暂无说明',
    '',
    `- 成员数：${room.memberCount}`,
    `- 活跃数：${room.activeCount}`,
    '',
    '## 当前席位',
    ...room.agents.map(
      (agent, index) => `${index + 1}. ${agent.emoji || '🤖'} ${agent.name} · ${agent.statusLabel}${agent.currentTask ? ` · ${agent.currentTask}` : ''}`,
    ),
  ]

  return lines.filter(Boolean).join('\n')
}

interface EmpireLiveFeedProps {
  items: LiveFeedItem[]
  gatewayRpcConnected: boolean
  gatewayRuntimeRunning: boolean
}

export function EmpireLiveFeed({ items, gatewayRpcConnected, gatewayRuntimeRunning }: EmpireLiveFeedProps) {
  const gatewayLabel = gatewayRpcConnected
    ? gatewayRuntimeRunning
      ? 'RPC 在线 / 进程运行中'
      : 'RPC 在线 / 进程未运行'
    : gatewayRuntimeRunning
      ? 'RPC 离线 / 进程运行中'
      : 'RPC 离线 / 进程未运行'

  return (
    <div className="game-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white/90">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-sm" style={{ boxShadow: '0 0 8px rgba(139,92,246,0.2)' }}>📗</span>
            LIVE FEED
          </h2>
          <p className="mt-1 text-[10px] text-white/45">融合通信事件与消息流，实时反映 Agent 正在做什么。</p>
        </div>
        <span
          className={cn(
            'rounded-md border px-2 py-1 text-[10px] font-bold',
            gatewayRpcConnected ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-400/30 bg-rose-500/10 text-rose-300',
          )}
        >
          {gatewayLabel}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-sm text-white/45">
          <span className="text-4xl opacity-30">📭</span>
          <p>当前还没有可展示的实时事件</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-200 hover:bg-white/[0.05]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider', item.accentClass)}>
                      {item.kind === 'communication'
                        ? 'COMM'
                        : item.kind === 'workflow'
                          ? 'FLOW'
                          : item.kind === 'notification'
                            ? 'ALERT'
                            : 'MSG'}
                    </span>
                    <p className="truncate text-sm font-bold text-white/90">{item.title}</p>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-white/55">{item.summary}</p>
                </div>
                <span className="flex-shrink-0 text-[10px] text-white/35">{timeAgo(item.timestamp)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
