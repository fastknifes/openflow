import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleImplement } from '../../src/commands/implement.js'
import { implementationRunStore } from '../../src/utils/implementation-run.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

async function cleanupDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  } catch {
    // Windows can keep git/worktree handles briefly after child git processes exit.
  }
}

function uniqueTestDir(name: string): string {
  return join(process.cwd(), `.tmp-implement-worktree-dirty-${name}-${randomUUID()}`)
}

function createContext(overrides?: Partial<OpenFlowContext>): OpenFlowContext {
  return {
    directory: process.cwd(),
    worktree: process.cwd(),
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
    ...overrides,
  }
}

function createToolContext(directory: string, sessionID: string, messageID = 'test-msg') {
  return {
    sessionID,
    messageID,
    agent: 'test-agent',
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => {},
    ask: (() => ({}) as unknown) as never,
  }
}

function initGitRepo(directory: string): void {
  execFileSync('git', ['init'], { cwd: directory, stdio: 'ignore' })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test.com', 'commit', '--allow-empty', '-m', 'base'], { cwd: directory, stdio: 'ignore' })
}

async function initGitRepoWithDirtyFile(directory: string): Promise<void> {
  initGitRepo(directory)
  await writeFile(join(directory, 'dirty-file.txt'), 'dirty content', 'utf-8')
}

async function readRunForFeature(ctx: OpenFlowContext, feature: string) {
  const runs = await implementationRunStore.listRuns(ctx, { feature })
  const run = runs[0]
  if (!run) throw new Error(`No implementation run found for ${feature}`)
  return run
}

describe.serial('handleImplement dirty-main worktree policy', () => {
  test('--no-worktree with clean main succeeds in session mode', async () => {
    const testDir = uniqueTestDir('session-clean')
    const feature = 'session-clean-feature'
    try {
      await mkdir(testDir, { recursive: true })
      initGitRepo(testDir)
      const ctx = createContext({ directory: testDir, worktree: testDir })

      const result = await handleImplement(ctx, feature, false, createToolContext(testDir, 'test-session-clean'))
      const run = await readRunForFeature(ctx, feature)

      expect(result).toContain('Implementation Run Created')
      expect(result).toContain('- **Container Mode**: session')
      expect(result).not.toContain('Dirty Main Worktree')
      expect(run.containerMode).toBe('session')
      expect(run.mainWorktreeDirty).toBe(false)
    } finally {
      await cleanupDir(testDir)
    }
  })

  test('--no-worktree with dirty main is blocked', async () => {
    const testDir = uniqueTestDir('session-dirty')
    const feature = 'session-dirty-feature'
    try {
      await mkdir(testDir, { recursive: true })
      await initGitRepoWithDirtyFile(testDir)
      const ctx = createContext({ directory: testDir, worktree: testDir })

      const result = await handleImplement(ctx, feature, false, createToolContext(testDir, 'test-session-dirty'))

      expect(result).toContain('Dirty Main Worktree')
      expect(result).toContain('- **Mode**: session (--no-worktree)')
      expect(result).toContain('Commit or stash your changes first')
      expect(await implementationRunStore.listRuns(ctx, { feature })).toHaveLength(0)
    } finally {
      await cleanupDir(testDir)
    }
  })

  test('default worktree mode with dirty main succeeds and records warning observation', async () => {
    const testDir = uniqueTestDir('worktree-dirty')
    const feature = 'worktree-dirty-feature'
    try {
      await mkdir(testDir, { recursive: true })
      await initGitRepoWithDirtyFile(testDir)
      const ctx = createContext({ directory: testDir, worktree: testDir })

      const result = await handleImplement(ctx, feature, undefined, createToolContext(testDir, 'test-worktree-dirty'))
      const run = await readRunForFeature(ctx, feature)
      const observations = await Bun.file(join(ctx.directory, run.observationsPath)).text()

      expect(result).toContain('Implementation Run Created')
      expect(result).toContain('- **Container Mode**: worktree')
      expect(result).not.toContain('Dirty Main Worktree')
      expect(run.containerMode).toBe('worktree')
      expect(run.mainWorktreeDirty).toBe(true)
      expect(observations).toContain(`WARNING: Main worktree is dirty while using isolated worktree for ${feature}`)
    } finally {
      await cleanupDir(testDir)
    }
  })

  test('default worktree mode with clean main succeeds normally', async () => {
    const testDir = uniqueTestDir('worktree-clean')
    const feature = 'worktree-clean-feature'
    try {
      await mkdir(testDir, { recursive: true })
      initGitRepo(testDir)
      const ctx = createContext({ directory: testDir, worktree: testDir })

      const result = await handleImplement(ctx, feature, undefined, createToolContext(testDir, 'test-worktree-clean'))
      const run = await readRunForFeature(ctx, feature)
      const observations = await Bun.file(join(ctx.directory, run.observationsPath)).text()

      expect(result).toContain('Implementation Run Created')
      expect(result).toContain('- **Container Mode**: worktree')
      expect(result).not.toContain('Dirty Main Worktree')
      expect(run.containerMode).toBe('worktree')
      expect(run.mainWorktreeDirty).toBe(false)
      expect(observations).not.toContain('WARNING: Main worktree is dirty')
    } finally {
      await cleanupDir(testDir)
    }
  })
})
