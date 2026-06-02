import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { ImplementationBackend, ImplementationContainerMode, ImplementationRunStatus, OpenFlowContext } from '../types.js'
import { implementationRunStore, recordObservation } from '../utils/implementation-run.js'
import { handoffToBackend } from '../utils/implementation-backend.js'
import { createWorktree, isMainWorktreeDirty, syncChangesToWorktree } from '../utils/implementation-worktree.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { sanitizeFeatureName } from '../utils/security.js'
import type { ImplementationRun } from '../types.js'
import { logger } from '../utils/index.js'
import { generateConstraintPacket, type ConstraintPacketResult } from '../contracts/context-resolver.js'
import { resolveChangeUnitDir } from '../utils/change-units.js'
import { initPlanState, savePlanState } from '../utils/plan-state.js'

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
  let baseBranch: string | undefined
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

      // Check for existing constraints in resumed run
      if (activeRun.status === 'running') {
        const executionRoot = activeRun.worktree || activeRun.directory
        try {
          const changeDir = await resolveChangeUnitDir(executionRoot, sanitizedFeature)
          const constraintsPath = path.join(executionRoot, 'docs', 'changes', changeDir, 'constraints.md')
          try {
            await fs.access(constraintsPath)
            // #8: Check if plan.md is newer than constraints.md
            const planPath = path.join(executionRoot, 'docs', 'changes', changeDir, 'plan.md')
            let constraintsAreStale = false
            try {
              const [planStat, constraintsStat] = await Promise.all([
                fs.stat(planPath),
                fs.stat(constraintsPath),
              ])
              if (planStat.mtimeMs > constraintsStat.mtimeMs) {
                constraintsAreStale = true
              }
            } catch {
              // plan.md stat failed; can't compare, assume constraints are valid
            }
            if (constraintsAreStale) {
              await recordObservation(ctx, activeRun.observationsPath, `Constraints are stale (plan.md modified after constraints.md generation). Skipping reuse.`)
            } else {
              await recordObservation(ctx, activeRun.observationsPath, `Reusing existing constraints.md for run ${activeRun.runID}`)
            }
          } catch {
            // constraints.md doesn't exist, will be generated below
          }
        } catch {
          // resolveChangeUnitDir failed, skip
        }
      }

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

  // ── 3b. Block when plan.md is missing ───────────────────────────────────
  const preCheckDir = ctx.directory
  try {
    const preCheckChangeDir = await resolveChangeUnitDir(preCheckDir, sanitizedFeature)
    const preCheckPlanPath = path.join(preCheckDir, 'docs', 'changes', preCheckChangeDir, 'plan.md')
    try {
      await fs.access(preCheckPlanPath)
    } catch {
      logger.warn('orchestrator', 'plan.md not found, blocking implement', { sanitizedFeature, preCheckPlanPath })
      return formatPlanMissingMessage(sanitizedFeature, preCheckPlanPath)
    }
  } catch {
    // resolveChangeUnitDir failed — no change unit dir yet, so plan.md can't exist
    logger.warn('orchestrator', 'change unit dir not found, plan.md cannot exist', { sanitizedFeature })
    const fallbackPlanPath = path.join(ctx.directory, 'docs', 'changes', sanitizedFeature, 'plan.md')
    return formatPlanMissingMessage(sanitizedFeature, fallbackPlanPath)
  }

  // ── 4. Prepare scoped paths ─────────────────────────────────────────────
  const eventsPath = join('.openflow', 'events', `${sanitizedFeature}.jsonl`)
  const observationsPath = join('.openflow', 'observations', `${sanitizedFeature}.jsonl`)

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
      baseBranch = result.baseBranch
      logger.info('orchestrator', 'worktree created', { path: result.path, branch: result.branch, baseRef, baseBranch })
      await recordObservation(ctx, observationsPath, `Worktree ${worktree ? 'reused' : 'created'} for feature ${sanitizedFeature} at ${result.path} (branch: ${result.branch ?? 'unknown'})`)
      if (result.stashed) {
        await recordObservation(ctx, observationsPath, `Auto-stashed dirty main worktree before creating worktree for ${sanitizedFeature}`)
      }
      if (mainWorktreeDirty) {
        await recordObservation(ctx, observationsPath, `WARNING: Main worktree is dirty while using isolated worktree for ${sanitizedFeature}. Changes in main worktree are not affected by this run.`)
      }

      // Sync changes workspace to worktree so build agent and QG can find docs/changes files
      try {
        const syncResult = await syncChangesToWorktree(ctx, sanitizedFeature, result.path)
        if (syncResult.synced.length > 0) {
          logger.info('orchestrator', 'changes workspace synced to worktree', { feature: sanitizedFeature, synced: syncResult.synced })
          await recordObservation(ctx, observationsPath, `Synced changes workspace to worktree: ${syncResult.synced.join(', ')}`)
        }
        if (syncResult.errors.length > 0) {
          logger.warn('orchestrator', 'changes workspace sync partial failure', { feature: sanitizedFeature, errors: syncResult.errors })
          await recordObservation(ctx, observationsPath, `WARNING: Changes workspace sync had errors: ${syncResult.errors.join('; ')}`)
        }
      } catch (syncErr) {
        logger.warn('orchestrator', 'changes workspace sync failed (non-blocking)', { feature: sanitizedFeature, error: syncErr instanceof Error ? syncErr.message : String(syncErr) })
        await recordObservation(ctx, observationsPath, `WARNING: Changes workspace sync failed: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`)
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
      ...(baseBranch ? { baseBranch } : {}),
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

  // ── 6a. Initialize plan execution state ────────────────────────────────
  try {
    const planState = await initPlanState(ctx, sanitizedFeature)
    planState.runId = run.runID
    planState.status = 'in_progress'
    await savePlanState(ctx, sanitizedFeature, planState)
    logger.info('orchestrator', 'plan state linked to run', { runID: run.runID, feature: sanitizedFeature })
  } catch (error) {
    logger.warn('orchestrator', 'plan state init failed (non-blocking)', { runID: run.runID, error: error instanceof Error ? error.message : String(error) })
  }

  // ── 6. Set active run in observer ───────────────────────────────────────
  if (observer) {
    logger.debug('orchestrator', 'setting active run in observer', { runID: run.runID })
    observer.setActiveRun(run)
  }

  // ── 6b. Generate constraint packet ──────────────────────────────────────
  let constraintResult: ConstraintPacketResult | undefined
  try {
    const executionRoot = run.worktree || directory
    const changeDir = await resolveChangeUnitDir(executionRoot, sanitizedFeature)
    const planAbsPath = path.join(executionRoot, 'docs', 'changes', changeDir, 'plan.md')
    let planContent = ''
    try {
      planContent = await fs.readFile(planAbsPath, 'utf-8')
    } catch {
      // plan.md might not exist; proceed without constraints
    }
    if (planContent) {
      constraintResult = await generateConstraintPacket({
        projectDir: ctx.directory,
        planContent,
        feature: sanitizedFeature,
        runID: run.runID,
        executionRoot,
      })
      await recordObservation(ctx, observationsPath, `Constraint packet: ${constraintResult.status}, ${constraintResult.constraintCount} constraints${constraintResult.constraintsPath ? ` at ${constraintResult.constraintsPath}` : ''}`)
      logger.info('orchestrator', 'constraint packet generated', { runID: run.runID, status: constraintResult.status, count: constraintResult.constraintCount })
    }
  } catch (error) {
    logger.warn('orchestrator', 'constraint packet generation failed', { runID: run.runID, error: error instanceof Error ? error.message : String(error) })
    await recordObservation(ctx, observationsPath, `Constraint packet generation failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  // ── 7. Backend handoff ──────────────────────────────────────────────────
  let handoffResult: { success: boolean; backend: ImplementationBackend; command?: string; executionGuide?: string; error?: string }
  if (toolContext) {
    logger.debug('orchestrator', 'handing off to backend', { runID: run.runID, backend })
    try {
      handoffResult = await handoffToBackend(ctx, run, toolContext, constraintResult)
      logger.info('orchestrator', 'backend handoff completed', { runID: run.runID, success: handoffResult.success, backend: handoffResult.backend, command: handoffResult.command })
      await recordObservation(ctx, observationsPath, `Backend handoff ${handoffResult.success ? 'succeeded' : 'failed'} for run ${run.runID} (${handoffResult.backend}${handoffResult.command ? ` / ${handoffResult.command}` : ''})`)
      // Record plan progress tracking requirement
      if (handoffResult.success && handoffResult.executionGuide) {
        await recordObservation(ctx, observationsPath, `Plan progress tracking: you MUST update plan.md checkboxes (- [ ] → - [x]) as each task completes. Quality gate will reject if any checkbox remains unchecked.`)
      }
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
  const resultLines: string[] = [
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
  ]

  // D2: Inject execution guide for non-OMO environments
  if (handoffResult.executionGuide) {
    resultLines.push('', handoffResult.executionGuide)
  }

  resultLines.push(
    '',
    `*Implementation run created at ${new Date().toISOString()}*`,
    '',
    '> 提醒：实现完成并通过质量门禁后，请运行以下命令来归档本次变更：',
    '',
    '```',
    `/openflow-archive ${sanitizedFeature}`,
    '```',
  )

  return resultLines.filter(Boolean).join('\n')
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
 * Format a plan-missing error message with the feature name and expected plan path.
 */
function formatPlanMissingMessage(feature: string, planPath: string): string {
  return [
    '## Implementation Run — Plan Missing',
    '',
    `- **Feature**: ${feature}`,
    `- **Error**: Plan file not found at ${planPath}`,
    '',
    `- **Required**: Run \`/openflow-plan ${feature}\` first to create a plan before implementing.`,
  ].join('\n')
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
