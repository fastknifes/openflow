import { execFileSync, execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { logger } from '../utils/logger.js'

export interface AutoCommitResult {
  committed: boolean
  /** Paths that were dirty (uncommitted) for this feature. */
  dirtyPaths: string[]
  /** Non-fatal warning if auto-commit was skipped or partially succeeded. */
  warning?: string
}

export interface WorktreeResult {
  success: boolean
  path: string
  branch?: string
  baseRef?: string
  error?: string
}

export function resolveWorktreePath(ctx: OpenFlowContext, feature: string): string {
  return join(ctx.directory, ctx.config.paths.worktree_dir, feature)
}

export function getCurrentBaseRef(ctx: OpenFlowContext): string | undefined {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: ctx.directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return undefined
  }
}

export function isMainWorktreeDirty(ctx: OpenFlowContext): boolean {
  try {
    const status = execSync('git status --porcelain', {
      cwd: ctx.directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    return status.length > 0
  } catch {
    return false
  }
}

/**
 * Auto-stage and commit **feature-scoped** OpenFlow documentation files so they are
 * visible in the worktree.
 *
 * This prevents the common problem where `/openflow-writing-plan` produces docs that
 * have not been committed; when `/openflow-implement --worktree` creates a new worktree
 * from HEAD those uncommitted files would be invisible.
 *
 * Safety guarantees:
 * - Only commits paths attributable to the current feature (feature workspace + plan).
 * - Skips if pre-existing staged changes are detected anywhere (avoids committing unrelated
 *   staged work or destroying partial staging).
 * - Uses `execFileSync` (argument-vector) instead of shell interpolation.
 * - Never uses `--allow-empty`.
 * - Failure is non-fatal: worktree creation proceeds with a warning.
 */
export function autoCommitDocs(ctx: OpenFlowContext, feature: string): AutoCommitResult {
  const empty: AutoCommitResult = { committed: false, dirtyPaths: [] }

  const featurePaths = getFeatureDocPaths(ctx, feature)
  if (featurePaths.length === 0) return empty

  // Step 1: Check for pre-existing staged changes anywhere. `git commit` commits the
  // whole index, so auto-commit must not run when users already staged unrelated work.
  let preStaged: string
  try {
    preStaged = gitCmd(ctx, ['diff', '--cached', '--name-only'])
  } catch (err: unknown) {
    const warning = `Auto-commit preflight failed: ${errorMessage(err)}`
    logger.warn('orchestrator', 'autoCommitDocs: staged preflight failed, skipping', { feature, error: errorMessage(err) })
    return { committed: false, dirtyPaths: [], warning }
  }

  if (preStaged.trim().length > 0) {
    const warning = `Pre-existing staged changes detected (${preStaged.trim().split('\n').length} file(s)). Skipping auto-commit to preserve your staging state. Commit or stash manually before using worktree.`
    logger.warn('orchestrator', 'autoCommitDocs: pre-existing staged changes, skipping', { feature, stagedFiles: preStaged.trim() })
    return { committed: false, dirtyPaths: [], warning }
  }

  // Step 2: Check for dirty (unstaged + untracked) feature paths
  let status: string
  try {
    status = gitCmd(ctx, ['status', '--porcelain', '--', ...featurePaths]).trim()
  } catch (err: unknown) {
    const warning = `Auto-commit status check failed: ${errorMessage(err)}`
    logger.warn('orchestrator', 'autoCommitDocs: status check failed, skipping', { feature, error: errorMessage(err) })
    return { committed: false, dirtyPaths: [], warning }
  }

  if (!status) {
    logger.debug('orchestrator', 'autoCommitDocs: no dirty doc paths, skipping', { feature })
    return empty
  }

  const dirtyPaths = parsePorcelainPaths(status)
  if (dirtyPaths.length === 0) {
    logger.debug('orchestrator', 'autoCommitDocs: dirty status had no parsable paths, skipping', { feature, status })
    return empty
  }

  // Step 3: Stage only the actual dirty files discovered by git status. Do not
  // stage broad candidate pathspecs: some candidates may not exist, and `git add`
  // can fail on unmatched pathspecs.
  try {
    gitCmd(ctx, ['add', '-A', '--', ...dirtyPaths])
  } catch (err: unknown) {
    logger.warn('orchestrator', 'autoCommitDocs: git add failed', { feature, error: errorMessage(err) })
    restoreStaged(ctx, dirtyPaths, feature)
    return { committed: false, dirtyPaths, warning: `Auto-commit stage failed: ${errorMessage(err)}` }
  }

  // Step 4: Verify staged diff is non-empty before committing
  let stagedDiff: string
  try {
    stagedDiff = gitCmd(ctx, ['diff', '--cached', '--name-only', '--', ...dirtyPaths]).trim()
  } catch (err: unknown) {
    logger.warn('orchestrator', 'autoCommitDocs: staged diff check failed', { feature, error: errorMessage(err) })
    restoreStaged(ctx, dirtyPaths, feature)
    return { committed: false, dirtyPaths, warning: `Auto-commit staged diff check failed: ${errorMessage(err)}` }
  }
  if (!stagedDiff) {
    logger.debug('orchestrator', 'autoCommitDocs: staged diff is empty after add, skipping commit', { feature })
    restoreStaged(ctx, dirtyPaths, feature)
    return { committed: false, dirtyPaths }
  }

  // `git commit` commits the whole index. Re-check the complete staged set right
  // before commit to avoid accidentally committing unrelated files staged by a race
  // or hook-like side effect between preflight and commit.
  let allStaged: string
  try {
    allStaged = gitCmd(ctx, ['diff', '--cached', '--name-only']).trim()
  } catch (err: unknown) {
    restoreStaged(ctx, dirtyPaths, feature)
    logger.warn('orchestrator', 'autoCommitDocs: full staged diff check failed', { feature, error: errorMessage(err) })
    return { committed: false, dirtyPaths, warning: `Auto-commit full staged diff check failed: ${errorMessage(err)}` }
  }
  if (normalizeGitFileList(allStaged) !== normalizeGitFileList(stagedDiff)) {
    const warning = 'Additional staged changes appeared during auto-commit. Skipping commit to preserve the index.'
    logger.warn('orchestrator', 'autoCommitDocs: staged set changed before commit, skipping', { feature, stagedFiles: allStaged })
    restoreStaged(ctx, dirtyPaths, feature)
    return { committed: false, dirtyPaths, warning }
  }

  // Step 5: Commit
  try {
    gitCmd(ctx, [
      '-c', 'user.name=OpenFlow',
      '-c', 'user.email=openflow@auto',
      'commit',
      '-m', `openflow: auto-commit docs for ${feature} before worktree`,
    ])
    logger.info('orchestrator', 'auto-committed feature docs before worktree creation', { feature, fileCount: dirtyPaths.length })
    return { committed: true, dirtyPaths }
  } catch (err: unknown) {
    logger.warn('orchestrator', 'auto-commit docs failed, proceeding without commit', {
      feature,
      error: errorMessage(err),
    })
    restoreStaged(ctx, dirtyPaths, feature)
    return { committed: false, dirtyPaths, warning: `Auto-commit failed: ${errorMessage(err)}` }
  }
}

/**
 * Derive **feature-scoped** document paths that should be auto-committed before worktree.
 *
 * Only includes paths directly attributable to the current feature:
 * - The feature's change workspace directory (e.g. `docs/changes/2026-xx-xx-{feature}/`)
 * - The feature's plan file (e.g. `.sisyphus/plans/{feature}.md`)
 *
 * Global doc directories (docs/current/*) are intentionally excluded to avoid
 * committing unrelated feature changes.
 */
function getFeatureDocPaths(ctx: OpenFlowContext, feature: string): string[] {
  const paths = ctx.config.paths
  const result: string[] = []

  // Feature change workspace: exact match or dated variant.
  // Use the entire parent dir; git status/add with '--' will only report
  // files that actually exist under these pathspecs.
  // Exact name: docs/changes/{feature}
  result.push(gitPath(paths.changes, feature))
  // Glob for dated variants: docs/changes/YYYY-MM-DD-{feature}.
  // Use a strict date-shaped prefix to avoid suffix collisions like
  // `payment-api` when the requested feature is `api`.
  // Git natively supports pathspec globs, so this works with execFileSync.
  result.push(`:(glob)${gitPath(paths.changes, `????-??-??-${feature}`, '**')}`)

  // Feature plan file
  result.push(gitPath(paths.plans, `${feature}.md`))

  return result
}

function gitPath(...segments: string[]): string {
  return segments
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
}

function normalizeGitFileList(value: string): string {
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .sort()
    .join('\n')
}

function parsePorcelainPaths(status: string): string[] {
  return status
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .flatMap(line => {
      const rawPath = line.substring(3).trim()
      if (!rawPath) return []
      if (rawPath.includes(' -> ')) {
        return rawPath.split(' -> ').map(part => part.trim()).filter(Boolean)
      }
      return [rawPath]
    })
}

function restoreStaged(ctx: OpenFlowContext, paths: string[], feature: string): void {
  if (paths.length === 0) return
  try {
    gitCmd(ctx, ['restore', '--staged', '--', ...paths])
  } catch (err: unknown) {
    logger.warn('orchestrator', 'autoCommitDocs: failed to restore staged paths', { feature, error: errorMessage(err) })
  }
}

/**
 * Execute a git command using argument-vector (no shell interpolation).
 */
function gitCmd(ctx: OpenFlowContext, args: string[]): string {
  return execFileSync('git', args, {
    cwd: ctx.directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function gitCmdIn(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function gitCheckIn(cwd: string, args: string[]): boolean {
  try {
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}

function validateReusableWorktree(path: string, expectedBranch: string, baseRef?: string): string | undefined {
  try {
    const actualBranch = gitCmdIn(path, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    if (actualBranch !== expectedBranch) {
      return `Existing worktree is on branch ${actualBranch}, expected ${expectedBranch}. Remove it or resume the matching branch.`
    }

    const status = gitCmdIn(path, ['status', '--porcelain']).trim()
    if (status) {
      return `Existing worktree has uncommitted changes. Clean or archive it before reusing: ${path}`
    }

    if (baseRef && !gitCheckIn(path, ['merge-base', '--is-ancestor', baseRef, 'HEAD'])) {
      return `Existing worktree does not contain current base commit ${baseRef}. Remove it or recreate the worktree.`
    }

    return undefined
  } catch (err: unknown) {
    return `Existing worktree validation failed: ${errorMessage(err)}`
  }
}

export async function createWorktree(ctx: OpenFlowContext, feature: string): Promise<WorktreeResult> {
  const path = resolveWorktreePath(ctx, feature)
  const branch = `openflow/implement-${feature}`
  const baseRef = getCurrentBaseRef(ctx)
  logger.debug('orchestrator', 'createWorktree started', { feature, path, branch, baseRef })

  // Check for existing valid worktree — reuse if resumable
  const existing = await verifyWorktree(ctx, feature)
  if (existing.exists) {
    const reuseError = validateReusableWorktree(path, branch, baseRef)
    if (reuseError) {
      logger.warn('orchestrator', 'existing worktree is not reusable', { feature, path, branch, error: reuseError })
      return { success: false, path, branch, error: reuseError }
    }
    logger.info('orchestrator', 'reusing existing worktree', { feature, path, branch })
    return baseRef ? { success: true, path, branch, baseRef } : { success: true, path, branch }
  }

  // Conflicting path: directory exists but is not a valid git worktree
  if (existsSync(path)) {
    logger.warn('orchestrator', 'conflicting worktree path exists but is not a valid git worktree', { feature, path })
    return {
      success: false,
      path,
      error: `Worktree path exists but is not a valid git worktree: ${path}. Remove it or use a different feature name.`,
    }
  }

  try {
    logger.debug('orchestrator', 'git worktree add with new branch', { path, branch })
    runGitCommand(ctx, ['worktree', 'add', '-b', branch, path])
    logger.info('orchestrator', 'worktree created with new branch', { path, branch })
    return baseRef ? { success: true, path, branch, baseRef } : { success: true, path, branch }
  } catch (firstErr: unknown) {
    if (!isBranchAlreadyExistsError(firstErr)) {
      logger.warn('orchestrator', 'git worktree add failed', { feature, error: errorMessage(firstErr) })
      return { success: false, path, error: errorMessage(firstErr) }
    }

    logger.debug('orchestrator', 'branch already exists, trying worktree add with existing branch', { path, branch })
    try {
      runGitCommand(ctx, ['worktree', 'add', path, branch])
      logger.info('orchestrator', 'worktree created with existing branch', { path, branch })
      return baseRef ? { success: true, path, branch, baseRef } : { success: true, path, branch }
    } catch (secondErr: unknown) {
      logger.warn('orchestrator', 'git worktree add with existing branch failed', { feature, error: errorMessage(secondErr) })
      return { success: false, path, branch, error: errorMessage(secondErr) }
    }
  }
}

export async function removeWorktree(ctx: OpenFlowContext, feature: string): Promise<WorktreeResult> {
  const path = resolveWorktreePath(ctx, feature)
  const branch = `openflow/implement-${feature}`
  logger.debug('orchestrator', 'removeWorktree started', { feature, path })

  try {
    runGitCommand(ctx, ['worktree', 'remove', '--force', path])
    logger.info('orchestrator', 'worktree removed', { path })
    return { success: true, path, branch }
  } catch (firstErr: unknown) {
    logger.debug('orchestrator', 'force worktree remove failed, trying normal remove', { error: errorMessage(firstErr) })
    try {
      runGitCommand(ctx, ['worktree', 'remove', path])
      logger.info('orchestrator', 'worktree removed (normal)', { path })
      return { success: true, path, branch }
    } catch (secondErr: unknown) {
      logger.debug('orchestrator', 'normal worktree remove failed, trying filesystem cleanup', { error: errorMessage(secondErr) })
      try {
        rmSync(path, { recursive: true, force: true })
        logger.info('orchestrator', 'worktree removed via filesystem cleanup', { path })
        return { success: true, path, branch }
      } catch (cleanupErr: unknown) {
        logger.warn('orchestrator', 'all worktree removal attempts failed', { feature, error: errorMessage(cleanupErr) })
        return {
          success: false,
          path,
          branch,
          error: `${errorMessage(firstErr)}; fallback remove failed: ${errorMessage(secondErr)}; cleanup failed: ${errorMessage(cleanupErr)}`,
        }
      }
    }
  }
}

export async function verifyWorktree(
  ctx: OpenFlowContext,
  feature: string,
): Promise<{ exists: boolean; path: string }> {
  const path = resolveWorktreePath(ctx, feature)
  logger.debug('orchestrator', 'verifying worktree', { feature, path })

  if (!existsSync(path)) {
    logger.debug('orchestrator', 'worktree path does not exist', { path })
    return { exists: false, path }
  }

  try {
    const list = execSync('git worktree list', {
      cwd: ctx.directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const exists = worktreeListIncludesPath(list, path)
    logger.debug('orchestrator', 'worktree verification result', { path, exists })
    return { exists, path }
  } catch {
    logger.debug('orchestrator', 'worktree verification failed (git worktree list error)', { path })
    return { exists: false, path }
  }
}

function runGitCommand(ctx: OpenFlowContext, args: string[]): string {
  return execSync(['git', ...args.map(shellQuote)].join(' '), {
    cwd: ctx.directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function shellQuote(value: string): string {
  return `"${value.replace(/["]/g, '\\"')}"`
}

function isBranchAlreadyExistsError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase()
  return message.includes('already exists') && message.includes('branch')
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const stderr = (err as NodeJS.ErrnoException & { stderr?: unknown }).stderr
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim()
    if (Buffer.isBuffer(stderr) && stderr.toString('utf8').trim()) return stderr.toString('utf8').trim()
    return err.message
  }
  return String(err)
}

function worktreeListIncludesPath(list: string, path: string): boolean {
  const normalizedPath = normalizePath(path)
  return list
    .split(/\r?\n/)
    .filter(Boolean)
    .some((line) => normalizePath(line).startsWith(normalizedPath))
}

function normalizePath(path: string): string {
  return resolve(path).replace(/\\/g, '/').toLowerCase()
}
