import type { Hooks } from '@opencode-ai/plugin'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { handleFeature } from '../commands/feature.js'
import { normalizeFeatureSession, isAwaitingFormalAnswer } from '../phases/feature/state-machine.js'
import { createAcceptanceHook } from './acceptance.js'
import {
  appendGuardMessage,
  clearRecentFeatureCompletion,
  detectClosureReady,
  decideTrigger,
  extractMessageText,
  getActiveFeatureSession,
  getRecentCompletedFeature,
  getMessageRole,
  hasDesignDoc,
} from './feature-workflow.js'
import { getContractRuntime } from '../contracts/runtime.js'
import { dispatchOpenFlowCommand, extractOpenFlowCommand } from './chat-command-dispatch.js'
import { getImplementationState, isFreshReadiness } from '../utils/acceptance-state.js'
import { tArray } from '../i18n/index.js'

const COMPLETION_PHRASES = tArray('signals.completion.phrases')
const GUARD_BLOCK_TITLE = '## OpenFlow: Completion Blocked Until Quality Gate'
const GUARD_VERIFY_TITLE = '## OpenFlow: Verification Suggested'

function isCompletionMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return COMPLETION_PHRASES.some(phrase => lower.includes(phrase))
}

export function createChatMessageHook(ctx: OpenFlowContext) {
  const acceptanceHook = createAcceptanceHook(ctx)

  const hook: NonNullable<Hooks['chat.message']> = async (input, output): Promise<void> => {
    const rawInput = input as Record<string, unknown>
    const rawOutput = output as unknown as Record<string, unknown>
    const role = getMessageRole(rawOutput)
    // System-role messages are never processed by the hook
    if (role === 'system') return

    const message = extractMessageText(rawOutput)
    if (!message) return
    if (looksLikeInternalMessage(message)) return
    // Guard recursion: don't re-trigger on OpenFlow's own guard messages
    if (message.includes(GUARD_BLOCK_TITLE) || message.includes(GUARD_VERIFY_TITLE)) return

    if (await dispatchOpenFlowCommand(ctx, input, output, message)) return

    // ── Guardian session events (before completion guard, non-blocking) ─
    if (ctx.config.guardian?.enabled) {
      try {
        const runtime = getContractRuntime()
        if (runtime.isStarted && isCompletionMessage(message)) {
          await runtime.dispatchSessionEvent({ type: 'session_end', sessionId: input.sessionID })
        }
      } catch {
        // Non-blocking
      }
    }

    // ── Completion Guard (runs for BOTH user and assistant) ───────────
    if (ctx.config.verification.completion_prompt && isCompletionMessage(message)) {
      const guardAppended = await appendCompletionGuardIfNeeded(ctx, output, message)
      if (guardAppended) return
    }

    // ── Acceptance detection (runs even when feature phase is disabled) ─
    await acceptanceHook({ sessionID: input.sessionID, message })

    if (!ctx.config.feature.enabled) {
      return
    }

    const activeFeature = await getActiveFeatureSession(ctx.directory, input.sessionID)
    if (activeFeature && !(await hasDesignDoc(ctx, activeFeature))) {
      if (looksLikeDirectCommand(message) || isCompletionMessage(message)) {
        return
      }

      const activeSession = await loadActiveFeatureSession(ctx.directory, activeFeature, ctx.config.paths.feature_state)
      if (!activeSession || !isAwaitingFormalAnswer(activeSession)) {
        return
      }

      if (looksLikeFeatureSwitch(message, activeFeature)) {
        // Let new-feature detection continue below instead of hijacking the old feature session.
      } else {
        const continuation = await handleFeature(ctx, undefined, message, input)
        appendGuardMessage(output, continuation)
        return
      }
    }

    if (!ctx.config.feature.auto_trigger) {
      return
    }

    const recentCompletedFeature = await getRecentCompletedFeature(ctx.directory, input.sessionID)
    if (recentCompletedFeature) {
      if (looksLikePostFeatureAction(message, recentCompletedFeature)) {
        return
      }

      if (!looksLikePostFeatureAction(message, recentCompletedFeature)) {
        await clearRecentFeatureCompletion(ctx.directory, input.sessionID)
      }
    }

    if (shouldSuppressFeatureSuggestionForActiveDesignFlow(rawInput, rawOutput, message)) {
      return
    }

    const closureDecision = detectClosureReady(ctx, message)
    if (closureDecision.isClosureReady && ctx.config.feature.closure.auto_transition) {
		appendGuardMessage(output, `## OpenFlow: Feature Design Closure Ready

Detected ${closureDecision.level} closure signal(s): ${closureDecision.matchedSignals.map(s => `\`${s}\``).join(', ')}.

Next step: continue the standalone feature design flow until design generation completes.

Recommended entrypoint:

		\`\`\`text
/openflow-feature
\`\`\`

Generation policy:
- OpenFlow can derive the internal feature name from session context or natural language.
- OpenFlow asks one useful clarification only when it changes the design direction.
- If you want to proceed early, ask for a draft and assumptions will be marked separately.`)
      return
    }

    const decision = decideTrigger(ctx, rawInput, rawOutput, message)
    if (!decision.shouldTrigger || !decision.feature) return

    if (await hasDesignDoc(ctx, decision.feature)) return

		appendGuardMessage(output, `## OpenFlow: Feature Design Suggested

This request may benefit from OpenFlow feature design docs before implementation.

Suggested user action:

\`\`\`text
/openflow-feature
\`\`\`

To create formal design docs, manually run "/openflow-feature" in this same session and continue in natural language. OpenFlow will derive the internal feature name from context.

This is advisory only: it does not block research, reading, or implementation tools, and the assistant must not invoke "/openflow-feature" automatically unless the user explicitly requests it.`)
  }

  return hook
}

