import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { handleImplement } from '../../src/commands/implement.js'
import { defaultConfig, type OpenFlowContext, type ImplementationRun } from '../../src/types.js'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'

// Mock implementation-run store
const mockCreateRun = mock(async (_ctx: OpenFlowContext, run: Record<string, unknown>) => ({
  ...run,
  runID: 'run_test-uuid-001',
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}))

const mockGetActiveRun = mock(async () => null)
const mockUpdateRun = mock(async (_ctx: OpenFlowContext, _runID: string, updates: Record<string, unknown>) => ({
  runID: 'run_test-uuid-001',
  ...updates,
}))

// We need to mock at the module level. Since bun:test doesn't have jest-style module mocking,
// we'll use a different approach: test with real store but temp directories.
// For isolated unit tests, we create temp fixture dirs.

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

describe('handleImplement', () => {
  describe('missing feature handling', () => {
    test('returns error when no feature provided and no active feature found', async () => {
      const testDir = join(process.cwd(), '.tmp-implement-test-no-feature')
      try {
        await mkdir(testDir, { recursive: true })
        // No plans dir — findActiveFeature returns null
        const ctx = createContext({ directory: testDir })
        const result = await handleImplement(ctx, undefined, undefined, {
          sessionID: 'test-session',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          worktree: '',
          abort: new AbortController().signal,
          metadata: () => {},
          ask: (() => ({}) as unknown) as never,
        })
        expect(result).toContain('No feature specified')
        expect(result).toContain('Error')
      } finally {
        await rm(testDir, { recursive: true, force: true })
      }
    })

    test('returns error when feature is only whitespace', async () => {
      const testDir = join(process.cwd(), '.tmp-implement-test-whitespace')
      try {
        await mkdir(testDir, { recursive: true })
        const ctx = createContext({ directory: testDir })
        const result = await handleImplement(ctx, '   ', undefined, {
          sessionID: 'test-session',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          worktree: '',
          abort: new AbortController().signal,
          metadata: () => {},
          ask: (() => ({}) as unknown) as never,
        })
        expect(result).toContain('No feature specified')
      } finally {
        await rm(testDir, { recursive: true, force: true })
      }
    })
  })

  describe('command token stripping', () => {
    test('strips /openflow-implement prefix from feature name', async () => {
      const testDir = join(process.cwd(), '.tmp-implement-test-strip')
      const runsDir = join(testDir, '.sisyphus', 'openflow', 'runs')
      try {
        await mkdir(runsDir, { recursive: true })
        const ctx = createContext({ directory: testDir })

        // This should strip /openflow-implement and create the run
        const result = await handleImplement(ctx, '/openflow-implement my-feature', false, {
          sessionID: 'test-session-strip',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          worktree: '',
          abort: new AbortController().signal,
          metadata: () => {},
          ask: (() => ({}) as unknown) as never,
        })

        // Should either succeed (creating the run) or hit a backend handoff issue
        // but it should NOT use "/openflow-implement my-feature" as the feature name
        expect(result).not.toContain('/openflow-implement my-feature')
      } finally {
        await rm(testDir, { recursive: true, force: true })
      }
    })
  })

  describe('duplicate run prevention', () => {
    test('returns duplicate error when active run exists', async () => {
      const testDir = join(process.cwd(), '.tmp-implement-test-dup')
      const runsDir = join(testDir, '.sisyphus', 'openflow', 'runs', 'dup-feature')
      try {
        await mkdir(runsDir, { recursive: true })

        // Create a pre-existing active run file
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

        const { writeFile } = await import('node:fs/promises')
        await writeFile(join(runsDir, 'run_existing-001.json'), JSON.stringify(activeRun, null, 2), 'utf8')

        const ctx = createContext({ directory: testDir })
        const result = await handleImplement(ctx, 'dup-feature', undefined, {
          sessionID: 'test-session-dup',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          worktree: '',
          abort: new AbortController().signal,
          metadata: () => {},
          ask: (() => ({}) as unknown) as never,
        })

        expect(result).toContain('Duplicate Blocked')
        expect(result).toContain('run_existing-001')
      } finally {
        await rm(testDir, { recursive: true, force: true })
      }
    })
  })

  describe('successful run creation', () => {
    test('creates run and returns metadata', async () => {
      const testDir = join(process.cwd(), '.tmp-implement-test-create')
      const runsDir = join(testDir, '.sisyphus', 'openflow', 'runs', 'new-feature')
      try {
        await mkdir(runsDir, { recursive: true })
        const ctx = createContext({ directory: testDir })

        const result = await handleImplement(ctx, 'new-feature', false, {
          sessionID: 'test-session-create',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          worktree: '',
          abort: new AbortController().signal,
          metadata: () => {},
          ask: (() => ({}) as unknown) as never,
        })

        expect(result).toContain('Implementation Run Created')
        expect(result).toContain('new-feature')
        expect(result).toContain('run_')
        expect(result).toContain('session')

        // Verify the run file was created
        const { readdir } = await import('node:fs/promises')
        const files = await readdir(runsDir)
        expect(files.length).toBeGreaterThan(0)
        expect(files[0]).toMatch(/\.json$/)
      } finally {
        await rm(testDir, { recursive: true, force: true })
      }
    })
  })

  describe('observer integration', () => {
    test('calls observer.setActiveRun with the created run', async () => {
      const testDir = join(process.cwd(), '.tmp-implement-test-observer')
      const runsDir = join(testDir, '.sisyphus', 'openflow', 'runs', 'observer-feature')
      try {
        await mkdir(runsDir, { recursive: true })
        const ctx = createContext({ directory: testDir })

        let capturedRun: ImplementationRun | undefined
        const observer = {
          setActiveRun(run: ImplementationRun) {
            capturedRun = run
          },
        }

        const result = await handleImplement(ctx, 'observer-feature', false, {
          sessionID: 'test-session-obs',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          worktree: '',
          abort: new AbortController().signal,
          metadata: () => {},
          ask: (() => ({}) as unknown) as never,
        }, observer)

        expect(result).toContain('Implementation Run Created')
        expect(capturedRun).toBeDefined()
        expect(capturedRun!.feature).toBe('observer-feature')
        expect(capturedRun!.runID).toMatch(/^run_/)
      } finally {
        await rm(testDir, { recursive: true, force: true })
      }
    })

    test('works without observer (no crash)', async () => {
      const testDir = join(process.cwd(), '.tmp-implement-test-no-observer')
      const runsDir = join(testDir, '.sisyphus', 'openflow', 'runs', 'no-obs-feature')
      try {
        await mkdir(runsDir, { recursive: true })
        const ctx = createContext({ directory: testDir })

        const result = await handleImplement(ctx, 'no-obs-feature', false, {
          sessionID: 'test-session-no-obs',
          messageID: 'test-msg',
          agent: 'test-agent',
          directory: testDir,
          worktree: '',
          abort: new AbortController().signal,
          metadata: () => {},
          ask: (() => ({}) as unknown) as never,
          // No observer passed
        })

        expect(result).toContain('Implementation Run Created')
      } finally {
        await rm(testDir, { recursive: true, force: true })
      }
    })
  })
})
