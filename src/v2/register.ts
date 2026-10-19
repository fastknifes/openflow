import type { Plugin as V2Plugin } from '@opencode/plugin'
import { tool } from '@opencode-ai/plugin/tool'
import type { Hooks as V1Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext } from '../types.js'
import { logger } from '../utils/logger.js'

type V2Ctx = V2Plugin.Context
type Cleanup = () => Promise<void> | void

/**
 * Translate a V1 zod raw-shape tool definition into a V2 JSON Schema input.
 *
 * OpenFlow defines its tools with `tool.schema` (zod v4), which ships a
 * `toJSONSchema` helper. We fall back to a permissive object schema if the
 * conversion is unavailable so a single tool can never break registration.
 */
function toJsonSchema(args: Record<string, unknown>): unknown {
  try {
    const shape = tool.schema.object(args as never)
    return tool.schema.toJSONSchema(shape)
  } catch (error) {
    logger.warn('Failed to convert tool args to JSON Schema; falling back to permissive schema', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { type: 'object', properties: {}, additionalProperties: true }
  }
}

/**
 * Adapt a V1 `ToolResult` (`string | { output, ... }`) into a V2 `Tool.Result`.
 */
function toV2Result(result: unknown): { content: string } {
  if (typeof result === 'string') return { content: result }
  const record = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}
  const output = typeof record.output === 'string' ? record.output : ''
  return { content: output }
}

interface V2ToolDefinition {
  description: string
  args: Record<string, unknown>
  execute: (args: unknown, context: unknown) => Promise<unknown>
}

/**
 * Build a V1-compatible `ToolContext` from a V2 tool execution context.
 *
 * V2 exposes `{ sessionID, agent, messageID, id, signal, progress }` but no
 * `directory`/`worktree`/`ask`. We supply the session directory and stub the
 * parts of the V1 surface that OpenFlow only probes defensively.
 */
function toV1ToolContext(context: unknown, directory: string, worktree: string): Record<string, unknown> {
  const ctx = (typeof context === 'object' && context !== null ? context : {}) as Record<string, unknown>
  return {
    sessionID: ctx.sessionID,
    messageID: ctx.messageID,
    agent: ctx.agent,
    directory,
    worktree,
    abort: ctx.signal,
    metadata: () => undefined,
    ask: async () => undefined,
  }
}

const OPENFLOW_NOTICE_TITLE = '## OpenFlow:'

/**
 * Fold V2 `session.hook("prompt")` into the V1 `chat.message` contract.
 *
 * The V1 hook receives `{ message, parts }` and mutates `parts` (prepending or
 * appending synthetic notices). V2 only exposes `event.prompt.text`. We
 * synthesise the V1 output, run the hook, then fold the resulting text parts
 * back into `event.prompt.text` preserving order.
 */
async function runChatMessageHook(
  hook: NonNullable<V1Hooks['chat.message']>,
  event: { sessionID: string; messageID: string; prompt: { text: string; agents?: readonly { name: string }[] } },
  directory: string,
  worktree: string,
): Promise<string | undefined> {
  const originalText = event.prompt.text
  const parts: Record<string, unknown>[] = [
    {
      id: `prt_openflow_${event.messageID}`,
      sessionID: event.sessionID,
      messageID: event.messageID,
      type: 'text',
      text: originalText,
    },
  ]
  const output = {
    message: {
      id: event.messageID,
      sessionID: event.sessionID,
      role: 'user',
    },
    parts,
  }

  const input = {
    sessionID: event.sessionID,
    messageID: event.messageID,
    directory,
    worktree,
    agent: event.prompt.agents?.[0]?.name,
  }

  await hook(input as never, output as never)

  const nextText = parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n\n')

  if (nextText !== originalText) {
    event.prompt.text = nextText
  }

  // V1 signals a programmatic agent switch by setting `output.message.agent`;
  // V2 needs an explicit `session.switchAgent` call instead.
  const switchedAgent = (output.message as Record<string, unknown>).agent
  return typeof switchedAgent === 'string' && switchedAgent ? switchedAgent : undefined
}

export interface RegisterV2Options {
  hooks: V1Hooks
  ctx: OpenFlowContext
  agentsToSwitch?: string[]
}

/**
 * Register the shared OpenFlow hooks/tools against the OpenCode V2 plugin API.
 */
