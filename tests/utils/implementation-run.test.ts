import { describe, expect, test } from 'bun:test'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createRun,
  createRunID,
  deleteRun,
  findActiveRun,
  getRun,
  isTerminalStatus,
  listRuns,
  resolveRunsPath,
  updateRun,
  implementationRunStore,
} from '../../src/utils/implementation-run.js'
import { defaultConfig, type ImplementationRun, type OpenFlowContext } from '../../src/types.js'

const TEST_ROOT = join(process.cwd(), '.test-implementation-run')

function createContext(directory: string, implementationRunsPath?: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    enhancedPlans: new Set<string>(),
    config: {
      ...defaultConfig,
      paths: {
        ...defaultConfig.paths,
        implementation_runs: implementationRunsPath ?? defaultConfig.paths.implementation_runs,
      },
    },
  }
}

function sampleRun(overrides: Partial<ImplementationRun> = {}): ImplementationRun {
  return {
    runID: 'run_123',
    feature: 'workflow',
    sessionID: 'session-1',
    messageID: 'message-1',
    agent: 'build',
    directory: '/repo',
    backend: 'opencode',
    backendCommand: 'opencode run',
    status: 'created',
    containerMode: 'session',
    startedAt: '2026-05-22T10:00:00.000Z',
    updatedAt: '2026-05-22T10:00:00.000Z',
    eventsPath: '.sisyphus/openflow/runs/run_123.events.jsonl',
    observationsPath: '.sisyphus/openflow/runs/run_123.observations.jsonl',
    ...overrides,
  }
}

