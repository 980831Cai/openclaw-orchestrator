/**
 * ExecutionLogs component - displays workflow execution logs
 * Extracted from TeamWorkflowEditor.tsx
 */

import { cn } from '@/lib/utils'
import type { WorkflowLog } from '@/types'

interface ExecutionLogsProps {
  logs: WorkflowLog[]
  maxHeight?: string
}

export function ExecutionLogs({ logs, maxHeight = '200px' }: ExecutionLogsProps) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-white/5 bg-cyber-bg/30 p-4">
        <p className="text-center text-xs text-white/30">暂无执行日志</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-white/60">执行日志</h4>
      <div
        className="space-y-1 overflow-y-auto rounded-lg border border-white/5 bg-cyber-bg/30 p-3"
        style={{ maxHeight }}
      >
        {logs.map((log, index) => (
          <div
            key={index}
            className={cn(
              'rounded px-2 py-1 text-[11px]',
              log.level === 'error'
                ? 'bg-red-500/10 text-red-300'
                : log.level === 'warn'
                  ? 'bg-amber-500/10 text-amber-300'
                  : 'bg-white/5 text-white/70'
            )}
          >
            <span className="mr-2 font-mono text-white/40">{log.timestamp?.slice(11, 19) || '--:--:--'}</span>
            <span className="mr-2 text-white/30">[{log.nodeId}]</span>
            {log.message}
          </div>
        ))}
      </div>
    </div>
  )
}
