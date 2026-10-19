import type { Plugin as V2Plugin } from '@opencode/plugin'

type V2Ctx = V2Plugin.Context

interface V1SessionClient {
  session: {
    messages: (args: { sessionID: string }) => Promise<{ data: unknown[] }>
    create: (args: { query?: { directory?: string }; body?: Record<string, unknown> }) => Promise<unknown>
    prompt: (args: { path?: { id?: string }; query?: { directory?: string }; body?: Record<string, unknown> }) => Promise<unknown>
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      const record = asRecord(part)
      return typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function mapAssistantContent(content: unknown): Record<string, unknown> | undefined {
  const record = asRecord(content)
  if (record.type === 'text') {
    return { type: 'text', text: typeof record.text === 'string' ? record.text : '' }
  }
  if (record.type === 'tool') {
    const state = asRecord(record.state)
    return {
      type: 'tool',
      tool: record.name,
      callID: record.id,
      state: {
        status: state.status,
        input: asRecord(state.input),
        output: extractContentText(state.content),
      },
    }
  }
  return undefined
}

/**
 * Translate V2 `session.context` messages into the V1 `{ info, parts }` shape
 * that OpenFlow business logic consumes.
 */
function mapSessionMessages(messages: unknown): unknown[] {
  if (!Array.isArray(messages)) return []
  const out: unknown[] = []
  for (const raw of messages) {
    const message = asRecord(raw)
    if (message.type === 'user') {
      out.push({
        info: { role: 'user', id: message.id, createdAt: asRecord(message.time).created },
        parts: [{ type: 'text', text: typeof message.text === 'string' ? message.text : '' }],
      })
      continue
    }
    if (message.type === 'assistant') {
      const content = Array.isArray(message.content) ? message.content : []
      const parts = content
        .map(mapAssistantContent)
        .filter((part): part is Record<string, unknown> => part !== undefined)
      out.push({
        info: { role: 'assistant', id: message.id, createdAt: asRecord(message.time).created },
        parts,
      })
    }
  }
  return out
}

function extractPromptText(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => {
      const record = asRecord(part)
      return typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function normalizeModel(model: unknown): { id: string; providerID: string; variant?: string } {
  const record = asRecord(model)
  const providerID = typeof record.providerID === 'string'
    ? record.providerID
    : typeof record.providerId === 'string' ? record.providerId : ''
  const id = typeof record.modelID === 'string'
    ? record.modelID
    : typeof record.modelId === 'string' ? record.modelId
      : typeof record.id === 'string' ? record.id : ''
  if (typeof record.variant === 'string') {
    return { id, providerID, variant: record.variant }
  }
  return { id, providerID }
}

function buildPromptResponse(messages: unknown): Record<string, unknown> {
  const list = Array.isArray(messages) ? messages : []
  let text = ''
  let tokens: unknown = undefined

  for (let i = list.length - 1; i >= 0; i--) {
    const message = asRecord(list[i])
    if (message.type !== 'assistant') continue
    const content = Array.isArray(message.content) ? message.content : []
    text = content
      .map((part) => {
        const record = asRecord(part)
        return record.type === 'text' && typeof record.text === 'string' ? record.text : ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
    if (message.tokens) tokens = message.tokens
    break
  }

  if (!text) {
    for (let i = list.length - 1; i >= 0; i--) {
      const message = asRecord(list[i])
      if (message.type === 'user' && typeof message.text === 'string') {
        text = message.text
        break
      }
    }
  }

  return { data: { info: { tokens }, parts: text ? [{ type: 'text', text }] : [] } }
}

/**
 * Adapt the V2 session domain to the V1 `ctx.client.session.*` surface used by
 * OpenFlow's harden, quality-gate, archive and omo-handoff code paths.
 */
export function createCompatClient(ctx: V2Ctx): V1SessionClient {
  return {
    session: {
      messages: async ({ sessionID }) => ({ data: mapSessionMessages(await ctx.session.context({ sessionID })) }),

      create: async (args) => {
        const body = asRecord(args?.body)
        const input: Record<string, unknown> = {}
        if (typeof body.title === 'string') input.title = body.title
        if (typeof body.parentID === 'string') input.parentID = body.parentID
        if (typeof body.agent === 'string') input.agent = body.agent
        if (body.model && typeof body.model === 'object') input.model = normalizeModel(body.model)
        const directory = args?.query?.directory
        if (typeof directory === 'string' && directory) input.location = { directory }
        return ctx.session.create(input as never)
      },

      prompt: async (args) => {
        const sessionID = args?.path?.id
        if (!sessionID) {
          throw new Error('OpenFlow: session.prompt requires path.id')
        }
        const body = asRecord(args?.body)
        const text = extractPromptText(body.parts)

        if (typeof body.agent === 'string' && body.agent) {
          try {
            await ctx.session.switchAgent({ sessionID, agent: body.agent } as never)
          } catch {
            // Best-effort: agent switch is not always permitted mid-turn.
          }
        }
        if (body.model && typeof body.model === 'object') {
          try {
            await ctx.session.switchModel({ sessionID, model: normalizeModel(body.model) } as never)
          } catch {
            // Best-effort.
          }
        }

        await ctx.session.prompt({ sessionID, text } as never)

        // V2 `prompt` enqueues; wait for the turn to settle, then read the result
        // so the V1-shaped caller still observes assistant text + token usage.
        try {
          await ctx.session.wait({ sessionID } as never)
        } catch {
          // If waiting is unsupported, fall through and read whatever exists.
        }

        try {
          return buildPromptResponse(await ctx.session.context({ sessionID }))
        } catch {
          return { data: { parts: [] } }
        }
      },
    },
  }
}
