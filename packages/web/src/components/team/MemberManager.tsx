import { useEffect, useState } from 'react'
import { Users, UserPlus, X, GripVertical, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import type { TeamMember, AgentListItem, AgentStatus } from '@/types'

interface MemberManagerProps {
  teamId: string
  members: TeamMember[]
  leadAgentId?: string | null
  onMembersChange?: () => void
}

const ROLES = ['leader', 'member', 'reviewer', 'specialist']
const ROLE_LABELS: Record<string, string> = {
  leader: '负责人',
  member: '成员',
  reviewer: '审核者',
  specialist: '专家',
}

const STATUS_CFG: Record<AgentStatus, { color: string; label: string }> = {
  busy: { color: '#22C55E', label: '执行中' },
  idle: { color: '#3B82F6', label: '空闲' },
  scheduled: { color: '#06B6D4', label: '值守中' },
  error: { color: '#EF4444', label: '异常' },
  offline: { color: '#6B7280', label: '离线' },
}

export function MemberManager({ teamId, members, leadAgentId, onMembersChange }: MemberManagerProps) {
  const [allAgents, setAllAgents] = useState<AgentListItem[]>([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api.get<AgentListItem[]>('/agents').then(setAllAgents)
  }, [])

  const handleSetLead = async (agentId: string) => {
    try {
      await api.put(`/teams/${teamId}/lead`, { agentId })
      toast({ title: '已设置 Team Lead', description: agentId })
      onMembersChange?.()
    } catch (error) {
      toast({ title: '设置失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }

  const memberIds = new Set(members.map((m) => m.agentId))
  const availableAgents = allAgents.filter((a) => !memberIds.has(a.id))

  const handleAdd = async (agentId: string) => {
    await api.post(`/teams/${teamId}/members`, { agentId, role: 'member' })
    onMembersChange?.()
    setAdding(false)
  }

  const handleRemove = async (agentId: string) => {
    await api.delete(`/teams/${teamId}/members/${agentId}`)
    onMembersChange?.()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-cyber-lavender" />
          {members.length} 名成员
        </h3>
        <Button
          size="sm"
          onClick={() => setAdding(!adding)}
          className="bg-cyber-purple/20 text-cyber-lavender border border-cyber-purple/30 hover:bg-cyber-purple/30"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" /> 邀请 Agent
        </Button>
      </div>

      {/* Available agents pool (shown when adding) */}
      {adding && (
        <div className="glass rounded-xl p-4 animate-fade-in">
          <p className="text-white/50 text-xs mb-3">选择要加入团队的 Agent：</p>
          {availableAgents.length === 0 ? (
            <p className="text-white/20 text-center py-4 text-xs">没有可用的 Agent</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {availableAgents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => handleAdd(agent.id)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-cyber-bg/50 border border-white/5 hover:border-cyber-purple/30 hover:bg-cyber-purple/10 transition-all cursor-pointer group"
                >
                  <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} size="sm" />
                  <span className="text-white/60 text-[10px] truncate max-w-full group-hover:text-white transition-colors">
                    {agent.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Current members list */}
      {members.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-white/10 mx-auto mb-3" />
          <p className="text-white/20">暂无成员，点击邀请添加 Agent</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => {
            const isLead = m.agentId === leadAgentId
            const memberStatus: AgentStatus = (m.status as AgentStatus) || 'idle'
            const sCfg = STATUS_CFG[memberStatus]
            return (
              <div
                key={m.agentId}
                className={cn(
                  'glass rounded-xl p-3 flex items-center gap-3 group hover:border-white/15 transition-all animate-fade-in',
                  isLead && 'ring-1 ring-cyber-amber/30 bg-cyber-amber/5'
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <GripVertical className="w-3.5 h-3.5 text-white/10 cursor-grab" />
                <div className="relative flex flex-col items-center gap-1">
                  <AgentAvatar emoji={m.emoji || '🤖'} theme={m.theme || '#6366F1'} status={memberStatus} size="sm" />
                  {/* Status bar under avatar */}
                  <div
                    className={cn(
                      'h-[2px] rounded-full transition-all',
                      memberStatus === 'busy' ? 'w-6 animate-pulse' : 'w-4',
                    )}
                    style={{ backgroundColor: sCfg.color }}
                  />
                  {isLead && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-cyber-amber/20 flex items-center justify-center border border-cyber-amber/30">
                      <Crown className="w-2.5 h-2.5 text-cyber-amber" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-white text-sm font-medium truncate">{m.name || m.agentId}</p>
                    {isLead && (
                      <span className="text-[9px] text-cyber-amber bg-cyber-amber/10 px-1 py-0.5 rounded">Lead</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1">
                      <span
                        className={cn('w-1.5 h-1.5 rounded-full inline-block', memberStatus === 'busy' && 'animate-pulse')}
                        style={{ backgroundColor: sCfg.color }}
                      />
                      <span className="text-[10px]" style={{ color: `${sCfg.color}CC` }}>{sCfg.label}</span>
                    </div>
                    <span className="text-white/15 text-[10px]">·</span>
                    <p className="text-white/30 text-[10px]">加入 #{m.joinOrder}</p>
                  </div>
                </div>
                <Select defaultValue={m.role || 'member'}>
                  <SelectTrigger className="w-28 h-8 text-xs bg-cyber-bg/50 border-white/10 text-white/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-cyber-surface border-white/10">
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="text-white/70 text-xs focus:bg-cyber-purple/20 focus:text-white">
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isLead && (
                  <button
                    onClick={() => handleSetLead(m.agentId)}
                    title="设为 Team Lead"
                    className="p-1.5 rounded-lg text-white/15 hover:text-cyber-amber hover:bg-cyber-amber/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <Crown className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleRemove(m.agentId)}
                  className="p-1.5 rounded-lg text-white/20 hover:text-cyber-red hover:bg-cyber-red/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
