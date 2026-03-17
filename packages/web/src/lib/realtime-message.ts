import type { SessionMessage } from '@/types'

const UNTRUSTED_SENDER_PREFIX = 'Sender (untrusted metadata):'

export function parseRealtimeSessionKey(value: string): { agentId?: string; sessionId?: string } {
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

export function sanitizeRealtimeContent(value: string): string {
  const text = value.trim()
  if (!text.startsWith(UNTRUSTED_SENDER_PREFIX)) {
    return text
  }

  const suffix = text.includes(']') ? text.slice(text.lastIndexOf(']') + 1).trim() : ''
  if (suffix) {
    return suffix
  }

  return text.replace(UNTRUSTED_SENDER_PREFIX, '').trim()
}

function coerceTimestamp(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000
    return new Date(milliseconds).toISOString()
  }
  return new Date().toISOString()
}

function coerceContent(value: unknown): string {
  if (typeof value === 'string') return sanitizeRealtimeContent(value)
  if (Array.isArray(value)) {
    return sanitizeRealtimeContent(
      value
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const text = (item as Record<string, unknown>).text ?? (item as Record<string, unknown>).content
            return typeof text === 'string' ? text : ''
          }
          return ''
        })
        .filter(Boolean)
        .join('\n'),
    )
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.text === 'string') return sanitizeRealtimeContent(record.text)
    if (typeof record.content === 'string') return sanitizeRealtimeContent(record.content)
  }
  return ''
}

export function buildRealtimeMessageKey(message: Partial<SessionMessage>, index = 0): string {
  const normalizedContent = sanitizeRealtimeContent(String(message.content || '')).trim()
  const normalizedTimestamp = (() => {
    if (!message.timestamp) return ''
    const parsed = Date.parse(message.timestamp)
    return Number.isNaN(parsed) ? String(message.timestamp) : new Date(parsed).toISOString()
  })()

  if (normalizedContent && normalizedTimestamp) {
    return [
      message.agentId || 'unknown',
      message.sessionId || 'main',
      message.role || 'assistant',
      normalizedTimestamp,
      normalizedContent,
    ].join('|')
  }

  return message.id || `${message.agentId || 'unknown'}-${message.sessionId || 'main'}-${message.timestamp || index}`
}

export function mergeRealtimeMessages(
  current: SessionMessage[],
  incoming: SessionMessage[],
  limit = 200,
): SessionMessage[] {
  const merged = new Map<string, SessionMessage>()
  current.forEach((message, index) => {
    merged.set(buildRealtimeMessageKey(message, index), {
      ...message,
      content: sanitizeRealtimeContent(message.content),
    })
  })
  incoming.forEach((message, index) => {
    merged.set(buildRealtimeMessageKey(message, current.length + index), {
      ...message,
      content: sanitizeRealtimeContent(message.content),
    })
  })

  return Array.from(merged.values())
    .sort((left, right) => {
      const leftTs = left.timestamp ? Date.parse(left.timestamp) : 0
      const rightTs = right.timestamp ? Date.parse(right.timestamp) : 0
      return (Number.isNaN(leftTs) ? 0 : leftTs) - (Number.isNaN(rightTs) ? 0 : rightTs)
    })
    .slice(-limit)
}

export function normalizeRealtimeMessage(payload: unknown): SessionMessage | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const envelope =
    record.message && typeof record.message === 'object'
      ? (record.message as Record<string, unknown>)
      : record

  const directRole = envelope.role ?? record.role
  const role =
    directRole === 'user' || directRole === 'assistant' || directRole === 'system'
      ? directRole
      : ((envelope.authorRole ??
          record.authorRole ??
          envelope.senderRole ??
          record.senderRole ??
          'assistant') as SessionMessage['role'])

  const nestedSession =
    envelope.session && typeof envelope.session === 'object'
      ? (envelope.session as Record<string, unknown>)
      : record.session && typeof record.session === 'object'
        ? (record.session as Record<string, unknown>)
        : null

  const sessionKey =
    typeof envelope.sessionKey === 'string'
      ? envelope.sessionKey
      : typeof record.sessionKey === 'string'
        ? record.sessionKey
        : typeof envelope.scope === 'string'
          ? envelope.scope
          : typeof record.scope === 'string'
            ? record.scope
            : typeof nestedSession?.key === 'string'
              ? nestedSession.key
              : typeof nestedSession?.id === 'string'
                ? nestedSession.id
                : ''

  let sessionId =
    typeof envelope.sessionId === 'string'
      ? envelope.sessionId
      : typeof record.sessionId === 'string'
        ? record.sessionId
        : typeof nestedSession?.id === 'string'
          ? nestedSession.id
          : ''
  let agentId =
    typeof envelope.agentId === 'string'
      ? envelope.agentId
      : typeof record.agentId === 'string'
        ? record.agentId
        : typeof nestedSession?.agentId === 'string'
          ? nestedSession.agentId
          : typeof envelope.agent === 'string'
            ? envelope.agent
            : typeof record.agent === 'string'
              ? record.agent
              : ''

  const parsedFromSessionKey = sessionKey ? parseRealtimeSessionKey(sessionKey) : {}
  if (!agentId && parsedFromSessionKey.agentId) {
    agentId = parsedFromSessionKey.agentId
  }
  if (!sessionId && parsedFromSessionKey.sessionId) {
    sessionId = parsedFromSessionKey.sessionId
  }

  const content = coerceContent(
    envelope.content ??
      record.content ??
      envelope.text ??
      record.text ??
      envelope.message ??
      record.message ??
      envelope.parts ??
      record.parts ??
      '',
  )
  if (!content) return null

  return {
    id:
      (typeof envelope.id === 'string' && envelope.id) ||
      (typeof record.id === 'string' && record.id) ||
      (typeof envelope.messageId === 'string' && envelope.messageId) ||
      (typeof record.messageId === 'string' && record.messageId) ||
      `rt-${agentId || 'unknown'}-${sessionId || 'main'}-${String(record.timestamp ?? Date.now())}`,
    sessionId: sessionId || 'main',
    sessionKey: sessionKey || undefined,
    agentId,
    role,
    content,
    timestamp: coerceTimestamp(
      envelope.timestamp ??
        record.timestamp ??
        envelope.createdAt ??
        record.createdAt ??
        envelope.updatedAt ??
        record.updatedAt,
    ),
  }
}