describe('implementation-run store', () => {
  test('createRun writes JSON atomically and getRun reads it by ID', async () => {
    const root = join(TEST_ROOT, 'create-get')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)
    const run = sampleRun()

    await createRun(ctx, run)

    const runsPath = await resolveRunsPath(ctx)
    const fileContent = await readFile(join(runsPath, 'run_123.json'), 'utf8')
    expect(JSON.parse(fileContent)).toEqual(run)
    expect(await getRun(ctx, 'run_123')).toEqual(run)
    expect(await getRun(ctx, 'missing')).toBeNull()
    expect(await readdir(runsPath)).not.toContain('run_123.json.tmp')

    await rm(root, { recursive: true, force: true })
  })

  test('createRun replaces a leftover temp file during atomic write', async () => {
    const root = join(TEST_ROOT, 'atomic-leftover')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)
    const runsPath = await resolveRunsPath(ctx)
    await mkdir(runsPath, { recursive: true })
    await writeFile(join(runsPath, 'run_123.json.tmp'), 'stale temp data')

    await createRun(ctx, sampleRun())

    expect(await getRun(ctx, 'run_123')).toEqual(sampleRun())
    expect(await readdir(runsPath)).not.toContain('run_123.json.tmp')

    await rm(root, { recursive: true, force: true })
  })

  test('updateRun merges specific fields and touches updatedAt', async () => {
    const root = join(TEST_ROOT, 'update')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)
    const run = sampleRun({ updatedAt: '2020-01-01T00:00:00.000Z' })
    await createRun(ctx, run)

    const updated = await updateRun(ctx, 'run_123', {
      status: 'running',
      backendCommand: 'npm test',
    })

    expect(updated.status).toBe('running')
    expect(updated.backendCommand).toBe('npm test')
    expect(updated.feature).toBe('workflow')
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(run.updatedAt).getTime())
    expect(await getRun(ctx, 'run_123')).toEqual(updated)

    await rm(root, { recursive: true, force: true })
  })

  test('updateRun returns null for missing run', async () => {
    const root = join(TEST_ROOT, 'update-missing')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)

    expect(await updateRun(ctx, 'missing', { status: 'running' })).toBeNull()

    await rm(root, { recursive: true, force: true })
  })

  test('listRuns lists all runs and filters by feature', async () => {
    const root = join(TEST_ROOT, 'list')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)
    await createRun(ctx, sampleRun({ runID: 'run_a', feature: 'alpha' }))
    await createRun(ctx, sampleRun({ runID: 'run_b', feature: 'beta' }))
    await createRun(ctx, sampleRun({ runID: 'run_c', feature: 'alpha' }))

    expect((await listRuns(ctx)).map((run) => run.runID).sort()).toEqual(['run_a', 'run_b', 'run_c'])
    expect((await listRuns(ctx, 'alpha')).map((run) => run.runID).sort()).toEqual(['run_a', 'run_c'])

    await rm(root, { recursive: true, force: true })
  })

  test('deleteRun removes an existing run and ignores missing files', async () => {
    const root = join(TEST_ROOT, 'delete')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)
    await createRun(ctx, sampleRun())

    expect(await deleteRun(ctx, 'run_123')).toBe(true)
    expect(await getRun(ctx, 'run_123')).toBeNull()
    expect(await deleteRun(ctx, 'run_123')).toBe(false)

    await rm(root, { recursive: true, force: true })
  })

  test('findActiveRun returns the most recent non-terminal run for a session', async () => {
    const root = join(TEST_ROOT, 'active')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)
    await createRun(ctx, sampleRun({ runID: 'archived', sessionID: 'session-1', status: 'archived', updatedAt: '2026-05-22T11:00:00.000Z' }))
    await createRun(ctx, sampleRun({ runID: 'older-active', sessionID: 'session-1', status: 'running', updatedAt: '2026-05-22T09:00:00.000Z' }))
    await createRun(ctx, sampleRun({ runID: 'newer-active', sessionID: 'session-1', status: 'quality_gate_pending', updatedAt: '2026-05-22T10:00:00.000Z' }))
    await createRun(ctx, sampleRun({ runID: 'other-session', sessionID: 'session-2', status: 'running', updatedAt: '2026-05-22T12:00:00.000Z' }))

    expect((await findActiveRun(ctx, 'session-1'))?.runID).toBe('newer-active')
    expect(await findActiveRun(ctx, 'session-3')).toBeNull()

    await rm(root, { recursive: true, force: true })
  })

  test('resolveRunsPath uses config path relative to ctx.directory and falls back to default', async () => {
    const root = join(TEST_ROOT, 'paths')
    await rm(root, { recursive: true, force: true })

    expect(await resolveRunsPath(createContext(root, 'custom/runs'))).toBe(join(root, 'custom/runs'))
    expect(await resolveRunsPath(createContext(root))).toBe(join(root, '.sisyphus/openflow/runs'))

    await rm(root, { recursive: true, force: true })
  })

  test('createRunID returns unique ImplementationRun IDs and terminal status helper matches workflow terminals', () => {
    const first = createRunID()
    const second = createRunID()

    expect(first).toStartWith('run_')
    expect(second).toStartWith('run_')
    expect(first).not.toBe(second)
    expect(isTerminalStatus('archived')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('blocked')).toBe(true)
    expect(isTerminalStatus('ready_for_archive')).toBe(false)
    expect(isTerminalStatus('running')).toBe(false)
  })

  test('implementationRunStore creates generated feature-scoped runs under the configured path', async () => {
    const root = join(TEST_ROOT, 'store-create')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root, 'custom/runs')
    const input = sampleRun({ feature: 'scoped-feature' })

    const created = await implementationRunStore.createRun(ctx, {
      feature: input.feature,
      sessionID: input.sessionID,
      messageID: input.messageID,
      agent: input.agent,
      directory: input.directory,
      backend: input.backend,
      backendCommand: input.backendCommand,
      status: input.status,
      containerMode: input.containerMode,
      eventsPath: input.eventsPath,
      observationsPath: input.observationsPath,
    })

    const persisted = JSON.parse(await readFile(join(root, 'custom/runs/scoped-feature', `${created.runID}.json`), 'utf8'))
    expect(created.runID).toStartWith('run_')
    expect(created.startedAt).toBe(created.updatedAt)
    expect(persisted).toEqual(created)

    await rm(root, { recursive: true, force: true })
  })

  test('implementationRunStore prevents duplicate active runs for the same feature and session', async () => {
    const root = join(TEST_ROOT, 'store-duplicate')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)

    const first = await implementationRunStore.createRun(ctx, {
      ...sampleRun({ feature: 'duplicate-feature', sessionID: 'session-1', status: 'running' }),
      runID: undefined as never,
      startedAt: undefined as never,
      updatedAt: undefined as never,
    })
    const second = await implementationRunStore.createRun(ctx, {
      ...sampleRun({ feature: 'duplicate-feature', sessionID: 'session-1', messageID: 'message-2' }),
      runID: undefined as never,
      startedAt: undefined as never,
      updatedAt: undefined as never,
    })

    expect(second).toEqual(first)
    expect(await implementationRunStore.listRuns(ctx, { feature: 'duplicate-feature', sessionID: 'session-1' })).toEqual([first])

    await rm(root, { recursive: true, force: true })
  })

  test('implementationRunStore updates, filters, gets active runs, and deletes by run ID', async () => {
    const root = join(TEST_ROOT, 'store-crud')
    await rm(root, { recursive: true, force: true })
    const ctx = createContext(root)
    const run = await implementationRunStore.createRun(ctx, {
      ...sampleRun({ feature: 'crud-feature', sessionID: 'session-1' }),
      runID: undefined as never,
      startedAt: undefined as never,
      updatedAt: undefined as never,
    })

    const updated = await implementationRunStore.updateRun(ctx, run.runID, { status: 'quality_gate_pending' })

    expect(await implementationRunStore.getRun(ctx, run.runID)).toEqual(updated)
    expect(await implementationRunStore.listRuns(ctx, { status: ['quality_gate_pending'] })).toEqual([updated])
    expect(await implementationRunStore.getActiveRun(ctx, 'crud-feature', 'session-1')).toEqual(updated)

    await implementationRunStore.deleteRun(ctx, run.runID)
    expect(await implementationRunStore.getRun(ctx, run.runID)).toBeNull()

    await rm(root, { recursive: true, force: true })
  })
})
