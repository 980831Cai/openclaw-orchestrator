import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock3, Filter, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { TeamAuditLog, TeamAuditResponse } from '@/types'

interface TeamAuditPanelProps {
  teamId: string
}

const ACTION_OPTIONS = [
  { value: 'all', label: '全部动作' },
  { value: 'team.create', label: '创建团队' },
  { value: 'team.update', label: '更新团队' },
  { value: 'team.member.add', label: '新增成员' },
  { value: 'team.schedule.update', label: '更新排班' },
  { value: 'workflow.create', label: '创建工作流' },
  { value: 'workflow.update', label: '更新工作流' },
  { value: 'workflow.execute', label: '执行工作流' },
  { value: 'approval.approve', label: '审批通过' },
  { value: 'approval.reject', label: '审批驳回' },
  { value: 'runtime.gateway.restart', label: '重启 Gateway' },
]

const RESOURCE_OPTIONS = [
  { value: 'all', label: '全部资源' },
  { value: 'team', label: '团队' },
  { value: 'team_member', label: '团队成员' },
  { value: 'team_schedule', label: '排班配置' },
  { value: 'team_execution_config', label: '执行配置' },
  { value: 'team_shared', label: '团队记忆' },
  { value: 'workflow', label: '工作流' },
  { value: 'workflow_execution', label: '工作流执行' },
  { value: 'approval', label: '审批' },
  { value: 'runtime_gateway', label: 'Gateway 运行时' },
]

