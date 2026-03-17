import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, Send, Loader2, Sparkles } from 'lucide-react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { EmptyState } from '@/components/brand/EmptyState'
import { Button } from '@/components/ui/button'
import { useAgents } from '@/hooks/use-agents'
import { useMonitorStore } from '@/stores/monitor-store'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { mergeRealtimeMessages } from '@/lib/realtime-message'
import { cn } from '@/lib/utils'
import type { AgentListItem, SessionMessage } from '@/types'

interface Session {
  id: string
  name: string
  messageCount: number
  lastActivity: string
}

interface SendMessageResult {
  success: boolean
  message: string
  method?: string
  sessionKey?: string | null
  correlationId?: string | null
}

function parseSessionKey(value?: string | null): { agentId?: string; sessionId?: string } {
  if (!value) return {}
  if (value.startsWith('agent:')) {
    const parts = value.split(':')
    if (parts.length >= 3) {
      return {
        agentId: parts[1],
        sessionId: parts.slice(2).join(':'),
      }
    }
  }
  if (value.startsWith('agent/')) {
    const parts = value.split('/')
    if (parts.length >= 3) {
      return {
        agentId: parts[1],
        sessionId: parts.slice(2).join('/'),
      }
    }
  }
  return {}
}

function resolveMessageAgentId(message: SessionMessage): string | undefined {
  if (message.agentId) return message.agentId
  if (message.sessionKey) {
    return parseSessionKey(message.sessionKey).agentId
  }
  return undefined
}

function resolveMessageSessionId(message: SessionMessage): string {
  if (message.sessionId) return message.sessionId
  if (message.sessionKey) {
    const parsed = parseSessionKey(message.sessionKey)
    if (parsed.sessionId) return parsed.sessionId
  }
  return 'main'
}

function sortSessions(items: Session[]): Session[] {
  return [...items].sort((left, right) => {
    if (left.id === 'main' && right.id !== 'main') return -1
    if (right.id === 'main' && left.id !== 'main') return 1

    const leftTime = Date.parse(left.lastActivity || '')
    const rightTime = Date.parse(right.lastActivity || '')
    if (!Number.isNaN(leftTime) || !Number.isNaN(rightTime)) {
      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime)
    }

    return left.name.localeCompare(right.name)
  })
}

