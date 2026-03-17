import { useMemo } from 'react'
import OfficeView from '@/components/empire-office/OfficeView'
import type { Agent as OfficeAgent, Department, EmpireAgentStatus, SubAgent, Task } from '@/components/empire-office/types'
import { cn } from '@/lib/utils'
import type { AgentRoom } from './model'

interface EmpireOfficeBoardProps {
  rooms: AgentRoom[]
  onOpenRoom: (roomId: string) => void
  onOpenAgent: (agentId: string) => void
}

const DEPARTMENT_COLORS = ['#5eead4', '#a78bfa', '#34d399', '#f59e0b', '#fb7185', '#38bdf8']

const STATUS_LABELS: Record<AgentRoom['agent']['resolvedStatus'], string> = {
  busy: '执行中',
  idle: '待命',
  scheduled: '值守中',
  error: '异常',
  offline: '离线',
}

const STATUS_TONE: Record<AgentRoom['agent']['resolvedStatus'], string> = {
  busy: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200',
  idle: 'border-sky-400/30 bg-sky-500/12 text-sky-200',
  scheduled: 'border-cyan-400/30 bg-cyan-500/12 text-cyan-100',
  error: 'border-rose-400/30 bg-rose-500/12 text-rose-200',
  offline: 'border-slate-400/20 bg-slate-500/10 text-slate-300',
}

const EMPIRE_STATUS_TONE: Record<EmpireAgentStatus, string> = {
  idle: 'border-sky-400/30 bg-sky-500/12 text-sky-200',
  working: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200',
  delegating: 'border-violet-400/30 bg-violet-500/12 text-violet-200',
  reviewing: 'border-amber-400/30 bg-amber-500/12 text-amber-100',
  meeting: 'border-fuchsia-400/30 bg-fuchsia-500/12 text-fuchsia-200',
  approval: 'border-orange-400/30 bg-orange-500/12 text-orange-100',
  returning: 'border-cyan-400/30 bg-cyan-500/12 text-cyan-200',
  break: 'border-rose-400/30 bg-rose-500/12 text-rose-200',
  offline: 'border-slate-400/20 bg-slate-500/10 text-slate-300',
}

