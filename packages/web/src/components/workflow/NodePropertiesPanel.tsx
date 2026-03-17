import type { ReactNode } from 'react'

import { Trash2 } from 'lucide-react'
import type { Node } from 'reactflow'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DEBATE_ROUND_OPTIONS, MEETING_WORKFLOW_TYPES } from '@/pages/workflow-editor/graph'
import { MEETING_TYPE_LABELS } from '@/types'
import type { AgentListItem, MeetingType, WorkflowNodeData } from '@/types'

interface BranchConnectionInfo {
  label: string
  agentId?: string
}

interface NodePropertiesPanelProps {
  selectedNode: Node<WorkflowNodeData> | null
  agents: AgentListItem[]
  upstreamOptions: { id: string; label: string; type: string }[]
  selectedConditionConnections?: { yes: BranchConnectionInfo | null; no: BranchConnectionInfo | null }
  instructionManual?: string | null
  onUpdate: (patch: Partial<WorkflowNodeData>) => void
  onDelete?: () => void
  children?: ReactNode
  emptyState?: ReactNode
}

function PanelSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-white/60">{label}</Label>
      {children}
    </div>
  )
}

function AgentOptions({
  value,
  agents,
  onChange,
  placeholder,
}: {
  value: string
  agents: AgentListItem[]
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <Select value={value || '__manual__'} onValueChange={(next) => onChange(next === '__manual__' ? '' : next)}>
      <SelectTrigger className="border-white/10 bg-cyber-bg text-white">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="border-white/10 bg-cyber-panel text-white">
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agent.name || agent.id} ({agent.id})
          </SelectItem>
        ))}
        <SelectItem value="__manual__">手动输入</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function NodePropertiesPanel({
  selectedNode,
  agents,
  upstreamOptions,
  selectedConditionConnections,
  instructionManual,
  onUpdate,
  onDelete,
  children,
  emptyState,
}: NodePropertiesPanelProps) {
  if (!selectedNode) {
    return (
      <div className="workflow-scroll flex h-full w-[380px] flex-col overflow-y-auto bg-cyber-surface/25 p-4">
        <div className="workflow-frost-panel rounded-3xl p-4">
          <p className="text-sm text-white/80">属性检查器</p>
          <p className="mt-2 text-sm leading-6 text-white/45">
            选择节点后可在这里编辑参数、查看分支与运行说明。未选择节点时，画布保持最大可视面积。
          </p>
        </div>
        {emptyState ? <div className="mt-4">{emptyState}</div> : null}
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    )
  }

  const data = selectedNode.data as WorkflowNodeData
  const isKnownAgent = (value?: string) => agents.some((agent) => agent.id === value || `agent:${agent.id}` === value)
  const participantValue = (data.type === 'meeting' || data.type === 'debate') ? data.participants.join(', ') : ''

  return (
    <div className="workflow-scroll flex h-full w-[380px] flex-col overflow-y-auto bg-cyber-surface/25 p-4">
      <div className="workflow-frost-panel rounded-3xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">Node Inspector</p>
            <Input
              value={data.label || ''}
              onChange={(event) => onUpdate({ label: event.target.value } as Partial<WorkflowNodeData>)}
              placeholder="节点名称"
              className="h-11 border-white/10 bg-cyber-bg text-base text-white"
            />
          </div>
          {onDelete ? (
            <Button type="button" variant="destructive" className="mt-6 h-9 rounded-xl px-3 text-xs" onClick={onDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              删除
            </Button>
          ) : null}
        </div>

        {instructionManual ? (
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-3">
            <p className="text-xs font-medium text-white/75">运行时说明书</p>
            <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-white/55">{instructionManual}</pre>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          {data.type === 'task' ? (
            <>
              <PanelSection label="团队 Agent">
                <AgentOptions value={data.agentId} agents={agents} onChange={(agentId) => onUpdate({ agentId } as Partial<WorkflowNodeData>)} placeholder="选择当前团队成员" />
              </PanelSection>
              {(!data.agentId || !isKnownAgent(data.agentId)) ? (
                <PanelSection label="手动填写 Agent ID（历史/跨团队值）">
                  <Input value={data.agentId || ''} onChange={(event) => onUpdate({ agentId: event.target.value } as Partial<WorkflowNodeData>)} placeholder="例如：worker-b" className="border-white/10 bg-cyber-bg text-white" />
                </PanelSection>
              ) : null}
              <PanelSection label="任务内容">
                <textarea value={data.task || ''} onChange={(event) => onUpdate({ task: event.target.value } as Partial<WorkflowNodeData>)} className="min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-cyber-bg px-3 py-3 text-sm text-white outline-none" />
              </PanelSection>
              <div className="grid grid-cols-2 gap-3">
                <PanelSection label="超时时间（秒）">
                  <Input type="number" min={1} value={data.timeoutSeconds ?? 60} onChange={(event) => onUpdate({ timeoutSeconds: Number(event.target.value || 60) } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" />
                </PanelSection>
                <PanelSection label="最大重试次数">
                  <Input type="number" min={0} value={data.maxRetries ?? 0} onChange={(event) => onUpdate({ maxRetries: Math.max(0, Number(event.target.value || 0)) } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" />
                </PanelSection>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/6 bg-cyber-bg/35 p-3">
                <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={data.requireResponse ?? true} onChange={(event) => onUpdate({ requireResponse: event.target.checked } as Partial<WorkflowNodeData>)} />要求有文本输出</label>
                <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={data.requireArtifacts ?? false} onChange={(event) => onUpdate({ requireArtifacts: event.target.checked } as Partial<WorkflowNodeData>)} />要求有产物</label>
                <PanelSection label="最小输出长度"><Input type="number" min={0} value={data.minOutputLength ?? 1} onChange={(event) => onUpdate({ minOutputLength: Number(event.target.value || 0) } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
                <PanelSection label="成功关键字"><Input value={data.successPattern || ''} onChange={(event) => onUpdate({ successPattern: event.target.value } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
              </div>
            </>
          ) : null}

          {data.type === 'condition' ? (
            <>
              <PanelSection label="条件表达式">
                <textarea value={data.expression || ''} onChange={(event) => onUpdate({ expression: event.target.value } as Partial<WorkflowNodeData>)} className="min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-cyber-bg px-3 py-3 text-sm text-white outline-none" />
              </PanelSection>
              <div className="space-y-3 rounded-2xl border border-white/6 bg-cyber-bg/35 p-3">
                <p className="text-xs font-medium text-white/70">条件分支</p>
                {(['yes', 'no'] as const).map((branch) => (
                  <div key={branch} className="space-y-1.5">
                    <p className="text-[11px] text-white/45">{branch === 'yes' ? '命中分支' : '未命中分支'}</p>
                    <div className="rounded-xl border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white/80">
                      {selectedConditionConnections?.[branch]
                        ? `${selectedConditionConnections[branch]?.label}${selectedConditionConnections[branch]?.agentId ? ` · ${selectedConditionConnections[branch]?.agentId}` : ''}`
                        : '未连接'}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/40">条件分支完全由连线决定：绿色 yes 口为命中，红色 no 口为未命中。</p>
            </>
          ) : null}

          {data.type === 'approval' ? (
            <>
              <PanelSection label="审批处理人">
                <Select
                  value={(() => {
                    const approver = String(data.approver || 'web-user')
                    if (approver === 'web-user') return 'web-user'
                    const matchedAgent = agents.find((agent) => approver === agent.id || approver === `agent:${agent.id}`)
                    return matchedAgent ? `agent:${matchedAgent.id}` : '__manual__'
                  })()}
                  onValueChange={(value) => onUpdate({ approver: value === '__manual__' ? '' : value } as Partial<WorkflowNodeData>)}
                >
                  <SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="选择审批处理人" /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-cyber-panel text-white">
                    <SelectItem value="web-user">人工审批（控制台）</SelectItem>
                    {agents.map((agent) => <SelectItem key={agent.id} value={`agent:${agent.id}`}>Agent 审批：{agent.name || agent.id}</SelectItem>)}
                    <SelectItem value="__manual__">手动输入</SelectItem>
                  </SelectContent>
                </Select>
              </PanelSection>
              {data.approver !== 'web-user' && !isKnownAgent(data.approver) ? <PanelSection label="手动填写审批处理人"><Input value={data.approver || ''} onChange={(event) => onUpdate({ approver: event.target.value } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection> : null}
              <PanelSection label="审批标题"><Input value={data.title || ''} onChange={(event) => onUpdate({ title: event.target.value } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
              <PanelSection label="审批说明"><textarea value={data.description || ''} onChange={(event) => onUpdate({ description: event.target.value } as Partial<WorkflowNodeData>)} className="min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-cyber-bg px-3 py-3 text-sm text-white outline-none" /></PanelSection>
              <PanelSection label="超时时间（分钟）"><Input type="number" min={1} value={data.timeoutMinutes ?? 30} onChange={(event) => onUpdate({ timeoutMinutes: Number(event.target.value || 30) } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
            </>
          ) : null}

          {(data.type === 'join' || data.type === 'parallel') ? (
            <>
              <PanelSection label="汇合模式">
                <Select value={data.joinMode || 'and'} onValueChange={(value) => onUpdate({ joinMode: value as any, waitForAll: value === 'and', preferredSourceNodeId: value === 'xor' ? (upstreamOptions[0]?.id || '') : undefined } as Partial<WorkflowNodeData>)}>
                  <SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="选择汇合模式" /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-cyber-panel text-white">
                    <SelectItem value="and">AND：全部到齐后继续</SelectItem>
                    <SelectItem value="or">OR：任一到达即继续</SelectItem>
                    <SelectItem value="xor">XOR：仅指定上游可放行</SelectItem>
                  </SelectContent>
                </Select>
              </PanelSection>
              {(data.joinMode || 'and') === 'xor' ? <PanelSection label="允许放行的上游节点"><Select value={data.preferredSourceNodeId || upstreamOptions[0]?.id || '__none__'} onValueChange={(value) => onUpdate({ preferredSourceNodeId: value === '__none__' ? '' : value } as Partial<WorkflowNodeData>)}><SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="选择一个上游节点" /></SelectTrigger><SelectContent className="border-white/10 bg-cyber-panel text-white">{upstreamOptions.length ? upstreamOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.label} ({option.id})</SelectItem>) : <SelectItem value="__none__">暂无上游节点</SelectItem>}</SelectContent></Select></PanelSection> : null}
            </>
          ) : null}

          {data.type === 'meeting' ? (
            <>
              <PanelSection label="会议类型"><Select value={data.meetingType || 'brainstorm'} onValueChange={(value) => onUpdate({ meetingType: value as Exclude<MeetingType, 'debate'> } as Partial<WorkflowNodeData>)}><SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="选择会议类型" /></SelectTrigger><SelectContent className="border-white/10 bg-cyber-panel text-white">{MEETING_WORKFLOW_TYPES.map((type) => <SelectItem key={type} value={type}>{MEETING_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select></PanelSection>
              <PanelSection label="会议议题"><Input value={data.topic || ''} onChange={(event) => onUpdate({ topic: event.target.value } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
              <PanelSection label="议题描述"><textarea value={data.topicDescription || ''} onChange={(event) => onUpdate({ topicDescription: event.target.value } as Partial<WorkflowNodeData>)} className="min-h-20 w-full resize-y rounded-2xl border border-white/10 bg-cyber-bg px-3 py-3 text-sm text-white outline-none" /></PanelSection>
              <PanelSection label="参与者 Agent（可补充历史 ID）"><Input value={participantValue} onChange={(event) => onUpdate({ participants: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
              <PanelSection label="主持人 Agent"><Select value={data.leadAgentId || '__auto__'} onValueChange={(value) => onUpdate({ leadAgentId: value === '__auto__' ? undefined : value } as Partial<WorkflowNodeData>)}><SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="自动（Team Lead）" /></SelectTrigger><SelectContent className="border-white/10 bg-cyber-panel text-white"><SelectItem value="__auto__">自动（Team Lead）</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>)}</SelectContent></Select></PanelSection>
              <PanelSection label="覆盖执行团队（可选）"><Input value={data.teamId || ''} onChange={(event) => onUpdate({ teamId: event.target.value } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
            </>
          ) : null}

          {data.type === 'debate' ? (
            <>
              <PanelSection label="辩题"><Input value={data.topic || ''} onChange={(event) => onUpdate({ topic: event.target.value } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
              <PanelSection label="辩题描述"><textarea value={data.topicDescription || ''} onChange={(event) => onUpdate({ topicDescription: event.target.value } as Partial<WorkflowNodeData>)} className="min-h-20 w-full resize-y rounded-2xl border border-white/10 bg-cyber-bg px-3 py-3 text-sm text-white outline-none" /></PanelSection>
              <div className="grid grid-cols-2 gap-3">
                {(['正方 Agent', '反方 Agent'] as const).map((label, index) => (
                  <PanelSection key={label} label={label}><Select value={data.participants[index] || '__none__'} onValueChange={(value) => { const participants = [...(data.participants || ['', ''])]; participants[index] = value === '__none__' ? '' : value; onUpdate({ participants } as Partial<WorkflowNodeData>) }}><SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="选择 Agent" /></SelectTrigger><SelectContent className="border-white/10 bg-cyber-panel text-white"><SelectItem value="__none__">未选择</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>)}</SelectContent></Select></PanelSection>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <PanelSection label="最大回合数"><Select value={String(data.maxRounds || 3)} onValueChange={(value) => onUpdate({ maxRounds: Number(value) } as Partial<WorkflowNodeData>)}><SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/10 bg-cyber-panel text-white">{DEBATE_ROUND_OPTIONS.map((round) => <SelectItem key={round} value={String(round)}>{round} 轮</SelectItem>)}</SelectContent></Select></PanelSection>
                <PanelSection label="裁判 Agent"><Select value={data.judgeAgentId || '__auto__'} onValueChange={(value) => onUpdate({ judgeAgentId: value === '__auto__' ? undefined : value } as Partial<WorkflowNodeData>)}><SelectTrigger className="border-white/10 bg-cyber-bg text-white"><SelectValue placeholder="自动（Team Lead）" /></SelectTrigger><SelectContent className="border-white/10 bg-cyber-panel text-white"><SelectItem value="__auto__">自动（Team Lead）</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>)}</SelectContent></Select></PanelSection>
              </div>
              <PanelSection label="覆盖执行团队（可选）"><Input value={data.teamId || ''} onChange={(event) => onUpdate({ teamId: event.target.value } as Partial<WorkflowNodeData>)} className="border-white/10 bg-cyber-bg text-white" /></PanelSection>
            </>
          ) : null}
        </div>
      </div>

      {children ? <div className="mt-4 space-y-4">{children}</div> : null}
    </div>
  )
}
