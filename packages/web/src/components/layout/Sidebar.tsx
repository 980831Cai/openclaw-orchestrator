import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Activity,
  Bot,
  Building2,
  Command,
  GitBranch,
  Loader2,
  MessageSquare,
  RotateCcw,
  Square,
  Users,
  Zap,
} from 'lucide-react'
import { NotificationCenter } from '@/components/notification/NotificationCenter'
import { Logo } from '@/components/brand/Logo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { getGatewayRuntimeActions } from '@/lib/gateway-runtime-controls'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitor-store'
import type { GatewayRuntimeStatus } from '@/types'
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from './layout-shell'

const navItems = [
  { path: '/', label: '总部大厅', icon: Building2, color: 'cyber-purple' },
  { path: '/agents', label: '人员档案', icon: Bot, color: 'cyber-violet' },
  { path: '/teams', label: '工作室', icon: Users, color: 'cyber-cyan' },
  { path: '/workflows', label: '战术桌', icon: GitBranch, color: 'cyber-amber' },
  { path: '/monitor', label: '指挥中心', icon: Activity, color: 'cyber-green' },
  { path: '/chat', label: '通信频道', icon: MessageSquare, color: 'cyber-blue' },
] as const

interface SidebarProps {
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

export function Sidebar({ expanded: expandedProp, onExpandedChange }: SidebarProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const [gatewayRuntime, setGatewayRuntime] = useState<GatewayRuntimeStatus | null>(null)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeActionError, setRuntimeActionError] = useState<string | null>(null)
  const expanded = expandedProp ?? internalExpanded
  const setExpanded = onExpandedChange ?? setInternalExpanded
  const { connected, gatewayConnected } = useMonitorStore()

  const loadGatewayRuntime = useCallback(async () => {
    try {
      const status = await api.get<GatewayRuntimeStatus>('/runtime/gateway')
      setGatewayRuntime(status)
    } catch (error) {
      console.error('Failed to load gateway runtime status', error)
    }
  }, [])

  useEffect(() => {
    void loadGatewayRuntime()
  }, [loadGatewayRuntime])

  useEffect(() => {
    if (!expanded) {
      return
    }
    void loadGatewayRuntime()
  }, [expanded, loadGatewayRuntime])

  const runGatewayAction = useCallback(
    async (action: 'start' | 'stop' | 'restart') => {
      setRuntimeBusy(true)
      try {
        const result = await api.post<GatewayRuntimeStatus>(`/runtime/gateway/${action}`)
        setGatewayRuntime(result)
        setRuntimeActionError(null)
        toast({
          title:
            action === 'start' ? 'Gateway 已发起启动' : action === 'stop' ? 'Gateway 已发起停止' : 'Gateway 已发起重启',
          description: result.message || `当前目标 ${result.host}:${result.port}`,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gateway 操作失败'
        setRuntimeActionError(message)
        toast({
          title: 'Gateway 操作失败',
          description: message,
          variant: 'destructive',
        })
      } finally {
        setRuntimeBusy(false)
        void loadGatewayRuntime()
      }
    },
    [loadGatewayRuntime],
  )

  const realtimeOk = connected
  const gatewayRpcOk = gatewayConnected
  const localProcessOk = gatewayRuntime?.running ?? false
  const runtimeActions = getGatewayRuntimeActions(gatewayRuntime, runtimeBusy)
  const allHealthy = realtimeOk && gatewayRpcOk && localProcessOk
  const overallTone: 'green' | 'amber' | 'red' = !realtimeOk ? 'red' : allHealthy ? 'green' : 'amber'
  const overallLabel =
    overallTone === 'green' ? '系统状态正常' : overallTone === 'red' ? '实时通道断开' : '部分服务未就绪'

  return (
    <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col overflow-y-auto border-r border-white/[0.06] py-4 transition-all duration-300 ease-out',
        )}
        style={{
          width: expanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
          background: 'linear-gradient(180deg, rgba(11, 15, 25, 0.97) 0%, rgba(11, 15, 25, 0.99) 100%)',
          backdropFilter: 'blur(24px)',
        }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="mb-6 flex items-center px-4">
          <div className="flex-shrink-0">
            <Logo size="md" showText={expanded} mood={connected ? 'happy' : 'worried'} animated />
          </div>
        </div>

        <div className="mx-4 mb-3 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

        <nav className="flex w-full flex-1 flex-col gap-0.5 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  'hover:bg-white/[0.04]',
                  isActive ? 'bg-white/[0.06] text-white/90' : 'text-white/35 hover:text-white/65'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <div
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all"
                      style={{ backgroundColor: `var(--color-${item.color}, #6366F1)` }}
                    />
                  ) : null}
                  <item.icon className={cn('h-[18px] w-[18px] flex-shrink-0 transition-colors', isActive ? `text-${item.color}` : undefined)} />
                  <span
                    className={cn(
                      'whitespace-nowrap transition-all duration-300',
                      expanded ? 'opacity-100' : 'w-0 overflow-hidden opacity-0'
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto w-full space-y-0.5 px-2">
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
            }}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/20 transition-colors hover:bg-white/[0.04] hover:text-white/40"
          >
            <Command className="h-3.5 w-3.5 flex-shrink-0" />
            <span
              className={cn(
                'whitespace-nowrap text-[10px] transition-opacity duration-300',
                expanded ? 'opacity-100' : 'w-0 overflow-hidden opacity-0'
              )}
            >
              搜索 ⌘K
            </span>
          </button>

