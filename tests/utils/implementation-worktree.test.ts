import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { join } from 'node:path'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import {
  autoCommitDocs,
  createWorktree,
  removeWorktree,
  resolveWorktreePath,
  verifyWorktree,
} from '../../src/utils/implementation-worktree.js'

const execSyncMock = mock<(command: string, options?: unknown) => string>(() => '')
const execFileSyncMock = mock<(cmd: string, args: string[], options?: unknown) => string>(() => '')
const existsSyncMock = mock<(path: string) => boolean>(() => false)
const rmSyncMock = mock<(path: string, options?: unknown) => void>(() => undefined)

mock.module('node:child_process', () => ({ execSync: execSyncMock, execFileSync: execFileSyncMock }))
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
    execFileSyncMock.mockReset()
    existsSyncMock.mockReset()
    rmSyncMock.mockReset()
    execSyncMock.mockImplementation(() => '')
    execFileSyncMock.mockImplementation(() => '')
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
    execSyncMock
      .mockImplementationOnce(() => 'abcdef')
      .mockImplementationOnce(() => {
        throw gitError("fatal: a branch named 'openflow/implement-workflow' already exists")
      })
      .mockImplementationOnce(() => '')

    const result = await createWorktree(ctx, 'workflow')

    expect(result.success).toBe(true)
    expect(execSyncMock).toHaveBeenLastCalledWith(
      `git "worktree" "add" "${path}" "openflow/implement-workflow"`,
      expect.objectContaining({ cwd: '/repo' }),
    )
  })

  test('createWorktree returns failure details for git errors', async () => {
    execSyncMock
      .mockImplementationOnce(() => 'abcdef')
      .mockImplementationOnce(() => {
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

  test('createWorktree reuses existing worktree only when branch and cleanliness are valid', async () => {
    const ctx = createContext('/repo')
    const path = join('/repo', '.sisyphus/worktree', 'workflow')
    existsSyncMock.mockImplementationOnce(() => true)
    execSyncMock
      .mockImplementationOnce(() => 'abcdef')
      .mockImplementationOnce(() => `${path}  abcdef [openflow/implement-workflow]\n`)
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') return 'openflow/implement-workflow\n'
      if (args.join(' ') === 'status --porcelain') return ''
      return ''
    })

    const result = await createWorktree(ctx, 'workflow')

    expect(result.success).toBe(true)
    expect(result.path).toBe(path)
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'git',
      ['merge-base', '--is-ancestor', 'abcdef', 'HEAD'],
      expect.objectContaining({ cwd: path }),
    )
  })

  test('createWorktree rejects existing worktree on wrong branch', async () => {
    const ctx = createContext('/repo')
    const path = join('/repo', '.sisyphus/worktree', 'workflow')
    existsSyncMock.mockImplementationOnce(() => true)
    execSyncMock
      .mockImplementationOnce(() => 'abcdef')
      .mockImplementationOnce(() => `${path}  abcdef [other-branch]\n`)
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') return 'other-branch\n'
      return ''
    })

    const result = await createWorktree(ctx, 'workflow')

    expect(result.success).toBe(false)
    expect(result.error).toContain('expected openflow/implement-workflow')
  })

  test('createWorktree rejects dirty existing worktree', async () => {
    const ctx = createContext('/repo')
    const path = join('/repo', '.sisyphus/worktree', 'workflow')
    existsSyncMock.mockImplementationOnce(() => true)
    execSyncMock
      .mockImplementationOnce(() => 'abcdef')
      .mockImplementationOnce(() => `${path}  abcdef [openflow/implement-workflow]\n`)
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') return 'openflow/implement-workflow\n'
      if (args.join(' ') === 'status --porcelain') return ' M docs/changes/workflow/plan.md\n'
      return ''
    })

    const result = await createWorktree(ctx, 'workflow')

    expect(result.success).toBe(false)
    expect(result.error).toContain('uncommitted changes')
  })

  describe('autoCommitDocs', () => {
    test('returns empty result when no dirty doc paths', () => {
      const ctx = createContext('/repo')
      // Step 1: git diff --cached returns empty (no pre-staged)
      // Step 2: git status --porcelain returns empty (no dirty)
      execFileSyncMock.mockImplementation(() => '')
      const result = autoCommitDocs(ctx, 'my-feature')

      expect(result).toEqual({ committed: false, dirtyPaths: [] })
    })

    test('commits dirty feature docs', () => {
      const ctx = createContext('/repo')
      let callIndex = 0
      execFileSyncMock.mockImplementation(() => {
        callIndex++
        // Call 1: git diff --cached → empty (no pre-staged)
        if (callIndex === 1) return ''
        // Call 2: git status --porcelain → dirty files
        if (callIndex === 2) return '?? docs/changes/my-feature/plan.md\n?? .sisyphus/plans/my-feature.md\n'
        // Call 3: git add → ok
        if (callIndex === 3) return ''
        // Call 4: git diff --cached --name-only → shows staged
        if (callIndex === 4) return 'docs/changes/my-feature/plan.md\n.sisyphus/plans/my-feature.md\n'
        // Call 5: git diff --cached --name-only (whole index) → same staged set
        if (callIndex === 5) return 'docs/changes/my-feature/plan.md\n.sisyphus/plans/my-feature.md\n'
        // Call 6: git commit → ok
        return ''
      })

      const result = autoCommitDocs(ctx, 'my-feature')

      expect(result.committed).toBe(true)
      expect(result.dirtyPaths).toEqual(['docs/changes/my-feature/plan.md', '.sisyphus/plans/my-feature.md'])
      expect(execFileSyncMock).toHaveBeenCalledWith(
        'git',
        ['add', '-A', '--', 'docs/changes/my-feature/plan.md', '.sisyphus/plans/my-feature.md'],
        expect.objectContaining({ cwd: '/repo' }),
      )
      // Verify commit was called with correct message
      expect(execFileSyncMock).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['commit', '-m', expect.stringContaining('auto-commit docs for my-feature')]),
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    test('skips commit when pre-existing staged changes detected', () => {
      const ctx = createContext('/repo')
      // Step 1: git diff --cached returns pre-staged files
      execFileSyncMock.mockImplementation(() => 'docs/changes/my-feature/design.md\n')

      const result = autoCommitDocs(ctx, 'my-feature')

      expect(result.committed).toBe(false)
      expect(result.warning).toContain('Pre-existing staged changes')
    })

    test('returns warning when git add fails', () => {
      const ctx = createContext('/repo')
      let callIndex = 0
      execFileSyncMock.mockImplementation(() => {
        callIndex++
        if (callIndex === 1) return '' // diff --cached empty
        if (callIndex === 2) return '?? docs/changes/my-feature/plan.md\n' // status dirty
        if (callIndex === 3) throw gitError('fatal: not a git repository') // git add fails
        return ''
      })

      const result = autoCommitDocs(ctx, 'my-feature')

      expect(result.committed).toBe(false)
      expect(result.warning).toContain('stage failed')
      expect(result.dirtyPaths).toEqual(['docs/changes/my-feature/plan.md'])
      expect(execFileSyncMock).toHaveBeenCalledWith(
        'git',
        ['restore', '--staged', '--', 'docs/changes/my-feature/plan.md'],
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    test('returns warning when git commit fails', () => {
      const ctx = createContext('/repo')
      let callIndex = 0
      execFileSyncMock.mockImplementation(() => {
        callIndex++
        if (callIndex === 1) return '' // diff --cached empty
        if (callIndex === 2) return '?? docs/changes/my-feature/plan.md\n' // status dirty
        if (callIndex === 3) return '' // git add ok
        if (callIndex === 4) return 'docs/changes/my-feature/plan.md\n' // staged diff ok
        if (callIndex === 5) return 'docs/changes/my-feature/plan.md\n' // whole index check ok
        if (callIndex === 6) throw gitError('commit failed: no user configured') // commit fails
        return ''
      })

      const result = autoCommitDocs(ctx, 'my-feature')

      expect(result.committed).toBe(false)
      expect(result.warning).toContain('commit failed')
      expect(result.dirtyPaths).toEqual(['docs/changes/my-feature/plan.md'])
      expect(execFileSyncMock).toHaveBeenCalledWith(
        'git',
        ['restore', '--staged', '--', 'docs/changes/my-feature/plan.md'],
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    test('skips commit when staged diff is empty after add', () => {
      const ctx = createContext('/repo')
      let callIndex = 0
      execFileSyncMock.mockImplementation(() => {
        callIndex++
        if (callIndex === 1) return '' // diff --cached empty
        if (callIndex === 2) return '?? docs/changes/my-feature/plan.md\n' // status dirty
        if (callIndex === 3) return '' // git add ok
        if (callIndex === 4) return '' // staged diff empty (race condition)
        return ''
      })

      const result = autoCommitDocs(ctx, 'my-feature')

      expect(result.committed).toBe(false)
      expect(result.dirtyPaths).toEqual(['docs/changes/my-feature/plan.md'])
      expect(execFileSyncMock).toHaveBeenCalledWith(
        'git',
        ['restore', '--staged', '--', 'docs/changes/my-feature/plan.md'],
        expect.objectContaining({ cwd: '/repo' }),
      )
    })

    test('uses feature-scoped paths (not global doc directories)', () => {
      const ctx = createContext('/repo')
      let statusCall: string[] | undefined
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === 'status') {
          statusCall = args
        }
        return ''
      })

      autoCommitDocs(ctx, 'my-feature')

      // Should NOT contain docs/current/* or docs/changes (bare)
      // Should contain feature-scoped paths
      expect(statusCall).toBeDefined()
      const pathArgs = statusCall!.slice(statusCall!.indexOf('--') + 1)
      expect(pathArgs.some(p => p.includes('my-feature'))).toBe(true)
      expect(pathArgs).toContain(':(glob)docs/changes/????-??-??-my-feature/**')
      expect(pathArgs).not.toContain('docs/changes/*-my-feature')
      // Should NOT have bare docs/current paths
      expect(pathArgs.some(p => p === 'docs/current/requirements')).toBe(false)
      expect(pathArgs.some(p => p === 'docs/current/design')).toBe(false)
    })

    test('uses strict dated pathspec to avoid suffix collisions', () => {
      const ctx = createContext('/repo')
      let statusCall: string[] | undefined
      execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
        if (args[0] === 'status') {
          statusCall = args
        }
        return ''
      })

      autoCommitDocs(ctx, 'api')

      expect(statusCall).toBeDefined()
      const pathArgs = statusCall!.slice(statusCall!.indexOf('--') + 1)
      expect(pathArgs).toContain('docs/changes/api')
      expect(pathArgs).toContain(':(glob)docs/changes/????-??-??-api/**')
      expect(pathArgs).not.toContain('docs/changes/*-api')
    })
  })
})
