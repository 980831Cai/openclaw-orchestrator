import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Building2,
  Users,
  Bot,
  GitBranch,
  Activity,
  MessageSquare,
} from 'lucide-react'
import { NotificationCenter } from '@/components/notification/NotificationCenter'

const navItems = [
  { path: '/', label: '总部大厅', icon: Building2 },
  { path: '/agents', label: '人员档案', icon: Bot },
  { path: '/teams', label: '工作室', icon: Users },
  { path: '/workflows', label: '战术桌', icon: GitBranch },
  { path: '/monitor', label: '指挥中心', icon: Activity },
  { path: '/chat', label: '通信频道', icon: MessageSquare },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[72px] flex-col items-center border-r border-white/5 bg-cyber-bg py-4 transition-all duration-300 hover:w-[200px] group">
      <div className="mb-8 flex items-center justify-center">
        <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-cyber-purple to-cyber-violet flex items-center justify-center glow-purple">
          <span className="text-lg font-bold text-white">O</span>
          <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-cyber-green animate-pulse-slow" />
        </div>
        <span className="ml-3 text-sm font-semibold text-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          OpenClaw
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-2 w-full px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                'hover:bg-white/5',
                isActive
                  ? 'bg-gradient-to-r from-cyber-purple/20 to-cyber-violet/10 text-white glow-purple'
                  : 'text-white/50 hover:text-white/80'
              )
            }
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-2 w-full space-y-1">
        <NotificationCenter />
        <div className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/30 hover:text-white/60 cursor-pointer transition-colors">
          <div className="h-2 w-2 rounded-full bg-cyber-green animate-pulse" />
          <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
            已连接
          </span>
        </div>
      </div>
    </aside>
  )
}
