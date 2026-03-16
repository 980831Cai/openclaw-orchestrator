import type { MeetingType, WorkflowNodeData } from '@/types'

const DEFAULT_NODE_POSITION = { x: 240, y: 120 }
const DEFAULT_MEETING_TYPE: Exclude<MeetingType, 'debate'> = 'brainstorm'

const DEFAULT_TASK_PROMPT = '基于上游结果完成当前节点任务，并输出可直接交付的结果。'

const DEFAULT_APPROVAL_DESCRIPTION = '基于上游产物判断是否允许继续执行。'

const DEFAULT_MEETING_TOPIC = '围绕当前任务进行会议讨论并形成可执行结论'
const DEFAULT_MEETING_DESCRIPTION = '请围绕当前任务形成共识、分歧与行动项。'

const DEFAULT_DEBATE_TOPIC = '就当前方案或决策进行正反辩论'
const DEFAULT_DEBATE_DESCRIPTION = '请给出正反观点、依据、风险与最终裁决参考。'

export function createDefaultWorkflowNodeData(type: WorkflowNodeData['type']): WorkflowNodeData {
  const position = { ...DEFAULT_NODE_POSITION }

  switch (type) {
    case 'task':
      return {
        type: 'task',
        label: '任务节点',
        agentId: '',
        task: DEFAULT_TASK_PROMPT,
        timeoutSeconds: 60,
        requireResponse: true,
        requireArtifacts: false,
        minOutputLength: 1,
        successPattern: '',
        maxRetries: 0,
        position,
      }
    case 'condition':
      return {
        type: 'condition',
        label: '条件节点',
        expression: 'true',
        branches: { yes: '', no: '' },
        position,
      }
    case 'approval':
      return {
        type: 'approval',
        label: '审批节点',
        title: '请判断是否允许继续执行',
        description: DEFAULT_APPROVAL_DESCRIPTION,
        approver: 'web-user',
        timeoutMinutes: 30,
        onTimeout: 'reject',
        position,
      }
    case 'join':
      return {
        type: 'join',
        label: '汇合节点',
        joinMode: 'and',
        waitForAll: true,
        position,
      }
    case 'parallel':
      return {
        type: 'parallel',
        label: '汇合节点',
        joinMode: 'and',
        waitForAll: true,
        position,
      }
    case 'meeting':
      return {
        type: 'meeting',
        label: '会议节点',
        meetingType: DEFAULT_MEETING_TYPE,
        topic: DEFAULT_MEETING_TOPIC,
        topicDescription: DEFAULT_MEETING_DESCRIPTION,
        participants: [],
        position,
      }
    case 'debate':
      return {
        type: 'debate',
        label: '辩论节点',
        topic: DEFAULT_DEBATE_TOPIC,
        topicDescription: DEFAULT_DEBATE_DESCRIPTION,
        participants: [],
        maxRounds: 3,
        position,
      }
  }
}
