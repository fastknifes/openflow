import type { Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext } from '../types.js'
import { handleBrainstorm } from '../commands/brainstorm.js'
import { normalizeBrainstormSession, isAwaitingFormalAnswer } from '../phases/brainstorm/state-machine.js'
import { createAcceptanceHook } from './acceptance.js'
import {
  appendGuardMessage,
  clearRecentBrainstormCompletion,
  detectClosureReady,
  decideTrigger,
  extractMessageText,
  getActiveBrainstormFeature,
  getRecentCompletedBrainstormFeature,
  getMessageRole,
  hasDesignDoc,
} from './brainstorm-workflow.js'

const COMPLETION_PHRASES = ['完成了', '好了', '可以收尾', 'done', 'finished', 'ready to archive']

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

    await acceptanceHook({ sessionID: input.sessionID, message })

    if (!ctx.config.brainstorming.enabled) {
      return
    }

    const activeFeature = await getActiveBrainstormFeature(ctx.directory, input.sessionID)
    if (activeFeature && !(await hasDesignDoc(ctx, activeFeature))) {
      if (looksLikeDirectCommand(message) || isCompletionMessage(message)) {
        return
      }

      const activeSession = await loadActiveBrainstormSession(ctx.directory, activeFeature)
      if (!activeSession || !isAwaitingFormalAnswer(activeSession)) {
        return
      }

      if (looksLikeFeatureSwitch(message, activeFeature)) {
        // Let new-feature detection continue below instead of hijacking the old brainstorm.
      } else {
        const continuation = await handleBrainstorm(ctx, undefined, message, input)
        appendGuardMessage(output, continuation)
        return
      }
    }

    if (!ctx.config.brainstorming.auto_trigger) {
      return
    }

    const recentCompletedFeature = await getRecentCompletedBrainstormFeature(ctx.directory, input.sessionID)
    if (recentCompletedFeature) {
      if (looksLikePostBrainstormAction(message, recentCompletedFeature)) {
        return
      }

      if (!looksLikePostBrainstormAction(message, recentCompletedFeature)) {
        await clearRecentBrainstormCompletion(ctx.directory, input.sessionID)
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
    if (closureDecision.isClosureReady && ctx.config.brainstorming.closure.auto_transition) {
      const decision = decideTrigger(ctx, rawInput, rawOutput, message)
      const featureHint = decision.feature ?? '<feature-name>'

		appendGuardMessage(output, `## OpenFlow: Brainstorm Closure Ready

Detected ${closureDecision.level} closure signal(s): ${closureDecision.matchedSignals.map(s => `\`${s}\``).join(', ')}.

Next step: continue the standalone brainstorm flow until design generation completes.

Recommended entrypoint:

\`\`\`text
/openflow-brainstorm ${featureHint}
\`\`\`

Generation policy:
- Design is generated automatically when the required answers are complete.
- OpenFlow advances one question at a time through the brainstorm skill.`)
      return
    }

    const decision = decideTrigger(ctx, rawInput, rawOutput, message)
    if (!decision.shouldTrigger || !decision.feature) return

    if (await hasDesignDoc(ctx, decision.feature)) return

		appendGuardMessage(output, `## OpenFlow: Brainstorm Suggested

Feature \`${decision.feature}\` does not have design docs yet.

Recommended next step before implementation:

\`\`\`
/openflow-brainstorm ${decision.feature}
\`\`\`

OpenFlow only suggests this step. It does not block research, reading, or implementation tools.`)
  }

  return hook
}

function looksLikeDirectCommand(message: string): boolean {
  const trimmed = message.trim()
  return trimmed.startsWith('/openflow-') || trimmed.includes('skill(name="openflow-brainstorm"') || trimmed.includes("skill(name='openflow-brainstorm'")
}

function looksLikeFeatureSwitch(message: string, activeFeature: string): boolean {
  const normalized = message.toLowerCase()
  if (!/(我想实现|我要实现|新的功能|新功能|另一个功能|another feature|new feature)/i.test(message)) {
    return false
  }

  return !normalized.includes(activeFeature.toLowerCase())
}

function looksLikePostBrainstormAction(message: string, feature: string): boolean {
  const normalized = message.toLowerCase()
  if (normalized.includes(feature.toLowerCase())) {
    return true
  }

  return /(实现|开始做|开始开发|编码|落地|archive|归档|verify|验证|start-work|ulw-loop|implement|build|code)/i.test(message)
}

async function loadActiveBrainstormSession(directory: string, feature: string) {
  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const filePath = path.join(directory, '.sisyphus', 'brainstorm', `${feature}.json`)
    const content = await fs.readFile(filePath, 'utf-8')
    return normalizeBrainstormSession(feature, JSON.parse(content) as unknown)
  } catch {
    return undefined
  }
}
