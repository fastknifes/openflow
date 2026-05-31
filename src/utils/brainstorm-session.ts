import type { MessageLike } from '../phases/feature/context-extraction.js'

/**
 * Detect whether the current session is a brainstorm session by inspecting
 * skill activation metadata in the input/output objects.
 *
 * This avoids regex-matching message body content; it only checks metadata
 * fields (agent, skill, command) which are set by the orchestrator.
 */
export function isBrainstormSessionFromMetadata(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
): boolean {
  const read = (source: Record<string, unknown>, path: string[]): string | undefined => {
    let current: unknown = source
    for (const key of path) {
      if (!current || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return typeof current === 'string' ? current : undefined
  }

  const signalText = [
    read(output, ['agent']),
    read(input, ['agent']),
    read(output, ['message', 'metadata', 'agent']),
    read(output, ['message', 'metadata', 'skill']),
    read(input, ['message', 'metadata', 'skill']),
    read(output, ['metadata', 'skill']),
    read(input, ['metadata', 'skill']),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')

  return /\bbrainstorm\b/iu.test(signalText)
}

/**
 * Fetch all messages for a session via the OpenCode client API and convert
 * them to the MessageLike format used by context extraction.
 */
export async function fetchSessionMessages(
  client: unknown,
  sessionID: string,
): Promise<MessageLike[]> {
  const sessionClient = client as {
    session?: { messages?: (args: { sessionID: string }) => Promise<{ data?: unknown[]; messages?: unknown[] }> }
  }

  if (!sessionClient.session?.messages) return []

  try {
    const response = await sessionClient.session.messages({ sessionID })
    const rawMessages = (response.data ?? response.messages ?? []) as unknown[]

    return rawMessages
      .filter((m): m is { info: { role: string }; parts: Array<{ type: string; text?: string }> } =>
        m != null && typeof m === 'object' &&
        (m as Record<string, unknown>).info != null &&
        typeof (m as Record<string, unknown>).info === 'object' &&
        typeof ((m as Record<string, unknown>).info as Record<string, unknown>).role === 'string' &&
        Array.isArray((m as Record<string, unknown>).parts)
      )
      .map(m => ({
        role: (m.info.role === 'user' || m.info.role === 'assistant' ? m.info.role : 'user') as 'user' | 'assistant',
        content: m.parts
          .filter((p): p is { type: string; text: string } => p.type === 'text' && typeof p.text === 'string')
          .map(p => p.text)
          .join('\n'),
      }))
      .filter(m => m.content.trim().length > 0)
  } catch {
    return []
  }
}

/**
 * Derive a feature hint string from the first user message in the conversation.
 */
export function deriveFeatureHint(messages: MessageLike[]): string {
  const firstUser = messages.find(m => m.role === 'user')
  if (firstUser) {
    const trimmed = firstUser.content.trim()
    const firstSentence = trimmed.split(/[.!。！\n]/)[0] ?? ''
    const hint = firstSentence.trim().slice(0, 40)
    return hint || 'brainstorm-session'
  }
  return 'brainstorm-session'
}
