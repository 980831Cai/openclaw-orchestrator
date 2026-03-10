import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Bot, Users, GitBranch, Activity,
  MessageSquare, Building2, ArrowRight, Command,
} from 'lucide-react'
import { useAgentStore } from '@/stores/agent-store'
import { useTeamStore } from '@/stores/team-store'
import { cn } from '@/lib/utils'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  path: string
  category: 'navigation' | 'agent' | 'team' | 'workflow'
}

const NAV_ITEMS: CommandItem[] = [
  { id: 'nav-home', label: '总部大厅', description: '返回仪表盘', icon: <Building2 className="w-4 h-4" />, path: '/', category: 'navigation' },
  { id: 'nav-agents', label: '人员档案', description: '管理 Agent', icon: <Bot className="w-4 h-4" />, path: '/agents', category: 'navigation' },
  { id: 'nav-teams', label: '工作室', description: '团队协作', icon: <Users className="w-4 h-4" />, path: '/teams', category: 'navigation' },
  { id: 'nav-workflows', label: '战术桌', description: '工作流编排', icon: <GitBranch className="w-4 h-4" />, path: '/workflows', category: 'navigation' },
  { id: 'nav-monitor', label: '指挥中心', description: '实时监控', icon: <Activity className="w-4 h-4" />, path: '/monitor', category: 'navigation' },
  { id: 'nav-chat', label: '通信频道', description: 'Agent 对话', icon: <MessageSquare className="w-4 h-4" />, path: '/chat', category: 'navigation' },
]

const CATEGORY_LABELS: Record<string, string> = {
  navigation: '页面导航',
  agent: 'Agent',
  team: '工作室',
  workflow: '工作流',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const navigate = useNavigate()
  const { agents } = useAgentStore()
  const { teams } = useTeamStore()

  // Build command items from agents, teams, and navigation
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [...NAV_ITEMS]

    // Add agents
    if (agents) {
      agents.forEach((a) => {
        items.push({
          id: `agent-${a.id}`,
          label: a.name,
          description: `Agent · ${a.status || 'idle'}`,
          icon: <Bot className="w-4 h-4" />,
          path: `/agents/${a.id}`,
          category: 'agent',
        })
      })
    }

    // Add teams
    if (teams) {
      teams.forEach((t) => {
        items.push({
          id: `team-${t.id}`,
          label: t.name,
          description: `工作室 · ${t.memberCount || 0} 成员`,
          icon: <Users className="w-4 h-4" />,
          path: `/teams/${t.id}`,
          category: 'team',
        })
      })
    }

    return items
  }, [agents, teams])

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return allItems
    const q = query.toLowerCase()
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
    )
  }, [allItems, query])

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    for (const item of filtered) {
      if (!groups[item.category]) groups[item.category] = []
      groups[item.category].push(item)
    }
    return groups
  }, [filtered])

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const result: CommandItem[] = []
    for (const cat of Object.keys(grouped)) {
      result.push(...grouped[cat])
    }
    return result
  }, [grouped])

  // Keyboard shortcut: Cmd+K or Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
        setQuery('')
        setSelectedIdx(0)
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Reset selected index when filtered changes
  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  const handleSelect = useCallback((item: CommandItem) => {
    navigate(item.path)
    setOpen(false)
    setQuery('')
  }, [navigate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.min(prev + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatList[selectedIdx]) handleSelect(flatList[selectedIdx])
    }
  }, [flatList, selectedIdx, handleSelect])

  if (!open) return null

  let flatIdx = -1

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg mx-4 animate-slide-in" style={{ animationDuration: '0.2s' }}>
        <div className="rounded-2xl border border-white/10 bg-cyber-panel/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
            <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索 Agent、工作室、页面..."
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 focus:outline-none"
            />
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 text-white/20 text-[10px] border border-white/5">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {flatList.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <Search className="w-8 h-8 text-white/10 mb-2" />
                <p className="text-white/25 text-sm">没有找到结果</p>
              </div>
            ) : (
              Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className="mb-2">
                  <p className="text-white/20 text-[10px] font-semibold uppercase tracking-wider px-2 py-1">
                    {CATEGORY_LABELS[cat] || cat}
                  </p>
                  {items.map((item) => {
                    flatIdx++
                    const isActive = flatIdx === selectedIdx
                    const currentIdx = flatIdx
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIdx(currentIdx)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer',
                          isActive ? 'bg-cyber-purple/15 text-white' : 'text-white/60 hover:bg-white/5'
                        )}
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                          isActive ? 'bg-cyber-purple/20 text-cyber-lavender' : 'bg-white/5 text-white/30'
                        )}>
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          {item.description && (
                            <p className="text-white/25 text-[10px] truncate">{item.description}</p>
                          )}
                        </div>
                        {isActive && (
                          <ArrowRight className="w-3.5 h-3.5 text-cyber-purple/60 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 text-white/15 text-[10px]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-white/5 border border-white/5">↑↓</kbd> 导航</span>
              <span className="flex items-center gap-1"><kbd className="px-1 rounded bg-white/5 border border-white/5">↵</kbd> 选择</span>
            </div>
            <span className="flex items-center gap-1">
              <Command className="w-2.5 h-2.5" />K 打开
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
