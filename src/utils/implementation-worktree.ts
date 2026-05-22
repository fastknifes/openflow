import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { logger } from '../utils/logger.js'

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

export async function createWorktree(ctx: OpenFlowContext, feature: string): Promise<WorktreeResult> {
  const path = resolveWorktreePath(ctx, feature)
  const branch = `openflow/implement-${feature}`
  const baseRef = getCurrentBaseRef(ctx)
  logger.debug('orchestrator', 'createWorktree started', { feature, path, branch, baseRef })

  // Check for existing valid worktree — reuse if resumable
  const existing = await verifyWorktree(ctx, feature)
  if (existing.exists) {
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