export async function registerOpenFlowHooksOnV2(v2ctx: V2Ctx, options: RegisterV2Options): Promise<Cleanup[]> {
  const { hooks, ctx } = options
  const cleanups: Cleanup[] = []
  const directory = ctx.directory
  const worktree = ctx.worktree

  // ── Tools ────────────────────────────────────────────────────────────────
  if (hooks.tool && Object.keys(hooks.tool).length > 0) {
    const registration = await v2ctx.tool.transform((editor) => {
      for (const [name, definition] of Object.entries(hooks.tool ?? {})) {
        const v1Tool = definition as unknown as V2ToolDefinition
        editor.add({
          name,
          description: v1Tool.description,
          input: toJsonSchema(v1Tool.args),
          execute: async (input: unknown, context: unknown) => {
            const result = await v1Tool.execute(input, toV1ToolContext(context, directory, worktree))
            return toV2Result(result)
          },
        } as never)
      }
    })
    cleanups.push(() => registration.dispose())
  }

  // ── tool.execute.before ─────────────────────────────────────────────────
  if (hooks['tool.execute.before']) {
    const hook = hooks['tool.execute.before']
    const registration = await v2ctx.tool.hook('execute.before', async (event) => {
      const output = { args: event.input }
      await hook({ tool: event.tool, sessionID: event.sessionID, callID: event.id }, output)
      if (output.args !== event.input) {
        event.input = output.args
      }
    })
    cleanups.push(() => registration.dispose())
  }

  // ── tool.execute.after ──────────────────────────────────────────────────
  if (hooks['tool.execute.after']) {
    const hook = hooks['tool.execute.after']
    const registration = await v2ctx.tool.hook('execute.after', async (event) => {
      const output: Record<string, unknown> = {
        title: '',
        output: event.status === 'completed' ? extractResultText(event.result) : '',
        metadata: event.status === 'completed' ? event.result.metadata : undefined,
      }
      if (event.status === 'error') {
        output.error = event.error
      }

      await hook(
        { tool: event.tool, sessionID: event.sessionID, callID: event.id, args: event.input },
        output as never,
      )

      if (event.status === 'completed' && typeof output.output === 'string' && output.output) {
        const original = extractResultText(event.result)
        if (output.output !== original) {
          ;(event.result as { content?: string | ReadonlyArray<unknown> }).content = output.output
        }
      }
    })
    cleanups.push(() => registration.dispose())
  }

  // ── session.hook("prompt") ← chat.message ───────────────────────────────
  if (hooks['chat.message']) {
    const hook = hooks['chat.message']
    const registration = await v2ctx.session.hook('prompt', async (event) => {
      try {
        const prompt = event.prompt as unknown as {
          text: string
          agents?: readonly { name: string }[]
        }
        const switchedAgent = await runChatMessageHook(
          hook,
          { sessionID: event.sessionID, messageID: event.messageID, prompt },
          directory,
          worktree,
        )
        if (switchedAgent) {
          try {
            await v2ctx.session.switchAgent({ sessionID: event.sessionID, agent: switchedAgent } as never)
          } catch (error) {
            logger.debug('OpenFlow agent switch failed', {
              agent: switchedAgent,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      } catch (error) {
        logger.warn('OpenFlow prompt hook failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
    cleanups.push(() => registration.dispose())
  }

  // ── shell.hook("create.before") ← shell.env ─────────────────────────────
  if (hooks['shell.env']) {
    const hook = hooks['shell.env']
    const registration = await v2ctx.shell.hook('create.before', async (event) => {
      const output: Record<string, unknown> = { env: {} }
      await hook({ cwd: event.cwd }, output as never)
      const env = output.env
      if (env && typeof env === 'object') {
        for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
          if (typeof value === 'string') {
            event.env[key] = value
          }
        }
      }
    })
    cleanups.push(() => registration.dispose())
  }

  // ── event.subscribe() ← event ───────────────────────────────────────────
  if (hooks.event) {
    const hook = hooks.event
    const abort = new AbortController()
    const subscription = v2ctx.event.subscribe({ signal: abort.signal })
    void (async () => {
      try {
        for await (const event of subscription) {
          try {
            // V1's `event` hook reads `{ event }` but its observers also probe
            // top-level `type`/`sessionID`, so surface the V2 event's own fields.
            const record = event as unknown as Record<string, unknown>
            const data = (typeof record.data === 'object' && record.data !== null
              ? record.data
              : {}) as Record<string, unknown>
            await hook({
              ...record,
              event: event as never,
              ...(typeof record.sessionID === 'string'
                ? {}
                : typeof data.sessionID === 'string'
                  ? { sessionID: data.sessionID }
                  : {}),
            } as never)
          } catch (error) {
            logger.debug('OpenFlow event hook failed', {
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      } catch {
        // Subscription aborted on cleanup.
      }
    })()
    cleanups.push(() => abort.abort())
  }

  return cleanups
}

function extractResultText(result: unknown): string {
  const record = (typeof result === 'object' && result !== null ? result : {}) as Record<string, unknown>
  if (typeof record.content === 'string') return record.content
  if (Array.isArray(record.content)) {
    return record.content
      .map((part) => {
        const p = (typeof part === 'object' && part !== null ? part : {}) as Record<string, unknown>
        return typeof p.text === 'string' ? p.text : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof record.output === 'string') return record.output
  return ''
}

export { OPENFLOW_NOTICE_TITLE }
