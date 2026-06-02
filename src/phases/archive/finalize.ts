import { execSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type CurrentPromotionSuggestion, type ImplementationRun, type OpenFlowContext } from '../../types.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../utils/acceptance-state.js'
import { buildPromotionSuggestions, applyPromotionSuggestions } from './current-promotion.js'
import { cleanBuild } from '../../utils/build-cleaner.js'
import { listBuilds } from '../../utils/file-tracker.js'
import { logger } from '../../utils/logger.js'
import { implementationRunStore } from '../../utils/implementation-run.js'
import { removeWorktree } from '../../utils/implementation-worktree.js'
import type { ArchiveContext, FinalizeResult } from './types.js'

const RECENT_BUILDS_WINDOW = 5

export async function finalizeArchive(
  ctx: OpenFlowContext,
  ac: ArchiveContext,
  archivedSources: ReadonlySet<string>,
): Promise<FinalizeResult> {
  const stagingDir = ac.stagingDir
  const finalArchiveDir = ac.archiveDir
  const archiveRoot = ac.archiveRoot

  // Promotion
  const promotionSuggestions = await buildPromotionSuggestions({
    projectDir: ctx.directory,
    archiveDir: stagingDir,
    feature: ac.feature,
  })

  const autoPromoteCurrent = Boolean(ctx.config.archive.auto_promote_current)
  let promotionResult: { applied: CurrentPromotionSuggestion[]; skipped: CurrentPromotionSuggestion[] }

  if (autoPromoteCurrent) {
    promotionResult = await applyPromotionSuggestions({
      projectDir: ctx.directory,
      suggestions: promotionSuggestions,
    })
  } else {
    promotionResult = { applied: [], skipped: promotionSuggestions }
  }

  // Staging → final
  await fs.mkdir(archiveRoot, { recursive: true })
  await fs.rename(stagingDir, finalArchiveDir)

  // Safety gate
  const expectedArchiveFiles: string[] = []
  if (ac.designExists) expectedArchiveFiles.push('design.md')
  if (ac.planExists) expectedArchiveFiles.push('plan.md')
  const { verified: archiveVerified } = await assertArchiveMaterialized(finalArchiveDir, expectedArchiveFiles)
  const isDerivedWorktree = ac.implementationRun?.worktreeKind === 'derived' && !!ac.implementationRun?.worktree

  // Worktree commit/merge/cleanup
  let archiveCommitHash: string | undefined
  let commitSucceeded = false
  const implementationRun = ac.implementationRun

  if (isDerivedWorktree && implementationRun!.worktree) {
    try {
      execSync('git add -A', { cwd: implementationRun!.worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      execSync(`git commit -m "Archive: ${ac.feature}" --no-verify`, { cwd: implementationRun!.worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      archiveCommitHash = execSync('git rev-parse HEAD', { cwd: implementationRun!.worktree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      commitSucceeded = true
      logger.info('orchestrator', 'archive commit created from derived worktree', { feature: ac.feature, commit: archiveCommitHash })
    } catch (err) {
      logger.warn('orchestrator', 'failed to create archive commit from derived worktree', { feature: ac.feature, error: err instanceof Error ? err.message : String(err) })
    }
  } else {
    commitSucceeded = true
  }

  let worktreeCleanedUp = false
  let mergeSucceeded = false
  if (isDerivedWorktree && implementationRun!.worktree && archiveCommitHash) {
    const branch = implementationRun!.branch ?? `openflow/implement-${ac.feature}`
    // Branch check & switch
    try {
      const currentBranch = execSync('git branch --show-current', { cwd: ctx.directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
      if (currentBranch && implementationRun!.baseRef && currentBranch !== implementationRun!.baseRef) {
        try { execSync(`git checkout ${implementationRun!.baseRef}`, { cwd: ctx.directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch { /* continue */ }
      }
    } catch { /* continue */ }

    try {
      execSync(`git merge ${branch} --no-edit`, { cwd: ctx.directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      mergeSucceeded = true
      logger.info('orchestrator', 'merged worktree branch', { feature: ac.feature, branch })
    } catch (err) {
      logger.warn('orchestrator', 'failed to merge worktree branch', { feature: ac.feature, branch, error: err instanceof Error ? err.message : String(err) })
    }

    try {
      const removeResult = await removeWorktree(ctx, ac.feature)
      if (removeResult.success) {
        try {
          execSync(`git branch -d ${branch}`, { cwd: ctx.directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
          worktreeCleanedUp = true
        } catch { /* branch delete failed */ }
      }
    } catch { /* cleanup error */ }
  } else if (!isDerivedWorktree) {
    mergeSucceeded = true
  }

  const destructiveOpsSafe = archiveVerified && commitSucceeded && (isDerivedWorktree ? mergeSucceeded : true)
  const promotionApplied = promotionResult.applied.length > 0

  // Update acceptance state
  await markArchivedIfNeeded(ctx, ac.feature, promotionSuggestions, promotionApplied)
  await cleanupBuildData(ctx.directory)

  if (destructiveOpsSafe) {
    await cleanupArchivedSources(ac.sourcePaths.changeWorkspace, archivedSources)
  } else {
    logger.warn('orchestrator', 'skipping source workspace cleanup — safety gate failed', { feature: ac.feature })
  }

  // Update implementation run
  if (implementationRun) {
    if (implementationRun.status === 'ready_for_archive') {
      const updates: Partial<ImplementationRun> = { status: 'archived' }
      if (archiveCommitHash) updates.baseRef = archiveCommitHash
      await implementationRunStore.updateRun(ctx, implementationRun.runID, updates)
    }
    await recordArchiveRunEvent(ctx, implementationRun)
  }

  return {
    archiveDir: finalArchiveDir,
    archiveCommitHash,
    worktreeCleanedUp,
    sourceCleanupSkipped: !destructiveOpsSafe,
    promotionApplied,
    promotionSuggestions,
    promotionAppliedCount: promotionResult.applied.length,
    autoPromoteCurrent,
  }
}

/** Clean up staging on failure */
export async function cleanupStaging(stagingDir: string): Promise<void> {
  try { await fs.rm(stagingDir, { recursive: true, force: true }) } catch { /* best effort */ }
}

async function assertArchiveMaterialized(archiveDir: string, expectedFiles: string[]): Promise<{ verified: boolean; missing: string[] }> {
  const missing: string[] = []
  try { await fs.access(archiveDir) } catch { return { verified: false, missing: ['<archive directory does not exist>'] } }
  for (const file of expectedFiles) {
    try {
      const stat = await fs.stat(path.join(archiveDir, file))
      if (stat.size === 0) missing.push(`${file} (empty)`)
    } catch { missing.push(file) }
  }
  return { verified: missing.length === 0, missing }
}

async function markArchivedIfNeeded(ctx: OpenFlowContext, feature: string, suggestions: CurrentPromotionSuggestion[], applied: boolean): Promise<void> {
  const state = await loadAcceptanceState(ctx.directory)
  if (!state || state.feature !== feature) return
  state.phase = applied ? 'promoted' : 'promotion_pending'
  state.waitingForDocUpdateConfirm = false
  state.promotionSuggestions = suggestions
  state.promotionApplied = applied
  state.promotionDecidedAt = new Date().toISOString()
  if (applied) state.promotionAppliedAt = state.promotionDecidedAt
  delete state.lastChangedFile
  await saveAcceptanceState(ctx.directory, state)
}

async function cleanupBuildData(projectDir: string): Promise<void> {
  const builds = await listBuilds(projectDir)
  for (const buildId of builds.slice(RECENT_BUILDS_WINDOW)) {
    try { await cleanBuild({ projectDir, buildId }) } catch { /* best effort */ }
  }
}

async function cleanupArchivedSources(changeWorkspace: string, archivedSources: ReadonlySet<string>): Promise<void> {
  const normalizedWorkspace = path.resolve(changeWorkspace)
  const sorted = [...archivedSources].map(p => path.resolve(p)).filter(p => isDescendant(normalizedWorkspace, p)).sort((a, b) => b.length - a.length)
  for (const p of sorted) { try { await fs.rm(p, { force: true }) } catch { /* best effort */ } }
  const dirs = new Set<string>()
  for (const p of sorted) {
    let d = path.dirname(p)
    while (isDescendant(normalizedWorkspace, d)) { dirs.add(d); if (d === normalizedWorkspace) break; d = path.dirname(d) }
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    try { if ((await fs.readdir(d)).length === 0) await fs.rmdir(d) } catch { /* best effort */ }
  }
}

function isDescendant(parent: string, candidate: string): boolean {
  const rel = path.relative(parent, candidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

async function recordArchiveRunEvent(ctx: OpenFlowContext, run: ImplementationRun): Promise<void> {
  const eventsPath = path.isAbsolute(run.eventsPath) ? run.eventsPath : path.join(ctx.directory, run.eventsPath)
  await fs.mkdir(path.dirname(eventsPath), { recursive: true })
  await fs.appendFile(eventsPath, `${JSON.stringify({ type: 'archive_completed', runID: run.runID, feature: run.feature, sessionID: run.sessionID, timestamp: new Date().toISOString() })}\n`, 'utf8')
}
