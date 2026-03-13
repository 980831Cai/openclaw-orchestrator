import React from 'react'
import type { Node } from 'reactflow'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { MEETING_TYPE_LABELS } from '@/types'
import type {
  AgentListItem,
  TaskNodeData,
  ConditionNodeData,
  ApprovalNodeData,
  JoinNodeData,
  ParallelNodeData,
  MeetingNodeData,
  DebateNodeData,
  WorkflowNodeData,
} from '@/types'

interface NodePropertiesPanelProps {
  selectedNode: Node<WorkflowNodeData> | null
  agents: AgentListItem[]
  upstreamOptions: { id: string; label: string; type: string }[]
  onUpdate: (patch: Partial<WorkflowNodeData>) => void
}

// ─── Sub-panels per node type ───

function TaskPanel({
  data,
  agents,
  onUpdate,
}: {
  data: TaskNodeData
  agents: AgentListItem[]
  onUpdate: (patch: Partial<TaskNodeData>) => void
}) {
  const agentInList = agents.some((a) => a.id === data.agentId)

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">Agent ID</Label>
        <Select
          value={data.agentId || '__manual__'}
          onValueChange={(v) => onUpdate({ agentId: v === '__manual__' ? '' : v })}
        >
          <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
            <SelectValue placeholder="选择一个 Agent" />
          </SelectTrigger>
          <SelectContent className="bg-cyber-panel border-white/10 text-white">
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name || agent.id} ({agent.id})
              </SelectItem>
            ))}
            <SelectItem value="__manual__">手动输入</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(!data.agentId || !agentInList) && (
        <div className="space-y-2">
          <Label className="text-xs text-white/60">手动填写 Agent ID</Label>
          <Input
            value={data.agentId || ''}
            onChange={(e) => onUpdate({ agentId: e.target.value })}
            placeholder="例如：worker-b"
            className="bg-cyber-bg border-white/10 text-white"
          />
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-xs text-white/60">任务内容</Label>
        <textarea
          value={data.task || ''}
          onChange={(e) => onUpdate({ task: e.target.value })}
          placeholder="要发送给 Agent 的任务内容"
          className="w-full min-h-28 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">超时时间（秒）</Label>
        <Input
          type="number"
          min={1}
          value={data.timeoutSeconds ?? 60}
          onChange={(e) => onUpdate({ timeoutSeconds: Number(e.target.value || 60) })}
          placeholder="timeoutSeconds"
          className="bg-cyber-bg border-white/10 text-white"
        />
      </div>
    </>
  )
}

