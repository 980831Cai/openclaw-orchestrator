import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, Bot, Coins, Gauge, RefreshCw, Sparkles, TimerReset, Workflow } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type {
  TeamMember,
  TeamUsageAgentBreakdownItem,
  TeamUsageBreakdownResponse,
  TeamUsageModelBreakdownItem,
  TeamUsageSummary,
  TeamUsageTrendResponse,
  TeamUsageWorkflowBreakdownItem,
} from '@/types'

interface TeamUsagePanelProps {
  teamId: string
  members: TeamMember[]
}

interface BreakdownListItem {
  key: string
  label: string
  secondary: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  avgDurationMs: number
  estimatedCostUsd: number
}

const RANGE_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
]

const CHART_COLORS = {
  prompt: '#22D3EE',
  completion: '#8B5CF6',
  total: '#F59E0B',
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value > 0.99 ? 0 : 1)}%`
}

function formatCost(value: number) {
  return `$${value.toFixed(value >= 10 ? 2 : 4)}`
}

function formatDuration(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

function MetricCard({ title, value, hint, icon }: { title: string; value: string; hint: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.9),rgba(17,24,39,0.68))] p-4 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.28em] text-slate-400">{title}</span>
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/8 p-2 text-cyan-300">{icon}</div>
      </div>
      <div className="mt-4 text-2xl font-semibold text-slate-50">{value}</div>
      <p className="mt-2 text-xs leading-5 text-slate-400">{hint}</p>
    </div>
  )
}

function BreakdownPanel({ title, items, accent }: { title: string; items: BreakdownListItem[]; accent: string }) {
  const total = items.reduce((sum, item) => sum + item.totalTokens, 0)
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">{title}</h4>
          <p className="mt-1 text-xs text-slate-400">聚焦近一周期消耗贡献最高的执行主体</p>
        </div>
        <div className={cn('h-2 w-16 rounded-full bg-gradient-to-r', accent)} />
      </div>
      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-slate-400">
            当前时间窗内还没有可展示的执行消耗。
          </div>
        ) : (
          items.map((item, index) => {
            const share = total > 0 ? item.totalTokens / total : 0
            return (
              <div key={item.key} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs text-slate-300">
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-100">{item.label}</p>
                        <p className="text-xs text-slate-400">{item.secondary}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-50">{formatNumber(item.totalTokens)} tokens</p>
                    <p className="text-xs text-slate-400">{formatCost(item.estimatedCostUsd)}</p>
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/6">
                  <div className={cn('h-full rounded-full bg-gradient-to-r', accent)} style={{ width: `${Math.max(share * 100, 8)}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] text-slate-400">
                  <span>输入 {formatNumber(item.promptTokens)}</span>
                  <span>输出 {formatNumber(item.completionTokens)}</span>
                  <span>均时 {formatDuration(item.avgDurationMs)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function TeamUsagePanel({ teamId, members }: TeamUsagePanelProps) {
  const [days, setDays] = useState(7)
  const [reloadToken, setReloadToken] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<TeamUsageSummary | null>(null)
  const [trend, setTrend] = useState<TeamUsageTrendResponse['items']>([])
  const [modelBreakdown, setModelBreakdown] = useState<TeamUsageModelBreakdownItem[]>([])
  const [agentBreakdown, setAgentBreakdown] = useState<TeamUsageAgentBreakdownItem[]>([])
  const [workflowBreakdown, setWorkflowBreakdown] = useState<TeamUsageWorkflowBreakdownItem[]>([])

  const memberNameMap = useMemo(() => new Map(members.map((member) => [member.agentId, member.name || member.agentId])), [members])
  const chartData = useMemo(() => trend.map((item) => ({ ...item, label: item.date.slice(5).replace('-', '/') })), [trend])
  const breakdownSections = useMemo(
    () => [
      {
        title: '模型消耗榜',
        accent: 'from-cyan-400 via-sky-400 to-purple-500',
        items: modelBreakdown.map<BreakdownListItem>((item) => ({
          key: item.model,
          label: item.model,
          secondary: `${item.executionCount} 次执行 · ${formatCost(item.estimatedCostUsd)}`,
          totalTokens: item.totalTokens,
          promptTokens: item.promptTokens,
          completionTokens: item.completionTokens,
          avgDurationMs: item.avgDurationMs,
          estimatedCostUsd: item.estimatedCostUsd,
        })),
      },
      {
        title: 'Agent 拆分',
        accent: 'from-violet-500 via-fuchsia-500 to-cyan-400',
        items: agentBreakdown.map<BreakdownListItem>((item) => ({
          key: item.agentId,
          label: memberNameMap.get(item.agentId) || item.agentId || '未知 Agent',
          secondary: `${item.agentId || '未绑定'} · ${item.executionCount} 次执行`,
          totalTokens: item.totalTokens,
          promptTokens: item.promptTokens,
          completionTokens: item.completionTokens,
          avgDurationMs: item.avgDurationMs,
          estimatedCostUsd: item.estimatedCostUsd,
        })),
      },
      {
        title: '工作流拆分',
        accent: 'from-amber-400 via-orange-400 to-pink-500',
        items: workflowBreakdown.map<BreakdownListItem>((item) => ({
          key: item.workflowId,
          label: item.workflowName,
          secondary: `${item.executionCount} 次执行 · ${formatCost(item.estimatedCostUsd)}`,
          totalTokens: item.totalTokens,
          promptTokens: item.promptTokens,
          completionTokens: item.completionTokens,
          avgDurationMs: item.avgDurationMs,
          estimatedCostUsd: item.estimatedCostUsd,
        })),
      },
    ],
    [agentBreakdown, memberNameMap, modelBreakdown, workflowBreakdown]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      api.get<TeamUsageSummary>(`/teams/${teamId}/usage/summary?days=${days}`),
      api.get<TeamUsageTrendResponse>(`/teams/${teamId}/usage/trend?days=${days}`),
      api.get<TeamUsageBreakdownResponse<TeamUsageModelBreakdownItem>>(`/teams/${teamId}/usage/breakdown?dimension=model&days=${days}&limit=6`),
      api.get<TeamUsageBreakdownResponse<TeamUsageAgentBreakdownItem>>(`/teams/${teamId}/usage/breakdown?dimension=agent&days=${days}&limit=6`),
      api.get<TeamUsageBreakdownResponse<TeamUsageWorkflowBreakdownItem>>(`/teams/${teamId}/usage/breakdown?dimension=workflow&days=${days}&limit=6`),
    ])
      .then(([nextSummary, nextTrend, nextModel, nextAgent, nextWorkflow]) => {
        if (cancelled) return
        setSummary(nextSummary)
        setTrend(nextTrend.items)
        setModelBreakdown(nextModel.items)
        setAgentBreakdown(nextAgent.items)
        setWorkflowBreakdown(nextWorkflow.items)
      })
      .catch((err: unknown) => {
        console.error('Failed to load team usage dashboard', err)
        if (!cancelled) setError(err instanceof Error ? err.message : '团队用量加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days, reloadToken, teamId])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),linear-gradient(160deg,rgba(15,23,42,0.96),rgba(2,6,23,0.9))] p-6 shadow-[0_25px_80px_rgba(15,23,42,0.38)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-300/80">Team Usage Console</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-50">团队级模型消耗与执行覆盖驾驶舱</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300/80">
              从团队主视角观察执行吞吐、成功率、Token 消耗和预估成本，并继续下钻到模型、Agent、工作流三个层次。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                onClick={() => setDays(option.value)}
                className={cn(
                  'border-white/10 bg-slate-950/50 text-slate-300 hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-100',
                  days === option.value && 'border-cyan-300/70 bg-cyan-400/12 text-cyan-100'
                )}
              >
                {option.label}
              </Button>
            ))}
            <Button type="button" variant="outline" className="border-white/10 bg-slate-950/50 text-slate-300 hover:bg-white/10" onClick={() => setReloadToken((value) => value + 1)}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> 刷新数据
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard title="执行次数" value={formatNumber(summary?.executionCount || 0)} hint={`时间窗：${days} 天`} icon={<Activity className="h-4 w-4" />} />
          <MetricCard title="成功率" value={formatPercent(summary?.successRate || 0)} hint={`成功 ${formatNumber(summary?.successCount || 0)} 次`} icon={<Gauge className="h-4 w-4" />} />
          <MetricCard title="平均耗时" value={formatDuration(summary?.avgDurationMs || 0)} hint="跨执行聚合后的平均完成时长" icon={<TimerReset className="h-4 w-4" />} />
          <MetricCard title="总 Token" value={formatNumber(summary?.totalTokens || 0)} hint={`输入 ${formatNumber(summary?.promptTokens || 0)} / 输出 ${formatNumber(summary?.completionTokens || 0)}`} icon={<Sparkles className="h-4 w-4" />} />
          <MetricCard title="预估成本" value={formatCost(summary?.estimatedCostUsd || 0)} hint="仅统计当前时间窗已采集执行" icon={<Coins className="h-4 w-4" />} />
          <MetricCard title="覆盖率" value={formatPercent(summary?.coverageRate || 0)} hint={`已覆盖 ${formatNumber(summary?.coveredExecutionCount || 0)} 次执行`} icon={<Bot className="h-4 w-4" />} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">Token 趋势</h4>
              <p className="mt-1 text-xs text-slate-400">按日观察输入输出 Token 与执行波峰，快速识别团队资源高负载时段。</p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{days} 天窗口</div>
          </div>
          <div className="mt-5 h-[320px]">
            {loading && chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">正在汇总执行样本...</div>
            ) : chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-400">暂无趋势数据，待团队开始执行后会自动点亮曲线。</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="promptGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.prompt} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={CHART_COLORS.prompt} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="completionGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.completion} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_COLORS.completion} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                  <XAxis dataKey="label" stroke="rgba(148,163,184,0.6)" tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(148,163,184,0.6)" tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    contentStyle={{ background: 'rgba(2,6,23,0.96)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '16px' }}
                    labelStyle={{ color: '#e2e8f0' }}
                    formatter={(value: number, name: string) => [formatNumber(value), name === 'promptTokens' ? '输入 Token' : name === 'completionTokens' ? '输出 Token' : '总 Token']}
                  />
                  <Area type="monotone" dataKey="promptTokens" stackId="tokens" stroke={CHART_COLORS.prompt} fill="url(#promptGradient)" strokeWidth={2} />
                  <Area type="monotone" dataKey="completionTokens" stackId="tokens" stroke={CHART_COLORS.completion} fill="url(#completionGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-amber-200">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-100">运行窗口解读</h4>
              <p className="mt-1 text-xs text-slate-400">让团队负责人快速判断当前消耗是否健康。</p>
            </div>
          </div>
          <div className="mt-5 space-y-4 text-sm text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">覆盖质量</p>
              <p className="mt-2 text-lg font-semibold text-slate-50">{formatPercent(summary?.coverageRate || 0)}</p>
              <p className="mt-2 leading-6 text-slate-400">已经为 {formatNumber(summary?.coveredExecutionCount || 0)} 次执行采到模型用量，可据此判断当前成本结论的可信度。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">吞吐观察</p>
              <p className="mt-2 text-lg font-semibold text-slate-50">{formatNumber(summary?.executionCount || 0)} 次</p>
              <p className="mt-2 leading-6 text-slate-400">将执行次数与 Agent、工作流榜单联动，可以快速看出是某个战术流过热，还是团队整体负载抬升。</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">成本阈值</p>
              <p className="mt-2 text-lg font-semibold text-slate-50">{formatCost(summary?.estimatedCostUsd || 0)}</p>
              <p className="mt-2 leading-6 text-slate-400">结合模型榜查看高成本来源，适合排查长输出、重复执行或策略切换造成的费用波动。</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {breakdownSections.map((section) => (
          <BreakdownPanel key={section.title} title={section.title} accent={section.accent} items={section.items} />
        ))}
      </div>
    </div>
  )
}
