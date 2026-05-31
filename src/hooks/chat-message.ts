import type { Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext } from '../types.js'
import type { ImplementObserver } from '../commands/implement.js'
import { createAcceptanceHook } from './acceptance.js'
import {
  appendOpenFlowNotice,
  extractMessageText,
  getMessageRole,
} from './feature-workflow.js'
import { getContractRuntime } from '../contracts/runtime.js'
import { dispatchOpenFlowCommand } from './chat-command-dispatch.js'
import { getImplementationState, isFreshReadiness } from '../utils/acceptance-state.js'
import { tArray } from '../i18n/index.js'
import { tryAutoSaveBrainstormPacket } from '../phases/feature/brainstorm-auto-save.js'
import {
  isBrainstormSessionFromMetadata,
  fetchSessionMessages,
  deriveFeatureHint,
} from '../utils/brainstorm-session.js'

const COMPLETION_PHRASES = tArray('signals.completion.phrases')
const GUARD_BLOCK_TITLE = '## OpenFlow: Completion Blocked Until Quality Gate'
const GUARD_VERIFY_TITLE = '## OpenFlow: Verification Suggested'

function isCompletionMessage(message: string): boolean {
  // Guard recursion: quality gate reports contain "completed" but are not task completions.
  // Treating them as completions causes the hook to append a guard that re-invokes the gate.
  if (message.includes('## Quality Gate') || message.includes('Quality gate completed at')) {
    return false
  }
  const lower = message.toLowerCase()
  return COMPLETION_PHRASES.some(phrase => lower.includes(phrase))
}

export function createChatMessageHook(ctx: OpenFlowContext, observer?: ImplementObserver) {
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

    if (await dispatchOpenFlowCommand(ctx, input, output, message, observer)) return

    // ── Brainstorm auto-save (assistant-turn, fire-and-forget) ────────
    if (role === 'assistant') {
      const sessionID = typeof rawInput.sessionID === 'string' ? rawInput.sessionID : undefined
      if (sessionID && isBrainstormSessionFromMetadata(rawOutput, rawInput)) {
        void (async () => {
          try {
            const messages = await fetchSessionMessages(ctx.client, sessionID)
            if (messages.length === 0) return
            await tryAutoSaveBrainstormPacket({
              projectDir: ctx.directory,
              sourceSessionID: sessionID,
              featureHint: deriveFeatureHint(messages),
              messages,
              trigger: 'assistant-turn',
              isBrainstormSession: true,
            })
          } catch {
            // Silently ignore per plan constraints
          }
        })()
      }
    }

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

    // ── Acceptance detection ─
    await acceptanceHook({ sessionID: input.sessionID, message })
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
    const invocationCount = implementationState.qualityGateInvocationCount ?? 0
    if (invocationCount >= 3) {
      appendOpenFlowNotice(output, {
        kind: 'verification-suggested',
        text: `## OpenFlow: Quality Gate Retry Limit Reached

The implementation state is \`${implementationState.state}\` and the quality gate has already been invoked ${invocationCount} time${invocationCount === 1 ? '' : 's'}.

Required next action:
- Report the blockers to the user and ask for guidance
- Do NOT re-invoke the quality gate again`,
        ephemeral: false,
        placement: 'prepend',
      })
      return true
    }

    appendOpenFlowNotice(output, {
      kind: 'completion-blocked',
      text: `## OpenFlow: Completion Blocked Until Quality Gate

The task appears to be in completion state during formal implementation, but the current implementation state is \`${implementationState.state}\`.

Required next action before claiming completion:
- Run Full Quality Gate: \`openflow-quality-gate\` (max 3 total invocations)
- Resolve the reported readiness issues
- Re-check completion after the quality gate is clean`,
      ephemeral: false,
      placement: 'prepend',
    })
    return true
  }

  appendOpenFlowNotice(output, {
    kind: 'verification-suggested',
    text: `## OpenFlow: Verification Suggested

The task appears to be in completion state.

Recommended next action:
- For formal implementation: run Full Quality Gate with \`openflow-quality-gate\`
- For casual coding or low-risk edits: perform lightweight verification (diff review, relevant tests, typecheck, lint)
- Skip for now (known risk)

OpenFlow keeps this prompt non-blocking.`,
    ephemeral: false,
    placement: 'prepend',
  })
  return true
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



