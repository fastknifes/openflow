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
    try {
      const result = await handleFeature(ctx, feature || undefined, undefined, input)
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
    const feature = writingPlanMatch[1]?.trim()
    try {
      const resolvedFeature = feature || await findActiveFeature(ctx)
      if (!resolvedFeature) {
        appendGuardMessage(output, 'Feature name is required. Usage: /openflow-writing-plan <feature-name>')
        return true
      }
      const agent = await detectPlanAgent(ctx, message)
      const packet = await handleWritingPlan(ctx, resolvedFeature)
      const agentNote = agent === 'prometheus'
        ? '\n\n**Agent Target**: prometheus\n\nSwitch to Prometheus planner to continue.'
        : '\n\n**Agent Target**: plan\n\nSwitch to OpenCode plan agent to continue.'
      appendGuardMessage(output, packet + agentNote)
      // Programmatic agent switch: set output.message.agent so the runtime routes to the correct agent
      const rawOutput = output as unknown as Record<string, unknown>
      const msg = rawOutput.message as Record<string, unknown> | undefined
      if (msg && typeof msg === 'object') {
        msg['agent'] = agent === 'prometheus' ? 'prometheus' : 'plan'
      }
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
