import { describe, expect, test } from 'bun:test'
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
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

async function readObservations(ctx: OpenFlowContext, run: ImplementationRun): Promise<string[]> {
  const content = await readFile(join(ctx.directory, run.observationsPath), 'utf8')
  return content.trim().split('\n')
}

describe('implementation backend handoff', () => {
  test('omo detected calls session.prompt with enriched context and records backend_started', async () => {
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

    const expectedCommand = [
      '/start-work openflow-implement-workflow',
      '',
      'OpenFlow Implementation Context:',
      `- runID: ${run.runID}`,
      '- feature: openflow-implement-workflow',
      `- executionRoot: ${root}`,
      '- worktree: (none)',
      '- planPath: .sisyphus/plans/openflow-implement-workflow.md',
      '- containerMode: session',
      '- mustUseExistingImplementationRun: true',
    ].join('\n')
    expect(result).toEqual({ success: true, backend: 'omo', command: expectedCommand })
    expect(calls).toHaveLength(1)
    const callArg = calls[0] as { body: { parts: Array<{ type: string; text: string }> } }
    const promptText = callArg.body.parts[0].text
    expect(promptText).toContain('runID: ' + run.runID)
    expect(promptText).toContain('executionRoot: ' + root)
    expect(promptText).toContain('worktree: (none)')
    expect(promptText).toContain('planPath: .sisyphus/plans/openflow-implement-workflow.md')
    expect(promptText).toContain('containerMode: session')
    expect(promptText).toContain('mustUseExistingImplementationRun: true')
    const updated = await implementationRunStore.getRun(ctx, run.runID)
    expect(updated?.status).toBe('running')
    expect(updated?.backend).toBe('omo')
    const events = await readEvents(ctx, run)
    expect(events[0]?.type).toBe('backend_started')
    expect(events[0]?.backend).toBe('omo')

    await rm(root, { recursive: true, force: true })
  })

  test('no omo returns OpenCode build agent handoff metadata with implementation context observation', async () => {
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
    const observations = await readObservations(ctx, run)
    expect(observations.length).toBeGreaterThanOrEqual(2)
    expect(observations[0]).toContain('Backend started: opencode (opencode build)')
    const contextLine = observations[1]
    expect(contextLine).toContain('Implementation context:')
    expect(contextLine).toContain(`runID=${run.runID}`)
    expect(contextLine).toContain('feature=openflow-implement-workflow')
    expect(contextLine).toContain('planPath=.sisyphus/plans/openflow-implement-workflow.md')
    expect(contextLine).toContain('containerMode=session')

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
