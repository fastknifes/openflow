import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { implementationRunStore } from '../utils/implementation-run.js'
import { logger } from '../utils/logger.js'

export interface GuardCheckOptions {
  ctx: OpenFlowContext
  /** The feature slug if known */
  feature?: string
  /** Tool name being executed */
  tool?: string
  /** Task args (prompt, subagent_type, category) */
  taskArgs?: Record<string, unknown>
  /** Session ID */
  sessionID?: string
}

export interface GuardResult {
  blocked: boolean
  feature?: string
  message?: string
}

/** Implementation-like tools that trigger the guard */
const IMPLEMENTATION_TOOLS = new Set([
  'task_create',
  'write',
  'edit',
])

/** Task categories/prompts that indicate implementation */
const IMPLEMENTATION_PATTERNS = [
  /\bimplement\b/i,
  /\bbuild\b/i,
  /\bfix\b/i,
  /\brefactor\b/i,
  /\bcode\s+change\b/i,
]

/** Actions that are always allowed even when plan exists */
const ALLOWED_TASK_CATEGORIES = new Set([
  'writing',
])

/**
 * Check if the current action should be blocked by the plan→implement guard.
 * Returns { blocked: false } when the action is allowed.
 * Returns { blocked: true, message } when the action should be blocked.
 */
export async function checkImplementationGuard(options: GuardCheckOptions): Promise<GuardResult> {
  const { ctx, tool, taskArgs, sessionID } = options

  // Only check implementation-like actions
  if (!isImplementationLikeAction(tool, taskArgs)) {
    return { blocked: false }
  }

  // Find features that have plan files but no active run
  const blockedFeature = await findPlanWithoutRun(ctx, sessionID)
  if (!blockedFeature) {
    return { blocked: false }
  }

  logger.info('implementation blocked: plan exists without active run', { feature: blockedFeature, tool })

  return {
    blocked: true,
    feature: blockedFeature,
    message: [
      `## Implementation Blocked`,
      '',
      `Feature **${blockedFeature}** has an implementation plan but no active ImplementationRun.`,
      '',
      'Before implementing, start an implementation run:',
      '',
      `\`/openflow-implement ${blockedFeature}\``,
      '',
      'This ensures proper worktree isolation, run tracking, and backend handoff.',
    ].join('\n'),
  }
}

function isImplementationLikeAction(tool: string | undefined, taskArgs: Record<string, unknown> | undefined): boolean {
  // Direct tool calls to write/edit/task_create
  if (tool && IMPLEMENTATION_TOOLS.has(tool)) {
    return true
  }

  // task() calls with implementation-like prompts
  if (tool === 'task' && taskArgs) {
    const prompt = typeof taskArgs.prompt === 'string' ? taskArgs.prompt : ''

    // Allow writing/documentation tasks
    if (taskArgs.category && ALLOWED_TASK_CATEGORIES.has(taskArgs.category as string)) {
      return false
    }

    // Check if prompt contains implementation-like intent
    if (IMPLEMENTATION_PATTERNS.some(pattern => pattern.test(prompt))) {
      return true
    }
  }

  return false
}

async function findPlanWithoutRun(ctx: OpenFlowContext, sessionID?: string): Promise<string | undefined> {
  const plansDir = path.join(ctx.directory, ctx.config.paths.plans)

  try {
    const entries = await fs.readdir(plansDir)
    const planFiles = entries.filter(e => e.endsWith('.md'))

    for (const planFile of planFiles) {
      const feature = planFile.replace(/\.md$/, '')
      const activeRun = await implementationRunStore.getActiveRun(ctx, feature, sessionID)
      if (!activeRun) {
        return feature
      }
    }
  } catch {
    // Plans directory doesn't exist — no guard needed
  }

  return undefined
}
