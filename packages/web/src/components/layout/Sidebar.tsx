import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Building2,
  Users,
  Bot,
  GitBranch,
  Activity,
  MessageSquare,
  Command,
} from 'lucide-react'
import { NotificationCenter } from '@/components/notification/NotificationCenter'
import { Logo } from '@/components/brand/Logo'
import { useMonitorStore } from '@/stores/monitor-store'

const navItems = [
  { path: '/', label: '总部大厅', icon: Building2, color: 'cyber-purple' },
  { path: '/agents', label: '人员档案', icon: Bot, color: 'cyber-violet' },
  { path: '/teams', label: '工作室', icon: Users, color: 'cyber-cyan' },
  { path: '/workflows', label: '战术桌', icon: GitBranch, color: 'cyber-amber' },
  { path: '/monitor', label: '指挥中心', icon: Activity, color: 'cyber-green' },
  { path: '/chat', label: '通信频道', icon: MessageSquare, color: 'cyber-blue' },
]

export function Sidebar() {
  const [expanded, setExpanded] = useState(false)
  const { connected } = useMonitorStore()

  return (
    <>
      {/* Backdrop when expanded */}
      {expanded && (
        <div className="fixed inset-0 z-30" onClick={() => setExpanded(false)} />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/5 bg-cyber-bg/95 backdrop-blur-sm py-4 transition-all duration-300',
          expanded ? 'w-[200px]' : 'w-[72px]'
        )}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Logo area */}
        <div className="mb-6 flex items-center px-4">
          <div className="flex-shrink-0">
            <Logo
              size="md"
              showText={expanded}
              mood={connected ? 'happy' : 'worried'}
              animated
            />
          </div>
        </div>

        {/* Separator */}
        <div className="mx-4 mb-3 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 w-full px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  'hover:bg-white/5',
                  isActive
                    ? 'bg-white/5 text-white'
                    : 'text-white/40 hover:text-white/70'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator bar */}
                  {isActive && (
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full transition-all"
                      style={{ backgroundColor: `var(--color-${item.color}, #6366F1)` }}
                    />
                  )}
                  <item.icon className={cn(
                    'h-5 w-5 flex-shrink-0 transition-colors',
                    isActive && `text-${item.color}`
                  )} />
                  <span className={cn(
                    'transition-all duration-300 whitespace-nowrap',
                    expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                  )}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom area */}
        <div className="mt-auto px-2 w-full space-y-1">
          {/* Command palette hint */}
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/20 hover:text-white/40 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <Command className="h-3.5 w-3.5 flex-shrink-0" />
            <span className={cn(
              'text-[10px] transition-opacity duration-300 whitespace-nowrap',
              expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
            )}>
              搜索  ⌘K
            </span>
          </button>

          {/* Notification */}
          <NotificationCenter />

          {/* Connection status */}
          <div className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/30 transition-colors">
            <div className={cn(
              'h-2 w-2 rounded-full flex-shrink-0',
              connected ? 'bg-cyber-green animate-pulse' : 'bg-cyber-red'
            )} />
            <span className={cn(
              'text-xs transition-opacity duration-300 whitespace-nowrap',
              expanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
            )}>
              {connected ? 'Gateway 已连接' : '未连接'}
            </span>
          </div>

          {/* Version */}
          {expanded && (
            <div className="text-center text-white/10 text-[9px] py-1 animate-fade-in">
              v0.1.0
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