export function EmpireOfficeBoard({ rooms, onOpenRoom, onOpenAgent }: EmpireOfficeBoardProps) {
  const departments = useMemo<Department[]>(
    () =>
      rooms.map((room, index) => ({
        id: room.id,
        name: room.name,
        name_ko: room.name,
        name_ja: room.name,
        name_zh: room.name,
        icon: room.agent.emoji || '🤖',
        color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length],
        description: room.teamName ? `${room.teamName} · 独立工位` : '独立工位',
        prompt: null,
        sort_order: index + 1,
        created_at: Date.now(),
        agent_count: 1,
      })),
    [rooms],
  )

  const agents = useMemo<OfficeAgent[]>(
    () =>
      rooms.map((room, index) => ({
        id: room.agent.id,
        name: room.agent.name,
        name_ko: room.agent.name,
        name_ja: room.agent.name,
        name_zh: room.agent.name,
        department_id: room.id,
        role: index === 0 ? 'team_leader' : index % 3 === 0 ? 'senior' : 'junior',
        cli_provider: 'codex',
        avatar_emoji: room.agent.emoji || '🤖',
        personality: room.teamName ? `所属工作室：${room.teamName}` : null,
        status:
          room.agent.resolvedStatus === 'busy'
            ? 'working'
            : room.agent.resolvedStatus === 'offline'
              ? 'offline'
              : room.agent.resolvedStatus === 'error'
                ? 'break'
                : 'idle',
        empire_status: room.agent.empireStatus,
        empire_status_label: room.agent.empireLabel,
        current_task_id: room.agent.currentTask ? `${room.agent.id}:current` : null,
        stats_tasks_done: Math.max(0, Math.round(room.agent.score / 10)),
        stats_xp: room.agent.score,
        created_at: Date.now(),
      })),
    [rooms],
  )

  const tasks = useMemo<Task[]>(
    () =>
      rooms
        .filter((room) => room.agent.resolvedStatus === 'busy' || room.agent.currentTask)
        .map((room, index) => ({
          id: `${room.id}:${room.agent.id}:${index}`,
          title: room.agent.currentTask || `${room.agent.name} 正在执行任务`,
          description: room.teamName ? `所属工作室：${room.teamName}` : '独立工位任务',
          department_id: room.id,
          assigned_agent_id: room.agent.id,
          agent_name: room.agent.name,
          agent_name_ko: room.agent.name,
          agent_avatar: room.agent.emoji,
          status: 'in_progress',
          priority: 1,
          task_type: 'general',
          project_path: null,
          result: null,
          started_at: Date.now(),
          completed_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        })),
    [rooms],
  )

  const unreadAgentIds = useMemo(() => new Set(rooms.filter((room) => room.agent.resolvedStatus === 'error').map((room) => room.agent.id)), [rooms])
  const subAgents = useMemo<SubAgent[]>(() => [], [])

  const roomStats = useMemo(
    () => ({
      busy: rooms.filter((room) => room.agent.resolvedStatus === 'busy').length,
      idle: rooms.filter((room) => room.agent.resolvedStatus === 'idle').length,
      scheduled: rooms.filter((room) => room.agent.resolvedStatus === 'scheduled').length,
      error: rooms.filter((room) => room.agent.resolvedStatus === 'error').length,
      offline: rooms.filter((room) => room.agent.resolvedStatus === 'offline').length,
    }),
    [rooms],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatusChip label="执行中" value={roomStats.busy} tone="border-emerald-400/20 bg-emerald-500/10 text-emerald-200" />
        <StatusChip label="待命" value={roomStats.idle} tone="border-sky-400/20 bg-sky-500/10 text-sky-200" />
        <StatusChip label="值守" value={roomStats.scheduled} tone="border-cyan-400/20 bg-cyan-500/10 text-cyan-100" />
        <StatusChip label="异常" value={roomStats.error} tone="border-rose-400/20 bg-rose-500/10 text-rose-200" />
        <StatusChip label="离线" value={roomStats.offline} tone="border-slate-400/20 bg-slate-500/10 text-slate-300" />
      </div>

      <div className="mt-4 flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-slate-950/45 shadow-[0_16px_40px_rgba(2,6,23,0.35)]">
        <div className="border-b border-white/[0.08] bg-black/20 px-4 py-3">
          <h3 className="text-sm font-black tracking-wider text-white/85">Agent 工位总览</h3>
          <p className="mt-1 text-[11px] text-white/45">每个 Agent 独立工位，实时展示状态与当前任务。</p>
        </div>
        <div className="min-h-0 overflow-auto">
          <OfficeView
            departments={departments}
            agents={agents}
            tasks={tasks}
            subAgents={subAgents}
            unreadAgentIds={unreadAgentIds}
            onSelectAgent={(agent) => onOpenAgent(agent.id)}
            onSelectDepartment={(department) => {
              const room = rooms.find((item) => item.id === department.id)
              if (room?.teamId) {
                onOpenRoom(room.teamId)
              } else if (room) {
                onOpenAgent(room.agentId)
              }
            }}
          />
        </div>
      </div>

      <div className="mt-4 max-h-[340px] overflow-y-auto pr-1 xl:max-h-[360px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => (
            <article
              key={room.id}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-200 hover:border-white/12 hover:bg-white/[0.04]"
            >
            <div className={`mb-3 h-1 rounded-full bg-gradient-to-r ${room.accent.bar}`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => onOpenAgent(room.agentId)} className="truncate text-left text-sm font-black text-white/90 hover:text-white">
                    {room.agent.emoji || '🤖'} {room.name}
                  </button>
                  <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-black', STATUS_TONE[room.agent.resolvedStatus])}>
                    {STATUS_LABELS[room.agent.resolvedStatus]}
                  </span>
                  <span
                    className={cn('rounded-md border px-2 py-0.5 text-[10px] font-black', EMPIRE_STATUS_TONE[room.agent.empireStatus])}
                    title={room.agent.empireReason}
                  >
                    {room.agent.empireLabel}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] text-white/45">{room.description}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/40">积分</p>
                <p className="text-base font-black text-white/85">{room.agent.score}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-white/45">
              <span className="truncate">{room.teamName || '未分组'}</span>
              {room.teamId ? (
                <button
                  type="button"
                  onClick={() => onOpenRoom(room.teamId!)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-white/60 transition-colors hover:border-white/20 hover:text-white/85"
                >
                  打开工作室
                </button>
              ) : null}
            </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cn('rounded-2xl border px-3 py-2', tone)}>
      <p className="text-[10px] opacity-70">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  )
}