function resolvePreferredSessionId(items: Session[]): string {
  if (items.length === 0) return 'main'
  return items.find((session) => session.id === 'main')?.id ?? items[0].id
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function hasMessageContent(items: SessionMessage[], role: SessionMessage['role'], content: string): boolean {
  const normalized = content.trim()
  return items.some((message) => message.role === role && message.content.trim() === normalized)
}

export function ChatPage() {
  const { agents, loading: agentsLoading, fetchAgents } = useAgents()
  const [searchParams] = useSearchParams()
  const [selectedAgent, setSelectedAgent] = useState<AgentListItem | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchAgents() }, [fetchAgents])

  // Auto-select agent from URL query ?agent=xxx (e.g., from DeskSlot click)
  useEffect(() => {
    if (agents.length === 0) return
    const agentParam = searchParams.get('agent')
    if (!agentParam) return

    const match = agents.find((a) => a.id === agentParam || a.name === agentParam)
    if (!match) return
    if (selectedAgent?.id === match.id) return

    setSelectedAgent(match)
    setSelectedSession(null)
  }, [agents, searchParams, selectedAgent])

  useEffect(() => {
    if (!selectedAgent) return
    const latest = agents.find((agent) => agent.id === selectedAgent.id)
    if (!latest) return
    if (latest !== selectedAgent) {
      setSelectedAgent(latest)
    }
  }, [agents, selectedAgent])

  useEffect(() => {
    if (!selectedAgent) {
      setSessions([])
      setSelectedSession(null)
      return
    }

    let disposed = false

    setSelectedSession(null)
    setSessionsLoading(true)

    api
      .get<Session[]>(`/agents/${selectedAgent.id}/sessions`)
      .then((s) => {
        if (disposed) return

        const normalizedSessions = sortSessions(
          s.length > 0
            ? s
            : [{ id: 'main', name: 'Main', messageCount: 0, lastActivity: new Date().toISOString() }]
        )
        setSessions(normalizedSessions)
        setSelectedSession(resolvePreferredSessionId(normalizedSessions))
      })
      .catch(() => {
        if (disposed) return
        const fallbackSessions = [{ id: 'main', name: 'Main', messageCount: 0, lastActivity: '' }]
        setSessions(fallbackSessions)
        setSelectedSession('main')
      })
      .finally(() => {
        if (!disposed) {
          setSessionsLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [selectedAgent])

  useEffect(() => {
    if (!selectedAgent) {
      setMessages([])
      setMessagesLoading(false)
      return
    }

    if (!selectedSession) {
      setMessagesLoading(false)
      return
    }

    let disposed = false
    setMessagesLoading(true)

    api
      .get<SessionMessage[]>(`/agents/${selectedAgent.id}/sessions/${selectedSession}/messages`)
      .then((nextMessages) => {
        if (!disposed) {
          setMessages(nextMessages)
        }
      })
      .catch(() => {
        if (!disposed) {
          setMessages([])
        }
      })
      .finally(() => {
        if (!disposed) {
          setMessagesLoading(false)
        }
      })

    return () => {
      disposed = true
    }
  }, [selectedAgent, selectedSession])

  // Real-time: merge new messages from WebSocket into current view
  const { realtimeMessages } = useMonitorStore()
  useEffect(() => {
    if (!selectedAgent || !selectedSession) return
    const newMsgs = realtimeMessages.filter((m) => {
      const messageAgentId = resolveMessageAgentId(m)
      if (messageAgentId && messageAgentId !== selectedAgent.id) {
        return false
      }
      return resolveMessageSessionId(m) === selectedSession
    })
    if (newMsgs.length === 0) return
    setMessages((prev) => mergeRealtimeMessages(prev, newMsgs))
  }, [realtimeMessages, selectedAgent, selectedSession])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const refreshSessionsForAgent = async (agentId: string, preferredSessionId?: string | null) => {
    try {
      const nextSessions = await api.get<Session[]>(`/agents/${agentId}/sessions`)
      const normalizedSessions = sortSessions(
        nextSessions.length > 0
          ? nextSessions
          : [{ id: 'main', name: 'Main', messageCount: 0, lastActivity: new Date().toISOString() }]
      )
      setSessions(normalizedSessions)
      const nextSelectedSession =
        preferredSessionId && normalizedSessions.some((session) => session.id === preferredSessionId)
          ? preferredSessionId
          : resolvePreferredSessionId(normalizedSessions)
      setSelectedSession(nextSelectedSession)
      return nextSelectedSession
    } catch {
      const fallbackSessions = [{ id: 'main', name: 'Main', messageCount: 0, lastActivity: '' }]
      setSessions(fallbackSessions)
      setSelectedSession('main')
      return 'main'
    }
  }

  const handleSend = async () => {
    const content = input.trim()
    if (!content || !selectedAgent || !selectedSession) return

    const baselineMessageCount = messages.length
    const optimisticMessage: SessionMessage = {
      id: `pending-${Date.now()}`,
      sessionId: selectedSession,
      agentId: selectedAgent.id,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    setSending(true)
    setInput('')
    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const result = await api.post<SendMessageResult>(
        `/agents/${selectedAgent.id}/sessions/${selectedSession}/send`,
        { content }
      )

      const actualSessionId = result.sessionKey ? (parseSessionKey(result.sessionKey).sessionId ?? selectedSession) : selectedSession
      const resolvedSessionId = await refreshSessionsForAgent(selectedAgent.id, actualSessionId)

      const pollIntervals = [150, 500, 1200, 2500, 4000]
      let latestMessages: SessionMessage[] = []

      for (const delay of pollIntervals) {
        await sleep(delay)
        latestMessages = await api.get<SessionMessage[]>(
          `/agents/${selectedAgent.id}/sessions/${resolvedSessionId}/messages`
        )
        setMessages((prev) => mergeRealtimeMessages(prev, latestMessages))

        const userMessageReady = hasMessageContent(latestMessages, 'user', content)
        const lastMessage = latestMessages[latestMessages.length - 1]
        const assistantCaughtUp =
          latestMessages.length >= baselineMessageCount + 2 || lastMessage?.role === 'assistant'

        if (userMessageReady && assistantCaughtUp) {
          break
        }
      }
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticMessage.id))
      const description = error instanceof Error ? error.message : '消息发送失败'
      toast({
        title: '发送失败',
        description,
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Agent list sidebar ── */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-cyber-surface/20 min-h-0">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cyber-blue" />
            通信频道
          </h2>
          <p className="text-white/20 text-[10px] mt-1">选择 Agent 开始对话</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {agentsLoading ? (
            <div className="py-8">
              <EmptyState scene="loading" title="加载 Agent 中..." description="正在同步可用会话目标" className="py-4" />
            </div>
          ) : agents.length === 0 ? (
            <div className="py-8">
              <EmptyState scene="no-agents" className="py-4" />
            </div>
          ) : (
            agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  setSelectedAgent(agent)
                  setSelectedSession(null)
                }}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer text-left group',
                  selectedAgent?.id === agent.id
                    ? 'cartoon-card border-cyber-blue/30'
                    : 'hover:bg-white/5 border-2 border-transparent'
                )}
              >
                <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate group-hover:text-white/90">{agent.name}</p>
                  <p className="text-white/25 text-[10px] flex items-center gap-1">
                    <span className={cn(
                      'w-1.5 h-1.5 rounded-full inline-block',
                      agent.status === 'busy' ? 'bg-cyber-green animate-pulse' : agent.status === 'idle' ? 'bg-cyber-blue' : 'bg-white/20'
                    )} />
                    {agent.status === 'busy' ? '工作中' : agent.status === 'idle' ? '在线' : '离线'}
                  </p>
                </div>
                {/* Unread indicator dot */}
                {selectedAgent?.id !== agent.id && agent.status === 'busy' && (
                  <div className="w-2 h-2 rounded-full bg-cyber-amber animate-pulse flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col min-h-0">
        {agentsLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <EmptyState scene="loading" title="加载通信频道..." description="正在同步 Agent 与会话列表" />
          </div>
        ) : !selectedAgent ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <EmptyState
              scene="no-messages"
              title="选择一个 Agent"
              description="从左侧列表中选择一个 Agent 开始对话"
            />
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-white/5 bg-cyber-surface/20">
              <AgentAvatar emoji={selectedAgent.emoji || '🤖'} theme={selectedAgent.theme} status={selectedAgent.status} size="sm" />
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">{selectedAgent.name}</p>
                <p className="text-white/25 text-[10px] flex items-center gap-1">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full inline-block',
                    selectedAgent.status === 'busy'
                      ? 'bg-cyber-green animate-pulse'
                      : selectedAgent.status === 'idle'
                        ? 'bg-cyber-blue'
                        : 'bg-white/20'
                  )} />
                  {sessions.length > 1 ? `${sessions.length} 会话` : '主会话'}
                  {selectedAgent.model && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-cyber-purple/10 text-cyber-lavender/50 text-[9px] border border-cyber-purple/10">
                      {selectedAgent.model}
                    </span>
                  )}
                </p>
              </div>
              {/* Session tabs */}
              {!sessionsLoading && sessions.length > 1 && (
                <div className="flex gap-1">
                  {sessions.slice(0, 5).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSession(s.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[10px] transition-colors cursor-pointer',
                        selectedSession === s.id
                          ? 'bg-cyber-blue/15 text-white border border-cyber-blue/20'
                          : 'text-white/25 hover:text-white/50 hover:bg-white/5'
                      )}
                    >
                      {s.name.slice(0, 8)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (sessionsLoading || messagesLoading) ? (
                <EmptyState
                  scene="loading"
                  title={sessionsLoading ? '加载会话中...' : '加载消息中...'}
                  description={sessionsLoading ? '正在解析主会话与历史会话' : `正在读取 ${selectedAgent.name} 的消息记录`}
                  className="h-full"
                />
              ) : messages.length === 0 ? (
                <EmptyState
                  scene="no-messages"
                  title="暂无消息"
                  description={`向 ${selectedAgent.name} 发送第一条消息开始对话`}
                  className="h-full"
                />
              ) : (
                <>
                  {(sessionsLoading || messagesLoading) && (
                    <div className="sticky top-0 z-10 flex justify-center pb-2">
                      <span className="rounded-full border border-white/[0.08] bg-cyber-panel/85 px-3 py-1 text-[10px] text-white/45 backdrop-blur-sm">
                        {sessionsLoading ? '正在切换会话...' : '正在同步最新消息...'}
                      </span>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} agent={selectedAgent} />
                  ))}
                  {/* Typing indicator when sending */}
                  {sending && (
                    <div className="flex items-center gap-3 animate-msg-slide-left">
                      <AgentAvatar emoji={selectedAgent.emoji || '🤖'} theme={selectedAgent.theme} size="sm" className="flex-shrink-0" />
                      <div className="cartoon-card px-4 py-3 flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-cyber-lavender/40 animate-dot-pulse" style={{ animationDelay: '0s' }} />
                        <div className="w-2 h-2 rounded-full bg-cyber-lavender/40 animate-dot-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 rounded-full bg-cyber-lavender/40 animate-dot-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 p-4 border-t border-white/5 bg-cyber-surface/20">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={`发送消息给 ${selectedAgent.name}...`}
                    className="w-full bg-white/5 border-2 border-white/[0.08] text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyber-blue/40 transition-all placeholder:text-white/20"
                    disabled={sending}
                  />
                  {input.trim() && (
                    <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyber-lavender/30 animate-cartoon-sparkle" />
                  )}
                </div>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className={cn(
                    'h-11 px-5 rounded-xl transition-all',
                    input.trim()
                      ? 'bg-gradient-to-r from-cyber-blue to-cyber-purple hover:from-cyber-blue/90 hover:to-cyber-purple/90'
                      : 'bg-white/5 text-white/20'
                  )}
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
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
        <span className="text-white/20 text-[10px] bg-white/5 px-3 py-1 rounded-full border border-white/5">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex gap-3',
      isUser ? 'flex-row-reverse animate-msg-slide-right' : 'flex-row animate-msg-slide-left'
    )}>
      {!isUser && (
        <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} size="sm" className="flex-shrink-0 mt-1" />
      )}
      <div className={cn('max-w-[70%]', isUser ? 'items-end' : 'items-start')}>
        {!isUser && (
          <p className="text-white/25 text-[10px] mb-1 px-1 flex items-center gap-1">
            {agent.name}
            <Sparkles className="w-2.5 h-2.5 text-cyber-lavender/30" />
          </p>
        )}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-gradient-to-r from-cyber-blue/20 to-cyber-purple/15 text-white/90 rounded-br-md border border-cyber-blue/10'
              : 'cartoon-card text-white/70 rounded-bl-md'
          )}
        >
          {message.content}
        </div>
        <p className={cn('text-white/12 text-[9px] mt-1 px-1', isUser && 'text-right')}>
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </p>
      </div>
    </div>
  )
}
