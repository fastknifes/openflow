import type { Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext } from '../types.js'
import { handleBrainstorm } from '../commands/brainstorm.js'
import { handleArchive, handleInit, handleStatus, handleConfig, handleVerify, handleMigrateDocs, handleHarden, handleIssue } from '../commands/index.js'
import { handleChange } from '../commands/change.js'
import { readDesignContextPacket } from '../commands/writing-plan.js'
import { normalizeBrainstormSession, isAwaitingFormalAnswer } from '../phases/brainstorm/state-machine.js'
import { createAcceptanceHook } from './acceptance.js'
import { getHardenSuggestion } from './acceptance-prompt.js'
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
import { findActiveFeature } from '../utils/feature-resolver.js'
import { detectOmoExecutionFlow } from '../utils/omo-detection.js'
import { loadExecutionPolicy, saveExecutionPolicy, createDefaultPolicy } from '../utils/execution-policy.js'
import { assessChangeRisk, isHighRisk } from '../utils/risk-assessment.js'
import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'

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

    // OpenFlow slash-command dispatch — intercept BEFORE continuation/suggestion logic
    const openFlowCommand = extractOpenFlowCommand(message)
    if (openFlowCommand) {
      const trimmed = openFlowCommand

      // /openflow-brainstorm <feature>
      const brainstormMatch = trimmed.match(/^\/openflow-brainstorm(?:\s+(.+))?$/)
      if (brainstormMatch) {
        const feature = brainstormMatch[1]?.trim()
        try {
          const result = await handleBrainstorm(ctx, feature || undefined, undefined, input)
          appendGuardMessage(output, result)
        } catch (err) {
          appendGuardMessage(output, err instanceof Error ? err.message : String(err))
        }
        return
      }

      // /openflow-change <feature> "<description>"
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
        return
      }

      // /openflow-verify <feature>
      const verifyMatch = trimmed.match(/^\/openflow-verify(?:\s+(.+))?$/)
      if (verifyMatch) {
        const feature = verifyMatch[1]?.trim()
        const result = await handleVerify(ctx, feature || undefined)
        appendGuardMessage(output, result)
        return
      }

      // /openflow-archive <feature>
      const archiveMatch = trimmed.match(/^\/openflow-archive(?:\s+(.+))?$/)
      if (archiveMatch) {
        const feature = archiveMatch[1]?.trim() || undefined
        try {
          const result = await handleArchive(ctx, feature)
          appendGuardMessage(output, result)
        } catch (err) {
          appendGuardMessage(output, err instanceof Error ? err.message : String(err))
        }
        return
      }

      // /openflow-init
      if (trimmed === '/openflow-init') {
        try {
          const result = await handleInit(ctx)
          appendGuardMessage(output, result)
        } catch (err) {
          appendGuardMessage(output, err instanceof Error ? err.message : String(err))
        }
        return
      }

      // /openflow-status
      if (trimmed === '/openflow-status') {
        const result = handleStatus(ctx)
        appendGuardMessage(output, result)
        return
      }

      // /openflow-config
      if (trimmed === '/openflow-config') {
        const result = handleConfig(ctx)
        appendGuardMessage(output, result)
        return
      }

      // /openflow-migrate-docs [--sourceDir <path>] [--targetDir <path>] [--dryRun] [--answer <text>]
      if (trimmed.startsWith('/openflow-migrate-docs')) {
        const migrateArgs: Record<string, string | boolean> = {}
        let migrateKey: string | null = null
        for (const token of trimmed.slice('/openflow-migrate-docs'.length).trim().split(/\s+/).filter(Boolean)) {
          if (token.startsWith('--')) {
            migrateKey = token.slice(2)
            migrateArgs[migrateKey] = true
          } else if (migrateKey) {
            migrateArgs[migrateKey] = token
            migrateKey = null
          }
        }
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
        return
      }

      // /openflow-writing-plan <feature>
      const writingPlanMatch = trimmed.match(/^\/openflow-writing-plan(?:\s+(.+))?$/)
      if (writingPlanMatch) {
        const feature = writingPlanMatch[1]?.trim()
        try {
          const resolvedFeature = feature || await findActiveFeature(ctx)
          if (!resolvedFeature) {
            appendGuardMessage(output, 'Feature name is required. Usage: /openflow-writing-plan <feature-name>')
            return
          }
          const contextPacket = await readDesignContextPacket(ctx.directory, resolvedFeature)
          const result = contextPacket
            ? `## Writing Plan Context\n\nFeature: \`${resolvedFeature}\`\n\n${contextPacket}`
            : `No design context found for feature \`${resolvedFeature}\`. Run \`/openflow-brainstorm ${resolvedFeature}\` first.`
          appendGuardMessage(output, result)
        } catch (err) {
          appendGuardMessage(output, err instanceof Error ? err.message : String(err))
        }
        return
      }

      // /openflow-harden <feature> [--full] [--mode <mode>]
      const hardenMatch = trimmed.match(/^\/openflow-harden(?:\s+(.+))?$/)
      if (hardenMatch) {
        const hardenArgs = hardenMatch[1]?.trim() ?? ''
        const hardenFeature = hardenArgs.split(/\s+--/)[0]?.trim()
        const full = hardenArgs.includes('--full')
        try {
          const result = await handleHarden(ctx, hardenFeature || undefined, { full }, input.sessionID)
          appendGuardMessage(output, result)
        } catch (err) {
          appendGuardMessage(output, err instanceof Error ? err.message : String(err))
        }
        return
      }

      // /openflow-issue <feature-or-description>
      const issueMatch = trimmed.match(/^\/openflow-issue(?:\s+(.+))?$/)
      if (issueMatch) {
        const feature = issueMatch[1]?.trim()
        try {
          const result = await handleIssue(ctx, feature || undefined)
          appendGuardMessage(output, result)
        } catch (err) {
          appendGuardMessage(output, err instanceof Error ? err.message : String(err))
        }
        return
      }

      // Unknown /openflow-* command — pass through
    }

    // --- Quality Policy Lifecycle (OMO Execution) ---
    try {
      const omoFlow = await detectOmoExecutionFlow(ctx, message)
      if (omoFlow === 'omo') {
        const feature = await findActiveFeature(ctx)
        if (feature) {
          const existingPolicy = await loadExecutionPolicy(ctx.directory, feature)

          if (!existingPolicy) {
            // Check for pending selection from a previous turn
            const pending = await readPendingSelection(ctx.directory)

            if (pending && pending.feature === feature) {
              // Parse user reply for quality mode
              const modeMatch = message.match(/\b(fast|balanced|strict)\b/i)
              const mode = modeMatch?.[1] ? modeMatch[1].toLowerCase() as 'fast' | 'balanced' | 'strict' : 'balanced'

              // Determine harden_policy based on mode
              const hardenPolicy = mode === 'fast' ? 'none' as const
                : mode === 'strict' ? 'final' as const
                : 'risk-based' as const

              const policy = createDefaultPolicy(feature, feature, mode)
              policy.harden_policy = hardenPolicy
              policy.selected_by = 'user'
              await saveExecutionPolicy(ctx.directory, policy)
              await clearPendingSelection(ctx.directory)

              appendGuardMessage(output, `## OpenFlow: Quality Mode Selected\n\nMode: **${mode}**\nHarden policy: ${hardenPolicy}\nPolicy saved for feature \`${feature}\`.`)
            } else {
              // No policy, no pending — prompt for selection
              await writePendingSelection(ctx.directory, { feature, timestamp: new Date().toISOString() })

              appendGuardMessage(output, `## OpenFlow: Quality Mode Selection

Choose quality mode for this OMO execution:
1. **Balanced** (Recommended) - risk-based harden + required verify
2. **Fast** - skip harden + required verify
3. **Strict** - final harden + required verify

Reply with: \`fast\`, \`balanced\`, or \`strict\`. (Default: balanced)`)
            }
          } else {
            // Policy exists — apply harden decision (Phase B)
            const qualityMode = existingPolicy.quality_mode
            const hardenPolicy = existingPolicy.harden_policy

            if (qualityMode === 'balanced' && hardenPolicy === 'risk-based') {
              // Assess risk from git diff
              try {
                const { execSync } = await import('node:child_process')
                const diffOutput = execSync('git diff HEAD', { cwd: ctx.directory, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
                const diffLines = diffOutput.split('\n').length
                const files = [...new Set(
                  diffOutput.split('\n')
                    .filter((line: string) => line.startsWith('+++ '))
                    .map((line: string) => line.slice(6).trim())
                )]
                const risk = assessChangeRisk(files, diffLines, false)
                if (isHighRisk(risk)) {
                  appendGuardMessage(output, `## OpenFlow: Harden Suggested\n\nBalanced mode detected **high-risk** changes.\nRecommended: run \`/openflow-harden ${feature}\``)
                }
              } catch {
                // git diff unavailable — skip risk assessment silently
              }
            } else if (qualityMode === 'strict' && hardenPolicy === 'final') {
              appendGuardMessage(output, `## OpenFlow: Harden Required\n\nStrict mode requires harden before verify.\nRun: \`/openflow-harden ${feature}\``)
            }
            // fast + none → skip harden entirely
          }
        }
      }
    } catch {
      // Quality policy errors must never block message flow
    }
    // --- End Quality Policy Lifecycle ---

    await acceptanceHook({ sessionID: input.sessionID, message })

    // Suggest /openflow-harden for complex features — gated behind quality policy absence
    const acceptanceState = await import('../utils/acceptance-state.js').then(m => m.loadAcceptanceState(ctx.directory))
    if (acceptanceState?.phase === 'acceptance' && acceptanceState.feature) {
      // Phase C: gate existing harden suggestion if quality policy exists for this feature
      const policyForFeature = await loadExecutionPolicy(ctx.directory, acceptanceState.feature)
      if (!policyForFeature) {
        const hardenSuggestion = await getHardenSuggestion(ctx, acceptanceState.feature)
        if (hardenSuggestion) {
          appendGuardMessage(output, hardenSuggestion)
        }
      }
    }

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
  return Boolean(extractOpenFlowCommand(trimmed)) || trimmed.includes('skill(name="openflow-brainstorm"') || trimmed.includes("skill(name='openflow-brainstorm'")
}

function extractOpenFlowCommand(message: string): string | undefined {
  const trimmed = message.trim()
  if (trimmed.startsWith('/openflow-')) {
    return trimmed
  }

  const commandMatch = trimmed.match(/^OpenFlow command:\s*(\/openflow-\S+(?:\s+.+)?)$/m)
  return commandMatch?.[1]?.trim()
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

const PENDING_SELECTION_PATH = ['openflow', 'pending-selection.json']

async function readPendingSelection(directory: string): Promise<{ feature: string; timestamp: string } | null> {
  try {
    const filePath = nodePath.join(directory, '.sisyphus', ...PENDING_SELECTION_PATH)
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.feature === 'string' && typeof parsed.timestamp === 'string') {
      return parsed as { feature: string; timestamp: string }
    }
    return null
  } catch {
    return null
  }
}

async function writePendingSelection(directory: string, data: { feature: string; timestamp: string }): Promise<void> {
  try {
    const filePath = nodePath.join(directory, '.sisyphus', ...PENDING_SELECTION_PATH)
    const dir = nodePath.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    // Log but don't crash
  }
}

async function clearPendingSelection(directory: string): Promise<void> {
  try {
    const filePath = nodePath.join(directory, '.sisyphus', ...PENDING_SELECTION_PATH)
    await fs.unlink(filePath)
  } catch {
    // Already gone or inaccessible — ignore
  }
}
