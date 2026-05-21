import { join } from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { ImplementationBackend, ImplementationContainerMode, OpenFlowContext } from '../types.js'
import { implementationRunStore } from '../utils/implementation-run.js'
import { handoffToBackend } from '../utils/implementation-backend.js'
import { createWorktree } from '../utils/implementation-worktree.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { sanitizeFeatureName } from '../utils/security.js'
import type { ImplementationRun } from '../types.js'
import { logger } from '../utils/index.js'

export interface ImplementArgs {
  feature?: string
  useWorktree?: boolean
}

export interface ImplementObserver {
  setActiveRun(run: ImplementationRun): void
}

export async function handleImplement(
  ctx: OpenFlowContext,
  feature?: string,
  useWorktree?: boolean,
  toolContext?: ToolContext,
  observer?: ImplementObserver,
): Promise<string> {
  // ── 1. Resolve feature name ─────────────────────────────────────────────
  const providedFeature = stripCommandTokens(feature)
  const resolvedFeature = providedFeature || await findActiveFeature(ctx)

  if (!resolvedFeature) {
    return 'Error: No feature specified and no active feature found. Provide a feature name: openflow-implement <feature>'
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)

  // ── 2. Derive session context ───────────────────────────────────────────
  const sessionID = toolContext?.sessionID ?? ''
  const messageID = toolContext?.messageID ?? ''
  const agent = toolContext?.agent ?? ''
  let directory = ctx.directory
  let worktree: string | undefined
  const containerMode: ImplementationContainerMode = useWorktree ? 'worktree' : 'session'
  const backend: ImplementationBackend = 'opencode'
  const backendCommand = ''

  // ── 3. Check for duplicate active run ───────────────────────────────────
  const activeRun = await implementationRunStore.getActiveRun(ctx, sanitizedFeature, sessionID || undefined)
  if (activeRun) {
    logger.warn('Duplicate active run blocked', { feature: sanitizedFeature, runID: activeRun.runID })
    return [
      '## Implementation Run — Duplicate Blocked',
      '',
      `- **Feature**: ${sanitizedFeature}`,
      `- **Active Run ID**: ${activeRun.runID}`,
      `- **Status**: ${activeRun.status}`,
      `- **Started**: ${activeRun.startedAt}`,
      '',
      'An active implementation run already exists for this feature. Complete or cancel the existing run before starting a new one.',
      '',
      `Active run directory: \`${activeRun.directory}\``,
    ].join('\n')
  }

  // ── 4. Optionally create worktree ───────────────────────────────────────
  if (useWorktree) {
    const result = await createWorktree(ctx, sanitizedFeature)
    if (result.success) {
      directory = result.path
      worktree = result.path
    } else {
      logger.warn('Worktree creation failed', { feature: sanitizedFeature, error: result.error })
      return [
        '## Implementation Run — Worktree Creation Failed',
        '',
        `- **Feature**: ${sanitizedFeature}`,
        `- **Error**: ${result.error ?? 'unknown error'}`,
        '',
        'Could not create a git worktree for isolation. Proceed without worktree or resolve the git issue.',
      ].join('\n')
    }
  }

  // ── 5. Create ImplementationRun ─────────────────────────────────────────
  // Use feature-scoped paths; the runID will be assigned by the store.
  const eventsPath = join('.sisyphus', 'openflow', 'events', `${sanitizedFeature}.jsonl`)
  const observationsPath = join('.sisyphus', 'openflow', 'observations', `${sanitizedFeature}.jsonl`)

  let run: ImplementationRun
  try {
    run = await implementationRunStore.createRun(ctx, {
      feature: sanitizedFeature,
      sessionID,
      messageID,
      agent,
      directory,
      ...(worktree ? { worktree } : {}),
      backend,
      backendCommand,
      status: 'created',
      containerMode,
      eventsPath,
      observationsPath,
    })
  } catch (error) {
    return `Error: Failed to create implementation run: ${error instanceof Error ? error.message : String(error)}`
  }

  logger.info('Implementation run created', { runID: run.runID, feature: sanitizedFeature })

  // ── 6. Set active run in observer ───────────────────────────────────────
  if (observer) {
    observer.setActiveRun(run)
  }

  // ── 7. Backend handoff ──────────────────────────────────────────────────
  let handoffResult: { success: boolean; backend: ImplementationBackend; command?: string; error?: string }
  if (toolContext) {
    try {
      handoffResult = await handoffToBackend(ctx, run, toolContext)
    } catch (error) {
      return [
        '## Implementation Run — Backend Handoff Failed',
        '',
        `- **Feature**: ${sanitizedFeature}`,
        `- **Run ID**: ${run.runID}`,
        `- **Error**: ${error instanceof Error ? error.message : String(error)}`,
        '',
        'The implementation run was created but the backend handoff failed. You may retry manually.',
      ].join('\n')
    }
  } else {
    handoffResult = { success: true, backend: 'opencode' as const, command: 'opencode build' }
  }

  // ── 8. Return result ────────────────────────────────────────────────────
  return [
    '## Implementation Run Created',
    '',
    `- **Feature**: ${sanitizedFeature}`,
    `- **Run ID**: ${run.runID}`,
    `- **Backend**: ${handoffResult.backend}`,
    `- **Status**: created`,
    `- **Container Mode**: ${containerMode}`,
    useWorktree && worktree ? `- **Worktree**: \`${worktree}\`` : '',
    `- **Directory**: \`${directory}\``,
    handoffResult.command ? `- **Backend Command**: \`${handoffResult.command}\`` : '',
    '',
    handoffResult.success
      ? 'Backend handoff successful. The implementation run is now active.'
      : `Backend handoff issue: ${handoffResult.error ?? 'unknown'}`,
    '',
    '---',
    '',
    `*Implementation run created at ${new Date().toISOString()}*`,
  ].filter(Boolean).join('\n')
}

/**
 * Strip leading command tokens like /openflow-implement from feature input.
 */
function stripCommandTokens(input?: string): string | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  // Strip leading slash-command patterns
  const stripped = trimmed.replace(/^\/?openflow-implement\s*/i, '').trim()
  return stripped || undefined
}

/**
 * Exposed for src/index.ts to pass the observer instance.
 */
export function buildImplementHandler(
  ctx: OpenFlowContext,
  observer: ImplementObserver,
) {
  return (feature?: string, useWorktree?: boolean, toolContext?: ToolContext) =>
    handleImplement(ctx, feature, useWorktree, toolContext, observer)
}
