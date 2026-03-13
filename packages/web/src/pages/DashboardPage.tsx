import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  ClipboardList,
  Clock3,
  Radio,
  ShieldCheck,
  Waypoints,
  Wifi,
  Zap,
} from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { EmptyState } from '@/components/brand/EmptyState'
import { EmpireOfficeBoard } from '@/components/empire-dashboard/EmpireOfficeBoard'
import {
  buildAgentRooms,
  buildLiveFeed,
  resolveAgents,
  timeAgo,
  type LiveFeedItem,
} from '@/components/empire-dashboard/model'
import { useAgents } from '@/hooks/use-agents'
import { useTeams } from '@/hooks/use-teams'
import { useWebSocket } from '@/hooks/use-websocket'
import { getActiveWorkflowCount, getActiveWorkflowSignals, getSchedulableWorkflows } from '@/lib/active-workflows'
import { isGatewayRuntimeProcessRunning, isGatewayRuntimeReady } from '@/lib/gateway-status'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitor-store'
import type { TeamListItem, WorkflowDefinition, WorkflowRuntimeSignal } from '@/types'

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

  useWebSocket()

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
  const gatewayRuntimeRunning = isGatewayRuntimeProcessRunning(gatewayRuntime)
  const gatewayRuntimeReady = isGatewayRuntimeReady(gatewayRuntime)

  const resolvedAgents = resolveAgents(agents, agentStatuses, {
    events,
    messages: realtimeMessages,
    notifications,
    workflowSignals: workflowSignalList,
    gatewayConnected,
    gatewayRuntimeReady,
  })

  const busyCount = resolvedAgents.filter((agent) => agent.resolvedStatus === 'busy').length
  const agentRooms = buildAgentRooms(teams, resolvedAgents)
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
  const systemSummary = connected
    ? gatewayConnected
      ? gatewayRuntimeReady
        ? '实时通道、Gateway RPC 和本机进程都正常'
        : gatewayRuntimeRunning
          ? '实时通道与 Gateway RPC 已连接，但本机 Gateway 尚未通过健康探测'
          : '实时通道与 Gateway RPC 正常，但本机 Gateway 进程未运行'
      : gatewayRuntimeRunning
        ? '实时通道已连接，本机 Gateway 在运行，但后端还没连上 RPC'
        : '实时通道已连接，但 Gateway 还没就绪'
    : '实时通道未连接，首页状态可能不完整'

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
              <p className="mt-1 text-sm text-white/30">{systemSummary}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <StatCard
              icon={<Radio className={cn('h-4 w-4', connected ? 'text-cyber-cyan' : 'text-cyber-red')} />}
              label="实时通道"
              value={connected ? '已连' : '断开'}
              valueColor={connected ? 'text-cyber-cyan' : 'text-cyber-red'}
            />
            <StatCard
              icon={<Wifi className={cn('h-4 w-4', gatewayConnected ? 'text-cyber-green' : 'text-cyber-red')} />}
              label="Gateway RPC"
              value={gatewayConnected ? '在线' : '离线'}
              valueColor={gatewayConnected ? 'text-cyber-green' : 'text-cyber-red'}
            />
            <StatCard
              icon={<ShieldCheck className={cn('h-4 w-4', gatewayRuntimeReady ? 'text-cyber-green' : gatewayRuntimeRunning ? 'text-cyber-amber' : 'text-white/25')} />}
              label="Gateway 进程"
              value={gatewayRuntimeReady ? '已就绪' : gatewayRuntimeRunning ? '待响应' : '未运行'}
              valueColor={gatewayRuntimeReady ? 'text-cyber-green' : gatewayRuntimeRunning ? 'text-cyber-amber' : 'text-white/45'}
            />
            <StatCard icon={<Zap className="h-4 w-4 text-cyber-purple" />} label="活跃 Agent" value={String(busyCount)} valueColor="text-cyber-purple" />
            <StatCard icon={<Waypoints className="h-4 w-4 text-cyber-cyan" />} label="活跃工作流" value={String(visibleWorkflowCount)} valueColor="text-cyber-cyan" />
            <StatCard icon={<ClipboardList className="h-4 w-4 text-cyber-amber" />} label="实时流" value={String(liveFeedItems.length)} valueColor="text-cyber-amber" />
          </div>
        </div>
      </div>

      <div className="group mb-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Building2 className="h-5 w-5 text-cyber-cyan" />
              工作室入口
            </h2>
            {teams.length > 0 ? <p className="mt-1 text-[10px] text-white/25">悬停展开全部工作室</p> : null}
          </div>
          {teams.length > 0 ? (
            <button
              onClick={() => navigate('/teams')}
              className="flex cursor-pointer items-center gap-1 text-xs text-white/25 transition-colors hover:text-white/50"
            >
              全部 <ArrowRight className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {teams.length === 0 ? (
          <div className="cartoon-card">
            <EmptyState scene="no-teams" className="py-8" />
          </div>
        ) : (
          <div className="cartoon-card overflow-hidden p-3 transition-all duration-300 group-hover:shadow-[0_14px_36px_rgba(56,189,248,0.12)]">
            <div className="flex h-[84px] items-stretch gap-3 overflow-x-auto overflow-y-hidden pb-1 pr-1">
              {teams.map((team) => (
                <TeamDoorRailCard key={team.id} team={team} onClick={() => navigate(`/teams/${team.id}`)} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.9fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-4">
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

          <div className="cartoon-card flex min-h-[420px] flex-col overflow-hidden p-4 sm:p-6 xl:min-h-[760px]">
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

        <div className="space-y-6 xl:pr-1">
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
    <div className="cartoon-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <Waypoints className="h-4 w-4 text-cyber-purple" />
            工作流状态
          </h2>
          <p className="mt-1 text-[10px] text-white/35">首页直接查看进行中、待审批和已启用的定时任务。</p>
        </div>
        <button
          type="button"
          onClick={onOpenWorkflows}
          className="flex cursor-pointer items-center gap-1 text-[10px] text-white/25 transition-colors hover:text-white/55"
        >
          打开 DAG <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">运行中</p>
            <span className="text-[10px] text-white/25">{activeSignalCount}</span>
          </div>
          {activeSignals.length === 0 ? (
            <div className="rounded-xl border border-white/6 bg-white/[0.03] px-3 py-4 text-[10px] text-white/30">当前没有运行中的工作流。</div>
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
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">已启用定时</p>
            <span className="text-[10px] text-white/25">{scheduledWorkflowCount}</span>
          </div>
          {scheduledWorkflows.length === 0 ? (
            <div className="rounded-xl border border-white/6 bg-white/[0.03] px-3 py-4 text-[10px] text-white/30">没有启用中的定时任务。</div>
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
      className="w-full rounded-xl border border-white/6 bg-white/[0.03] p-3 text-left transition hover:border-white/12 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase', toneClass)}>{signal.status}</span>
            <p className="truncate text-sm font-medium text-white/85">{title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] text-white/35">{summary || '运行中，但当前还没有更多上下文。'}</p>
        </div>
        <span className="text-[9px] text-white/20">{timeAgo(signal.updatedAt ?? new Date().toISOString())}</span>
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
      className="w-full rounded-xl border border-white/6 bg-white/[0.03] p-3 text-left transition hover:border-white/12 hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-cyber-cyan/20 bg-cyber-cyan/10 px-2 py-0.5 text-[9px] font-bold uppercase text-cyber-cyan">
              定时
            </span>
            <p className="truncate text-sm font-medium text-white/85">{workflow.name}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] text-white/35">
            {nextRunAt
              ? `下次执行 ${new Date(nextRunAt).toLocaleString()}`
              : `当前暂无可执行时间 · Cron: ${workflow.schedule?.cron ?? '未配置'}`}
            {windowLabel ? ` · 时间窗 ${windowLabel}` : ''}
          </p>
        </div>
        <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyber-cyan/70" />
      </div>
    </button>
  )
}

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
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <Zap className="h-4 w-4 text-cyber-amber" />
          实时事件流
        </h2>
        <button
          type="button"
          onClick={onOpenChat}
          className="flex cursor-pointer items-center gap-1 text-[10px] text-white/25 transition-colors hover:text-white/55"
        >
          通信频道 <ArrowRight className="h-3 w-3" />
        </button>
      </div>
      <div className="cartoon-card max-h-[320px] overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] text-white/35">消息 / 工作流 / 通知统一流</span>
          <span
            className={cn(
              'rounded-md border px-2 py-0.5 text-[9px] font-bold',
              gatewayConnected ? 'border-cyber-green/20 bg-cyber-green/10 text-cyber-green' : 'border-cyber-red/20 bg-cyber-red/10 text-cyber-red',
            )}
          >
            {gatewayLabel}
          </span>
        </div>

        {items.length === 0 ? (
          <EmptyState scene="no-events" className="py-6" />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <LiveFeedRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LiveFeedRow({ item }: { item: LiveFeedItem }) {
  return (
    <article className="rounded-xl border border-white/6 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]">
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
            <p className="truncate text-sm font-medium text-white/85">{item.title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] text-white/35">{item.summary}</p>
        </div>
        <span className="text-[9px] text-white/20">{timeAgo(item.timestamp)}</span>
      </div>
    </article>
  )
}

function TeamDoorRailCard({ team, onClick }: { team: TeamListItem; onClick: () => void }) {
  const hasActivity = (team.activeTaskCount ?? 0) > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex h-[72px] w-[216px] flex-none items-center gap-3 overflow-hidden rounded-xl border border-white/6 bg-white/[0.03] p-4 text-left transition-[width,transform,background-color,border-color] duration-200 hover:w-[280px] hover:translate-y-[-1px] hover:bg-white/[0.05]',
        hasActivity && 'border-cyber-amber/20'
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/5 transition-colors',
          hasActivity ? 'bg-cyber-amber/10' : 'bg-white/5'
        )}
      >
        <Building2 className={cn('h-4 w-4 transition-colors', hasActivity ? 'text-cyber-amber' : 'text-cyber-lavender/60')} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/80 transition-colors group-hover:text-white">{team.name}</p>
        <p className="mt-1 text-[10px] text-white/20">{team.memberCount} 成员</p>
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
