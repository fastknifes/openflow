import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import { defaultConfig, type ImplementationRun, type OpenFlowContext } from '../../src/types.js'
import { handoffToBackend } from '../../src/utils/implementation-backend.js'
import { implementationRunStore } from '../../src/utils/implementation-run.js'

const TEST_ROOT = join(process.cwd(), '.test-implementation-backend')

function createContext(directory: string, prompt?: (input: unknown) => Promise<unknown>): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {
      session: {
        prompt: prompt ?? (async () => ({})),
      },
    },
    $: {},
    enhancedPlans: new Set<string>(),
    config: {
      ...defaultConfig,
      paths: {
        ...defaultConfig.paths,
        implementation_runs: '.runs',
      },
    },
  }
}

function createToolContext(sessionID = 'session-1'): ToolContext {
  return {
    sessionID,
    messageID: 'message-1',
    agent: 'build',
    directory: '/repo',
    worktree: '/repo',
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: async () => undefined,
  }
}

async function createStoredRun(ctx: OpenFlowContext, overrides: Partial<ImplementationRun> = {}): Promise<ImplementationRun> {
  return implementationRunStore.createRun(ctx, {
    feature: 'openflow-implement-workflow',
    sessionID: 'session-1',
    messageID: 'message-1',
    agent: 'build',
    directory: ctx.directory,
    backend: 'opencode',
    backendCommand: '',
    status: 'created',
    containerMode: 'session',
    eventsPath: '.events/run.events.jsonl',
    observationsPath: '.events/run.observations.jsonl',
    ...overrides,
  })
}

async function readEvents(ctx: OpenFlowContext, run: ImplementationRun): Promise<Array<Record<string, unknown>>> {
  const content = await readFile(join(ctx.directory, run.eventsPath), 'utf8')
  return content.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('implementation backend handoff', () => {
  test('omo detected calls session.prompt with /start-work and records backend_started', async () => {
    const root = join(TEST_ROOT, 'omo')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    const calls: unknown[] = []
    const ctx = createContext(root, async (input) => {
      calls.push(input)
      return {}
    })
    const run = await createStoredRun(ctx)

    const result = await handoffToBackend(ctx, run, createToolContext())

    expect(result).toEqual({ success: true, backend: 'omo', command: '/start-work openflow-implement-workflow' })
    expect(calls).toEqual([
      {
        path: { id: 'session-1' },
        body: { parts: [{ type: 'text', text: '/start-work openflow-implement-workflow' }] },
      },
    ])
    const updated = await implementationRunStore.getRun(ctx, run.runID)
    expect(updated?.status).toBe('running')
    expect(updated?.backend).toBe('omo')
    expect(updated?.backendCommand).toBe('/start-work openflow-implement-workflow')
    const events = await readEvents(ctx, run)
    expect(events[0]?.type).toBe('backend_started')
    expect(events[0]?.backend).toBe('omo')

    await rm(root, { recursive: true, force: true })
  })

  test('no omo returns OpenCode build agent handoff metadata', async () => {
    const root = join(TEST_ROOT, 'opencode')
    await rm(root, { recursive: true, force: true })
    const calls: unknown[] = []
    const ctx = createContext(root, async (input) => {
      calls.push(input)
      return {}
    })
    const run = await createStoredRun(ctx)

    const result = await handoffToBackend(ctx, run, createToolContext())

    expect(result).toEqual({ success: true, backend: 'opencode', command: 'opencode build' })
    expect(calls).toEqual([])
    const updated = await implementationRunStore.getRun(ctx, run.runID)
    expect(updated?.status).toBe('running')
    expect(updated?.backend).toBe('opencode')
    expect(updated?.backendCommand).toBe('opencode build')

    await rm(root, { recursive: true, force: true })
  })

  test('recursion guard prevents duplicate session.prompt calls', async () => {
    const root = join(TEST_ROOT, 'guard')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    let promptCalls = 0
    let releasePrompt!: () => void
    const pendingPrompt = new Promise<void>((resolve) => {
      releasePrompt = resolve
    })
    const ctx = createContext(root, async () => {
      promptCalls += 1
      return pendingPrompt
    })
    const run = await createStoredRun(ctx)
    const first = handoffToBackend(ctx, run, createToolContext())

    const second = await handoffToBackend(ctx, run, createToolContext())
    releasePrompt()
    const firstResult = await first

    expect(promptCalls).toBe(1)
    expect(firstResult.success).toBe(true)
    expect(second).toEqual({
      success: false,
      backend: 'omo',
      error: 'Recursion guard: handoff already in progress',
    })

    await rm(root, { recursive: true, force: true })
  })

  test('records backend_failed and blocks run when backend handoff fails', async () => {
    const root = join(TEST_ROOT, 'failed')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    const ctx = createContext(root, async () => {
      throw new Error('prompt failed')
    })
    const run = await createStoredRun(ctx)

    const result = await handoffToBackend(ctx, run, createToolContext())

    expect(result).toEqual({ success: false, backend: 'omo', error: 'prompt failed' })
    const updated = await implementationRunStore.getRun(ctx, run.runID)
    expect(updated?.status).toBe('blocked')
    const events = await readEvents(ctx, run)
    expect(events[0]?.type).toBe('backend_failed')
    expect(events[0]?.error).toBe('prompt failed')

    await rm(root, { recursive: true, force: true })
  })
})
