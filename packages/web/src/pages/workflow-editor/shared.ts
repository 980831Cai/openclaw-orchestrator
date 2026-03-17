import type { LucideIcon } from 'lucide-react'
import { Merge, MessageSquare, Split, Swords, UserCheck, Zap } from 'lucide-react'
import type { NodeTypes } from 'reactflow'

import { ApprovalNodeComponent } from '@/components/workflow/ApprovalNode'
import { ConditionNodeComponent } from '@/components/workflow/ConditionNode'
import { DebateNodeComponent } from '@/components/workflow/DebateNode'
import { JoinNodeComponent } from '@/components/workflow/JoinNode'
import { MeetingNodeComponent } from '@/components/workflow/MeetingNode'
import { TaskNodeComponent } from '@/components/workflow/TaskNode'
import type { WorkflowNodeType } from '@/types'

export interface WorkflowNodePaletteItem {
  type: WorkflowNodeType
  label: string
  description: string
  category: '执行节点' | '分支控制' | '多人协作'
  icon: LucideIcon
  hoverClassName: string
  iconClassName: string
}

export const workflowNodeTypes: NodeTypes = {
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
  parallel: JoinNodeComponent,
  approval: ApprovalNodeComponent,
  meeting: MeetingNodeComponent,
  debate: DebateNodeComponent,
}

export const WORKFLOW_NODE_BUTTONS: WorkflowNodePaletteItem[] = [
  {
    type: 'task',
    label: '任务',
    description: '把任务派发给单个 Agent 执行，适合标准处理步骤。',
    category: '执行节点',
    icon: Zap,
    hoverClassName: 'hover:border-cyber-blue/30 hover:bg-cyber-blue/10',
    iconClassName: 'text-cyber-blue',
  },
  {
    type: 'condition',
    label: '条件',
    description: '根据表达式把流程分到 yes / no 两条支路。',
    category: '分支控制',
    icon: Split,
    hoverClassName: 'hover:border-cyber-amber/30 hover:bg-cyber-amber/10',
    iconClassName: 'text-cyber-amber',
  },
  {
    type: 'approval',
    label: '审批',
    description: '插入人工或 Agent 审批步骤，等待结果后再继续。',
    category: '分支控制',
    icon: UserCheck,
    hoverClassName: 'hover:border-yellow-400/30 hover:bg-yellow-400/10',
    iconClassName: 'text-yellow-400',
  },
  {
    type: 'join',
    label: '汇合',
    description: '等待并行分支收敛，再决定如何继续放行下游。',
    category: '分支控制',
    icon: Merge,
    hoverClassName: 'hover:border-cyber-green/30 hover:bg-cyber-green/10',
    iconClassName: 'text-cyber-green',
  },
  {
    type: 'meeting',
    label: '会议',
    description: '多 Agent 会议协作，沉淀共识、行动项和主持流程。',
    category: '多人协作',
    icon: MessageSquare,
    hoverClassName: 'hover:border-purple-400/30 hover:bg-purple-400/10',
    iconClassName: 'text-purple-400',
  },
  {
    type: 'debate',
    label: '辩论',
    description: '让正反双方辩论同一议题，并由裁判给出结论。',
    category: '多人协作',
    icon: Swords,
    hoverClassName: 'hover:border-orange-400/30 hover:bg-orange-400/10',
    iconClassName: 'text-orange-400',
  },
]
