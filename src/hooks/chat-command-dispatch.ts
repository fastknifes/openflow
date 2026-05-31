import type { Hooks } from '@opencode-ai/plugin'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { OpenFlowContext } from '../types.js'
import { handleFeature } from '../commands/feature.js'
import { handleArchive, handleInit, handleStatus, handleConfig, handleMigrateDocs } from '../commands/index.js'
import { handleChange } from '../commands/change.js'
import { handleWritingPlan } from '../commands/writing-plan.js'
import { handleImplement, type ImplementObserver } from '../commands/implement.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { appendGuardMessage } from './feature-workflow.js'
import { detectPlanAgent } from '../utils/agent-router.js'
import { escapeMarkdown } from '../utils/security.js'
import { tryAutoSaveBrainstormPacket } from '../phases/feature/brainstorm-auto-save.js'
import { fetchSessionMessages, deriveFeatureHint } from '../utils/brainstorm-session.js'

type ChatInput = Parameters<NonNullable<Hooks['chat.message']>>[0]
type ChatOutput = Parameters<NonNullable<Hooks['chat.message']>>[1]

type OpenFlowImplementParseResult = { feature: string; useWorktree: boolean } | { error: string }

export function parseOpenFlowImplementCommand(command: string): OpenFlowImplementParseResult | undefined {
  const match = command.match(/^\/openflow-implement(?:\s+(.*))?$/)
  if (!match) return undefined

  const tokens = match[1]?.trim().split(/\s+/).filter(Boolean) ?? []
  const supportedFlags = '--no-worktree'
  let useWorktree = true
  const featureTokens: string[] = []

  for (const token of tokens) {
    if (token === '--no-worktree') {
      useWorktree = false
      continue
    }

    if (token.startsWith('--')) {
      return { error: `Unsupported flag: ${token}. Supported flags: ${supportedFlags}` }
    }

    featureTokens.push(token)
  }

  const feature = featureTokens.join(' ').trim()
  if (!feature) {
    return { error: 'Feature name is required. Usage: /openflow-implement <feature-name> [--no-worktree]' }
  }

  return { feature, useWorktree }
}

export function parseWritingPlanCommandArgs(raw: string): { feature: string | undefined; mode: string | boolean | undefined } {
  const tokens = raw.split(/\s+/).filter(Boolean)
  let feature = ''
  let mode: string | boolean | undefined = undefined

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token?.startsWith('--mode=')) {
      mode = token.slice('--mode='.length)
      continue
    }
    if (token === '--mode') {
      const nextToken = tokens[i + 1]
      if (nextToken && !nextToken.startsWith('--')) {
        mode = nextToken
        i++ // consume the value token
        continue
      }
      // --mode without value: ignore and fall back to config default
      continue
    }
    if (feature) {
      feature += ' ' + token
    } else {
      feature = token ?? ''
    }
  }

  return { feature: feature || undefined, mode }
}

function buildToolContextFromChatInput(input: ChatInput): ToolContext | undefined {
  const rawInput = input as Record<string, unknown>
  const sessionID = typeof rawInput.sessionID === 'string' ? rawInput.sessionID : undefined
  if (!sessionID) return undefined

  return {
    sessionID,
    messageID: '',
    agent: '',
    directory: typeof rawInput.directory === 'string' ? rawInput.directory : '',
    worktree: typeof rawInput.worktree === 'string' ? rawInput.worktree : '',
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: async () => undefined,
  }
}

