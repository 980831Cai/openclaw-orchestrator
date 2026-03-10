import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { TeamMember, Meeting, MeetingType } from '@/types'
import { MEETING_TYPE_LABELS, MEETING_TYPE_ICONS } from '@/types'

interface MeetingCreatorProps {
  teamId: string
  members: TeamMember[]
  leadAgentId?: string | null
  onCreated?: (meeting: Meeting) => void
}

const MEETING_TYPES: MeetingType[] = ['standup', 'kickoff', 'review', 'brainstorm', 'decision', 'retro', 'debate']

export function MeetingCreator({ teamId, members, leadAgentId, onCreated }: MeetingCreatorProps) {
  const [open, setOpen] = useState(false)
  const [meetingType, setMeetingType] = useState<MeetingType>('standup')
  const [topic, setTopic] = useState('')
  const [topicDescription, setTopicDescription] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([])
  const [maxRounds, setMaxRounds] = useState(3)
  const [creating, setCreating] = useState(false)

  const isDebate = meetingType === 'debate'

  const toggleParticipant = (agentId: string) => {
    setSelectedParticipants((prev) => {
      if (prev.includes(agentId)) {
        return prev.filter((id) => id !== agentId)
      }
      // Debate mode: max 2 participants
      if (isDebate && prev.length >= 2) {
        return [...prev.slice(1), agentId]
      }
      return [...prev, agentId]
    })
  }

  const handleCreate = async () => {
    if (!topic.trim()) {
      toast({ title: '请输入议题', variant: 'destructive' })
      return
    }
    if (selectedParticipants.length < 2) {
      toast({ title: '至少需要 2 名参与者', variant: 'destructive' })
      return
    }
    if (isDebate && selectedParticipants.length !== 2) {
      toast({ title: '辩论模式需要恰好 2 名参与者', variant: 'destructive' })
      return
    }

    setCreating(true)
    try {
      const meeting = await api.post<Meeting>(`/teams/${teamId}/meetings`, {
        meetingType,
        topic: topic.trim(),
        topicDescription: topicDescription.trim() || undefined,
        participants: selectedParticipants,
        leadAgentId: leadAgentId || undefined,
        maxRounds: isDebate ? maxRounds : undefined,
      })
      toast({ title: '会议已创建', description: `${MEETING_TYPE_LABELS[meetingType]}: ${topic}` })
      onCreated?.(meeting)
      // Reset form
      setTopic('')
      setTopicDescription('')
      setSelectedParticipants([])
      setOpen(false)
    } catch (error) {
      toast({ title: '创建失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="bg-cyber-purple/20 text-cyber-lavender border border-cyber-purple/30 hover:bg-cyber-purple/30"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> 发起会议
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-cyber-surface border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <span className="text-lg">📋</span>
            发起新会议
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Meeting type selector */}
          <div className="space-y-2">
            <Label className="text-xs text-white/60">会议类型</Label>
            <div className="grid grid-cols-4 gap-2">
              {MEETING_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setMeetingType(type)
                    if (type === 'debate' && selectedParticipants.length > 2) {
                      setSelectedParticipants(selectedParticipants.slice(0, 2))
                    }
                  }}
                  className={cn(
                    'cartoon-card flex flex-col items-center gap-1 p-2.5 transition-all cursor-pointer text-center',
                    meetingType === type
                      ? 'border-cyber-purple/50 bg-cyber-purple/10'
                      : 'hover:bg-white/5'
                  )}
                >
                  <span className="text-base">{MEETING_TYPE_ICONS[type]}</span>
                  <span className={cn(
                    'text-[10px]',
                    meetingType === type ? 'text-white' : 'text-white/40'
                  )}>
                    {MEETING_TYPE_LABELS[type]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Topic */}
          <div className="space-y-2">
            <Label className="text-xs text-white/60">议题</Label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={isDebate ? '辩论主题，如：应该优先重构还是开发新功能' : '会议议题'}
              className="bg-cyber-bg border-white/10 text-white"
            />
          </div>

          {/* Topic description */}
          <div className="space-y-2">
            <Label className="text-xs text-white/60">详细描述（可选）</Label>
            <textarea
              value={topicDescription}
              onChange={(e) => setTopicDescription(e.target.value)}
              placeholder="提供更多背景信息帮助参与者理解议题..."
              className="w-full min-h-20 rounded-lg border border-white/10 bg-cyber-bg px-3 py-2 text-sm text-white outline-none resize-y"
            />
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <Label className="text-xs text-white/60">
              选择参与者
              {isDebate && <span className="text-cyber-amber ml-1">（辩论模式需要恰好 2 人）</span>}
            </Label>
            {members.length === 0 ? (
              <p className="text-white/20 text-xs py-4 text-center">团队暂无成员</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {members.map((m) => {
                  const isSelected = selectedParticipants.includes(m.agentId)
                  const isLead = m.agentId === leadAgentId
                  return (
                    <button
                      key={m.agentId}
                      onClick={() => toggleParticipant(m.agentId)}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer',
                        isSelected
                          ? 'border-cyber-purple/40 bg-cyber-purple/10'
                          : 'border-white/5 bg-cyber-bg/50 hover:border-white/15'
                      )}
                    >
                      <div className="relative">
                        <AgentAvatar emoji={m.emoji || '🤖'} theme={m.theme || '#6366F1'} size="xs" />
                        {isSelected && (
                          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-cyber-purple flex items-center justify-center">
                            <span className="text-white text-[6px]">✓</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className={cn('text-[10px] truncate', isSelected ? 'text-white' : 'text-white/50')}>
                          {m.name || m.agentId}
                        </p>
                        {isLead && <span className="text-[8px] text-cyber-amber">👑 Lead</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="text-white/20 text-[10px]">
              已选择 {selectedParticipants.length} 人{isDebate ? ' / 2' : ''}
            </p>
          </div>

          {/* Max rounds (debate only) */}
          {isDebate && (
            <div className="space-y-2">
              <Label className="text-xs text-white/60">最大回合数</Label>
              <Select value={String(maxRounds)} onValueChange={(v) => setMaxRounds(Number(v))}>
                <SelectTrigger className="bg-cyber-bg border-white/10 text-white w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-cyber-panel border-white/10 text-white">
                  {[2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} 轮</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Create button */}
          <Button
            onClick={handleCreate}
            disabled={creating || !topic.trim() || selectedParticipants.length < 2}
            className="w-full bg-gradient-to-r from-cyber-purple/80 to-cyber-purple"
          >
            {creating ? (
              <span className="animate-pulse">创建中...</span>
            ) : (
              <>
                {MEETING_TYPE_ICONS[meetingType]} 创建{MEETING_TYPE_LABELS[meetingType]}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
