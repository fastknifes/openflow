import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleArchive } from '../../src/commands/archive.js'
import { handleImplement } from '../../src/commands/implement.js'
import { handleQualityGate } from '../../src/commands/quality-gate.js'
import { createImplementationObserver } from '../../src/hooks/implementation-observer.js'
import { saveAcceptanceState } from '../../src/utils/acceptance-state.js'
import { implementationRunStore } from '../../src/utils/implementation-run.js'
import { removeWorktree } from '../../src/utils/implementation-worktree.js'
import { defaultConfig, type ImplementationRun, type OpenFlowContext, VerifyReadinessStatus } from '../../src/types.js'

async function cleanupDir(testDir: string): Promise<void> {
  try {
    await rm(testDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  } catch {
    // Windows can keep git/worktree handles briefly after child git processes exit.
    // Cleanup failure must not turn a passing integration assertion into a flaky failure.
  }
}

function uniqueTestDir(name: string): string {
  return join(process.cwd(), `.tmp-implement-${name}-${randomUUID()}`)
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

async function readRunForFeature(ctx: OpenFlowContext, feature: string): Promise<ImplementationRun> {
  const runs = await implementationRunStore.listRuns(ctx, { feature })
  const run = runs[0]
  if (!run) throw new Error(`No implementation run found for ${feature}`)
  return run
}

async function readRunEvents(ctx: OpenFlowContext, run: ImplementationRun): Promise<Array<Record<string, unknown>>> {
  const events = await readFile(join(ctx.directory, run.eventsPath), 'utf-8')
  return events.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
}

function initGitRepo(directory: string): void {
  execFileSync('git', ['init'], { cwd: directory, stdio: 'ignore' })
  execFileSync('git', ['-c', 'user.name=OpenFlow Test', '-c', 'user.email=openflow@example.test', 'commit', '--allow-empty', '-m', 'base'], { cwd: directory, stdio: 'ignore' })
}

async function setupArchiveFixture(testDir: string, feature: string): Promise<OpenFlowContext> {
  await mkdir(join(testDir, 'docs', 'changes', feature), { recursive: true })
  await writeFile(join(testDir, 'docs', 'changes', feature, 'design.md'), '# Design\n\nImplementation archive fixture', 'utf-8')
  await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
  await writeFile(join(testDir, '.sisyphus', 'plans', `${feature}.md`), '# Plan', 'utf-8')
  await saveAcceptanceState(testDir, {
    feature,
    phase: 'acceptance',
    phaseStartedAt: '2026-05-22T00:00:00.000Z',
    pendingDocUpdates: [],
    readiness: VerifyReadinessStatus.Ready,
  })
  return createContext({ directory: testDir, worktree: testDir })
}

describe.serial('handleImplement', () => {
  describe('missing feature handling', () => {
    test('returns error when no feature provided and no active feature found', async () => {
      const testDir = uniqueTestDir('no-feature')
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir })
        const result = await handleImplement(ctx, undefined, undefined, createToolContext(testDir, 'test-session'))
        expect(result).toContain('No feature specified')
        expect(result).toContain('Error')
      } finally {
        await cleanupDir(testDir)
      }
    })

    test('returns error when feature is only whitespace', async () => {
      const testDir = uniqueTestDir('whitespace')
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir })
        const result = await handleImplement(ctx, '   ', undefined, createToolContext(testDir, 'test-session'))
        expect(result).toContain('No feature specified')
      } finally {
        await cleanupDir(testDir)
      }
    })
  })

  describe('command token stripping', () => {
    test('strips /openflow-implement prefix from feature name', async () => {
      const testDir = uniqueTestDir('strip')
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir })

        const result = await handleImplement(ctx, '/openflow-implement my-feature', false, createToolContext(testDir, 'test-session-strip'))

        expect(result).not.toContain('/openflow-implement my-feature')
        expect((await readRunForFeature(ctx, 'my-feature')).feature).toBe('my-feature')
      } finally {
        await cleanupDir(testDir)
      }
    })
  })

  describe('duplicate run prevention', () => {
    test('returns duplicate error when active run exists', async () => {
      const testDir = uniqueTestDir('dup')
      const runsDir = join(testDir, '.sisyphus', 'openflow', 'runs', 'dup-feature')
      try {
        await mkdir(runsDir, { recursive: true })
        const activeRun = {
          runID: 'run_existing-001',
          feature: 'dup-feature',
          sessionID: 'test-session-dup',
          messageID: 'msg-old',
          agent: 'test-agent',
          directory: testDir,
          backend: 'opencode',
          backendCommand: '',
          status: 'running',
          containerMode: 'session',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          eventsPath: '.sisyphus/openflow/events/run_existing-001.jsonl',
          observationsPath: '.sisyphus/openflow/observations/run_existing-001.jsonl',
        }
        await writeFile(join(runsDir, 'run_existing-001.json'), JSON.stringify(activeRun, null, 2), 'utf8')

        const ctx = createContext({ directory: testDir })
        const result = await handleImplement(ctx, 'dup-feature', undefined, createToolContext(testDir, 'test-session-dup'))

        expect(result).toContain('Duplicate Blocked')
        expect(result).toContain('run_existing-001')
      } finally {
        await cleanupDir(testDir)
      }
    })
  })

  describe('successful run creation', () => {
    test('creates run and returns metadata', async () => {
      const testDir = uniqueTestDir('create')
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir })

        const result = await handleImplement(ctx, 'new-feature', false, createToolContext(testDir, 'test-session-create'))

        expect(result).toContain('Implementation Run Created')
        expect(result).toContain('new-feature')
        expect(result).toContain('run_')
        expect(result).toContain('session')
        expect((await readRunForFeature(ctx, 'new-feature')).runID).toMatch(/^run_/)
      } finally {
        await cleanupDir(testDir)
      }
    })
  })

  describe('backend handoff branches', () => {
    test('hands off to omo when omo environment is detected', async () => {
      const testDir = uniqueTestDir('omo-branch')
      const feature = 'omo-feature'
      const promptCalls: unknown[] = []
      try {
        await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
        const ctx = createContext({
          directory: testDir,
          worktree: testDir,
          client: { session: { prompt: async (input: unknown) => { promptCalls.push(input); return {} } } },
        })

        const result = await handleImplement(ctx, feature, false, createToolContext(testDir, 'test-session-omo'))
        const run = await readRunForFeature(ctx, feature)

        expect(result).toContain('- **Backend**: omo')
        expect(promptCalls).toEqual([{ path: { id: 'test-session-omo' }, body: { parts: [{ type: 'text', text: `/start-work ${feature}` }] } }])
        expect(run.backend).toBe('omo')
        expect(run.backendCommand).toBe(`/start-work ${feature}`)
        expect(run.status).toBe('running')
      } finally {
        await cleanupDir(testDir)
      }
    })

    test('hands off to opencode when no omo environment is detected', async () => {
      const testDir = uniqueTestDir('opencode-branch')
      const feature = 'opencode-feature'
      const promptCalls: unknown[] = []
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({
          directory: testDir,
          worktree: testDir,
          client: { session: { prompt: async (input: unknown) => { promptCalls.push(input); return {} } } },
        })

        const result = await handleImplement(ctx, feature, false, createToolContext(testDir, 'test-session-opencode'))
        const run = await readRunForFeature(ctx, feature)

        expect(result).toContain('- **Backend**: opencode')
        expect(promptCalls).toEqual([])
        expect(run.backend).toBe('opencode')
        expect(run.backendCommand).toBe('opencode build')
        expect(run.status).toBe('running')
      } finally {
        await cleanupDir(testDir)
      }
    })
  })

  describe('worktree lifecycle', () => {
    test('creates run in a git worktree and removes the worktree during cleanup', async () => {
      const testDir = uniqueTestDir('worktree-lifecycle')
      const feature = `worktree-feature-${randomUUID()}`
      try {
        await mkdir(testDir, { recursive: true })
        initGitRepo(testDir)
        const ctx = createContext({ directory: testDir, worktree: testDir })

        const result = await handleImplement(ctx, feature, true, createToolContext(testDir, 'test-session-worktree'))
        const run = await readRunForFeature(ctx, feature)
        const expectedWorktree = join(testDir, defaultConfig.paths.worktree_dir, feature)

        expect(result).toContain('- **Container Mode**: worktree')
        expect(result).toContain(expectedWorktree)
        expect(run.containerMode).toBe('worktree')
        expect(run.directory).toBe(expectedWorktree)
        expect(run.worktree).toBe(expectedWorktree)
        await expect(access(expectedWorktree)).resolves.toBeNull()

        const cleanup = await removeWorktree(ctx, feature)
        expect(cleanup.path).toBe(expectedWorktree)
        if (cleanup.success) {
          await expect(access(expectedWorktree)).rejects.toBeDefined()
        } else {
          expect(cleanup.error).toBeDefined()
        }
      } finally {
        await cleanupDir(testDir)
      }
    })
  })

  describe('observer integration', () => {
    test('calls observer.setActiveRun with the created run', async () => {
      const testDir = uniqueTestDir('observer')
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir })
        let capturedRun: ImplementationRun | undefined
        const observer = { setActiveRun(run: ImplementationRun) { capturedRun = run } }

        const result = await handleImplement(ctx, 'observer-feature', false, createToolContext(testDir, 'test-session-obs'), observer)

        expect(result).toContain('Implementation Run Created')
        expect(capturedRun).toBeDefined()
        expect(capturedRun!.feature).toBe('observer-feature')
        expect(capturedRun!.runID).toMatch(/^run_/)
      } finally {
        await cleanupDir(testDir)
      }
    })

    test('works without observer (no crash)', async () => {
      const testDir = uniqueTestDir('no-observer')
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir })

        const result = await handleImplement(ctx, 'no-obs-feature', false, createToolContext(testDir, 'test-session-no-obs'))

        expect(result).toContain('Implementation Run Created')
      } finally {
        await cleanupDir(testDir)
      }
    })

    test('records observer events while the run is active', async () => {
      const testDir = uniqueTestDir('observer-events')
      const feature = 'observer-events-feature'
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir, worktree: testDir })
        const observer = createImplementationObserver(ctx)

        await handleImplement(ctx, feature, false, createToolContext(testDir, 'test-session-observer-events'), observer)

        // Verify handleImplement auto-refreshed the observer after backend handoff
        const activeRun = observer.getActiveRun('test-session-observer-events')
        expect(activeRun).toBeDefined()
        expect(activeRun!.backendCommand).toBe('opencode build')
        expect(activeRun!.status).toBe('running')

        const run = await readRunForFeature(ctx, feature)
        await observer.toolBeforeHook({ sessionID: 'test-session-observer-events', tool: 'opencode build', callID: 'call-1' }, {})
        await observer.toolAfterHook({ sessionID: 'test-session-observer-events', tool: 'opencode build', callID: 'call-1' }, {})

        const events = await readRunEvents(ctx, run)
        expect(events).toContainEqual(expect.objectContaining({ type: 'backend_started', tool: 'opencode build', callID: 'call-1' }))
        expect(events).toContainEqual(expect.objectContaining({ type: 'backend_completed', tool: 'opencode build', callID: 'call-1' }))
        expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('quality_gate_pending')
      } finally {
        await cleanupDir(testDir)
      }
    })
  })

  describe('quality-gate and archive integration', () => {
    test('quality gate transitions active run to ready_for_archive when verify is ready', async () => {
      const testDir = uniqueTestDir('quality-gate')
      const feature = 'quality-gate-feature'
      try {
        await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
        await mkdir(join(testDir, 'src'), { recursive: true })
        await writeFile(join(testDir, '.sisyphus', 'plans', `${feature}.md`), '# Plan', 'utf-8')
        await writeFile(join(testDir, 'src', `${feature}.ts`), 'export const implemented = true\n', 'utf-8')
        await saveAcceptanceState(testDir, {
          feature,
          phase: 'acceptance',
          phaseStartedAt: '2026-05-22T00:00:00.000Z',
          sessionID: 'test-session-quality-gate',
          pendingDocUpdates: [],
          implementationState: {
            state: 'dirty',
            updatedAt: '2026-05-22T00:00:00.000Z',
            changedFiles: [`src/${feature}.ts`],
          },
        })
        const ctx = createContext({ directory: testDir, worktree: testDir })
        await implementationRunStore.createRun(ctx, {
          feature,
          sessionID: 'test-session-quality-gate',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          backend: 'opencode',
          backendCommand: 'opencode build',
          status: 'running',
          containerMode: 'session',
          eventsPath: join('.sisyphus', 'openflow', 'events', `${feature}.jsonl`),
          observationsPath: join('.sisyphus', 'openflow', 'observations', `${feature}.jsonl`),
        })

        const output = await handleQualityGate(ctx, { feature, sessionID: 'test-session-quality-gate' }, {
          overrideVerify: async () => '### Evidence\n- checks_run:\n  - tests ✅\n- status: ready\n',
        })
        const run = await readRunForFeature(ctx, feature)
        const events = await readRunEvents(ctx, run)

        expect(output).toContain('## Quality Gate')
        expect(run.status).toBe('ready_for_archive')
        expect(events).toContainEqual(expect.objectContaining({ type: 'quality_gate_started', runID: run.runID }))
        expect(events).toContainEqual(expect.objectContaining({ type: 'quality_gate_completed', result: 'ready', runID: run.runID }))
      } finally {
        await cleanupDir(testDir)
      }
    })

    test('archive blocks when an implementation run is incomplete', async () => {
      const testDir = uniqueTestDir('archive-block')
      const feature = 'archive-block-feature'
      try {
        const ctx = await setupArchiveFixture(testDir, feature)
        await implementationRunStore.createRun(ctx, {
          feature,
          sessionID: 'test-session-archive-block',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          backend: 'opencode',
          backendCommand: 'opencode build',
          status: 'running',
          containerMode: 'session',
          eventsPath: join('.sisyphus', 'openflow', 'events', `${feature}.jsonl`),
          observationsPath: join('.sisyphus', 'openflow', 'observations', `${feature}.jsonl`),
        })

        const result = await handleArchive(ctx, feature)

        expect(result).toContain('Archive Blocked')
        expect(result).toContain('implementation run status is **running**')
        await expect(access(join(testDir, 'docs', 'archive', feature))).rejects.toBeDefined()
      } finally {
        await cleanupDir(testDir)
      }
    })
  })
})
