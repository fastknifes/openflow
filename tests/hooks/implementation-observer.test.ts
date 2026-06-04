import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createImplementationObserver } from '../../src/hooks/implementation-observer.js'
import { implementationRunStore } from '../../src/utils/implementation-run.js'
import { defaultConfig, type ImplementationRun, type OpenFlowContext } from '../../src/types.js'

const TEST_ROOT = join(process.cwd(), '.test-implementation-observer')

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    enhancedPlans: new Set(),
    config: {
      ...defaultConfig,
      paths: { ...defaultConfig.paths, implementation_runs: '.runs' },
    },
  }
}

async function createRun(ctx: OpenFlowContext, overrides: Partial<ImplementationRun> = {}): Promise<ImplementationRun> {
  return implementationRunStore.createRun(ctx, {
    feature: overrides.feature ?? 'observer-feature',
    sessionID: overrides.sessionID ?? 'session-1',
    messageID: overrides.messageID ?? 'message-1',
    agent: overrides.agent ?? 'build',
    directory: overrides.directory ?? ctx.directory,
    backend: overrides.backend ?? 'opencode',
    backendCommand: overrides.backendCommand ?? 'task',
    status: overrides.status ?? 'created',
    containerMode: overrides.containerMode ?? 'session',
    eventsPath: overrides.eventsPath ?? `.events/${overrides.sessionID ?? 'session-1'}.jsonl`,
    observationsPath: overrides.observationsPath ?? `.events/${overrides.sessionID ?? 'session-1'}.observations.jsonl`,
    worktree: overrides.worktree,
  })
}

