import { Logo } from './Logo'
import { cn } from '@/lib/utils'

type EmptyScene =
  | 'no-agents'
  | 'no-teams'
  | 'no-workflows'
  | 'no-messages'
  | 'no-events'
  | 'no-tasks'
  | 'no-results'
  | 'loading'
  | 'error'
  | 'disconnected'

interface EmptyStateProps {
  scene: EmptyScene
  title?: string
  description?: string
  className?: string
  action?: React.ReactNode
}

const sceneConfig: Record<EmptyScene, {
  mood: 'happy' | 'working' | 'worried' | 'waving'
  defaultTitle: string
  defaultDesc: string
  emoji?: string
}> = {
  'no-agents': {
    mood: 'waving',
    defaultTitle: '还没有 Agent',
    defaultDesc: '创建你的第一个 AI Agent 吧！',
    emoji: '🔍',
  },
  'no-teams': {
    mood: 'waving',
    defaultTitle: '还没有工作室',
    defaultDesc: '创建一个工作室来组织你的 Agent 团队',
    emoji: '🏢',
  },
  'no-workflows': {
    mood: 'happy',
    defaultTitle: '还没有工作流',
    defaultDesc: '创建工作流来编排 Agent 协作任务',
    emoji: '🔀',
  },
  'no-messages': {
    mood: 'happy',
    defaultTitle: '暂无消息',
    defaultDesc: '选择一个 Agent 开始对话',
    emoji: '💬',
  },
  'no-events': {
    mood: 'happy',
    defaultTitle: '等待事件...',
    defaultDesc: 'Agent 活动时这里会实时显示事件流',
    emoji: '📡',
  },
  'no-tasks': {
    mood: 'happy',
    defaultTitle: '暂无任务',
    defaultDesc: '当前没有进行中的任务',
    emoji: '📋',
  },
  'no-results': {
    mood: 'worried',
    defaultTitle: '没有找到结果',
    defaultDesc: '试试换个关键词搜索',
    emoji: '🔎',
  },
  'loading': {
    mood: 'working',
    defaultTitle: '加载中...',
    defaultDesc: '正在获取数据',
  },
  'error': {
    mood: 'worried',
    defaultTitle: '出错了',
    defaultDesc: '请稍后重试或检查网络连接',
    emoji: '⚠️',
  },
  'disconnected': {
    mood: 'worried',
    defaultTitle: '未连接',
    defaultDesc: 'OpenClaw Gateway 连接断开',
    emoji: '🔌',
  },
}

export function EmptyState({
  scene,
  title,
  description,
  className,
  action,
}: EmptyStateProps) {
  const config = sceneConfig[scene]

  return (
    <div className={cn('flex flex-col items-center justify-center py-12 animate-fade-in', className)}>
      {/* Logo mascot */}
      <div className="relative mb-4">
        <Logo size="xl" mood={config.mood} animated />

        {/* Floating emoji */}
        {config.emoji && (
          <div className="absolute -top-2 -right-3 text-lg animate-cartoon-bob" style={{ animationDelay: '0.5s' }}>
            {config.emoji}
          </div>
        )}
      </div>

      {/* Text */}
      <h3 className="text-white/50 text-base font-semibold mb-1">
        {title || config.defaultTitle}
      </h3>
      <p className="text-white/20 text-[13px] max-w-[280px] text-center leading-relaxed">
        {description || config.defaultDesc}
      </p>

      {/* Optional action button */}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  )
}