          <NotificationCenter />

          <OverallStatus
            expanded={expanded}
            tone={overallTone}
            label={overallLabel}
            detailItems={[
              {
                key: 'realtime',
                label: '实时通道',
                active: realtimeOk,
                activeLabel: '已连接',
                inactiveLabel: '未连接',
              },
              {
                key: 'gateway',
                label: 'Gateway RPC',
                active: gatewayRpcOk,
                activeLabel: '已连接',
                inactiveLabel: '未连接',
              },
              {
                key: 'runtime',
                label: '本机进程',
                active: localProcessOk,
                activeLabel: '运行中',
                inactiveLabel: '未运行',
              },
            ]}
          />

          {expanded ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-[10px] text-white/45">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white/70">{gatewayRuntime?.gatewayUrl ?? '等待读取 Gateway 配置'}</p>
                  <p className="mt-1 truncate text-white/25">
                    {gatewayRuntime?.host && gatewayRuntime?.port
                      ? `${gatewayRuntime.host}:${gatewayRuntime.port}`
                      : '尚未获取目标端口'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadGatewayRuntime()}
                  className="rounded-md border border-white/[0.06] px-2 py-1 text-[10px] text-white/35 transition hover:border-white/10 hover:text-white/65"
                  disabled={runtimeBusy}
                >
                  刷新
                </button>
              </div>

              {gatewayRuntime?.message ? <p className="mt-2 text-white/30">{gatewayRuntime.message}</p> : null}
              {runtimeActionError ? (
                <div className="mt-2 whitespace-pre-wrap rounded-lg border border-cyber-red/15 bg-cyber-red/[0.06] px-2.5 py-2 text-[10px] leading-5 text-cyber-red/85">
                  {runtimeActionError}
                </div>
              ) : null}
              {gatewayRuntime?.logTail ? (
                <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    最近运行日志
                  </p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-white/60">
                    {gatewayRuntime.logTail}
                  </pre>
                </div>
              ) : null}
              {gatewayRuntime?.errorLogTail ? (
                <div className="mt-2 rounded-lg border border-cyber-amber/10 bg-black/20 px-2.5 py-2">
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyber-amber/65">
                    最近错误日志
                  </p>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-cyber-amber/80">
                    {gatewayRuntime.errorLogTail}
                  </pre>
                </div>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                {runtimeActions
                  .filter((action) => action.visible)
                  .map((action) => (
                    <ActionButton
                      key={action.action}
                      icon={
                        runtimeBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : action.action === 'start' ? (
                          <Zap className="h-3.5 w-3.5" />
                        ) : action.action === 'stop' ? (
                          <Square className="h-3.5 w-3.5" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )
                      }
                      label={action.label}
                      onClick={() => void runGatewayAction(action.action)}
                      disabled={action.disabled}
                    />
                  ))}
              </div>
            </div>
          ) : null}

          {expanded ? <div className="animate-fade-in py-1 text-center text-[9px] text-white/[0.08]">v0.1.0</div> : null}
        </div>
      </aside>
  )
}

function OverallStatus({
  expanded,
  tone,
  label,
  detailItems,
}: {
  expanded: boolean
  tone: 'green' | 'amber' | 'red'
  label: string
  detailItems: Array<{
    key: string
    label: string
    active: boolean
    activeLabel: string
    inactiveLabel: string
  }>
}) {
  const toneClass =
    tone === 'green' ? 'bg-cyber-green' : tone === 'amber' ? 'bg-cyber-amber' : 'bg-cyber-red'

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyber-purple/40"
            aria-label="系统状态明细"
          >
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', toneClass)} />
            <span
              className={cn(
                'whitespace-nowrap text-xs transition-opacity duration-300',
                expanded ? 'opacity-100' : 'w-0 overflow-hidden opacity-0'
              )}
            >
              {label}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="end"
          sideOffset={8}
          className="w-56 border-white/[0.08] bg-cyber-surface/95 p-3 text-white/85 backdrop-blur-2xl"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">状态明细</p>
          <div className="space-y-2">
            {detailItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 flex-shrink-0 rounded-full',
                      item.active ? 'bg-cyber-green' : 'bg-cyber-red'
                    )}
                  />
                  <span className="text-white/75">{item.label}</span>
                </div>
                <span className={cn('text-[11px]', item.active ? 'text-cyber-green/90' : 'text-cyber-red/90')}>
                  {item.active ? item.activeLabel : item.inactiveLabel}
                </span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 text-[10px] font-medium text-white/55 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