async function readEvents(ctx: OpenFlowContext, run: ImplementationRun): Promise<Array<Record<string, unknown>>> {
  try {
    const content = await readFile(join(ctx.directory, run.eventsPath), 'utf8')
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function readMismatchEvents(ctx: OpenFlowContext): Promise<Array<Record<string, unknown>>> {
  const mismatchPath = join(ctx.directory, '.sisyphus', 'openflow', 'events', 'mismatch.jsonl')
  try {
    const content = await readFile(mismatchPath, 'utf8')
    return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

describe('implementation observer hooks', () => {
  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('ignores events when no active run exists for session', async () => {
    const root = join(TEST_ROOT, 'no-active-run')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1' })
    await observer.chatMessageHook({ sessionID: 'session-1' }, { parts: [{ type: 'text', text: '/start-work observer-feature' }] })
    await observer.toolBeforeHook({ tool: 'task', sessionID: 'session-1', callID: 'call-1' }, { args: {} })
    await observer.commandBeforeHook({ command: 'openflow-quality-gate', sessionID: 'session-1', arguments: 'observer-feature' }, {})
    expect(await readEvents(ctx, run)).toEqual([])
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('created')
  })

  test('records backend_started when matching backend tool is executed', async () => {
    const root = join(TEST_ROOT, 'backend-started')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1', backendCommand: 'task' })
    observer.setActiveRun(run)
    await observer.toolBeforeHook({ tool: 'task', sessionID: 'session-1', callID: 'call-1' }, { args: {} })
    const events = await readEvents(ctx, run)
    expect(events.map(event => event.type)).toEqual(['backend_started'])
    expect(events[0]).toMatchObject({ runID: run.runID, sessionID: 'session-1', callID: 'call-1', tool: 'task' })
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('starting_backend')
  })

  test('records backend_failed when matching backend tool throws', async () => {
    const root = join(TEST_ROOT, 'backend-failed')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1', backendCommand: 'task' })
    observer.setActiveRun(run)
    await observer.toolAfterHook({ tool: 'task', sessionID: 'session-1', callID: 'call-1', args: {} }, { error: new Error('backend exploded') })
    const events = await readEvents(ctx, run)
    expect(events.map(event => event.type)).toEqual(['backend_failed'])
    expect(String(events[0]?.error)).toContain('backend exploded')
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('blocked')
  })

  test('records backend_completed when matching backend tool succeeds', async () => {
    const root = join(TEST_ROOT, 'backend-completed')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1', backendCommand: 'task' })
    observer.setActiveRun(run)
    await observer.toolAfterHook({ tool: 'task', sessionID: 'session-1', callID: 'call-1', args: {} }, { output: 'ok' })
    const events = await readEvents(ctx, run)
    expect(events.map(event => event.type)).toEqual(['backend_completed'])
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('quality_gate_pending')
  })

  test('records quality_gate_started when quality gate command is invoked', async () => {
    const root = join(TEST_ROOT, 'quality-gate-started')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1', status: 'quality_gate_pending' })
    observer.setActiveRun(run)
    await observer.commandBeforeHook({ command: 'openflow-quality-gate', sessionID: 'session-1', arguments: 'observer-feature' }, {})
    const events = await readEvents(ctx, run)
    expect(events.map(event => event.type)).toEqual(['quality_gate_started'])
    expect(events[0]).toMatchObject({ runID: run.runID, sessionID: 'session-1', command: 'openflow-quality-gate' })
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('quality_gate_running')
  })

  test('records quality_gate_completed from readiness chat result', async () => {
    const root = join(TEST_ROOT, 'quality-gate-completed')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1', status: 'quality_gate_running' })
    observer.setActiveRun(run)
    await observer.chatMessageHook({ sessionID: 'session-1' }, { parts: [{ type: 'text', text: 'Quality Gate complete. Readiness: Ready' }] })
    const events = await readEvents(ctx, run)
    expect(events.map(event => event.type)).toEqual(['quality_gate_completed'])
    expect(events[0]).toMatchObject({ runID: run.runID, sessionID: 'session-1', result: 'ready' })
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('ready_for_archive')
  })

  test('ignores events for unrelated sessions', async () => {
    const root = join(TEST_ROOT, 'unrelated-session')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1' })
    observer.setActiveRun(run)
    await observer.toolBeforeHook({ tool: 'task', sessionID: 'session-2', callID: 'call-1' }, { args: {} })
    await observer.commandBeforeHook({ command: 'openflow-quality-gate', sessionID: 'session-2', arguments: 'observer-feature' }, {})
    expect(await readEvents(ctx, run)).toEqual([])
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('created')
  })

  test('keeps active run state scoped by session', async () => {
    const root = join(TEST_ROOT, 'session-scoped')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const firstRun = await createRun(ctx, { sessionID: 'session-1', feature: 'first-feature', eventsPath: '.events/first.jsonl' })
    const secondRun = await createRun(ctx, { sessionID: 'session-2', feature: 'second-feature', eventsPath: '.events/second.jsonl' })
    observer.setActiveRun(firstRun)
    observer.setActiveRun(secondRun)
    await observer.toolBeforeHook({ tool: 'task', sessionID: 'session-1', callID: 'call-1' }, { args: {} })
    await observer.commandBeforeHook({ command: 'openflow-quality-gate', sessionID: 'session-2', arguments: 'second-feature' }, {})
    expect(observer.getActiveRun('session-1')?.runID).toBe(firstRun.runID)
    expect(observer.getActiveRun('session-2')?.runID).toBe(secondRun.runID)
    expect((await readEvents(ctx, firstRun)).map(event => event.type)).toEqual(['backend_started'])
    expect((await readEvents(ctx, secondRun)).map(event => event.type)).toEqual(['quality_gate_started'])
    observer.clearActiveRun('session-1')
    expect(observer.getActiveRun('session-1')).toBeUndefined()
    expect(observer.getActiveRun('session-2')?.runID).toBe(secondRun.runID)
  })
})

describe('implementation observer mismatch detection', () => {
  afterEach(async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('records mismatch when backend chat message has no active run', async () => {
    const root = join(TEST_ROOT, 'mismatch-chat-backend')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)

    // Send /start-work message without setting active run
    await observer.chatMessageHook(
      { sessionID: 'session-1' },
      { parts: [{ type: 'text', text: '/start-work my-feature' }] },
    )

    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      type: 'implementation_context_mismatch',
      sessionID: 'session-1',
      reason: 'no_active_run',
      originalEventType: 'backend_started',
    })
  })

  test('records mismatch when quality-gate chat message has no active run', async () => {
    const root = join(TEST_ROOT, 'mismatch-chat-qg')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)

    await observer.chatMessageHook(
      { sessionID: 'session-1' },
      { parts: [{ type: 'text', text: 'Quality Gate complete. Readiness: Ready' }] },
    )

    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      type: 'implementation_context_mismatch',
      sessionID: 'session-1',
      reason: 'no_active_run',
      originalEventType: 'quality_gate_started',
    })
  })

  test('records mismatch when backend tool call has no active run', async () => {
    const root = join(TEST_ROOT, 'mismatch-tool-backend')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)

    await observer.toolBeforeHook(
      { tool: 'task', sessionID: 'session-1', callID: 'call-1' },
      { args: {} },
    )

    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      type: 'implementation_context_mismatch',
      sessionID: 'session-1',
      reason: 'no_active_run',
      originalEventType: 'backend_started',
    })
  })

  test('records mismatch when backend tool completion has no active run', async () => {
    const root = join(TEST_ROOT, 'mismatch-tool-complete')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)

    await observer.toolAfterHook(
      { tool: 'task', sessionID: 'session-1', callID: 'call-1' },
      { output: 'done' },
    )

    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      type: 'implementation_context_mismatch',
      sessionID: 'session-1',
      reason: 'no_active_run',
      originalEventType: 'backend_completed',
    })
  })

  test('records mismatch when quality-gate command has no active run', async () => {
    const root = join(TEST_ROOT, 'mismatch-command-qg')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)

    await observer.commandBeforeHook(
      { command: 'openflow-quality-gate', sessionID: 'session-1', arguments: 'my-feature' },
      {},
    )

    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      type: 'implementation_context_mismatch',
      sessionID: 'session-1',
      reason: 'no_active_run',
      originalEventType: 'quality_gate_started',
    })
  })

  test('records mismatch when event hook receives backend events with no active run', async () => {
    const root = join(TEST_ROOT, 'mismatch-event')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)

    await observer.event({ sessionID: 'session-1', type: 'backend_completed' })

    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      type: 'implementation_context_mismatch',
      sessionID: 'session-1',
      reason: 'no_active_run',
      originalEventType: 'backend_completed',
    })
  })

  test('does not record mismatch for unrelated session events', async () => {
    const root = join(TEST_ROOT, 'mismatch-unrelated')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)

    // Set active run for session-1
    const run = await createRun(ctx, { sessionID: 'session-1' })
    observer.setActiveRun(run)

    // Send tool event for session-2 (wrong session)
    await observer.toolBeforeHook(
      { tool: 'task', sessionID: 'session-2', callID: 'call-1' },
      { args: {} },
    )

    // session-1 run should not have status changed
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('created')
    // session-2 should get mismatch
    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      sessionID: 'session-2',
      reason: 'no_active_run',
    })
  })

  test('correct run does not produce mismatch events', async () => {
    const root = join(TEST_ROOT, 'no-mismatch-happy-path')
    await mkdir(root, { recursive: true })
    const ctx = createContext(root)
    const observer = createImplementationObserver(ctx)
    const run = await createRun(ctx, { sessionID: 'session-1', backendCommand: 'task' })
    observer.setActiveRun(run)

    await observer.toolBeforeHook(
      { tool: 'task', sessionID: 'session-1', callID: 'call-1' },
      { args: {} },
    )

    const mismatches = await readMismatchEvents(ctx)
    expect(mismatches).toHaveLength(0)
    const events = await readEvents(ctx, run)
    expect(events.map(event => event.type)).toEqual(['backend_started'])
    expect((await implementationRunStore.getRun(ctx, run.runID))?.status).toBe('starting_backend')
  })
})
