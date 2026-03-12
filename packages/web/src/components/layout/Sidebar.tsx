import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Activity,
  Bot,
  Building2,
  Command,
  GitBranch,
  MessageSquare,
  Users,
} from 'lucide-react'
import { NotificationCenter } from '@/components/notification/NotificationCenter'
import { Logo } from '@/components/brand/Logo'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitor-store'

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
  const expanded = expandedProp ?? internalExpanded
  const setExpanded = onExpandedChange ?? setInternalExpanded
  const { connected, gatewayConnected } = useMonitorStore()

  return (
    <>
      {expanded ? <div className="fixed inset-0 z-30" onClick={() => setExpanded(false)} /> : null}

      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/5 bg-cyber-bg/95 py-4 backdrop-blur-sm transition-all duration-300',
          expanded ? 'w-[200px]' : 'w-[72px]'
        )}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="mb-6 flex items-center px-4">
          <div className="flex-shrink-0">
            <Logo size="md" showText={expanded} mood={connected ? 'happy' : 'worried'} animated />
          </div>
        </div>

        <div className="mx-4 mb-3 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

        <nav className="flex w-full flex-1 flex-col gap-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  'hover:bg-white/5',
                  isActive ? 'bg-white/5 text-white' : 'text-white/40 hover:text-white/70'
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
                  <item.icon className={cn('h-5 w-5 flex-shrink-0 transition-colors', isActive ? `text-${item.color}` : undefined)} />
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

        <div className="mt-auto w-full space-y-1 px-2">
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
            }}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/20 transition-colors hover:bg-white/5 hover:text-white/40"
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

          <div className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/30 transition-colors">
            <div className={cn('h-2 w-2 flex-shrink-0 rounded-full', connected ? 'bg-cyber-green animate-pulse' : 'bg-cyber-red')} />
            <span
              className={cn(
                'whitespace-nowrap text-xs transition-opacity duration-300',
                expanded ? 'opacity-100' : 'w-0 overflow-hidden opacity-0'
              )}
            >
              {connected ? (gatewayConnected ? '实时通道与 Gateway 已连接' : '实时通道已连接') : '未连接'}
            </span>
          </div>

          {expanded ? <div className="animate-fade-in py-1 text-center text-[9px] text-white/10">v0.1.0</div> : null}
        </div>
      </aside>
    </>
  )
}
