import type { ReactNode } from 'react'

import { Loader2, Play, Save, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WorkflowCanvasDockProps {
  saving: boolean
  executionActive: boolean
  onExecute: () => void
  onStop: () => void
  onSave: () => void
  statusBadge?: ReactNode
  extraActions?: ReactNode
}

export function WorkflowCanvasDock({
  saving,
  executionActive,
  onExecute,
  onStop,
  onSave,
  statusBadge,
  extraActions,
}: WorkflowCanvasDockProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4">
      <div className="workflow-frost-panel pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl px-3 py-3 shadow-[0_20px_70px_rgba(15,23,42,0.45)]">
        <Button
          size="sm"
          onClick={onExecute}
          disabled={executionActive}
          className="h-9 rounded-xl border border-emerald-400/25 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25"
        >
          {executionActive ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
          执行
        </Button>
        <Button size="sm" onClick={onStop} disabled={!executionActive} variant="destructive" className="h-9 rounded-xl">
          <Square className="mr-1.5 h-4 w-4" /> 停止
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="h-9 rounded-xl border border-violet-400/25 bg-violet-400/15 text-violet-100 hover:bg-violet-400/25"
        >
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          保存
        </Button>
        {extraActions ? <div className="mx-1 h-6 w-px bg-white/10" /> : null}
        {extraActions}
        {statusBadge ? (
          <div className={cn(extraActions ? 'ml-1' : 'ml-2')}>
            {statusBadge}
          </div>
        ) : null}
      </div>
    </div>
  )
}