/**
 * Append a completion guard to the output when the message contains
 * completion semantics and implementation state is dirty/stale/blocked.
 *
 * Returns true when a guard was appended (caller should return early).
 * Returns false when no guard was needed (caller should continue).
 *
 * Guards are applied for BOTH user and assistant messages.
 * OpenFlow's own guard messages are detected and skipped (recursion guard).
 */
async function appendCompletionGuardIfNeeded(
  ctx: OpenFlowContext,
  output: Record<string, unknown>,
  message: string,
): Promise<boolean> {
  if (!ctx.config.verification.completion_prompt || !isCompletionMessage(message)) {
    return false
  }

  // Don't append if output already has a guard (duplicate prevention)
  if (hasNotice(output, GUARD_BLOCK_TITLE) || hasNotice(output, GUARD_VERIFY_TITLE)) {
    return false
  }

  const implementationState = await getImplementationState(ctx.directory)
  const hasFreshReadiness = implementationState ? await isFreshReadiness(ctx.directory) : false

  if (implementationState && !hasFreshReadiness && ['dirty', 'stale', 'blocked'].includes(implementationState.state)) {
    appendGuardMessage(output, `## OpenFlow: Completion Blocked Until Quality Gate

The task appears to be in completion state, but the current implementation state is \`${implementationState.state}\`.

Required next action before claiming completion:
- Run \`openflow-quality-gate\`
- Resolve the reported readiness issues
- Re-check completion after the quality gate is clean`)
    return true
  }

  appendGuardMessage(output, `## OpenFlow: Verification Suggested

The task appears to be in completion state.

Recommended next action before archive:
- View verification checklist
- Run verification now
- Skip for now (known risk)

OpenFlow keeps this prompt non-blocking.`)
  return true
}

function looksLikeDirectCommand(message: string): boolean {
  const trimmed = message.trim()
  return Boolean(extractOpenFlowCommand(trimmed)) || trimmed.includes('skill(name="openflow-feature"') || trimmed.includes("skill(name='openflow-feature'")
}

function looksLikeInternalMessage(message: string): boolean {
  return /<\/?(?:system-reminder|auto-slash-command|command-message|omo_internal_initiator)\b/i.test(message)
    || /\[ALL BACKGROUND TASKS COMPLETE\]/i.test(message)
}

function hasNotice(output: Record<string, unknown>, noticeTitle: string): boolean {
  const parts = Array.isArray(output.parts) ? output.parts : []
  return parts.some((part) => {
    const rawPart = part as Record<string, unknown>
    return rawPart.type === 'text' && typeof rawPart.text === 'string' && rawPart.text.includes(noticeTitle)
  })
}

function looksLikeFeatureSwitch(message: string, activeFeature: string): boolean {
  const normalized = message.toLowerCase()
  if (!/(我想实现|我要实现|新的功能|新功能|另一个功能|another feature|new feature)/i.test(message)) {
    return false
  }

  return !normalized.includes(activeFeature.toLowerCase())
}

function looksLikePostFeatureAction(message: string, feature: string): boolean {
  const normalized = message.toLowerCase()
  if (normalized.includes(feature.toLowerCase())) {
    return true
  }

  return /(实现|开始做|开始开发|编码|落地|archive|归档|verify|验证|start-work|ulw-loop|implement|build|code)/i.test(message)
}

function shouldSuppressFeatureSuggestionForActiveDesignFlow(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  message: string,
): boolean {
  const signalText = [
    message,
    readString(input, ['agent']),
    readString(output, ['agent']),
    readString(input, ['message', 'agent']),
    readString(output, ['message', 'agent']),
    readString(input, ['metadata', 'agent']),
    readString(output, ['metadata', 'agent']),
    readString(output, ['message', 'metadata', 'agent']),
    readString(output, ['message', 'metadata', 'skill']),
    readString(output, ['message', 'metadata', 'command']),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n')

  return /(?:prometheus|plan builder|openflow-brainstorm|brainstorm|openflow-writing-plan|writing[-\s]?plan)/iu.test(signalText)
    || /(?:\.sisyphus[\\/](?:drafts|plans)|规划草稿|执行计划|实现计划|开发计划|planning draft|development plan)/iu.test(signalText)
    || /OpenFlow command:\s*\/openflow-(?:issue|feature|writing-plan)\b/iu.test(signalText)
}

function readString(source: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = source
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }

  return typeof current === 'string' ? current : undefined
}

async function loadActiveFeatureSession(directory: string, feature: string, featureStateDir = '.sisyphus/feature') {
  try {
    const filePath = path.join(directory, featureStateDir, `${feature}.json`)
    const content = await fs.readFile(filePath, 'utf-8')
    return normalizeFeatureSession(feature, JSON.parse(content) as unknown)
  } catch {
    return undefined
  }
}
