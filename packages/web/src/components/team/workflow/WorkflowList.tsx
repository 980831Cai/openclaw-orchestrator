/**
 * WorkflowList component - displays list of workflows for selection
 * Extracted from TeamWorkflowEditor.tsx
 */

import { GitBranch } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { WorkflowDefinition } from '@/types'

interface WorkflowListProps {
  workflows: WorkflowDefinition[]
  selectedId: string | undefined
  onSelect: (workflow: WorkflowDefinition) => void
}

export function WorkflowList({ workflows, selectedId, onSelect }: WorkflowListProps) {
  if (workflows.length === 0) {
    return (
      <div className="py-12 text-center">
        <GitBranch className="mx-auto mb-3 h-12 w-12 text-white/10" />
        <p className="text-white/20">暂无工作流，点击"新工作流"开始创建</p>
      </div>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {workflows.map((workflow) => (
        <button
          key={workflow.id}
          onClick={() => onSelect(workflow)}
          className={cn(
            'flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left transition-all',
            selectedId === workflow.id
              ? 'border border-cyber-amber/30 bg-cyber-amber/15 text-white'
              : 'border border-transparent text-white/50 hover:bg-white/5'
          )}
        >
          <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-cyber-amber/60" />
          <span className="text-xs font-medium">{workflow.name}</span>
          <span className="text-[10px] text-white/30">{Object.keys(workflow.nodes).length} 节点</span>
        </button>
      ))}
    </div>
  )
}
