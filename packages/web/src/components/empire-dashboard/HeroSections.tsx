import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { getRankTier, type HudStat, type RankedAgent } from './model'

interface DashboardHeroHeaderProps {
  title: string
  subtitle: string
  time: string
  date: string
  briefing: string
  reviewQueue: number
  primaryCtaLabel: string
  primaryCtaDescription: string
  onPrimaryCtaClick: () => void
}

export function DashboardHeroHeader({
  title,
  subtitle,
  time,
  date,
  briefing,
  reviewQueue,
  primaryCtaLabel,
  primaryCtaDescription,
  onPrimaryCtaClick,
}: DashboardHeroHeaderProps) {
  return (
    <div className="game-panel relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)]" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="dashboard-title-gradient text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              LIVE
            </span>
          </div>
          <p className="text-xs text-white/55">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.06] px-4 py-2">
            <span className="text-xs text-cyan-400/60">🕒</span>
            <span className="dashboard-time-display font-mono text-xl font-bold tracking-tight">{time}</span>
          </div>
          <div className="hidden flex-col gap-1 sm:flex">
            <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-400">{date}</span>
            <span className="rounded-md border border-cyan-400/20 bg-cyan-500/[0.06] px-2 py-0.5 text-[10px] text-cyan-300">{briefing}</span>
          </div>
          {reviewQueue > 0 ? (
            <span className="animate-neon-pulse-orange flex items-center gap-1.5 rounded-lg border border-orange-400/30 bg-orange-500/15 px-3 py-1.5 text-xs font-bold text-orange-300">
              🔔 待处理 {reviewQueue}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative mt-4 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 via-blue-500/15 to-emerald-500/20 p-4 shadow-[0_0_20px_rgba(34,211,238,0.12)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/85">快速入口</p>
            <p className="mt-1 text-xs text-white/85 sm:text-sm">{primaryCtaDescription}</p>
          </div>
          <button
            type="button"
            onClick={onPrimaryCtaClick}
            className="animate-cta-glow group inline-flex w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-3 text-sm font-black tracking-tight text-white shadow-[0_4px_20px_rgba(34,211,238,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:from-cyan-400 hover:to-blue-400 hover:shadow-[0_8px_30px_rgba(34,211,238,0.5)] active:translate-y-0 sm:w-auto sm:min-w-[200px]"
          >
            <span aria-hidden="true">🚪</span>
            <span>{primaryCtaLabel}</span>
            <span className="text-xs text-white/80 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  )
}

interface DashboardHudStatsProps {
  hudStats: HudStat[]
  numberFormatter: Intl.NumberFormat
}

export function DashboardHudStats({ hudStats, numberFormatter }: DashboardHudStatsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {hudStats.map((stat) => (
        <div
          key={stat.id}
          className="game-panel group relative overflow-hidden p-4 transition-all duration-300 hover:-translate-y-0.5"
          style={{ borderColor: `${stat.color}25` }}
        >
          <div className="absolute left-0 right-0 top-0 h-[2px] opacity-60" style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/45">{stat.label}</p>
              <p className="mt-1 text-3xl font-black tracking-tight" style={{ color: stat.color, textShadow: `0 0 20px ${stat.color}40` }}>
                {typeof stat.value === 'number' ? numberFormatter.format(stat.value) : stat.value}
              </p>
              <p className="mt-0.5 text-[10px] text-white/45">{stat.sub}</p>
            </div>
            <span className="text-3xl opacity-20 transition-all duration-300 group-hover:scale-110 group-hover:opacity-40" style={{ filter: `drop-shadow(0 0 8px ${stat.color}40)` }}>
              {stat.icon}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

interface ActivityRankingBoardProps {
  agents: RankedAgent[]
  numberFormatter: Intl.NumberFormat
}

export function ActivityRankingBoard({ agents, numberFormatter }: ActivityRankingBoardProps) {
  return (
    <div className="game-panel relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-500/[0.03] via-transparent to-transparent" />
      <div className="relative mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="animate-crown-wiggle text-2xl" style={{ display: 'inline-block', filter: 'drop-shadow(0 0 8px rgba(255,215,0,0.5))' }}>👑</span>
          <div>
            <h2 className="dashboard-ranking-gradient text-lg font-black uppercase tracking-wider">ACTIVE BOARD</h2>
            <p className="text-[10px] text-white/45">按当前活跃度排序的 Agent 榜单</p>
          </div>
        </div>
        <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold text-slate-400">TOP {agents.length}</span>
      </div>

      {agents.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-sm text-white/45">
          <span className="text-4xl opacity-30">🛰️</span>
          <p>暂无在线 Agent</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent, index) => {
            const tier = getRankTier(agent.score)
            return (
              <div
                key={agent.id}
                className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-200 hover:translate-x-1 hover:bg-white/[0.05]"
                style={{ borderLeftWidth: '3px', borderLeftColor: `${tier.color}60` }}
              >
                <span className="w-8 text-center font-mono text-sm font-black" style={{ color: `${tier.color}88` }}>#{index + 1}</span>
                <div className="flex-shrink-0 overflow-hidden rounded-2xl" style={{ border: `2px solid ${tier.color}50`, boxShadow: `0 0 14px ${tier.glow}` }}>
                  <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white/90">{agent.name}</p>
                  <p className="truncate text-[10px] text-white/45">{agent.currentTask || '当前无显式任务，处于待命或监听状态'}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-bold" style={{ color: tier.color }}>{numberFormatter.format(agent.score)} 活跃值</p>
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider"
                    style={{ background: tier.glow, color: tier.color, border: `1px solid ${tier.color}50`, boxShadow: `0 0 8px ${tier.glow}` }}
                  >
                    {tier.icon} {tier.name}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
