import { join } from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { ImplementationBackend, ImplementationContainerMode, OpenFlowContext } from '../types.js'
import { implementationRunStore, recordObservation } from '../utils/implementation-run.js'
import { handoffToBackend } from '../utils/implementation-backend.js'
import { createWorktree, isMainWorktreeDirty } from '../utils/implementation-worktree.js'
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
  // Default to worktree mode per design policy
  const effectiveUseWorktree = useWorktree ?? true
  logger.info('orchestrator', 'handleImplement started', { feature, useWorktree: effectiveUseWorktree, sessionID: toolContext?.sessionID })

  // ── 1. Resolve feature name ─────────────────────────────────────────────
  const providedFeature = stripCommandTokens(feature)
  const resolvedFeature = providedFeature || await findActiveFeature(ctx)

  if (!resolvedFeature) {
    logger.warn('orchestrator', 'handleImplement: no feature resolved')
    return 'Error: No feature specified and no active feature found. Provide a feature name: openflow-implement <feature>'
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  logger.debug('orchestrator', 'feature resolved', { sanitizedFeature, provided: !!providedFeature })

  // ── 2. Derive session context ───────────────────────────────────────────
  const sessionID = toolContext?.sessionID ?? ''
  const messageID = toolContext?.messageID ?? ''
  const agent = toolContext?.agent ?? ''
  let directory = ctx.directory
  let worktree: string | undefined
  let branch: string | undefined
  let baseRef: string | undefined
  const containerMode: ImplementationContainerMode = effectiveUseWorktree ? 'worktree' : 'session'
  const backend: ImplementationBackend = 'opencode'
  const backendCommand = ''
  const mainWorktreeDirty = isMainWorktreeDirty(ctx)

  // ── 3. Check for duplicate active run ───────────────────────────────────
  logger.debug('orchestrator', 'checking for duplicate active run', { sanitizedFeature, sessionID: sessionID || undefined })
  const activeRun = await implementationRunStore.getActiveRun(ctx, sanitizedFeature, sessionID || undefined)
  if (activeRun) {
    logger.warn('orchestrator', 'duplicate active run blocked', { feature: sanitizedFeature, runID: activeRun.runID })
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

  // ── 4. Prepare scoped paths ─────────────────────────────────────────────
  const eventsPath = join('.sisyphus', 'openflow', 'events', `${sanitizedFeature}.jsonl`)
  const observationsPath = join('.sisyphus', 'openflow', 'observations', `${sanitizedFeature}.jsonl`)

  // ── 5. Optionally create worktree ───────────────────────────────────────
  if (effectiveUseWorktree) {
    logger.debug('orchestrator', 'creating worktree', { feature: sanitizedFeature })
    const result = await createWorktree(ctx, sanitizedFeature)
    if (result.success) {
      directory = result.path
      worktree = result.path
      branch = result.branch
      baseRef = result.baseRef
      logger.info('orchestrator', 'worktree created', { path: result.path, branch: result.branch, baseRef })
      await recordObservation(ctx, observationsPath, `Worktree ${worktree ? 'reused' : 'created'} for feature ${sanitizedFeature} at ${result.path} (branch: ${result.branch ?? 'unknown'})`)
    } else {
      logger.warn('orchestrator', 'worktree creation failed', { feature: sanitizedFeature, error: result.error })
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

  // ── 6. Create ImplementationRun ─────────────────────────────────────────
  // Use feature-scoped paths; the runID will be assigned by the store.

  logger.debug('orchestrator', 'creating implementation run', { sanitizedFeature, directory, worktree, containerMode })
  let run: ImplementationRun
  try {
    run = await implementationRunStore.createRun(ctx, {
      feature: sanitizedFeature,
      sessionID,
      messageID,
      agent,
      directory,
      ...(worktree ? { worktree } : {}),
      ...(branch ? { branch } : {}),
      ...(baseRef ? { baseRef } : {}),
      backend,
      backendCommand,
      status: 'created',
      containerMode,
      worktreeKind: worktree ? 'derived' : 'main',
      ...(worktree ? { commitPolicy: 'archive' as const, cleanupPolicy: 'archive_remove' as const } : {}),
      mainWorktreeDirty,
      eventsPath,
      observationsPath,
    })
  } catch (error) {
    logger.error('orchestrator', 'failed to create implementation run', error instanceof Error ? error : new Error(String(error)), { sanitizedFeature })
    return `Error: Failed to create implementation run: ${error instanceof Error ? error.message : String(error)}`
  }

  logger.info('orchestrator', 'implementation run created', { runID: run.runID, feature: sanitizedFeature, directory, worktree })
  await recordObservation(ctx, observationsPath, `Implementation run ${run.runID} created for ${sanitizedFeature} (backend: ${backend}, containerMode: ${containerMode})`)

  // ── 6. Set active run in observer ───────────────────────────────────────
  if (observer) {
    logger.debug('orchestrator', 'setting active run in observer', { runID: run.runID })
    observer.setActiveRun(run)
  }

  // ── 7. Backend handoff ──────────────────────────────────────────────────
  let handoffResult: { success: boolean; backend: ImplementationBackend; command?: string; error?: string }
  if (toolContext) {
    logger.debug('orchestrator', 'handing off to backend', { runID: run.runID, backend })
    try {
      handoffResult = await handoffToBackend(ctx, run, toolContext)
      logger.info('orchestrator', 'backend handoff completed', { runID: run.runID, success: handoffResult.success, backend: handoffResult.backend, command: handoffResult.command })
      await recordObservation(ctx, observationsPath, `Backend handoff ${handoffResult.success ? 'succeeded' : 'failed'} for run ${run.runID} (${handoffResult.backend}${handoffResult.command ? ` / ${handoffResult.command}` : ''})`)
      // Refresh observer with the persisted run (backendCommand updated by handoffToBackend)
      const updatedRun = await implementationRunStore.getRun(ctx, run.runID)
      if (updatedRun && observer) {
        observer.setActiveRun(updatedRun)
      }
    } catch (error) {
      logger.error('orchestrator', 'backend handoff failed', error instanceof Error ? error : new Error(String(error)), { runID: run.runID })
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
    logger.debug('orchestrator', 'no toolContext, skipping backend handoff')
    handoffResult = { success: true, backend: 'opencode' as const, command: 'opencode build' }
  }

  logger.info('orchestrator', 'handleImplement completed', { runID: run.runID, feature: sanitizedFeature, success: handoffResult.success })

  // ── 8. Return result ────────────────────────────────────────────────────
  return [
    '## Implementation Run Created',
    '',
    `- **Feature**: ${sanitizedFeature}`,
    `- **Run ID**: ${run.runID}`,
    `- **Backend**: ${handoffResult.backend}`,
    `- **Status**: created`,
    `- **Container Mode**: ${containerMode}`,
    effectiveUseWorktree && worktree ? `- **Worktree**: \`${worktree}\`` : '',
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
