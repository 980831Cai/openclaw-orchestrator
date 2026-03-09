import { cn } from '@/lib/utils'
import type { AgentStatus } from '@/types'

interface AgentAvatarProps {
  emoji: string
  theme?: string
  status?: AgentStatus
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  onClick?: () => void
}

const sizeMap = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-lg',
  lg: 'w-16 h-16 text-2xl',
  xl: 'w-24 h-24 text-4xl',
}

const statusColors: Record<AgentStatus, string> = {
  idle: 'bg-gray-500',
  busy: 'bg-cyber-green',
  error: 'bg-cyber-red',
  offline: 'bg-gray-700',
}

const statusGlow: Record<AgentStatus, string> = {
  idle: '',
  busy: 'glow-green',
  error: 'glow-red',
  offline: '',
}

const statusAnimation: Record<AgentStatus, string> = {
  idle: 'animate-breathe',
  busy: 'animate-pulse-slow',
  error: 'animate-bounce',
  offline: '',
}

export function AgentAvatar({
  emoji,
  theme = '#6366F1',
  status = 'idle',
  size = 'md',
  className,
  onClick,
}: AgentAvatarProps) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-2xl cursor-pointer transition-all duration-300 hover:scale-110',
        sizeMap[size],
        statusAnimation[status],
        statusGlow[status],
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${theme}20, ${theme}40)`,
        border: `2px solid ${theme}60`,
      }}
      onClick={onClick}
    >
      <span className="select-none drop-shadow-lg">{emoji}</span>

      {/* Status indicator */}
      <div
        className={cn(
          'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-cyber-bg',
          statusColors[status],
          status === 'busy' && 'animate-pulse',
          size === 'sm' ? 'w-2.5 h-2.5' : size === 'md' ? 'w-3 h-3' : 'w-4 h-4'
        )}
      />

      {/* Busy typing bubble */}
      {status === 'busy' && size !== 'sm' && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-cyber-panel/90 border border-white/10 text-[10px] text-white/70 whitespace-nowrap animate-typing">
          <span className="inline-flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-cyber-green animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-cyber-green animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-cyber-green animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}

      {/* Error indicator */}
      {status === 'error' && size !== 'sm' && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-cyber-red text-sm font-bold animate-bounce">
          ⚠
        </div>
      )}
    </div>
  )
}
