import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { ImplementationBackend, ImplementationContainerMode, ImplementationRunStatus, OpenFlowContext } from '../types.js'
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
  const mainWorktreeDirty = existsSync(join(ctx.directory, '.git')) && isMainWorktreeDirty(ctx)

  // ── 3. Check for duplicate active run ───────────────────────────────────
  logger.debug('orchestrator', 'checking for duplicate active run', { sanitizedFeature, sessionID: sessionID || undefined })
  const activeRun = await implementationRunStore.getActiveRun(ctx, sanitizedFeature, sessionID || undefined)
    ?? (await implementationRunStore.listRuns(ctx, sessionID ? { feature: sanitizedFeature, sessionID } : { feature: sanitizedFeature }))[0]
  if (activeRun) {
    const resumeStatuses: ImplementationRunStatus[] = [
      'created', 'starting_backend', 'running', 'quality_gate_pending', 'ready_for_archive'
    ]

    if (resumeStatuses.includes(activeRun.status)) {
      logger.info('orchestrator', 'duplicate active run resumed', { feature: sanitizedFeature, runID: activeRun.runID, status: activeRun.status })
      return [
        '## Implementation Run — Resumed',
        '',
        `- **Feature**: ${sanitizedFeature}`,
        `- **Run ID**: ${activeRun.runID}`,
        `- **Status**: ${activeRun.status}`,
        `- **Started**: ${activeRun.startedAt}`,
        activeRun.worktree ? `- **Worktree**: \`${activeRun.worktree}\`` : '',
        `- **Directory**: \`${activeRun.directory}\``,
        '',
        activeRun.status === 'quality_gate_pending'
          ? 'An implementation run is active and awaiting quality gate. Run `/openflow-quality-gate` to proceed.'
          : activeRun.status === 'ready_for_archive'
            ? 'Implementation is verified and ready for archive. Run `/openflow-archive` to proceed.'
            : 'An implementation run already exists for this feature. Resume this run instead of creating a new one.',
        '',
        `Active run directory: \`${activeRun.directory}\``,
      ].filter(Boolean).join('\n')
    }

    if (activeRun.status === 'failed' || activeRun.status === 'cancelled') {
      return [
        '## Implementation Run — Recovery Required',
        '',
        `- **Feature**: ${sanitizedFeature}`,
        `- **Run ID**: ${activeRun.runID}`,
        `- **Status**: ${activeRun.status}`,
        '',
        `The previous run ended with status \`${activeRun.status}\`. To start a new implementation:`,
        '',
        '1. Cancel or clean up the failed run manually',
        '2. Then run `/openflow-implement ' + sanitizedFeature + '` again',
      ].join('\n')
    }

    if (activeRun.status === 'blocked') {
      return [
        '## Implementation Run — Blocked Run Exists',
        '',
        `- **Feature**: ${sanitizedFeature}`,
        `- **Run ID**: ${activeRun.runID}`,
        `- **Status**: ${activeRun.status}`,
        '',
        'The implementation run is blocked. Review the blocking issue and resolve it before retrying.',
        '',
        `Active run directory: \`${activeRun.directory}\``,
      ].join('\n')
    }

    if (activeRun.status === 'archived') {
      return [
        '## Implementation Run — Already Archived',
        '',
        `- **Feature**: ${sanitizedFeature}`,
        `- **Run ID**: ${activeRun.runID}`,
        `- **Status**: ${activeRun.status}`,
        '',
        'This feature has already been archived. To start a new implementation cycle, begin with `/openflow-feature`.',
      ].join('\n')
    }

    return [
      '## Implementation Run — Active Run Exists',
      '',
      `- **Feature**: ${sanitizedFeature}`,
      `- **Active Run ID**: ${activeRun.runID}`,
      `- **Status**: ${activeRun.status}`,
      '',
      'An implementation run already exists for this feature. Check its status before creating a new one.',
    ].join('\n')
  }

  // ── 4. Prepare scoped paths ─────────────────────────────────────────────
  const eventsPath = join('.sisyphus', 'openflow', 'events', `${sanitizedFeature}.jsonl`)
  const observationsPath = join('.sisyphus', 'openflow', 'observations', `${sanitizedFeature}.jsonl`)

  if (!sessionID) {
    logger.warn('orchestrator', 'no sessionID available, run creation blocked', { sanitizedFeature })
    return [
      '## Implementation Run — Session Required',
      '',
      `- **Feature**: ${sanitizedFeature}`,
      '',
      'Cannot create an implementation run without a valid session ID. This command must be invoked through the chat hook (not as a standalone tool call without context).',
      '',
      'Please use `/openflow-implement ' + sanitizedFeature + '` from the chat input.',
    ].join('\n')
  }

  // ── 4b. Dirty-main policy for --no-worktree ──────────────────────────────
  if (!effectiveUseWorktree && mainWorktreeDirty) {
    logger.warn('orchestrator', 'dirty main worktree blocked for --no-worktree', { feature: sanitizedFeature })
    return [
      '## Implementation Run — Dirty Main Worktree',
      '',
      `- **Feature**: ${sanitizedFeature}`,
      `- **Mode**: session (--no-worktree)`,
      '',
      'The main worktree has uncommitted or untracked changes that may conflict with the implementation.',
      '',
      '**Options:**',
      '1. Use worktree isolation (default): `/openflow-implement ' + sanitizedFeature + '`',
      '2. Commit or stash your changes first, then retry with `--no-worktree`',
    ].join('\n')
  }

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
      if (mainWorktreeDirty) {
        await recordObservation(ctx, observationsPath, `WARNING: Main worktree is dirty while using isolated worktree for ${sanitizedFeature}. Changes in main worktree are not affected by this run.`)
      }
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
    '',
    `> 提醒：实现完成并通过质量门禁后，请运行 \`/openflow-archive ${sanitizedFeature}\` 来归档本次变更。`,
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
