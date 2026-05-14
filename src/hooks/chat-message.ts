import type { Hooks } from '@opencode-ai/plugin'
import type { OpenFlowContext } from '../types.js'
import { handleFeature } from '../commands/feature.js'
import { handleArchive, handleInit, handleStatus, handleConfig, handleMigrateDocs, handleIssue } from '../commands/index.js'
import { handleChange } from '../commands/change.js'
import { readDesignContextPacket } from '../commands/writing-plan.js'
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
import { findActiveFeature } from '../utils/feature-resolver.js'
import { getContractRuntime } from '../contracts/runtime.js'
import { loadAcceptanceState } from '../utils/acceptance-state.js'
import { ISSUE_CLARIFICATION_FILENAME } from '../utils/issue-utils.js'
import * as fs from 'node:fs/promises'
import * as nodePath from 'node:path'

const COMPLETION_PHRASES = ['完成了', '好了', '可以收尾', 'done', 'finished', 'ready to archive']

interface ActiveIssueWorkspace {
  slug: string
  workspacePath: string
}

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

      // /openflow-feature <feature>
      const featureMatch = trimmed.match(/^\/openflow-feature(?:\s+(.+))?$/)
      if (featureMatch) {
        const feature = featureMatch[1]?.trim()
        try {
          const result = await handleFeature(ctx, feature || undefined, undefined, input)
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

      // /openflow-verify <feature> — deprecated, use openflow-quality-gate
      const verifyMatch = trimmed.match(/^\/openflow-verify(?:\s+(.+))?$/)
      if (verifyMatch) {
        appendGuardMessage(output, '`/openflow-verify` is deprecated. Use the `openflow-quality-gate` skill instead, which automatically runs evidence-aware verify as part of its quality gate process.')
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
            : `No design context found for feature \`${resolvedFeature}\`. Run \`/openflow-feature ${resolvedFeature}\` first.`
          appendGuardMessage(output, result)
        } catch (err) {
          appendGuardMessage(output, err instanceof Error ? err.message : String(err))
        }
        return
      }

      // /openflow-harden <feature> — deprecated, use openflow-quality-gate
      const hardenMatch = trimmed.match(/^\/openflow-harden(?:\s+(.+))?$/)
      if (hardenMatch) {
        appendGuardMessage(output, '`/openflow-harden` is deprecated. Use the `openflow-quality-gate` skill instead, which automatically assesses risk and runs harden only when required as part of its quality gate process.')
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

    const activeIssueWorkspace = await findActiveIssueWorkspace(ctx.directory)
    if (activeIssueWorkspace) {
      appendGuardMessage(output, `## OpenFlow: Issue Investigation Active

Active issue workspace detected: \`${activeIssueWorkspace.workspacePath}\`.

Feature-design and feature-harden suggestions are suppressed while issue context is active.

Recommended issue flow:
- Continue gathering evidence with \`/openflow-issue <problem> --continue\`
- If the fix is already complete, record it with \`/openflow-issue <problem> --resolve\`
- Then invoke the \`openflow-quality-gate\` tool/skill to verify readiness`)
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
      const decision = decideTrigger(ctx, rawInput, rawOutput, message)
      const featureHint = decision.feature ?? '<feature-name>'

		appendGuardMessage(output, `## OpenFlow: Feature Design Closure Ready

Detected ${closureDecision.level} closure signal(s): ${closureDecision.matchedSignals.map(s => `\`${s}\``).join(', ')}.

Next step: continue the standalone feature design flow until design generation completes.

Recommended entrypoint:

\`\`\`text
/openflow-feature ${featureHint}
\`\`\`

Generation policy:
- Design is generated automatically when the required answers are complete.
- OpenFlow advances one question at a time through the feature design workflow.`)
      return
    }

    const decision = decideTrigger(ctx, rawInput, rawOutput, message)
    if (!decision.shouldTrigger || !decision.feature) return

    if (await hasDesignDoc(ctx, decision.feature)) return

		appendGuardMessage(output, `## OpenFlow: Feature Design Suggested

Feature \`${decision.feature}\` does not have design docs yet.

Recommended next step before implementation:

\`\`\`
/openflow-feature ${decision.feature}
\`\`\`

OpenFlow only suggests this step. It does not block research, reading, or implementation tools.`)
  }

  return hook
}

function looksLikeDirectCommand(message: string): boolean {
  const trimmed = message.trim()
  return Boolean(extractOpenFlowCommand(trimmed)) || trimmed.includes('skill(name="openflow-feature"') || trimmed.includes("skill(name='openflow-feature'")
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

function looksLikePostFeatureAction(message: string, feature: string): boolean {
  const normalized = message.toLowerCase()
  if (normalized.includes(feature.toLowerCase())) {
    return true
  }

  return /(实现|开始做|开始开发|编码|落地|archive|归档|verify|验证|start-work|ulw-loop|implement|build|code)/i.test(message)
}

async function findActiveIssueWorkspace(directory: string): Promise<ActiveIssueWorkspace | null> {
  const state = await loadAcceptanceState(directory)
  if (state?.mode === 'issue' && state.issueClarificationPath) {
    const clarificationPath = nodePath.isAbsolute(state.issueClarificationPath)
      ? state.issueClarificationPath
      : nodePath.join(directory, state.issueClarificationPath)
    const workspace = nodePath.dirname(clarificationPath)
    if (await pathExists(clarificationPath) && !(await pathExists(nodePath.join(workspace, 'design.md')))) {
      return {
        slug: nodePath.basename(workspace),
        workspacePath: toProjectRelativePath(directory, workspace),
      }
    }
  }

  const changesDir = nodePath.join(directory, 'docs', 'changes')
  try {
    const entries = (await fs.readdir(changesDir, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name))
    for (const entry of entries) {
      const workspace = nodePath.join(changesDir, entry.name)
      const clarificationPath = nodePath.join(workspace, ISSUE_CLARIFICATION_FILENAME)
      const designPath = nodePath.join(workspace, 'design.md')
      if (await pathExists(clarificationPath) && !(await pathExists(designPath))) {
        return {
          slug: entry.name,
          workspacePath: toProjectRelativePath(directory, workspace),
        }
      }
    }
  } catch {
    return null
  }

  return null
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function toProjectRelativePath(directory: string, filePath: string): string {
  const relative = nodePath.relative(directory, filePath)
  return relative && !relative.startsWith('..') && !nodePath.isAbsolute(relative)
    ? relative.replace(/\\/g, '/')
    : filePath
}

async function loadActiveFeatureSession(directory: string, feature: string) {
  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const filePath = path.join(directory, '.sisyphus', 'feature', `${feature}.json`)
    const content = await fs.readFile(filePath, 'utf-8')
    return normalizeFeatureSession(feature, JSON.parse(content) as unknown)
  } catch {
    return undefined
  }
}


