import type { ReactNode } from 'react'

interface WorkflowEditorShellProps {
  sidebar?: ReactNode
  palette: ReactNode
  topbar: ReactNode
  canvas: ReactNode
  inspector: ReactNode
  dock?: ReactNode
  emptyState?: ReactNode
  hasSelection: boolean
}

export function WorkflowEditorShell({
  sidebar,
  palette,
  topbar,
  canvas,
  inspector,
  dock,
  emptyState,
  hasSelection,
}: WorkflowEditorShellProps) {
  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0B1022] shadow-[0_30px_120px_rgba(3,7,18,0.55)]">
      {sidebar ? <div className="hidden h-full border-r border-white/6 xl:flex">{sidebar}</div> : null}
      <div className="hidden h-full border-r border-white/6 lg:flex">{palette}</div>
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.16),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(9,12,28,0.98))]">
        <div className="relative z-10 border-b border-white/6 px-5 py-4">{topbar}</div>
        <div className="relative min-h-0 flex-1 overflow-hidden px-5 pb-5 pt-4">
          {hasSelection ? canvas : emptyState}
          {hasSelection ? dock : null}
        </div>
      </div>
      {hasSelection ? <div className="hidden h-full border-l border-white/6 xl:flex">{inspector}</div> : null}
    </div>
  )
}
