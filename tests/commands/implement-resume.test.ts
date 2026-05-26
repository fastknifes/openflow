import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import { handleImplement } from '../../src/commands/implement.js'
import { implementationRunStore } from '../../src/utils/implementation-run.js'
import { defaultConfig, type ImplementationRunStatus, type OpenFlowContext } from '../../src/types.js'

async function cleanupDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  } catch {
    // Windows can keep git handles briefly after child git processes exit.
  }
}

function uniqueTestDir(name: string): string {
  return join(process.cwd(), `.tmp-implement-resume-${name}-${randomUUID()}`)
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

function createToolContext(directory: string, sessionID: string, messageID = 'test-msg'): ToolContext {
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
  execFileSync('git', ['-c', 'user.name=OpenFlow Test', '-c', 'user.email=openflow@example.test', 'commit', '--allow-empty', '-m', 'base'], { cwd: directory, stdio: 'ignore' })
}

async function setupRun(status: ImplementationRunStatus): Promise<{ ctx: OpenFlowContext; feature: string; sessionID: string; testDir: string; runID: string }> {
  const testDir = uniqueTestDir(status)
  const feature = `resume-${status.replaceAll('_', '-')}`
  const sessionID = `test-session-${status}`
  await mkdir(testDir, { recursive: true })
  initGitRepo(testDir)
  const ctx = createContext({ directory: testDir, worktree: testDir })
  const run = await implementationRunStore.createRun(ctx, {
    feature,
    sessionID,
    messageID: 'msg-old',
    agent: 'test-agent',
    directory: testDir,
    backend: 'opencode',
    backendCommand: 'opencode build',
    status,
    containerMode: 'session',
    eventsPath: join('.sisyphus', 'openflow', 'events', `${feature}.jsonl`),
    observationsPath: join('.sisyphus', 'openflow', 'observations', `${feature}.jsonl`),
  })

  return { ctx, feature, sessionID, testDir, runID: run.runID }
}

async function expectSingleRun(ctx: OpenFlowContext, feature: string): Promise<void> {
  const runs = await implementationRunStore.listRuns(ctx, { feature })
  expect(runs).toHaveLength(1)
}

describe.serial('handleImplement resume matrix', () => {
  test('running status resumes the existing run without creating a new run', async () => {
    const fixture = await setupRun('running')
    try {
      const result = await handleImplement(fixture.ctx, fixture.feature, false, createToolContext(fixture.testDir, fixture.sessionID))

      expect(result).toContain('Implementation Run — Resumed')
      expect(result).toContain(fixture.runID)
      expect(result).toContain('- **Status**: running')
      expect(result).toContain('Resume this run instead of creating a new one')
      await expectSingleRun(fixture.ctx, fixture.feature)
    } finally {
      await cleanupDir(fixture.testDir)
    }
  })

  test('created status resumes the existing run', async () => {
    const fixture = await setupRun('created')
    try {
      const result = await handleImplement(fixture.ctx, fixture.feature, false, createToolContext(fixture.testDir, fixture.sessionID))

      expect(result).toContain('Implementation Run — Resumed')
      expect(result).toContain('- **Status**: created')
      await expectSingleRun(fixture.ctx, fixture.feature)
    } finally {
      await cleanupDir(fixture.testDir)
    }
  })

  test('quality_gate_pending status resumes with quality-gate hint', async () => {
    const fixture = await setupRun('quality_gate_pending')
    try {
      const result = await handleImplement(fixture.ctx, fixture.feature, false, createToolContext(fixture.testDir, fixture.sessionID))

      expect(result).toContain('Implementation Run — Resumed')
      expect(result).toContain('Run `/openflow-quality-gate` to proceed')
      await expectSingleRun(fixture.ctx, fixture.feature)
    } finally {
      await cleanupDir(fixture.testDir)
    }
  })

  test('ready_for_archive status resumes with archive hint', async () => {
    const fixture = await setupRun('ready_for_archive')
    try {
      const result = await handleImplement(fixture.ctx, fixture.feature, false, createToolContext(fixture.testDir, fixture.sessionID))

      expect(result).toContain('Implementation Run — Resumed')
      expect(result).toContain('Run `/openflow-archive` to proceed')
      await expectSingleRun(fixture.ctx, fixture.feature)
    } finally {
      await cleanupDir(fixture.testDir)
    }
  })

  test('failed status returns recovery required message', async () => {
    const fixture = await setupRun('failed')
    try {
      const result = await handleImplement(fixture.ctx, fixture.feature, false, createToolContext(fixture.testDir, fixture.sessionID))

      expect(result).toContain('Implementation Run — Recovery Required')
      expect(result).toContain('- **Status**: failed')
      expect(result).toContain('previous run ended with status `failed`')
      await expectSingleRun(fixture.ctx, fixture.feature)
    } finally {
      await cleanupDir(fixture.testDir)
    }
  })

  test('cancelled status returns recovery required message', async () => {
    const fixture = await setupRun('cancelled')
    try {
      const result = await handleImplement(fixture.ctx, fixture.feature, false, createToolContext(fixture.testDir, fixture.sessionID))

      expect(result).toContain('Implementation Run — Recovery Required')
      expect(result).toContain('- **Status**: cancelled')
      expect(result).toContain('previous run ended with status `cancelled`')
      await expectSingleRun(fixture.ctx, fixture.feature)
    } finally {
      await cleanupDir(fixture.testDir)
    }
  })

  test('archived status returns already archived message', async () => {
    const fixture = await setupRun('archived')
    try {
      const result = await handleImplement(fixture.ctx, fixture.feature, false, createToolContext(fixture.testDir, fixture.sessionID))

      expect(result).toContain('Implementation Run — Already Archived')
      expect(result).toContain('- **Status**: archived')
      expect(result).toContain('begin with `/openflow-feature`')
      await expectSingleRun(fixture.ctx, fixture.feature)
    } finally {
      await cleanupDir(fixture.testDir)
    }
  })

  test('missing sessionID blocks run creation with session-required message', async () => {
    const testDir = uniqueTestDir('missing-session')
    const feature = 'missing-session-feature'
    try {
      await mkdir(testDir, { recursive: true })
      initGitRepo(testDir)
      const ctx = createContext({ directory: testDir, worktree: testDir })

      const result = await handleImplement(ctx, feature, false)

      expect(result).toContain('Implementation Run — Session Required')
      expect(result).toContain('Cannot create an implementation run without a valid session ID')
      expect(result).toContain(`/openflow-implement ${feature}`)
      expect(await implementationRunStore.listRuns(ctx, { feature })).toHaveLength(0)
    } finally {
      await cleanupDir(testDir)
    }
  })
})