export async function dispatchOpenFlowCommand(
  ctx: OpenFlowContext,
  input: ChatInput,
  output: ChatOutput,
  message: string,
  observer?: ImplementObserver,
): Promise<boolean> {
  const openFlowCommand = extractOpenFlowCommand(message)
  if (!openFlowCommand) return false

  const trimmed = openFlowCommand

  const featureMatch = trimmed.match(/^\/openflow-feature(?:\s+(.+))?$/)
  if (featureMatch) {
    const feature = featureMatch[1]?.trim()
    const sessionID = (input as Record<string, unknown>).sessionID as string | undefined

    // Transition save before feature workflow (short-timeout, non-blocking)
    if (sessionID) {
      const transitionSavePromise = (async () => {
        try {
          const messages = await fetchSessionMessages(ctx.client, sessionID)
          if (messages.length === 0) return
          await tryAutoSaveBrainstormPacket({
            projectDir: ctx.directory,
            sourceSessionID: sessionID,
            featureHint: deriveFeatureHint(messages),
            messages,
            trigger: 'transition-to-feature',
            isBrainstormSession: true,
          })
        } catch {
          // Silently ignore per plan constraints
        }
      })()

      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 2000))
      await Promise.race([transitionSavePromise, timeoutPromise])
    }

    try {
      const result = await handleFeature(ctx, feature || undefined, /* answer */ undefined, /* action */ undefined, /* facts */ undefined, input)
      appendGuardMessage(output, result)
    } catch (err) {
      appendGuardMessage(output, err instanceof Error ? err.message : String(err))
    }
    return true
  }

  const changeMatch = trimmed.match(/^\/openflow-change\s+(\S+)(?:\s+("[^"]*"|'[^']*'))?$/)
  if (changeMatch) {
    const feature = changeMatch[1]?.trim()
    const desc = changeMatch[2]?.replace(/^["']|["']$/g, '').trim()
    try {
      const result = await handleChange(ctx, feature!, desc || undefined)
      appendGuardMessage(output, result)
    } catch (err) {
      appendGuardMessage(output, err instanceof Error ? err.message : String(err))
    }
    return true
  }

  // Legacy issue-mode: compatibility-only fallback (not an active workflow entry)
  if (trimmed.match(/^\/openflow-issue(?:\s+(.+))?$/)) {
    appendGuardMessage(output, '`/openflow-issue` is compatibility-only. Issue-mode is not an active Quality Gate workflow entry point. Use `/openflow-feature` for design or `openflow-quality-gate` skill for verification.')
    return true
  }

  if (trimmed.match(/^\/openflow-verify(?:\s+(.+))?$/)) {
    appendGuardMessage(output, '`/openflow-verify` is deprecated and compatibility-only. Use the `openflow-quality-gate` skill instead, which automatically runs evidence-aware verify as part of its quality gate process.')
    return true
  }

  const archiveMatch = trimmed.match(/^\/openflow-archive(?:\s+(.+))?$/)
  if (archiveMatch) {
    const feature = archiveMatch[1]?.trim() || undefined
    try {
      const result = await handleArchive(ctx, feature)
      appendGuardMessage(output, result)
    } catch (err) {
      appendGuardMessage(output, err instanceof Error ? err.message : String(err))
    }
    return true
  }

  if (trimmed === '/openflow-init') {
    try {
      const result = await handleInit(ctx)
      appendGuardMessage(output, result)
    } catch (err) {
      appendGuardMessage(output, err instanceof Error ? err.message : String(err))
    }
    return true
  }

  if (trimmed === '/openflow-status') {
    appendGuardMessage(output, handleStatus(ctx))
    return true
  }

  if (trimmed === '/openflow-config') {
    appendGuardMessage(output, handleConfig(ctx))
    return true
  }

  if (trimmed.startsWith('/openflow-migrate-docs')) {
    const migrateArgs = parseFlagArgs(trimmed.slice('/openflow-migrate-docs'.length))
    try {
      const parsedMigrateArgs: { sourceDir?: string; targetDir?: string; dryRun?: boolean; answer?: string } = {}
      if (typeof migrateArgs.sourceDir === 'string') parsedMigrateArgs.sourceDir = migrateArgs.sourceDir
      if (typeof migrateArgs.targetDir === 'string') parsedMigrateArgs.targetDir = migrateArgs.targetDir
      parsedMigrateArgs.dryRun = migrateArgs.dryRun === true || migrateArgs.dryRun === 'true'
      if (typeof migrateArgs.answer === 'string') parsedMigrateArgs.answer = migrateArgs.answer
      const result = await handleMigrateDocs(ctx, parsedMigrateArgs)
      appendGuardMessage(output, result)
    } catch (err) {
      appendGuardMessage(output, err instanceof Error ? err.message : String(err))
    }
    return true
  }

  const writingPlanMatch = trimmed.match(/^\/openflow-writing-plan(?:\s+(.+))?$/)
  if (writingPlanMatch) {
    const rawArgs = writingPlanMatch[1]?.trim() ?? ''
    const { feature, mode: invocationMode } = parseWritingPlanCommandArgs(rawArgs)
    try {
      const resolvedFeature = feature || await findActiveFeature(ctx)
      if (!resolvedFeature) {
        appendGuardMessage(output, 'Feature name is required. Usage: /openflow-writing-plan <feature-name> [--mode=<pyramid|pattern|mixed|false>]')
        return true
      }
      const agent = await detectPlanAgent(ctx, message)
      const { resolveWritingPlanMode } = await import('../commands/writing-plan/mode.js')
      const mode = resolveWritingPlanMode({ config: ctx.config, invocationValue: invocationMode })
      const packet = await handleWritingPlan(ctx, resolvedFeature, mode, message)
      const agentNote = agent === 'prometheus'
        ? '\n\n**Agent Target**: prometheus\n\nSwitch to Prometheus planner to continue.\n\n> 🚫 **DO NOT start implementation or switch to build mode.** This command is for planning only.'
        : '\n\n**Agent Target**: build\n\nYou are the build agent. Your ONLY job is to write the plan file to disk.\n\n> 🚫 **DO NOT start implementation.** This command is for planning only.\n> 🚫 **DO NOT begin coding, editing source files, or running builds.** Your role ends when plan.md bytes are written.\n> ✅ **DO** write the plan file to the output path shown above, then STOP.'
      appendGuardMessage(output, packet + agentNote)
      // Programmatic agent switch: set output.message.agent so the runtime routes to the correct agent
      const rawOutput = output as unknown as Record<string, unknown>
      const msg = rawOutput.message as Record<string, unknown> | undefined
      if (msg && typeof msg === 'object') {
        msg['agent'] = agent === 'prometheus' ? 'prometheus' : 'build'
      }
      appendGuardMessage(output, [
        '',
        '---',
        '',
        '**Next Step for You:**',
        '1. Review the plan once it\'s written.',
        '2. When ready, run `/openflow-implement ' + escapeMarkdown(resolvedFeature) + '` to start implementation.',
      ].join('\n'))
    } catch (err) {
      appendGuardMessage(output, err instanceof Error ? err.message : String(err))
    }
    return true
  }

  const parsedImplement = parseOpenFlowImplementCommand(trimmed)
  if (parsedImplement) {
    if ('error' in parsedImplement) {
      appendGuardMessage(output, parsedImplement.error)
      return true
    }
    const toolContext = buildToolContextFromChatInput(input)
    const result = await handleImplement(ctx, parsedImplement.feature, parsedImplement.useWorktree, toolContext, observer)
    appendGuardMessage(output, result)
    return true
  }

  if (trimmed.match(/^\/openflow-harden(?:\s+(.+))?$/)) {
    appendGuardMessage(output, '`/openflow-harden` is deprecated and compatibility-only. Use the `openflow-quality-gate` skill instead, which automatically assesses risk and runs harden only when required as part of its quality gate process.')
    return true
  }

  return false
}

export function extractOpenFlowCommand(message: string): string | undefined {
  const trimmed = message.trim()
  if (trimmed.startsWith('/openflow-')) {
    return trimmed
  }

  const commandMatch = trimmed.match(/^OpenFlow command:\s*(\/openflow-\S+(?:\s+.+)?)$/m)
  return commandMatch?.[1]?.trim()
}

function parseFlagArgs(raw: string): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {}
  let key: string | null = null
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    if (token.startsWith('--')) {
      key = token.slice(2)
      args[key] = true
    } else if (key) {
      args[key] = token
      key = null
    }
  }
  return args
}
