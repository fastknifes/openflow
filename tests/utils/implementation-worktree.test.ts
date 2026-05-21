import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { join } from 'node:path'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import {
  createWorktree,
  removeWorktree,
  resolveWorktreePath,
  verifyWorktree,
} from '../../src/utils/implementation-worktree.js'

const execSyncMock = mock<(command: string, options?: unknown) => string>(() => '')
const existsSyncMock = mock<(path: string) => boolean>(() => false)
const rmSyncMock = mock<(path: string, options?: unknown) => void>(() => undefined)

mock.module('node:child_process', () => ({ execSync: execSyncMock }))
mock.module('node:fs', () => ({ existsSync: existsSyncMock, rmSync: rmSyncMock }))

function createContext(directory: string, worktreeDir?: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    enhancedPlans: new Set<string>(),
    config: {
      ...defaultConfig,
      paths: { ...defaultConfig.paths, worktree_dir: worktreeDir ?? defaultConfig.paths.worktree_dir },
    },
  }
}

function gitError(message: string): Error & { stderr: string } {
  return Object.assign(new Error(message), { stderr: message })
}

describe('implementation-worktree', () => {
  beforeEach(() => {
    execSyncMock.mockReset()
    existsSyncMock.mockReset()
    rmSyncMock.mockReset()
    execSyncMock.mockImplementation(() => '')
    existsSyncMock.mockImplementation(() => false)
    rmSyncMock.mockImplementation(() => undefined)
  })

  test('resolveWorktreePath uses configured worktree directory relative to ctx.directory', () => {
    expect(resolveWorktreePath(createContext('/repo', 'custom/worktrees'), 'workflow')).toBe(
      join('/repo', 'custom/worktrees', 'workflow'),
    )
  })

  test('createWorktree runs git worktree add with implementation branch from repo root', async () => {
    const ctx = createContext('/repo')
    const path = join('/repo', '.sisyphus/worktree', 'workflow')
    const result = await createWorktree(ctx, 'workflow')

    expect(result).toEqual({ success: true, path, branch: 'openflow/implement-workflow' })
    expect(execSyncMock).toHaveBeenCalledWith(
      `git "worktree" "add" "-b" "openflow/implement-workflow" "${path}"`,
      expect.objectContaining({ cwd: '/repo' }),
    )
  })

  test('createWorktree reuses existing implementation branch when branch creation fails', async () => {
    const ctx = createContext('/repo')
    const path = join('/repo', '.sisyphus/worktree', 'workflow')
    execSyncMock.mockImplementationOnce(() => {
      throw gitError("fatal: a branch named 'openflow/implement-workflow' already exists")
    })

    const result = await createWorktree(ctx, 'workflow')

    expect(result.success).toBe(true)
    expect(execSyncMock).toHaveBeenLastCalledWith(
      `git "worktree" "add" "${path}" "openflow/implement-workflow"`,
      expect.objectContaining({ cwd: '/repo' }),
    )
  })

  test('createWorktree returns failure details for git errors', async () => {
    execSyncMock.mockImplementationOnce(() => {
      throw gitError('fatal: not a git repository')
    })
    const result = await createWorktree(createContext('/repo'), 'workflow')
    expect(result.success).toBe(false)
    expect(result.error).toBe('fatal: not a git repository')
  })

  test('removeWorktree runs forced remove and falls back to cleanup', async () => {
    const ctx = createContext('/repo')
    const path = join('/repo', '.sisyphus/worktree', 'workflow')

    expect((await removeWorktree(ctx, 'workflow')).success).toBe(true)
    expect(execSyncMock).toHaveBeenLastCalledWith(
      `git "worktree" "remove" "--force" "${path}"`,
      expect.objectContaining({ cwd: '/repo' }),
    )

    execSyncMock.mockReset()
    execSyncMock
      .mockImplementationOnce(() => {
        throw gitError('forced remove failed')
      })
      .mockImplementationOnce(() => {
        throw gitError('plain remove failed')
      })
    expect((await removeWorktree(ctx, 'workflow')).success).toBe(true)
    expect(rmSyncMock).toHaveBeenCalledWith(path, { recursive: true, force: true })
  })

  test('verifyWorktree checks path existence and git worktree list', async () => {
    const ctx = createContext('/repo')
    const path = join('/repo', '.sisyphus/worktree', 'workflow')

    expect(await verifyWorktree(ctx, 'workflow')).toEqual({ exists: false, path })
    expect(execSyncMock).not.toHaveBeenCalled()

    existsSyncMock.mockImplementationOnce(() => true)
    execSyncMock.mockImplementationOnce(() => `${path}  abcdef [openflow/implement-workflow]\n`)
    expect(await verifyWorktree(ctx, 'workflow')).toEqual({ exists: true, path })
    expect(execSyncMock).toHaveBeenCalledWith('git worktree list', expect.objectContaining({ cwd: '/repo' }))
  })
})
