import { useEffect, useState, useCallback } from 'react'
import { Calendar, Filter } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MeetingCreator } from './MeetingCreator'
import { MeetingDetail } from './MeetingDetail'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { Meeting, MeetingStatus, TeamMember } from '@/types'
import { MEETING_TYPE_LABELS, MEETING_TYPE_ICONS, MEETING_STATUS_LABELS } from '@/types'

interface MeetingPanelProps {
  teamId: string
  members: TeamMember[]
  leadAgentId?: string | null
}

const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-cyber-amber/10 text-cyber-amber border-cyber-amber/20',
  in_progress: 'bg-cyber-green/10 text-cyber-green border-cyber-green/20 animate-pulse',
  concluded: 'bg-cyber-blue/10 text-cyber-blue border-cyber-blue/20',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/20',
}

export function MeetingPanel({ teamId, members, leadAgentId }: MeetingPanelProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMeetings = useCallback(async () => {
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const data = await api.get<Meeting[]>(`/teams/${teamId}/meetings${params}`)
      setMeetings(data)
    } catch {
      // silently fail, list will be empty
    } finally {
      setLoading(false)
    }
  }, [teamId, statusFilter])

  useEffect(() => {
    fetchMeetings()
  }, [fetchMeetings])

  // Auto-refresh for active meetings
  useEffect(() => {
    const hasActive = meetings.some((m) => m.status === 'in_progress')
    if (!hasActive) return undefined
    const timer = window.setInterval(fetchMeetings, 5000)
    return () => window.clearInterval(timer)
  }, [meetings, fetchMeetings])

  const handleCreated = (meeting: Meeting) => {
    setMeetings((prev) => [meeting, ...prev])
    setSelectedMeetingId(meeting.id)
  }

  // Show detail view if a meeting is selected
  if (selectedMeetingId) {
    return (
      <MeetingDetail
        meetingId={selectedMeetingId}
        onBack={() => {
          setSelectedMeetingId(null)
          fetchMeetings()
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4 text-cyber-purple" />
          团队会议
          <span className="text-white/20 text-xs font-normal">
            {meetings.length} 场
          </span>
        </h3>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-28 h-8 text-xs bg-cyber-bg/50 border-white/10 text-white/60">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-cyber-panel border-white/10 text-white">
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="preparing">准备中</SelectItem>
              <SelectItem value="in_progress">进行中</SelectItem>
              <SelectItem value="concluded">已结束</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>

          <MeetingCreator
            teamId={teamId}
            members={members}
            leadAgentId={leadAgentId}
            onCreated={handleCreated}
          />
        </div>
      </div>

      {/* Meeting list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-white/30 text-sm">加载中...</div>
        </div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-12">
          <span className="text-4xl opacity-20 block mb-3">📋</span>
          <p className="text-white/20 text-sm">暂无会议记录</p>
          <p className="text-white/10 text-xs mt-1">点击「发起会议」开始第一场会议</p>
        </div>
      ) : (
        <div className="space-y-2">
          {meetings.map((meeting, i) => (
            <button
              key={meeting.id}
              onClick={() => setSelectedMeetingId(meeting.id)}
              className={cn(
                'w-full cartoon-card p-4 flex items-center gap-3 cursor-pointer text-left',
                'hover:border-cyber-purple/30 transition-all animate-fade-in'
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Type icon */}
              <div className="w-10 h-10 rounded-xl bg-cyber-purple/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">{MEETING_TYPE_ICONS[meeting.meetingType]}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white text-sm font-medium truncate">{meeting.topic}</p>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0',
                    STATUS_COLORS[meeting.status] || 'bg-white/5 text-white/40 border-white/10'
                  )}>
                    {MEETING_STATUS_LABELS[meeting.status]}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-white/30 text-[10px]">
                    {MEETING_TYPE_LABELS[meeting.meetingType]}
                  </span>
                  <span className="text-white/15 text-[10px]">·</span>
                  <span className="text-white/30 text-[10px]">
                    {meeting.participants.length} 人
                  </span>
                  {meeting.meetingType === 'debate' && (
                    <>
                      <span className="text-white/15 text-[10px]">·</span>
                      <span className="text-white/30 text-[10px]">
                        {meeting.currentRound}/{meeting.maxRounds} 轮
                      </span>
                    </>
                  )}
                  <span className="text-white/15 text-[10px]">·</span>
                  <span className="text-white/20 text-[10px]">
                    {new Date(meeting.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Summary preview */}
              {meeting.summary && (
                <div className="hidden md:block max-w-[200px] flex-shrink-0">
                  <p className="text-white/20 text-[10px] truncate">{meeting.summary}</p>
                </div>
              )}

              {/* Arrow */}
              <span className="text-white/15 text-xs">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
