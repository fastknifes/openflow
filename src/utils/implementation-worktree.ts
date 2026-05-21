import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { OpenFlowContext } from '../types.js'

export interface WorktreeResult {
  success: boolean
  path: string
  branch?: string
  error?: string
}

export function resolveWorktreePath(ctx: OpenFlowContext, feature: string): string {
  return join(ctx.directory, ctx.config.paths.worktree_dir, feature)
}

export async function createWorktree(ctx: OpenFlowContext, feature: string): Promise<WorktreeResult> {
  const path = resolveWorktreePath(ctx, feature)
  const branch = `openflow/implement-${feature}`

  try {
    runGitCommand(ctx, ['worktree', 'add', '-b', branch, path])
    return { success: true, path, branch }
  } catch (firstErr: unknown) {
    if (!isBranchAlreadyExistsError(firstErr)) {
      return { success: false, path, error: errorMessage(firstErr) }
    }

    try {
      runGitCommand(ctx, ['worktree', 'add', path, branch])
      return { success: true, path, branch }
    } catch (secondErr: unknown) {
      return { success: false, path, branch, error: errorMessage(secondErr) }
    }
  }
}

export async function removeWorktree(ctx: OpenFlowContext, feature: string): Promise<WorktreeResult> {
  const path = resolveWorktreePath(ctx, feature)
  const branch = `openflow/implement-${feature}`

  try {
    runGitCommand(ctx, ['worktree', 'remove', '--force', path])
    return { success: true, path, branch }
  } catch (firstErr: unknown) {
    try {
      runGitCommand(ctx, ['worktree', 'remove', path])
      return { success: true, path, branch }
    } catch (secondErr: unknown) {
      try {
        rmSync(path, { recursive: true, force: true })
        return { success: true, path, branch }
      } catch (cleanupErr: unknown) {
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

  if (!existsSync(path)) {
    return { exists: false, path }
  }

  try {
    const list = execSync('git worktree list', {
      cwd: ctx.directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { exists: worktreeListIncludesPath(list, path), path }
  } catch {
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
