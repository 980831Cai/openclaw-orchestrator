import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, Play, Square, FileText, Clock, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Meeting } from '@/types'
import { MEETING_TYPE_LABELS, MEETING_TYPE_ICONS, MEETING_STATUS_LABELS } from '@/types'

interface MeetingDetailProps {
  meetingId: string
  onBack: () => void
}

const STATUS_COLORS: Record<string, string> = {
  preparing: 'bg-cyber-amber/10 text-cyber-amber border-cyber-amber/20',
  in_progress: 'bg-cyber-green/10 text-cyber-green border-cyber-green/20',
  concluded: 'bg-cyber-blue/10 text-cyber-blue border-cyber-blue/20',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/20',
}

export function MeetingDetail({ meetingId, onBack }: MeetingDetailProps) {
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchMeeting = useCallback(async () => {
    try {
      const [meetingData, contentData] = await Promise.all([
        api.get<Meeting>(`/meetings/${meetingId}`),
        api.get<{ content: string }>(`/meetings/${meetingId}/content`).catch(() => ({ content: '' })),
      ])
      setMeeting(meetingData)
      setContent(contentData.content)
    } catch (error) {
      toast({ title: '加载失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  useEffect(() => {
    fetchMeeting()
  }, [fetchMeeting])

  // Poll for updates when meeting is in progress
  useEffect(() => {
    if (!meeting || meeting.status !== 'in_progress') return undefined
    const timer = window.setInterval(fetchMeeting, 3000)
    return () => window.clearInterval(timer)
  }, [meeting?.status, fetchMeeting])

  const handleStart = async () => {
    try {
      await api.post(`/meetings/${meetingId}/start`)
      toast({ title: '会议已开始' })
      fetchMeeting()
    } catch (error) {
      toast({ title: '启动失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }

  const handleConclude = async () => {
    try {
      await api.post(`/meetings/${meetingId}/conclude`)
      toast({ title: '会议已结束' })
      fetchMeeting()
    } catch (error) {
      toast({ title: '结束失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }

  const handleCancel = async () => {
    try {
      await api.post(`/meetings/${meetingId}/cancel`)
      toast({ title: '会议已取消' })
      fetchMeeting()
    } catch (error) {
      toast({ title: '取消失败', description: error instanceof Error ? error.message : '未知错误', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-pulse text-white/30">加载会议详情...</div>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="text-center py-16">
        <p className="text-white/30">会议不存在</p>
        <Button variant="ghost" size="sm" className="mt-2 text-white/40" onClick={onBack}>
          返回
        </Button>
      </div>
    )
  }

  const isDebate = meeting.meetingType === 'debate'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="text-white/40 hover:text-white h-8 px-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">{MEETING_TYPE_ICONS[meeting.meetingType]}</span>
            <h3 className="text-white font-semibold text-sm truncate">{meeting.topic}</h3>
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border',
              STATUS_COLORS[meeting.status] || 'bg-white/5 text-white/40 border-white/10'
            )}>
              {MEETING_STATUS_LABELS[meeting.status]}
            </span>
          </div>
          <p className="text-white/30 text-[10px] mt-0.5">
            {MEETING_TYPE_LABELS[meeting.meetingType]}
            {isDebate && ` · 第 ${meeting.currentRound}/${meeting.maxRounds} 轮`}
            {' · '}{new Date(meeting.createdAt).toLocaleString()}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {meeting.status === 'preparing' && (
            <Button size="sm" onClick={handleStart} className="bg-cyber-green/15 text-cyber-green border border-cyber-green/25 hover:bg-cyber-green/25 h-8">
              <Play className="w-3.5 h-3.5 mr-1" /> 开始
            </Button>
          )}
          {meeting.status === 'in_progress' && (
            <>
              <Button size="sm" onClick={handleConclude} className="bg-cyber-blue/15 text-cyber-blue border border-cyber-blue/25 hover:bg-cyber-blue/25 h-8">
                <FileText className="w-3.5 h-3.5 mr-1" /> 总结
              </Button>
              <Button size="sm" onClick={handleCancel} variant="destructive" className="h-8">
                <Square className="w-3.5 h-3.5 mr-1" /> 取消
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Meeting info cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="cartoon-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3 h-3 text-cyber-purple/60" />
            <span className="text-white/40 text-[10px]">参与者</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {meeting.participants.map((p) => (
              <span key={p} className="text-[10px] text-white/60 bg-white/5 px-1.5 py-0.5 rounded">
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="cartoon-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3 h-3 text-cyber-amber/60" />
            <span className="text-white/40 text-[10px]">时间</span>
          </div>
          <p className="text-white/60 text-[10px]">{new Date(meeting.createdAt).toLocaleString()}</p>
          {meeting.concludedAt && (
            <p className="text-cyber-green/60 text-[10px]">结束: {new Date(meeting.concludedAt).toLocaleString()}</p>
          )}
        </div>

        {meeting.leadAgentId && (
          <div className="cartoon-card p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px]">👑</span>
              <span className="text-white/40 text-[10px]">主持人</span>
            </div>
            <p className="text-white/60 text-xs">{meeting.leadAgentId}</p>
          </div>
        )}
      </div>

      {/* Topic description */}
      {meeting.topicDescription && (
        <div className="cartoon-card p-4">
          <p className="text-white/40 text-[10px] mb-1">议题描述</p>
          <p className="text-white/70 text-xs leading-relaxed">{meeting.topicDescription}</p>
        </div>
      )}

      {/* Meeting content / real-time transcript */}
      <div className="cartoon-card p-4 min-h-[200px]">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-3.5 h-3.5 text-cyber-purple/60" />
          <span className="text-white/50 text-xs font-semibold">会议记录</span>
          {meeting.status === 'in_progress' && (
            <span className="flex items-center gap-1 text-cyber-green text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
              实时更新中
            </span>
          )}
        </div>

        {content ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <pre className="text-white/60 text-xs whitespace-pre-wrap font-mono leading-relaxed bg-cyber-bg/30 rounded-lg p-3 max-h-[400px] overflow-y-auto">
              {content}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <span className="text-3xl opacity-20 mb-2">📝</span>
            <p className="text-white/20 text-xs">
              {meeting.status === 'preparing' ? '会议尚未开始' : '暂无记录内容'}
            </p>
          </div>
        )}
      </div>

      {/* Summary */}
      {meeting.summary && (
        <div className="cartoon-card p-4 border-cyber-green/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm">✅</span>
            <span className="text-white/50 text-xs font-semibold">会议结论</span>
          </div>
          <p className="text-white/70 text-xs leading-relaxed whitespace-pre-wrap">{meeting.summary}</p>
        </div>
      )}
    </div>
  )
}
