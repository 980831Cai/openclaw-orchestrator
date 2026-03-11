import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, Send, Sparkles } from 'lucide-react'

import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { EmptyState } from '@/components/brand/EmptyState'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { useAgents } from '@/hooks/use-agents'
import { useWebSocket } from '@/hooks/use-websocket'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitor-store'
import type { AgentListItem, SessionMessage } from '@/types'

interface Session {
  id: string
  name: string
  messageCount: number
  lastActivity: string
}

const MAIN_SESSION: Session = {
  id: 'main',
  name: 'main',
  messageCount: 0,
  lastActivity: '',
}

function isInternalWorkflowSession(sessionId: string) {
  return sessionId.startsWith('wf-') || sessionId.startsWith('approval-')
}

function sortSessions(left: Session, right: Session) {
  if (left.id === 'main') return -1
  if (right.id === 'main') return 1
  return (right.lastActivity || '').localeCompare(left.lastActivity || '')
}

export function ChatPage() {
  const { agents, fetchAgents } = useAgents()
  const [selectedAgent, setSelectedAgent] = useState<AgentListItem | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSessionPicker, setShowSessionPicker] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { realtimeMessages } = useMonitorStore()

  const visibleSessions = sessions
    .filter((session) => !isInternalWorkflowSession(session.id))
    .sort(sortSessions)
  const availableSessions = visibleSessions.some((session) => session.id === 'main')
    ? visibleSessions
    : [MAIN_SESSION, ...visibleSessions]
  const hiddenSessionCount = sessions.length - visibleSessions.length
  const hasMultipleSessions = availableSessions.length > 1

  useWebSocket()

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  useEffect(() => {
    if (agents.length === 0) return

    const params = new URLSearchParams(window.location.search)
    const agentParam = params.get('agent')
    if (!agentParam || selectedAgent) return

    const match = agents.find((agent) => agent.id === agentParam || agent.name === agentParam)
    if (match) {
      setSelectedAgent(match)
    }
  }, [agents, selectedAgent])

  useEffect(() => {
    if (!selectedAgent) return

    void api.get<Session[]>(`/agents/${selectedAgent.id}/sessions`).then((items) => {
      const sortedItems = [...items].sort(sortSessions)
      setSessions(sortedItems)
      setSelectedSession((current) =>
        current && sortedItems.some((item) => item.id === current) ? current : 'main'
      )
    })
  }, [selectedAgent])

  useEffect(() => {
    if (!selectedAgent || !selectedSession) return

    void api
      .get<SessionMessage[]>(`/agents/${selectedAgent.id}/sessions/${selectedSession}/messages`)
      .then(setMessages)
  }, [selectedAgent, selectedSession])

  useEffect(() => {
    if (!selectedAgent || !selectedSession) return

    const nextMessages = realtimeMessages.filter(
      (message) => message.agentId === selectedAgent.id && message.sessionId === selectedSession
    )
    if (nextMessages.length === 0) return

    setMessages((previous) => {
      const existingIds = new Set(previous.map((message) => message.id))
      const uniqueMessages = nextMessages.filter((message) => !existingIds.has(message.id))
      return uniqueMessages.length > 0 ? [...previous, ...uniqueMessages] : previous
    })
  }, [realtimeMessages, selectedAgent, selectedSession])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !selectedAgent || !selectedSession) return

    const content = input.trim()
    setSending(true)

    try {
      await api.post(`/agents/${selectedAgent.id}/sessions/${selectedSession}/send`, { content })
      setInput('')
      const refreshed = await api.get<SessionMessage[]>(
        `/agents/${selectedAgent.id}/sessions/${selectedSession}/messages`
      )
      setMessages(refreshed)
    } catch (error) {
      toast({
        title: '发送失败',
        description: error instanceof Error ? error.message : '消息没有成功发给 OpenClaw。',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex w-64 min-h-0 flex-col border-r border-white/5 bg-cyber-surface/20">
        <div className="border-b border-white/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <MessageSquare className="h-4 w-4 text-cyber-blue" />
            通信频道
          </h2>
          <p className="mt-1 text-[10px] text-white/20">选择 Agent 开始对话</p>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {agents.length === 0 ? (
            <div className="py-8">
              <EmptyState scene="no-agents" className="py-4" />
            </div>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  setSelectedAgent(agent)
                  setMessages([])
                  setSelectedSession('main')
                  setShowSessionPicker(false)
                }}
                className={cn(
                  'group flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-transparent p-3 text-left transition-all',
                  selectedAgent?.id === agent.id ? 'cartoon-card border-cyber-blue/30' : 'hover:bg-white/5'
                )}
              >
                <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white group-hover:text-white/90">{agent.name}</p>
                  <p className="flex items-center gap-1 text-[10px] text-white/25">
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        agent.status === 'busy'
                          ? 'bg-cyber-green animate-pulse'
                          : agent.status === 'idle'
                            ? 'bg-cyber-blue'
                            : 'bg-white/20'
                      )}
                    />
                    {agent.status === 'busy' ? '工作中' : agent.status === 'idle' ? '在线' : '离线'}
                  </p>
                </div>
                {selectedAgent?.id !== agent.id && agent.status === 'busy' ? (
                  <div className="h-2 w-2 flex-shrink-0 rounded-full bg-cyber-amber animate-pulse" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!selectedAgent ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <EmptyState
              scene="no-messages"
              title="选择一个 Agent"
              description="从左侧列表选择一个 Agent 开始对话。"
            />
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 shrink-0 border-b border-white/5 bg-cyber-surface/90 backdrop-blur">
              <div className="flex items-center gap-3 px-6 py-3">
                <button
                  type="button"
                  onClick={() => setShowSessionPicker((current) => !current)}
                  className="rounded-full transition-transform hover:scale-105"
                  aria-label="切换会话列表"
                >
                  <AgentAvatar
                    emoji={selectedAgent.emoji || '🤖'}
                    theme={selectedAgent.theme}
                    status={selectedAgent.status}
                    size="sm"
                  />
                </button>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{selectedAgent.name}</p>
                  <p className="flex items-center gap-1 text-[10px] text-white/25">
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        selectedAgent.status === 'busy' ? 'bg-cyber-green animate-pulse' : 'bg-cyber-blue'
                      )}
                    />
                    {selectedAgent.status === 'busy' ? '工作中' : '在线'}
                    {hasMultipleSessions ? <span className="ml-2">{availableSessions.length} 个会话</span> : null}
                    {hiddenSessionCount > 0 ? <span>已隐藏 {hiddenSessionCount} 个工作流会话</span> : null}
                    {selectedAgent.model ? (
                      <span className="ml-2 rounded border border-cyber-purple/10 bg-cyber-purple/10 px-1.5 py-0.5 text-[9px] text-cyber-lavender/50">
                        {selectedAgent.model}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>

              {showSessionPicker && hasMultipleSessions ? (
                <div className="flex gap-1 overflow-x-auto px-6 pb-3">
                  {availableSessions.slice(0, 8).map((session) => (
                    <button
                      key={session.id}
                      onClick={() => setSelectedSession(session.id)}
                      className={cn(
                        'shrink-0 cursor-pointer rounded-lg px-2.5 py-1 text-[10px] transition-colors',
                        selectedSession === session.id
                          ? 'border border-cyber-blue/20 bg-cyber-blue/15 text-white'
                          : 'text-white/25 hover:bg-white/5 hover:text-white/50'
                      )}
                    >
                      {session.name.slice(0, 12)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              {messages.length === 0 ? (
                <EmptyState
                  scene="no-messages"
                  title="暂无消息"
                  description={`向 ${selectedAgent.name} 发送第一条消息开始对话。`}
                  className="h-full"
                />
              ) : (
                <>
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} agent={selectedAgent} />
                  ))}
                  {sending ? (
                    <div className="flex items-center gap-3 animate-msg-slide-left">
                      <AgentAvatar emoji={selectedAgent.emoji || '🤖'} theme={selectedAgent.theme} size="sm" className="mt-1 flex-shrink-0" />
                      <div className="cartoon-card flex items-center gap-1.5 px-4 py-3">
                        <div className="h-2 w-2 rounded-full bg-cyber-lavender/40 animate-dot-pulse" style={{ animationDelay: '0s' }} />
                        <div className="h-2 w-2 rounded-full bg-cyber-lavender/40 animate-dot-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="h-2 w-2 rounded-full bg-cyber-lavender/40 animate-dot-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="shrink-0 border-t border-white/5 bg-cyber-surface/20 p-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder={`发送消息给 ${selectedAgent.name}...`}
                    className="w-full rounded-xl border-2 border-white/8 bg-white/5 px-4 py-3 text-sm text-white transition-all placeholder:text-white/20 focus:border-cyber-blue/40 focus:outline-none"
                    disabled={sending}
                  />
                  {input.trim() ? (
                    <Sparkles className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyber-lavender/30 animate-cartoon-sparkle" />
                  ) : null}
                </div>
                <Button
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || sending}
                  className={cn(
                    'h-11 rounded-xl px-5 transition-all',
                    input.trim()
                      ? 'bg-gradient-to-r from-cyber-blue to-cyber-purple hover:from-cyber-blue/90 hover:to-cyber-purple/90'
                      : 'bg-white/5 text-white/20'
                  )}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message, agent }: { message: SessionMessage; agent: AgentListItem }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center animate-fade-in">
        <span className="rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[10px] text-white/20">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse animate-msg-slide-right' : 'animate-msg-slide-left')}>
      {!isUser ? (
        <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} size="sm" className="mt-1 flex-shrink-0" />
      ) : null}

      <div className={cn('max-w-[70%]', isUser ? 'items-end' : 'items-start')}>
        {!isUser ? (
          <p className="mb-1 flex items-center gap-1 px-1 text-[10px] text-white/25">
            {agent.name}
            <Sparkles className="h-2.5 w-2.5 text-cyber-lavender/30" />
          </p>
        ) : null}

        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'rounded-br-md border border-cyber-blue/10 bg-gradient-to-r from-cyber-blue/20 to-cyber-purple/15 text-white/90'
              : 'cartoon-card rounded-bl-md text-white/70'
          )}
        >
          {message.content}
        </div>

        <p className={cn('mt-1 px-1 text-[9px] text-white/12', isUser ? 'text-right' : '')}>
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </p>
      </div>
    </div>
  )
}
