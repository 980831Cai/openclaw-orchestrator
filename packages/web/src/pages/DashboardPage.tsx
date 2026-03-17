import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Building2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Radio,
  ShieldCheck,
  Users,
  Waypoints,
  Wifi,
  Zap,
} from 'lucide-react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { EmptyState } from '@/components/brand/EmptyState'
import {
  buildAgentRooms,
  buildLiveFeed,
  resolveAgents,
  timeAgo,
  type LiveFeedItem,
  type ResolvedAgent,
} from '@/components/empire-dashboard/model'
import { useAgents } from '@/hooks/use-agents'
import { useTeams } from '@/hooks/use-teams'
import { getActiveWorkflowCount, getActiveWorkflowSignals, getSchedulableWorkflows } from '@/lib/active-workflows'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitor-store'
import type { CommunicationEvent, TeamListItem, WorkflowDefinition, WorkflowRuntimeSignal } from '@/types'

/* ═══════════════════════════════════════════════
   DashboardPage — 总部大厅
   Modern data-driven overview dashboard
   ═══════════════════════════════════════════════ */

export function DashboardPage() {
  const navigate = useNavigate()
  const { agents, fetchAgents } = useAgents()
  const { teams, fetchTeams } = useTeams()
  const {
    connected,
    events,
    agentStatuses,
    gatewayConnected,
    gatewayRuntime,
    realtimeMessages,
    notifications,
    workflowSignals,
    scheduledWorkflows: workflowCatalog,
  } = useMonitorStore()

  useEffect(() => {
    void fetchAgents()
    void fetchTeams()
  }, [fetchAgents, fetchTeams])

  const workflowSignalList = useMemo(
    () =>
      Array.from(workflowSignals.values()).sort(
        (left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime(),
      ),
    [workflowSignals],
  )
  const gatewayRuntimeRunning = gatewayRuntime?.running === true

  const resolvedAgents = resolveAgents(agents, agentStatuses, {
    events,
    messages: realtimeMessages,
    notifications,
    workflowSignals: workflowSignalList,
    gatewayConnected,
    gatewayRuntimeRunning,
  })

  const busyCount = resolvedAgents.filter((agent) => agent.resolvedStatus === 'busy').length
  const onlineCount = resolvedAgents.filter((a) => a.resolvedStatus !== 'offline').length
  const liveFeedItems = useMemo(
    () => buildLiveFeed(events, realtimeMessages, workflowSignalList, notifications).slice(0, 10),
    [events, notifications, realtimeMessages, workflowSignalList],
  )
  const allActiveWorkflowSignals = useMemo(() => getActiveWorkflowSignals(workflowSignalList), [workflowSignalList])
  const activeWorkflowSignals = useMemo(() => allActiveWorkflowSignals.slice(0, 6), [allActiveWorkflowSignals])
  const activeScheduledWorkflows = useMemo(() => getSchedulableWorkflows(workflowCatalog), [workflowCatalog])
  const scheduledWorkflows = useMemo(() => activeScheduledWorkflows.slice(0, 5), [activeScheduledWorkflows])

  const visibleWorkflowCount = useMemo(
    () => getActiveWorkflowCount({ signals: workflowSignalList, workflows: workflowCatalog }),
    [workflowSignalList, workflowCatalog],
  )

  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1440px] space-y-6 p-6 lg:p-8">
        {/* ── Header: Greeting + System Health ── */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white/90">{greeting}，指挥官</h1>
            <p className="mt-1 text-[13px] text-white/35">
              {connected ? '系统运行中' : '实时通道未连接'} · {agents.length} 位 Agent · {teams.length} 个工作室
            </p>
          </div>
          <div className="flex items-center gap-3">
            <HealthDot active={connected} label="实时通道" />
            <HealthDot active={gatewayConnected} label="Gateway" />
            <HealthDot active={gatewayRuntimeRunning} label="进程" />
          </div>
        </header>

        {/* ── Stats Row ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            icon={<Bot className="h-4 w-4" />}
            label="活跃 Agent"
            value={String(busyCount)}
            accentColor="#6366F1"
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="在线 Agent"
            value={String(onlineCount)}
            accentColor="#22C55E"
          />
          <StatCard
            icon={<Waypoints className="h-4 w-4" />}
            label="活跃工作流"
            value={String(visibleWorkflowCount)}
            accentColor="#06B6D4"
          />
          <StatCard
            icon={<ClipboardList className="h-4 w-4" />}
            label="实时事件"
            value={String(liveFeedItems.length)}
            accentColor="#F59E0B"
          />
          <StatCard
            icon={<Radio className="h-4 w-4" />}
            label="实时通道"
            value={connected ? '已连接' : '断开'}
            accentColor={connected ? '#22C55E' : '#EF4444'}
          />
          <StatCard
            icon={<Wifi className="h-4 w-4" />}
            label="Gateway"
            value={gatewayConnected ? '在线' : '离线'}
            accentColor={gatewayConnected ? '#22C55E' : '#EF4444'}
          />
        </div>

        {/* ── Main Content: Two Column Layout ── */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px] xl:items-start">
          <div className="space-y-6">
            {/* ── Team Hub ── */}
            <Section
              title="工作室"
              icon={<Building2 className="h-4 w-4 text-cyber-cyan" />}
              action={teams.length > 0 ? { label: '查看全部', onClick: () => navigate('/teams') } : undefined}
            >
              {teams.length === 0 ? (
                <div className="glass-card-static">
                  <EmptyState scene="no-teams" className="py-8" />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {teams.slice(0, 6).map((team) => (
                    <TeamCard key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />
                  ))}
                </div>
              )}
            </Section>

            {/* ── Agent Quick View ── */}
            <Section
              title="Agent 总览"
              icon={<Bot className="h-4 w-4 text-cyber-purple" />}
              action={agents.length > 0 ? { label: '查看全部', onClick: () => navigate('/agents') } : undefined}
            >
              {agents.length === 0 ? (
                <div className="glass-card-static">
                  <EmptyState scene="no-agents" className="py-8" />
                </div>
              ) : (
                <div className="glass-card-static overflow-hidden">
                  <div className="divide-y divide-white/[0.04]">
                    {resolvedAgents.slice(0, 8).map((agent, i) => (
                      <AgentRow
                        key={agent.id}
                        agent={agent}
                        style={{ animationDelay: `${i * 50}ms` }}
                        onClick={() => navigate(`/chat?agent=${encodeURIComponent(agent.id)}`)}
                      />
                    ))}
                  </div>
                  {resolvedAgents.length > 8 && (
                    <button
                      onClick={() => navigate('/agents')}
                      className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-white/[0.04] py-3 text-xs text-white/30 transition hover:text-white/50"
                    >
                      查看全部 {resolvedAgents.length} 位 Agent <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </Section>
          </div>

          {/* ── Right Sidebar: Workflow + Live Feed ── */}
          <div className="space-y-6">
            <WorkflowStatusPanel
              activeSignals={activeWorkflowSignals}
              activeSignalCount={allActiveWorkflowSignals.length}
              scheduledWorkflows={scheduledWorkflows}
              scheduledWorkflowCount={activeScheduledWorkflows.length}
              onOpenWorkflows={() => navigate('/workflows')}
              onOpenWorkflow={(workflowId, executionId, approvalId) =>
                navigate(
                  `/workflows?workflowId=${encodeURIComponent(workflowId)}${
                    executionId ? `&executionId=${encodeURIComponent(executionId)}` : ''
                  }${approvalId ? `&approvalId=${encodeURIComponent(approvalId)}` : ''}`,
                )
              }
            />

            <LiveFeedPanel
              items={liveFeedItems}
              gatewayConnected={gatewayConnected}
              gatewayRuntimeRunning={gatewayRuntimeRunning}
              onOpenChat={() => navigate('/chat')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Shared Components ─── */

function HealthDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full transition-colors',
          active ? 'bg-cyber-green' : 'bg-white/15',
        )}
      />
      <span className="text-[11px] text-white/25">{label}</span>
    </div>
  )
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: ReactNode
  action?: { label: string; onClick: () => void }
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="section-title">
          {icon}
          {title}
        </h2>
        {action ? (
          <button
            onClick={action.onClick}
            className="flex cursor-pointer items-center gap-1 text-xs text-white/25 transition-colors hover:text-white/50"
          >
            {action.label} <ArrowRight className="h-3 w-3" />
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function StatCard({
  icon,
  label,
  value,
  accentColor,
}: {
  icon: ReactNode
  label: string
  value: string
  accentColor: string
}) {
  return (
    <div className="stat-card" style={{ '--accent-color': accentColor } as React.CSSProperties}>
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-lg font-bold leading-none" style={{ color: accentColor }}>
          {value}
        </p>
        <p className="mt-1 text-[11px] text-white/30">{label}</p>
      </div>
    </div>
  )
}

function TeamCard({ team, onClick }: { team: TeamListItem; onClick: () => void }) {
  const hasActivity = (team.activeTaskCount ?? 0) > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'glass-card group flex items-center gap-4 p-4 text-left',
        hasActivity && 'border-cyber-amber/15',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.06] transition-colors',
          hasActivity ? 'bg-cyber-amber/[0.08]' : 'bg-white/[0.03]',
        )}
      >
        <Building2
          className={cn('h-4 w-4 transition-colors', hasActivity ? 'text-cyber-amber' : 'text-white/30')}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/80 transition-colors group-hover:text-white/95">
          {team.name}
        </p>
        <p className="mt-0.5 text-[11px] text-white/25">
          {team.memberCount} 成员
          {hasActivity ? (
            <span className="ml-2 text-cyber-amber/80">· {team.activeTaskCount} 任务进行中</span>
          ) : null}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-white/10 transition-colors group-hover:text-white/30" />
    </button>
  )
}

function AgentRow({
  agent,
  style,
  onClick,
}: {
  agent: ResolvedAgent
  style?: React.CSSProperties
  onClick: () => void
}) {
  const statusColor: Record<string, string> = {
    busy: 'text-cyber-green bg-cyber-green/10 border-cyber-green/20',
    idle: 'text-white/40 bg-white/[0.04] border-white/[0.06]',
    scheduled: 'text-cyber-amber bg-cyber-amber/10 border-cyber-amber/20',
    error: 'text-cyber-red bg-cyber-red/10 border-cyber-red/20',
    offline: 'text-white/20 bg-white/[0.02] border-white/[0.04]',
  }
  const statusLabel: Record<string, string> = {
    busy: '工作中',
    idle: '待命',
    scheduled: '值守中',
    error: '异常',
    offline: '离线',
  }

  return (
    <button
      onClick={onClick}
      className="animate-fade-in-up flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      style={style}
    >
      <AgentAvatar emoji={agent.emoji} theme={agent.theme} status={agent.resolvedStatus} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/80">{agent.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-white/25">
          {agent.currentTask || agent.empireReason || '暂无活动'}
        </p>
      </div>
      <span
        className={cn(
          'rounded-md border px-2 py-0.5 text-[10px] font-medium',
          statusColor[agent.resolvedStatus] ?? statusColor.idle,
        )}
      >
        {statusLabel[agent.resolvedStatus] ?? '未知'}
      </span>
    </button>
  )
}

/* ─── Workflow Status Panel ─── */

function WorkflowStatusPanel({
  activeSignals,
  activeSignalCount,
  scheduledWorkflows,
  scheduledWorkflowCount,
  onOpenWorkflows,
  onOpenWorkflow,
}: {
  activeSignals: WorkflowRuntimeSignal[]
  activeSignalCount: number
  scheduledWorkflows: WorkflowDefinition[]
  scheduledWorkflowCount: number
  onOpenWorkflows: () => void
  onOpenWorkflow: (workflowId: string, executionId?: string, approvalId?: string) => void
}) {
  return (
    <div className="glass-card-static p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title">
          <Waypoints className="h-4 w-4 text-cyber-purple" />
          工作流状态
        </h2>
        <button
          type="button"
          onClick={onOpenWorkflows}
          className="flex cursor-pointer items-center gap-1 text-[11px] text-white/25 transition-colors hover:text-white/50"
        >
          打开 DAG <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25">运行中</p>
            <span className="text-[10px] text-white/20">{activeSignalCount}</span>
          </div>
          {activeSignals.length === 0 ? (
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-4 text-center text-[11px] text-white/25">
              当前没有运行中的工作流
            </div>
          ) : (
            <div className="space-y-2">
              {activeSignals.map((signal) => (
                <WorkflowSignalCard
                  key={signal.executionId}
                  signal={signal}
                  onClick={() => {
                    if (signal.workflowId) {
                      onOpenWorkflow(signal.workflowId, signal.executionId, signal.approvalId ?? undefined)
                      return
                    }
                    onOpenWorkflows()
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25">已启用定时</p>
            <span className="text-[10px] text-white/20">{scheduledWorkflowCount}</span>
          </div>
          {scheduledWorkflows.length === 0 ? (
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-4 text-center text-[11px] text-white/25">
              没有启用中的定时任务
            </div>
          ) : (
            <div className="space-y-2">
              {scheduledWorkflows.map((workflow) => (
                <ScheduledWorkflowCard key={workflow.id} workflow={workflow} onClick={() => onOpenWorkflow(workflow.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorkflowSignalCard({ signal, onClick }: { signal: WorkflowRuntimeSignal; onClick: () => void }) {
  const toneClass =
    signal.status === 'waiting_approval'
      ? 'border-cyber-amber/20 bg-cyber-amber/10 text-cyber-amber'
      : signal.status === 'failed'
        ? 'border-cyber-red/20 bg-cyber-red/10 text-cyber-red'
        : signal.status === 'completed'
          ? 'border-cyber-green/20 bg-cyber-green/10 text-cyber-green'
          : 'border-cyber-purple/20 bg-cyber-purple/10 text-cyber-purple'

  const title = signal.workflowName ?? signal.workflowId ?? `执行 ${signal.executionId.slice(0, 8)}`
  const summary = [
    signal.nodeLabel ?? signal.currentNodeId ?? '未标记节点',
    signal.approverAgentId ? `审批：${signal.approverAgentId}` : null,
    typeof signal.totalArtifacts === 'number' ? `产物 ${signal.totalArtifacts}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-left transition hover:border-white/[0.08] hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase', toneClass)}>
              {signal.status}
            </span>
            <p className="truncate text-sm font-medium text-white/80">{title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-white/30">{summary || '运行中'}</p>
        </div>
        <span className="text-[10px] text-white/15">{timeAgo(signal.updatedAt ?? new Date().toISOString())}</span>
      </div>
    </button>
  )
}

function ScheduledWorkflowCard({ workflow, onClick }: { workflow: WorkflowDefinition; onClick: () => void }) {
  const nextRunAt = workflow.schedule?.nextRunAt
  const windowLabel = workflow.schedule?.window
    ? `${workflow.schedule.window.start} - ${workflow.schedule.window.end}`
    : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-left transition hover:border-white/[0.08] hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-cyber-cyan/20 bg-cyber-cyan/10 px-2 py-0.5 text-[9px] font-bold uppercase text-cyber-cyan">
              定时
            </span>
            <p className="truncate text-sm font-medium text-white/80">{workflow.name}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-white/30">
            {nextRunAt
              ? `下次执行 ${new Date(nextRunAt).toLocaleString()}`
              : `Cron: ${workflow.schedule?.cron ?? '未配置'}`}
            {windowLabel ? ` · 时间窗 ${windowLabel}` : ''}
          </p>
        </div>
        <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyber-cyan/50" />
      </div>
    </button>
  )
}

/* ─── Live Feed Panel ─── */

function LiveFeedPanel({
  items,
  gatewayConnected,
  gatewayRuntimeRunning,
  onOpenChat,
}: {
  items: LiveFeedItem[]
  gatewayConnected: boolean
  gatewayRuntimeRunning: boolean
  onOpenChat: () => void
}) {
  const gatewayLabel = gatewayConnected
    ? gatewayRuntimeRunning
      ? 'RPC 在线 / 进程运行中'
      : 'RPC 在线 / 进程未运行'
    : gatewayRuntimeRunning
      ? 'RPC 离线 / 进程运行中'
      : 'RPC 离线 / 进程未运行'

  return (
    <div className="glass-card-static p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="section-title">
          <Zap className="h-4 w-4 text-cyber-amber" />
          实时事件流
        </h2>
        <button
          type="button"
          onClick={onOpenChat}
          className="flex cursor-pointer items-center gap-1 text-[11px] text-white/25 transition-colors hover:text-white/50"
        >
          通信频道 <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] text-white/25">消息 / 工作流 / 通知统一流</span>
        <span
          className={cn(
            'rounded-md border px-2 py-0.5 text-[9px] font-bold',
            gatewayConnected
              ? 'border-cyber-green/20 bg-cyber-green/10 text-cyber-green'
              : 'border-cyber-red/20 bg-cyber-red/10 text-cyber-red',
          )}
        >
          {gatewayLabel}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState scene="no-events" className="py-6" />
      ) : (
        <div className="max-h-[320px] space-y-2 overflow-y-auto">
          {items.map((item) => (
            <LiveFeedRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function LiveFeedRow({ item }: { item: LiveFeedItem }) {
  return (
    <article className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase', item.accentClass)}>
              {item.kind === 'communication'
                ? 'COMM'
                : item.kind === 'workflow'
                  ? 'FLOW'
                  : item.kind === 'notification'
                    ? 'ALERT'
                    : 'MSG'}
            </span>
            <p className="truncate text-sm font-medium text-white/80">{item.title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] text-white/30">{item.summary}</p>
        </div>
        <span className="text-[10px] text-white/15">{timeAgo(item.timestamp)}</span>
      </div>
    </article>
  )
}
