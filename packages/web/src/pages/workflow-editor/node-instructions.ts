import type { WorkflowNodeData } from '@/types'

const TASK_MANUAL = [
  '运行时会自动补充执行说明。',
  '1. 优先完成当前节点目标，不要偏离当前节点范围。',
  '2. 如果引用上游产物，先提炼关键信息，再给出最终结果。',
  '3. 输出尽量具体、可执行，可直接作为下游输入。',
  '4. 如果存在阻塞、缺失信息或风险，需要明确写出。',
  '5. 建议输出结构：结论 / 结果、关键依据、下一步建议。',
].join('\n')

const APPROVAL_MANUAL = [
  '运行时会自动补充审批说明。',
  '1. 审批代理只返回 JSON，不返回额外解释或 Markdown。',
  '2. 只允许两种结果：{"decision":"approve","reason":"..."} 或 {"decision":"reject","reason":"..."}。',
  '3. 审批重点包括：目标是否完成、产物是否充分、风险是否可接受。',
  '4. 如果拒绝，reason 必须明确指出缺口、风险或遗漏。',
].join('\n')

const MEETING_MANUAL = [
  '运行时会自动补充会议说明。',
  '1. 参会 Agent 需要先阅读已有记录，再只追加你自己的发言。',
  '2. 发言应尽量给出观点、依据、风险和建议。',
  '3. 主持人会在最后总结共识、分歧和行动项。',
].join('\n')

const DEBATE_MANUAL = [
  '运行时会自动补充辩论说明。',
  '1. 正反双方需要按轮次回应上一轮观点。',
  '2. 每轮只输出你本轮的立场、论据和回应。',
  '3. 如果认为已经达成共识，需要明确写出“同意”或“达成共识”。',
  '4. 最后由裁判输出总结。',
].join('\n')

export function getWorkflowNodeInstructionManual(type: WorkflowNodeData['type'] | undefined | null): string | null {
  switch (type) {
    case 'task':
      return TASK_MANUAL
    case 'approval':
      return APPROVAL_MANUAL
    case 'meeting':
      return MEETING_MANUAL
    case 'debate':
      return DEBATE_MANUAL
    default:
      return null
  }
}