function ConditionPanel({
  data,
  onUpdate,
}: {
  data: ConditionNodeData
  onUpdate: (patch: Partial<ConditionNodeData>) => void
}) {
  const updateBranch = (key: string, value: string) => {
    onUpdate({ branches: { ...data.branches, [key]: value } })
  }

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">条件表达式</Label>
        <textarea
          value={data.expression || ''}
          onChange={(e) => onUpdate({ expression: e.target.value })}
          placeholder="例如：latest.status == 'sent'"
          className="w-full min-h-24 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y"
        />
      </div>
      <div className="space-y-3 rounded-lg border border-white/5 bg-cyber-bg/30 p-3">
        <Label className="text-xs text-white/60">条件分支</Label>
        {['yes', 'no', 'default'].map((branch) => (
          <div key={branch} className="space-y-2">
            <Label className="text-[11px] text-white/45">{branch} 分支目标节点 ID</Label>
            <Input
              value={data.branches?.[branch] || ''}
              onChange={(e) => updateBranch(branch, e.target.value)}
              placeholder={branch === 'default' ? '表达式失败或未命中时走这里' : `命中 ${branch} 时跳到哪个节点`}
              className="bg-cyber-bg border-white/10 text-white"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-white/40">边上的标签或 source handle 会作为分支条件保存。</p>
    </>
  )
}

function ApprovalPanel({
  data,
  onUpdate,
}: {
  data: ApprovalNodeData
  onUpdate: (patch: Partial<ApprovalNodeData>) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">审批标题</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="审批标题"
          className="bg-cyber-bg border-white/10 text-white"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">审批说明</Label>
        <textarea
          value={data.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="审批说明"
          className="w-full min-h-24 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">超时时间（分钟）</Label>
        <Input
          type="number"
          min={1}
          value={data.timeoutMinutes ?? 30}
          onChange={(e) => onUpdate({ timeoutMinutes: Number(e.target.value || 30) })}
          placeholder="timeoutMinutes"
          className="bg-cyber-bg border-white/10 text-white"
        />
      </div>
    </>
  )
}

function JoinPanel({
  data,
  upstreamOptions,
  onUpdate,
}: {
  data: JoinNodeData | ParallelNodeData
  upstreamOptions: { id: string; label: string; type: string }[]
  onUpdate: (patch: Partial<JoinNodeData | ParallelNodeData>) => void
}) {
  const joinMode = data.joinMode || 'and'

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">汇合模式</Label>
        <Select
          value={joinMode}
          onValueChange={(v) =>
            onUpdate({
              joinMode: v as JoinNodeData['joinMode'],
              waitForAll: v === 'and',
              preferredSourceNodeId: v === 'xor' ? (upstreamOptions[0]?.id || '') : undefined,
            })
          }
        >
          <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
            <SelectValue placeholder="选择汇合模式" />
          </SelectTrigger>
          <SelectContent className="bg-cyber-panel border-white/10 text-white">
            <SelectItem value="and">AND：全部到齐后继续</SelectItem>
            <SelectItem value="or">OR：任一到达即继续</SelectItem>
            <SelectItem value="xor">XOR：仅指定上游可放行</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {joinMode === 'xor' && (
        <div className="space-y-2">
          <Label className="text-xs text-white/60">允许放行的上游节点</Label>
          <Select
            value={data.preferredSourceNodeId || upstreamOptions[0]?.id || '__none__'}
            onValueChange={(v) => onUpdate({ preferredSourceNodeId: v === '__none__' ? '' : v })}
          >
            <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
              <SelectValue placeholder="选择一个上游节点" />
            </SelectTrigger>
            <SelectContent className="bg-cyber-panel border-white/10 text-white">
              {upstreamOptions.length ? (
                upstreamOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label} ({opt.id})
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__none__">暂无上游节点</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}
      <p className="text-xs text-white/40">
        普通节点接出多条线时会并行分发；汇合节点根据这里的逻辑门决定何时放行下游。
      </p>
    </>
  )
}

function MeetingPanel({
  data,
  agents,
  onUpdate,
}: {
  data: MeetingNodeData
  agents: AgentListItem[]
  onUpdate: (patch: Partial<MeetingNodeData>) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">会议类型</Label>
        <Select
          value={data.meetingType || 'brainstorm'}
          onValueChange={(v) => onUpdate({ meetingType: v as MeetingNodeData['meetingType'] })}
        >
          <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
            <SelectValue placeholder="选择会议类型" />
          </SelectTrigger>
          <SelectContent className="bg-cyber-panel border-white/10 text-white">
            {(['standup', 'kickoff', 'review', 'brainstorm', 'decision', 'retro'] as const).map((t) => (
              <SelectItem key={t} value={t}>{MEETING_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">会议议题</Label>
        <Input
          value={data.topic || ''}
          onChange={(e) => onUpdate({ topic: e.target.value })}
          placeholder="会议要讨论的主题"
          className="bg-cyber-bg border-white/10 text-white"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">议题描述（可选）</Label>
        <textarea
          value={data.topicDescription || ''}
          onChange={(e) => onUpdate({ topicDescription: e.target.value })}
          placeholder="提供更多背景信息..."
          className="w-full min-h-20 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">参与者 Agent ID（逗号分隔）</Label>
        <Input
          value={(data.participants || []).join(', ')}
          onChange={(e) =>
            onUpdate({
              participants: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })
          }
          placeholder="agent-1, agent-2, agent-3"
          className="bg-cyber-bg border-white/10 text-white"
        />
        {agents.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {agents.map((agent) => {
              const isIn = (data.participants || []).includes(agent.id)
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    const cur = [...(data.participants || [])]
                    onUpdate({
                      participants: isIn
                        ? cur.filter((p) => p !== agent.id)
                        : [...cur, agent.id],
                    })
                  }}
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-all',
                    isIn
                      ? 'bg-purple-400/15 text-purple-300 border-purple-400/30'
                      : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                  )}
                >
                  {agent.name || agent.id}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">主持人 Agent ID（可选，默认 Team Lead）</Label>
        <Select
          value={data.leadAgentId || '__auto__'}
          onValueChange={(v) => onUpdate({ leadAgentId: v === '__auto__' ? undefined : v })}
        >
          <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
            <SelectValue placeholder="自动（Team Lead）" />
          </SelectTrigger>
          <SelectContent className="bg-cyber-panel border-white/10 text-white">
            <SelectItem value="__auto__">自动（Team Lead）</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">Team ID（可选，自动推断）</Label>
        <Input
          value={data.teamId || ''}
          onChange={(e) => onUpdate({ teamId: e.target.value })}
          placeholder="留空则使用工作流所属团队"
          className="bg-cyber-bg border-white/10 text-white"
        />
      </div>
      <p className="text-xs text-white/40">会议节点会创建并执行一场 Agent 会议，会议结论将作为节点产物传递给下游。</p>
    </>
  )
}

function DebatePanel({
  data,
  agents,
  onUpdate,
}: {
  data: DebateNodeData
  agents: AgentListItem[]
  onUpdate: (patch: Partial<DebateNodeData>) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">辩题</Label>
        <Input value={data.topic || ''} onChange={(e) => onUpdate({ topic: e.target.value })} placeholder="辩论的核心问题" className="bg-cyber-bg border-white/10 text-white" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">辩题描述（可选）</Label>
        <textarea value={data.topicDescription || ''} onChange={(e) => onUpdate({ topicDescription: e.target.value })} placeholder="提供辩论的背景和具体要求..." className="w-full min-h-20 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">辩手（恰好 2 个 Agent ID）</Label>
        <div className="grid grid-cols-2 gap-2">
          {(['正方', '反方'] as const).map((side, idx) => (
            <div key={side}>
              <Label className="text-[10px] text-orange-300/60 mb-1">{side}</Label>
              <Select
                value={(data.participants || [])[idx] || '__none__'}
                onValueChange={(v) => {
                  const ps = [...(data.participants || ['', ''])]
                  ps[idx] = v === '__none__' ? '' : v
                  onUpdate({ participants: ps })
                }}
              >
                <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
                  <SelectValue placeholder="选择 Agent" />
                </SelectTrigger>
                <SelectContent className="bg-cyber-panel border-white/10 text-white">
                  <SelectItem value="__none__">未选择</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">最大回合数</Label>
        <Select value={String(data.maxRounds || 3)} onValueChange={(v) => onUpdate({ maxRounds: Number(v) })}>
          <SelectTrigger className="bg-cyber-bg border-white/10 text-white w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-cyber-panel border-white/10 text-white">
            {[2, 3, 4, 5].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} 轮</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">裁判 Agent ID（可选，默认 Team Lead）</Label>
        <Select value={data.judgeAgentId || '__auto__'} onValueChange={(v) => onUpdate({ judgeAgentId: v === '__auto__' ? undefined : v })}>
          <SelectTrigger className="bg-cyber-bg border-white/10 text-white">
            <SelectValue placeholder="自动（Team Lead）" />
          </SelectTrigger>
          <SelectContent className="bg-cyber-panel border-white/10 text-white">
            <SelectItem value="__auto__">自动（Team Lead）</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>{agent.name || agent.id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">Team ID（可选）</Label>
        <Input value={data.teamId || ''} onChange={(e) => onUpdate({ teamId: e.target.value })} placeholder="留空则使用工作流所属团队" className="bg-cyber-bg border-white/10 text-white" />
      </div>
      <p className="text-xs text-white/40">辩论节点让两个 Agent 就特定话题进行多轮对抗，裁判 Agent 最终评判胜方，辩论结论作为节点产物传递。</p>
    </>
  )
}

// ─── Main Panel ───

export const NodePropertiesPanel = React.memo(function NodePropertiesPanel({
  selectedNode,
  agents,
  upstreamOptions,
  onUpdate,
}: NodePropertiesPanelProps) {
  if (!selectedNode) {
    return <p className="text-sm text-white/35">点击画布中的节点后可编辑其字段。</p>
  }

  const data = selectedNode.data

  return (
    <>
      {/* Common: Label */}
      <div className="space-y-2">
        <Label className="text-xs text-white/60">节点名称</Label>
        <Input
          value={data.label || ''}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="节点名称"
          className="bg-cyber-bg border-white/10 text-white"
        />
      </div>

      {/* Type-specific panels */}
      {data.type === 'task' && (
        <TaskPanel data={data} agents={agents} onUpdate={onUpdate as (p: Partial<TaskNodeData>) => void} />
      )}
      {data.type === 'condition' && (
        <ConditionPanel data={data} onUpdate={onUpdate as (p: Partial<ConditionNodeData>) => void} />
      )}
      {data.type === 'approval' && (
        <ApprovalPanel data={data} onUpdate={onUpdate as (p: Partial<ApprovalNodeData>) => void} />
      )}
      {(data.type === 'join' || data.type === 'parallel') && (
        <JoinPanel
          data={data}
          upstreamOptions={upstreamOptions}
          onUpdate={onUpdate as (p: Partial<JoinNodeData | ParallelNodeData>) => void}
        />
      )}
      {data.type === 'meeting' && (
        <MeetingPanel data={data} agents={agents} onUpdate={onUpdate as (p: Partial<MeetingNodeData>) => void} />
      )}
      {data.type === 'debate' && (
        <DebatePanel data={data} agents={agents} onUpdate={onUpdate as (p: Partial<DebateNodeData>) => void} />
      )}
    </>
  )
})
