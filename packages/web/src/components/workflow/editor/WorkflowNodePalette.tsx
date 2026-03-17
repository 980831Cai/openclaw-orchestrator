import { useMemo, useState } from 'react'

import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { WORKFLOW_NODE_BUTTONS } from '@/pages/workflow-editor/shared'
import type { WorkflowNodeType } from '@/types'

const DRAG_MIME_TYPE = 'application/openclaw-workflow-node'

interface WorkflowNodePaletteProps {
  onCreateNode: (type: WorkflowNodeType) => void
}

export function WorkflowNodePalette({ onCreateNode }: WorkflowNodePaletteProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()

  const groups = useMemo(() => {
    const filtered = WORKFLOW_NODE_BUTTONS.filter((item) => {
      if (!normalizedQuery) return true
      const haystack = `${item.label} ${item.description} ${item.category}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })

    return filtered.reduce<Record<string, typeof filtered>>((acc, item) => {
      acc[item.category] ||= []
      acc[item.category].push(item)
      return acc
    }, {})
  }, [normalizedQuery])

  return (
    <aside className="workflow-studio-sidebar flex h-full w-72 flex-col gap-4 overflow-hidden p-4">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Canvas Library</p>
        <h2 className="text-lg font-semibold text-white">节点库</h2>
        <p className="text-sm text-slate-300/70">拖到画布任意位置创建，或点击快速插入到当前视野中心。</p>
      </div>

      <label className="workflow-frost-panel flex items-center gap-2 rounded-2xl px-3 py-2.5">
        <Search className="h-4 w-4 text-white/35" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索任务、条件、审批…"
          className="h-8 border-0 bg-transparent px-0 text-sm text-white shadow-none focus-visible:ring-0"
        />
      </label>

      <div className="workflow-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {Object.entries(groups).map(([category, items]) => (
          <section key={category} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-medium text-white/80">{category}</h3>
              <span className="text-[10px] text-white/30">{items.length} 个节点</span>
            </div>
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData(DRAG_MIME_TYPE, item.type)
                    event.dataTransfer.setData('text/plain', item.type)
                  }}
                  onClick={() => onCreateNode(item.type)}
                  className={cn(
                    'workflow-palette-card group flex w-full cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-left transition-all',
                    item.hoverClassName,
                  )}
                >
                  <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <item.icon className={cn('h-4 w-4', item.iconClassName)} />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white group-hover:text-white">{item.label}</span>
                      <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-white/35">拖拽</span>
                    </span>
                    <span className="block text-xs leading-5 text-slate-300/60">{item.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  )
}

export { DRAG_MIME_TYPE }
