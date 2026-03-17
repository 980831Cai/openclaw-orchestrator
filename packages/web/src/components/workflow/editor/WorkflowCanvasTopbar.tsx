import type { ReactNode } from 'react'

interface WorkflowCanvasTopbarProps {
  eyebrow?: string
  title: string
  subtitle?: string
  badges?: ReactNode
  actions?: ReactNode
}

export function WorkflowCanvasTopbar({ eyebrow, title, subtitle, badges, actions }: WorkflowCanvasTopbarProps) {
  return (
    <div className="workflow-frost-panel flex items-start justify-between gap-4 rounded-[28px] px-5 py-4">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-2xl font-semibold text-white">{title}</h2>
          {badges}
        </div>
        {subtitle ? <p className="text-sm text-slate-300/70">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
    </div>
  )
}
