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
import { findActiveIssueWorkspace } from './issue-workspace.js'

const COMPLETION_PHRASES = ['完成了', '好了', '可以收尾', 'done', 'finished', 'ready to archive']
const ISSUE_ACTIVE_NOTICE_TITLE = '## OpenFlow: Issue Investigation Active'

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
    if (role && role !== 'user') return

    const message = extractMessageText(rawOutput)
    if (!message) return
    if (looksLikeInternalMessage(message)) return

    if (await dispatchOpenFlowCommand(ctx, input, output, message)) return

    const activeIssueWorkspace = await findActiveIssueWorkspace(ctx.directory)
    if (activeIssueWorkspace) {
      if (!hasNotice(output, ISSUE_ACTIVE_NOTICE_TITLE)) {
        appendGuardMessage(output, `${ISSUE_ACTIVE_NOTICE_TITLE}

Active issue workspace detected: \`${activeIssueWorkspace.workspacePath}\`.

Feature-design and feature-harden suggestions are suppressed while issue context is active.

Recommended issue flow:
- Continue gathering evidence with \`/openflow-issue <problem> --continue\`
- If the fix is already complete, record it with \`/openflow-issue <problem> --resolve\`
- Then invoke the \`openflow-quality-gate\` skill to verify readiness`)
      }
      return
    }

    await acceptanceHook({ sessionID: input.sessionID, message })

    // Dispatch session events to Guardian
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

    if (!ctx.config.feature.enabled) {
      return
    }

    const activeFeature = await getActiveFeatureSession(ctx.directory, input.sessionID)
    if (activeFeature && !(await hasDesignDoc(ctx, activeFeature))) {
      if (looksLikeDirectCommand(message) || isCompletionMessage(message)) {
        return
      }

      const activeSession = await loadActiveFeatureSession(ctx.directory, activeFeature)
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

    if (ctx.config.verification.completion_prompt && isCompletionMessage(message)) {
      appendGuardMessage(output, `## OpenFlow: Verification Suggested

The task appears to be in completion state.

Recommended next action before archive:
- View verification checklist
- Run verification now
- Skip for now (known risk)

OpenFlow keeps this prompt non-blocking.`)
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

This request looks like it may need OpenFlow design docs before implementation.

Recommended next step before implementation:

\`\`\`
/openflow-feature
\`\`\`

Run it in the same session and continue in natural language; OpenFlow will derive the internal feature name.

OpenFlow only suggests this step. It does not block research, reading, or implementation tools.`)
  }

  return hook
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

async function loadActiveFeatureSession(directory: string, feature: string) {
  try {
    const filePath = path.join(directory, '.sisyphus', 'feature', `${feature}.json`)
    const content = await fs.readFile(filePath, 'utf-8')
    return normalizeFeatureSession(feature, JSON.parse(content) as unknown)
  } catch {
    return undefined
  }
}


