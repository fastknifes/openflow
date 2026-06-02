import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { logger } from '../utils/logger.js'
import { resolveChangeUnitDir } from './change-units.js'

export interface WorktreeResult {
  success: boolean
  path: string
  branch?: string
  baseRef?: string
  baseBranch?: string
  error?: string
  stashed?: boolean  // whether auto-stash was performed
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

export function getCurrentBranch(ctx: OpenFlowContext): string | undefined {
  try {
    return execSync('git branch --show-current', {
      cwd: ctx.directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim() || undefined
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
 * Auto-stash dirty main worktree changes before creating a worktree.
 * Returns true if stash was performed, false if not needed or failed.
 */
function autoStashIfDirty(ctx: OpenFlowContext, feature: string): boolean {
  if (!isMainWorktreeDirty(ctx)) return false
  try {
    runGitCommand(ctx, [
      'stash', 'push', '-m',
      `openflow:auto-stash before worktree for ${feature}`,
      '--include-untracked',
    ])
    logger.info('orchestrator', 'auto-stashed dirty main worktree', { feature })
    return true
  } catch {
    logger.warn('orchestrator', 'auto-stash failed, proceeding anyway', { feature })
    return false
  }
}

/**
 * Restore auto-stashed changes after worktree operation.
 * Must be called in a finally block.
 */
function autoStashPop(ctx: OpenFlowContext): void {
  try {
    runGitCommand(ctx, ['stash', 'pop'])
    logger.info('orchestrator', 'auto-stash pop restored main worktree')
  } catch {
    logger.warn('orchestrator', 'auto-stash pop failed — user may need to run "git stash pop" manually')
  }
}

export async function createWorktree(ctx: OpenFlowContext, feature: string): Promise<WorktreeResult> {
  const path = resolveWorktreePath(ctx, feature)
  const branch = `openflow/implement-${feature}`
  const baseRef = getCurrentBaseRef(ctx)
  const baseBranch = getCurrentBranch(ctx)
  logger.debug('orchestrator', 'createWorktree started', { feature, path, branch, baseRef, baseBranch })

  // Check for existing valid worktree — reuse if resumable
  const existing = await verifyWorktree(ctx, feature)
  if (existing.exists) {
    logger.info('orchestrator', 'reusing existing worktree', { feature, path, branch })
    return { success: true, path, branch, ...(baseRef ? { baseRef } : {}), ...(baseBranch ? { baseBranch } : {}) }
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

  // Auto-stash dirty main before creating worktree
  const stashed = autoStashIfDirty(ctx, feature)

  try {
    logger.debug('orchestrator', 'git worktree add with new branch', { path, branch })
    runGitCommand(ctx, ['worktree', 'add', '-b', branch, path])
    logger.info('orchestrator', 'worktree created with new branch', { path, branch })
    return { success: true, path, branch, ...(baseRef ? { baseRef } : {}), ...(baseBranch ? { baseBranch } : {}), ...(stashed ? { stashed } : {}) }
  } catch (firstErr: unknown) {
    if (!isBranchAlreadyExistsError(firstErr)) {
      logger.warn('orchestrator', 'git worktree add failed', { feature, error: errorMessage(firstErr) })
      return { success: false, path, error: errorMessage(firstErr), stashed }
    }

    logger.debug('orchestrator', 'branch already exists, trying worktree add with existing branch', { path, branch })
    try {
      runGitCommand(ctx, ['worktree', 'add', path, branch])
      logger.info('orchestrator', 'worktree created with existing branch', { path, branch })
      return { success: true, path, branch, ...(baseRef ? { baseRef } : {}), ...(baseBranch ? { baseBranch } : {}), ...(stashed ? { stashed } : {}) }
    } catch (secondErr: unknown) {
      logger.warn('orchestrator', 'git worktree add with existing branch failed', { feature, error: errorMessage(secondErr) })
      return { success: false, path, branch, error: errorMessage(secondErr), stashed }
    }
  } finally {
    // Always restore stash regardless of success or failure
    if (stashed) autoStashPop(ctx)
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

/**
 * Sync changes workspace files from the main repo to the worktree.
 *
 * When a worktree is created from HEAD, it only contains committed files.
 * The docs/changes/ workspace (design, plan, behavior, constraints) and
 * supporting state files (.openflow/change-units.json, .sisyphus/plans/)
 * may be uncommitted in the main repo and thus missing from the worktree.
 *
 * This function copies those files so the build agent and QG can find them.
 */
export async function syncChangesToWorktree(
  ctx: OpenFlowContext,
  feature: string,
  worktreePath: string,
): Promise<{ synced: string[]; errors: string[] }> {
  const synced: string[] = []
  const errors: string[] = []

  // 1. Resolve and copy docs/changes/{changeDir}/
  try {
    const changeDir = await resolveChangeUnitDir(ctx.directory, feature)
    const sourceChangeDir = join(ctx.directory, 'docs', 'changes', changeDir)
    const targetChangeDir = join(worktreePath, 'docs', 'changes', changeDir)

    if (existsSync(sourceChangeDir)) {
      await fs.mkdir(join(targetChangeDir, '..'), { recursive: true })
      await copyDirRecursive(sourceChangeDir, targetChangeDir)
      synced.push(`docs/changes/${changeDir}/`)
      logger.info('orchestrator', 'synced changes workspace to worktree', { feature, changeDir, worktreePath })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`docs/changes sync failed: ${msg}`)
    logger.warn('orchestrator', 'failed to sync changes workspace to worktree', { feature, error: msg })
  }

  // 2. Copy .openflow/change-units.json (needed for resolveChangeUnitDir in worktree)
  try {
    const sourceIndex = join(ctx.directory, '.openflow', 'change-units.json')
    const targetIndex = join(worktreePath, '.openflow', 'change-units.json')
    if (existsSync(sourceIndex)) {
      await fs.mkdir(join(targetIndex, '..'), { recursive: true })
      await fs.copyFile(sourceIndex, targetIndex)
      synced.push('.openflow/change-units.json')
    }
  } catch {
    // Non-critical — change unit resolution has fallback logic
  }

  // 3. Copy .sisyphus/plans/ if it exists (plan state tracking)
  try {
    const sourcePlans = join(ctx.directory, '.sisyphus', 'plans')
    const targetPlans = join(worktreePath, '.sisyphus', 'plans')
    if (existsSync(sourcePlans)) {
      await copyDirRecursive(sourcePlans, targetPlans)
      synced.push('.sisyphus/plans/')
    }
  } catch {
    // Non-critical
  }

  // 4. Copy .openflow/acceptance.local.md if it exists (acceptance state)
  try {
    const sourceAcceptance = join(ctx.directory, '.openflow', 'acceptance.local.md')
    const targetAcceptance = join(worktreePath, '.openflow', 'acceptance.local.md')
    if (existsSync(sourceAcceptance)) {
      await fs.mkdir(join(targetAcceptance, '..'), { recursive: true })
      await fs.copyFile(sourceAcceptance, targetAcceptance)
      synced.push('.openflow/acceptance.local.md')
    }
  } catch {
    // Non-critical — QG will create a fresh state if missing
  }

  return { synced, errors }
}

/**
 * Recursively copy a directory. Uses fs.cp when available (Node 16.7+),
 * falls back to manual recursive copy for older runtimes.
 */
async function copyDirRecursive(source: string, target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true })
  // fs.cp with recursive:true is available in Node 16.7+
  await fs.cp(source, target, { recursive: true })
}
