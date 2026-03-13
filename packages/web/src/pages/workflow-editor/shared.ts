import type { NodeTypes } from 'reactflow'
import { Merge, MessageSquare, Split, Swords, UserCheck, Zap } from 'lucide-react'

import { ApprovalNodeComponent } from '@/components/workflow/ApprovalNode'
import { ConditionNodeComponent } from '@/components/workflow/ConditionNode'
import { DebateNodeComponent } from '@/components/workflow/DebateNode'
import { JoinNodeComponent } from '@/components/workflow/JoinNode'
import { MeetingNodeComponent } from '@/components/workflow/MeetingNode'
import { TaskNodeComponent } from '@/components/workflow/TaskNode'

export const workflowNodeTypes: NodeTypes = {
  task: TaskNodeComponent,
  condition: ConditionNodeComponent,
  join: JoinNodeComponent,
  parallel: JoinNodeComponent,
  approval: ApprovalNodeComponent,
  meeting: MeetingNodeComponent,
  debate: DebateNodeComponent,
}

export const WORKFLOW_NODE_BUTTONS = [
  {
    type: 'task',
    label: '任务',
    icon: Zap,
    hoverClassName: 'hover:border-cyber-blue/30',
    iconClassName: 'text-cyber-blue',
  },
  {
    type: 'condition',
    label: '条件',
    icon: Split,
    hoverClassName: 'hover:border-cyber-amber/30',
    iconClassName: 'text-cyber-amber',
  },
  {
    type: 'approval',
    label: '审批',
    icon: UserCheck,
    hoverClassName: 'hover:border-yellow-400/30',
    iconClassName: 'text-yellow-400',
  },
  {
    type: 'join',
    label: '汇合',
    icon: Merge,
    hoverClassName: 'hover:border-cyber-green/30',
    iconClassName: 'text-cyber-green',
  },
  {
    type: 'meeting',
    label: '会议',
    icon: MessageSquare,
    hoverClassName: 'hover:border-purple-400/30',
    iconClassName: 'text-purple-400',
  },
  {
    type: 'debate',
    label: '辩论',
    icon: Swords,
    hoverClassName: 'hover:border-orange-400/30',
    iconClassName: 'text-orange-400',
  },
] as const