const RESULT_OPTIONS = [
  { value: 'all', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
]

const RANGE_OPTIONS = [
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'custom', label: '自定义' },
]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatApiDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function toApiDate(value: string) {
  return value ? `${value.replace('T', ' ')}:00`.slice(0, 19) : ''
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function resolveWindow(range: string, startAt: string, endAt: string) {
  if (range === 'custom') return { startAt: toApiDate(startAt), endAt: toApiDate(endAt) }
  const now = new Date()
  const start = new Date(now)
  if (range === '24h') start.setHours(now.getHours() - 24)
  if (range === '7d') start.setDate(now.getDate() - 7)
  if (range === '30d') start.setDate(now.getDate() - 30)
  return { startAt: formatApiDate(start), endAt: formatApiDate(now) }
}

export function TeamAuditPanel({ teamId }: TeamAuditPanelProps) {
  const [action, setAction] = useState('all')
  const [resourceType, setResourceType] = useState('all')
  const [result, setResult] = useState('all')
  const [range, setRange] = useState('7d')
  const [query, setQuery] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [audit, setAudit] = useState<TeamAuditResponse>({ teamId, items: [], total: 0, limit: 80, offset: 0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: '80' })
      const windowRange = resolveWindow(range, startAt, endAt)
      if (action !== 'all') params.set('action', action)
      if (resourceType !== 'all') params.set('resourceType', resourceType)
      if (result === 'success') params.set('ok', 'true')
      if (result === 'failed') params.set('ok', 'false')
      if (query.trim()) params.set('query', query.trim())
      if (windowRange.startAt) params.set('startAt', windowRange.startAt)
      if (windowRange.endAt) params.set('endAt', windowRange.endAt)
      setLoading(true)
      setError('')
      api.get<TeamAuditResponse>(`/teams/${teamId}/audit?${params.toString()}`)
        .then((response) => {
          setAudit(response)
          setSelectedId((current) => (response.items.some((item) => item.id === current) ? current : response.items[0]?.id || null))
        })
        .catch((err: unknown) => {
          console.error('Failed to load team audit logs', err)
          setError(err instanceof Error ? err.message : '审计日志加载失败')
        })
        .finally(() => setLoading(false))
    }, query.trim() ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [action, endAt, query, range, reloadToken, resourceType, result, startAt, teamId])

  const selectedLog = useMemo(() => audit.items.find((item) => item.id === selectedId) || audit.items[0] || null, [audit.items, selectedId])
  const stats = useMemo(() => {
    const successCount = audit.items.filter((item) => item.ok).length
    const failedCount = audit.items.filter((item) => !item.ok).length
    const actors = new Set(audit.items.map((item) => item.actor)).size
    return { successCount, failedCount, actors }
  }, [audit.items])

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-fuchsia-400/12 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.18),transparent_28%),linear-gradient(160deg,rgba(15,23,42,0.96),rgba(2,6,23,0.9))] p-6 shadow-[0_25px_80px_rgba(15,23,42,0.4)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-fuchsia-300/80">Operational Audit Trail</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-50">关键变更留痕与结果追踪</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300/80">记录团队、工作流、审批与 Gateway 控制动作，支持按动作、资源、结果和关键字快速筛选。</p>
          </div>
          <Button type="button" variant="outline" className="border-white/10 bg-slate-950/50 text-slate-300 hover:bg-white/10" onClick={() => setReloadToken((value) => value + 1)}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> 刷新日志
          </Button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="border-white/10 bg-slate-950/60 text-slate-100"><Filter className="h-4 w-4 text-slate-500" /><SelectValue placeholder="动作" /></SelectTrigger>
            <SelectContent className="border-white/10 bg-slate-950 text-slate-100">{ACTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger className="border-white/10 bg-slate-950/60 text-slate-100"><ShieldCheck className="h-4 w-4 text-slate-500" /><SelectValue placeholder="资源" /></SelectTrigger>
            <SelectContent className="border-white/10 bg-slate-950 text-slate-100">{RESOURCE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="border-white/10 bg-slate-950/60 text-slate-100"><SelectValue placeholder="结果" /></SelectTrigger>
            <SelectContent className="border-white/10 bg-slate-950 text-slate-100">{RESULT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="border-white/10 bg-slate-950/60 text-slate-100"><Clock3 className="h-4 w-4 text-slate-500" /><SelectValue placeholder="时间" /></SelectTrigger>
            <SelectContent className="border-white/10 bg-slate-950 text-slate-100">{RANGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 actor / detail / resourceId" className="border-white/10 bg-slate-950/60 pl-9 text-slate-100 placeholder:text-slate-500" />
          </div>
        </div>

        {range === 'custom' && (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:max-w-[520px]">
            <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="border-white/10 bg-slate-950/60 text-slate-100" />
            <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="border-white/10 bg-slate-950/60 text-slate-100" />
          </div>
        )}

        {error && <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.28em] text-slate-400">日志总数</p><p className="mt-3 text-2xl font-semibold text-slate-50">{audit.total}</p></div>
          <div className="rounded-2xl border border-emerald-400/10 bg-emerald-500/6 p-4"><p className="text-xs uppercase tracking-[0.28em] text-slate-400">成功事件</p><p className="mt-3 text-2xl font-semibold text-emerald-200">{stats.successCount}</p></div>
          <div className="rounded-2xl border border-rose-400/10 bg-rose-500/6 p-4"><p className="text-xs uppercase tracking-[0.28em] text-slate-400">失败事件</p><p className="mt-3 text-2xl font-semibold text-rose-200">{stats.failedCount}</p></div>
          <div className="rounded-2xl border border-cyan-400/10 bg-cyan-500/6 p-4"><p className="text-xs uppercase tracking-[0.28em] text-slate-400">操作者</p><p className="mt-3 text-2xl font-semibold text-cyan-100">{stats.actors}</p></div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between px-2 pb-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">时间线列表</h4>
              <p className="mt-1 text-xs text-slate-400">按时间倒序展示关键操作，便于回看最近发生了什么。</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{loading ? '同步中' : `${audit.items.length} 条`}</span>
          </div>
          <ScrollArea className="h-[460px] pr-3">
            <div className="space-y-3">
              {loading && audit.items.length === 0 ? (
                <div className="px-4 py-16 text-center text-sm text-slate-400">正在加载审计时间线...</div>
              ) : audit.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-16 text-center text-sm text-slate-400">当前筛选条件下没有命中的操作日志。</div>
              ) : (
                audit.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'w-full rounded-2xl border p-4 text-left transition-colors',
                      selectedLog?.id === item.id ? 'border-cyan-300/40 bg-cyan-400/8' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{item.action}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.createdAt)} · {item.actor}</p>
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]', item.ok ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/20 bg-rose-500/10 text-rose-200')}>
                        {item.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {item.ok ? '成功' : '失败'}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">{item.detail || '本次操作未写入额外说明，建议结合 metadata 和 requestId 继续追踪。'}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{item.resourceType}</span>
                      {item.resourceId && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{item.resourceId}</span>}
                      {item.requestId && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">request {item.requestId}</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 backdrop-blur-xl">
          <div>
            <h4 className="text-sm font-semibold text-slate-100">审计详情</h4>
            <p className="mt-1 text-xs text-slate-400">展示操作者、资源标识、补充说明与结构化 metadata，方便追查问题链路。</p>
          </div>
          {!selectedLog ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-16 text-center text-sm text-slate-400">选择一条时间线记录后，会在这里展开完整详情。</div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-50">{selectedLog.action}</p>
                    <p className="mt-1 text-sm text-slate-400">{formatDateTime(selectedLog.createdAt)}</p>
                  </div>
                  <span className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs', selectedLog.ok ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/20 bg-rose-500/10 text-rose-200')}>
                    {selectedLog.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {selectedLog.ok ? '执行成功' : '执行失败'}
                  </span>
                </div>
                <Separator className="my-4 bg-white/10" />
                <div className="grid gap-4 text-sm text-slate-300 md:grid-cols-2">
                  <div><p className="text-xs uppercase tracking-[0.22em] text-slate-500">操作者</p><p className="mt-2 text-slate-100">{selectedLog.actor}</p></div>
                  <div><p className="text-xs uppercase tracking-[0.22em] text-slate-500">资源类型</p><p className="mt-2 text-slate-100">{selectedLog.resourceType}</p></div>
                  <div><p className="text-xs uppercase tracking-[0.22em] text-slate-500">资源标识</p><p className="mt-2 text-slate-100">{selectedLog.resourceId || '未附带资源 ID'}</p></div>
                  <div><p className="text-xs uppercase tracking-[0.22em] text-slate-500">请求追踪</p><p className="mt-2 text-slate-100">{selectedLog.requestId || '未附带 requestId'}</p></div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">操作说明</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">{selectedLog.detail || '该事件只记录了结构化上下文，没有补充文案。'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/90 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Metadata</p>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/30 p-4 text-xs leading-6 text-cyan-100">{JSON.stringify(selectedLog.metadata || {}, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
