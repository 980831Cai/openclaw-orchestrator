import { useEffect, useState, useRef } from 'react'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { AgentAvatar } from '@/components/avatar/AgentAvatar'
import { Button } from '@/components/ui/button'
import { useAgents } from '@/hooks/use-agents'
import { useWebSocket } from '@/hooks/use-websocket'
import { useMonitorStore } from '@/stores/monitor-store'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { AgentListItem, SessionMessage } from '@/types'

interface Session {
  id: string
  name: string
  messageCount: number
  lastActivity: string
}

export function ChatPage() {
  const { agents, fetchAgents } = useAgents()
  const [selectedAgent, setSelectedAgent] = useState<AgentListItem | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  useWebSocket()

  useEffect(() => { fetchAgents() }, [fetchAgents])

  // Auto-select agent from URL query ?agent=xxx (e.g., from DeskSlot click)
  useEffect(() => {
    if (agents.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const agentParam = params.get('agent')
    if (agentParam && !selectedAgent) {
      const match = agents.find((a) => a.id === agentParam || a.name === agentParam)
      if (match) setSelectedAgent(match)
    }
  }, [agents, selectedAgent])

  useEffect(() => {
    if (selectedAgent) {
      api.get<Session[]>(`/agents/${selectedAgent.id}/sessions`).then((s) => {
        setSessions(s)
        if (s.length > 0) setSelectedSession(s[0].id)
      })
    }
  }, [selectedAgent])

  useEffect(() => {
    if (selectedAgent && selectedSession) {
      api.get<SessionMessage[]>(`/agents/${selectedAgent.id}/sessions/${selectedSession}/messages`).then(setMessages)
    }
  }, [selectedAgent, selectedSession])

  // Real-time: merge new messages from WebSocket into current view
  const { realtimeMessages } = useMonitorStore()
  useEffect(() => {
    if (!selectedAgent || !selectedSession) return
    const newMsgs = realtimeMessages.filter(
      (m) => m.agentId === selectedAgent.id && m.sessionId === selectedSession
    )
    if (newMsgs.length === 0) return
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id))
      const unique = newMsgs.filter((m) => !existingIds.has(m.id))
      return unique.length > 0 ? [...prev, ...unique] : prev
    })
  }, [realtimeMessages, selectedAgent, selectedSession])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !selectedAgent || !selectedSession) return
    setSending(true)
    await api.post(`/agents/${selectedAgent.id}/sessions/${selectedSession}/send`, { content: input.trim() })
    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      sessionId: selectedSession,
      agentId: selectedAgent.id,
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }])
    setInput('')
    setSending(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Agent list sidebar */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-cyber-surface/30">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-white font-bold text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cyber-blue" />
            通信频道
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => { setSelectedAgent(agent); setMessages([]) }}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer text-left',
                selectedAgent?.id === agent.id
                  ? 'bg-cyber-purple/15 border border-cyber-purple/30'
                  : 'hover:bg-white/5 border border-transparent'
              )}
            >
              <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} status={agent.status} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{agent.name}</p>
                <p className="text-white/30 text-[10px]">
                  {agent.status === 'busy' ? '工作中' : agent.status === 'idle' ? '在线' : '离线'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {!selectedAgent ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <MessageSquare className="w-16 h-16 text-white/10 mb-4" />
            <p className="text-white/30">选择一个 Agent 开始对话</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 bg-cyber-surface/30">
              <AgentAvatar emoji={selectedAgent.emoji || '🤖'} theme={selectedAgent.theme} size="sm" />
              <div>
                <p className="text-white font-semibold text-sm">{selectedAgent.name}</p>
                <p className="text-white/30 text-[10px]">{sessions.length} 会话</p>
              </div>
              {/* Session tabs */}
              {sessions.length > 1 && (
                <div className="flex gap-1 ml-4">
                  {sessions.slice(0, 5).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSession(s.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[10px] transition-colors cursor-pointer',
                        selectedSession === s.id ? 'bg-cyber-purple/20 text-white' : 'text-white/30 hover:text-white/50'
                      )}
                    >
                      {s.name.slice(0, 8)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/15">
                  <MessageSquare className="w-12 h-12 mb-3" />
                  <p className="text-sm">暂无消息记录</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} agent={selectedAgent} />
                ))
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/5 bg-cyber-surface/30">
              <div className="flex items-center gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder={`发送消息给 ${selectedAgent.name}...`}
                  className="flex-1 bg-cyber-bg border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyber-purple/30 focus:border-cyber-purple/40 transition-all"
                  disabled={sending}
                />
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="bg-gradient-to-r from-cyber-purple to-cyber-violet h-11 px-5"
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
      <div className="flex justify-center">
        <span className="text-white/20 text-[10px] bg-white/5 px-3 py-1 rounded-full">{message.content}</span>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <AgentAvatar emoji={agent.emoji || '🤖'} theme={agent.theme} size="sm" className="flex-shrink-0" />
      )}
      <div className={cn('max-w-[70%] animate-slide-in', isUser ? 'items-end' : 'items-start')}>
        {!isUser && (
          <p className="text-white/30 text-[10px] mb-1 px-1">{agent.name}</p>
        )}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-gradient-to-r from-cyber-purple/30 to-cyber-violet/20 text-white/90 rounded-br-md'
              : 'glass text-white/70 rounded-bl-md'
          )}
        >
          {message.content}
        </div>
        <p className={cn('text-white/15 text-[9px] mt-1 px-1', isUser && 'text-right')}>
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''}
        </p>
      </div>
    </div>
  )
}
