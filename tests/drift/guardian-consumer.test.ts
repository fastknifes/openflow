import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdir, rm, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { ContractRuntime, getContractRuntime } from '../../src/contracts/runtime.js'
import { GuardianConsumer } from '../../src/drift/guardian-consumer.js'
import { ScopedDriftJob } from '../../src/drift/scoped-job.js'
import {
  readSessionPending,
  writeSessionPending,
  readFeatureGuardianState,
  writeFeatureGuardianState,
  readGuardianRepairs,
  appendGuardianRepair,
} from '../../src/drift/state-store.js'
import type { OpenFlowContract } from '../../src/contracts/openflow-contract.js'
import type { FileChangedEvent, GuardianRepairRecord, GuardianPendingItem } from '../../src/types.js'

// --- Test fixtures ---

const TEMP_DIR = join(process.cwd(), '.test-guardian-consumer')
const FEATURE_A = 'test-feature-a'
const FEATURE_B = 'test-feature-b'
const SESSION_ID = 'test-session-001'

function makeContract(overrides?: Partial<OpenFlowContract>): OpenFlowContract {
  return {
    feature: FEATURE_A,
    sourceFiles: [],
    behaviorScenarios: [],
    alignmentItems: [
      {
        behaviorId: 'b1',
        designResponse: 'Created src/foo.ts with FooService',
        files: ['src/foo.ts'],
        modules: ['src/services'],
        expectedSymbols: ['FooService', 'createFoo'],
        risk: 'low',
      },
    ],
    currentConstraints: [],
    decisionConstraints: [],
    extractedAt: '2026-01-01T00:00:00Z',
    sourceHashes: {},
    ...overrides,
  }
}

function makeFileChangedEvent(overrides?: Partial<FileChangedEvent>): FileChangedEvent {
  return {
    type: 'file_changed',
    filePath: 'src/foo.ts',
    tool: 'write',
    timestamp: Date.now(),
    sessionId: SESSION_ID,
    ...overrides,
  }
}

async function setupProject(): Promise<string> {
  await rm(TEMP_DIR, { recursive: true, force: true })
  await mkdir(TEMP_DIR, { recursive: true })
  return TEMP_DIR
}

async function setupSrcFile(projectDir: string, fileName: string, content: string): Promise<string> {
  const srcDir = join(projectDir, 'src')
  await mkdir(srcDir, { recursive: true })
  const filePath = join(srcDir, fileName)
  // Ensure parent directory exists for nested paths (e.g., services/internal.ts)
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
  return filePath
}

async function setupTestRuntime(projectDir: string): Promise<ContractRuntime> {
  ContractRuntime.resetInstance()
  const runtime = getContractRuntime()
  await runtime.start(projectDir)
  return runtime
}

beforeAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true })
  await mkdir(TEMP_DIR, { recursive: true })
})

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true })
})

// ================================================================
// GuardianConsumer
// ================================================================

describe('GuardianConsumer', () => {
  describe('onEvent', () => {
    test('with no matching contract → stays idle (no job created)', async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      // Add a contract that matches src/foo.ts only
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)

      // Fire event for a file that matches NO contract
      const event = makeFileChangedEvent({ filePath: 'src/unknown.ts' })
      await consumer.onEvent(event)

      // No job should be created
      expect(consumer.getJob(FEATURE_A)).toBeUndefined()
    })

    test('with matching contract → creates ScopedDriftJob', async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      // Create the source file so drift check can run symbol-level check
      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}')

      // Add a contract that matches src/foo.ts
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)

      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      const job = consumer.getJob(FEATURE_A)
      expect(job).toBeDefined()
      expect(job!.feature).toBe(FEATURE_A)
      expect(job!.sessionId).toBe(SESSION_ID)

      // With matching file and symbols, should be no_drift → zero pending/repairs
      expect(job!.pendingCount).toBe(0)
      expect(job!.repairsCount).toBe(0)
    })

    test('with matching contract and file not existing → still creates job (file check only)', async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)

      // Fire event for a file that matches the contract but doesn't exist on disk
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      const job = consumer.getJob(FEATURE_A)
      expect(job).toBeDefined()
      // File check will say "matches alignment item" → no_drift → no pending
      expect(job!.pendingCount).toBe(0)
    })

    test('with multiple contracts hitting same file → skips (no auto-repair)', async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      // Add TWO contracts that both match src/foo.ts
      const contractA = makeContract()
      const contractB = makeContract({ feature: FEATURE_B })
      runtime.registry.set(FEATURE_A, contractA)
      runtime.registry.set(FEATURE_B, contractB)

      const consumer = new GuardianConsumer(projectDir)

      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      // No job created because >1 contract hits the same file
      expect(consumer.getJob(FEATURE_A)).toBeUndefined()
      expect(consumer.getJob(FEATURE_B)).toBeUndefined()
    })

    test('when runtime is NOT started → skips event', async () => {
      const projectDir = await setupProject()
      // Reset runtime but do NOT start it
      ContractRuntime.resetInstance()

      const consumer = new GuardianConsumer(projectDir)
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      expect(consumer.getJob(FEATURE_A)).toBeUndefined()
    })

    test('persists feature state after processing event', async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}')
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      // State should be persisted to disk
      const state = await readFeatureGuardianState(projectDir, FEATURE_A)
      expect(state).not.toBeNull()
      expect(state!.feature).toBe(FEATURE_A)
      expect(state!.sessionId).toBe(SESSION_ID)
    })
  })

  describe('onSessionEvent', () => {
    test("'interrupt' → flushes pending items to disk", async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      // Create a file matching the contract by path but with unexpected symbols
      // foo.ts matches the contract's files, but UnexpectedThing is not in expectedSymbols
      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}\nexport class UnexpectedThing {}')
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)

      // Fire event for matching file → creates job with pending items (ambiguous symbol)
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      const jobBefore = consumer.getJob(FEATURE_A)
      expect(jobBefore).toBeDefined()
      expect(jobBefore!.pendingCount).toBeGreaterThan(0)

      // Fire interrupt event
      await consumer.onSessionEvent({ type: 'interrupt' })

      // Pending items should be written to disk
      const pending = await readSessionPending(projectDir, SESSION_ID)
      expect(pending.length).toBeGreaterThan(0)
      expect(pending[0]!.feature).toBe(FEATURE_A)
    })

    test("'session_end' → flushes pending items to disk", async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}\nexport class UnexpectedThing {}')
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      await consumer.onSessionEvent({ type: 'session_end' })

      const pending = await readSessionPending(projectDir, SESSION_ID)
      expect(pending.length).toBeGreaterThan(0)
    })

    test("'archive_complete' → cleans up feature state and session pending", async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}\nexport class UnexpectedThing {}')
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      // Verify state file exists after onEvent
      let state = await readFeatureGuardianState(projectDir, FEATURE_A)
      expect(state).not.toBeNull()

      // Also write some pending items to disk (mimics prior flush)
      await writeSessionPending(projectDir, SESSION_ID, [])

      await consumer.onSessionEvent({ type: 'archive_complete' })

      // Feature state should be deleted
      state = await readFeatureGuardianState(projectDir, FEATURE_A)
      expect(state).toBeNull()

      // Session pending should be deleted
      const pending = await readSessionPending(projectDir, SESSION_ID)
      expect(pending).toEqual([])
    })

    test("'verify_start' → cleans up feature state", async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}')
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      // Verify state exists
      let state = await readFeatureGuardianState(projectDir, FEATURE_A)
      expect(state).not.toBeNull()

      await consumer.onSessionEvent({ type: 'verify_start' })

      // Feature state should be deleted
      state = await readFeatureGuardianState(projectDir, FEATURE_A)
      expect(state).toBeNull()
    })
  })

  describe('getJob', () => {
    test('returns job by feature name', async () => {
      const projectDir = await setupProject()
      const runtime = await setupTestRuntime(projectDir)

      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}')
      runtime.registry.set(FEATURE_A, makeContract())

      const consumer = new GuardianConsumer(projectDir)
      const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
      await consumer.onEvent(event)

      const job = consumer.getJob(FEATURE_A)
      expect(job).toBeDefined()
      expect(job!.feature).toBe(FEATURE_A)
    })

    test('returns undefined for unknown feature', async () => {
      const projectDir = await setupProject()
      const consumer = new GuardianConsumer(projectDir)
      expect(consumer.getJob('nonexistent')).toBeUndefined()
    })
  })

  describe('resumeFromDisk', () => {
    test('is a no-op (placeholder for future use)', async () => {
      const projectDir = await setupProject()
      const consumer = new GuardianConsumer(projectDir)
      await consumer.resumeFromDisk('some-session-id')
      // Should not throw and should not create any jobs
      expect(consumer.getJob(FEATURE_A)).toBeUndefined()
    })
  })
})

// ================================================================
// ScopedDriftJob
// ================================================================

describe('ScopedDriftJob', () => {
  describe('run', () => {
    test('no_drift disposition → no pending items, no repairs', async () => {
      const projectDir = await setupProject()
      // Create a file that matches the contract exactly
      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/foo.ts', contract)

      expect(job.pendingCount).toBe(0)
      expect(job.repairsCount).toBe(0)
    })

    test('ambiguous_needs_confirmation → adds to pending queue', async () => {
      const projectDir = await setupProject()
      // Create a file that does NOT match any alignment item
      await setupSrcFile(projectDir, 'unknown.ts', 'export class UnknownService {}')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/unknown.ts', contract)

      expect(job.pendingCount).toBeGreaterThan(0)
      expect(job.repairsCount).toBe(0)
    })

    test('pending items have correct structure', async () => {
      const projectDir = await setupProject()
      await setupSrcFile(projectDir, 'unknown.ts', 'export class UnknownService {}')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/unknown.ts', contract)

      expect(job.pendingCount).toBe(1)
      // Verify structure via getEvidence
      const evidence = await job.getEvidence()
      expect(evidence.pendingItems).toHaveLength(1)
      const item = evidence.pendingItems[0]!
      expect(item.feature).toBe(FEATURE_A)
      expect(item.filePath).toBe('src/unknown.ts')
      expect(item.disposition).toBe('ambiguous_needs_confirmation')
      expect(item.timestamp).toBeDefined()
      expect(item.reason).toBeDefined()
    })

    test('symbol-level ambiguous drift → adds to pending', async () => {
      const projectDir = await setupProject()
      // Create a file matching by path but with unexpected symbols
      await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}\nexport class UnexpectedThing {}')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/foo.ts', contract)

      // FooService matches, UnexpectedThing should be ambiguous
      expect(job.pendingCount).toBeGreaterThan(0)
      expect(job.repairsCount).toBe(0)

      const evidence = await job.getEvidence()
      // Items with "matches" or "no drift" reason are skipped in addPending
      const pendingItems = evidence.pendingItems
      const ambiguousItems = pendingItems.filter(p => p.disposition === 'ambiguous_needs_confirmation')
      expect(ambiguousItems.length).toBe(1)
      expect(ambiguousItems[0]!.item).toBe('UnexpectedThing')
    })

    test('non-code file runs file check only', async () => {
      const projectDir = await setupProject()
      await setupSrcFile(projectDir, 'foo.md', '# Doc')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/foo.md', contract)

      // .md file → no symbol check; file not in alignment → ambiguous
      expect(job.pendingCount).toBeGreaterThan(0)
    })
  })

  describe('flushPending / loadPending', () => {
    test('flushPending writes pending items to disk', async () => {
      const projectDir = await setupProject()
      await setupSrcFile(projectDir, 'unknown.ts', 'export class UnknownService {}')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/unknown.ts', contract)
      expect(job.pendingCount).toBeGreaterThan(0)

      await job.flushPending()

      // Read back from disk
      const pending = await readSessionPending(projectDir, SESSION_ID)
      expect(pending.length).toBe(job.pendingCount)
      expect(pending[0]!.feature).toBe(FEATURE_A)
    })

    test('flushPending with no pending items does not write', async () => {
      const projectDir = await setupProject()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.flushPending()

      // Should not create file — read should return empty array
      const pending = await readSessionPending(projectDir, SESSION_ID)
      expect(pending).toEqual([])
    })

    test('loadPending reads pending items from disk', async () => {
      const projectDir = await setupProject()

      const sampleItems: GuardianPendingItem[] = [
        {
          timestamp: new Date().toISOString(),
          feature: FEATURE_A,
          filePath: 'src/unknown.ts',
          item: 'UnknownService',
          disposition: 'ambiguous_needs_confirmation',
          reason: 'Not in contract',
        },
      ]
      await writeSessionPending(projectDir, SESSION_ID, sampleItems)

      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)
      await job.loadPending()

      expect(job.pendingCount).toBe(1)
    })

    test('loadPending with no file on disk returns zero', async () => {
      const projectDir = await setupProject()
      const job = new ScopedDriftJob(FEATURE_A, 'nonexistent-session', projectDir)

      await job.loadPending()

      expect(job.pendingCount).toBe(0)
    })
  })

  describe('getEvidence', () => {
    test('returns correct evidence with pending items', async () => {
      const projectDir = await setupProject()
      await setupSrcFile(projectDir, 'unknown.ts', 'export class UnknownService {}')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/unknown.ts', contract)

      const evidence = await job.getEvidence()

      expect(evidence.autoRepairs).toBe(0)
      expect(evidence.pendingAmbiguities).toBe(1)
      expect(evidence.unresolvedViolations).toBe(0)
      expect(evidence.contractSource).toBe(`docs/changes/*-${FEATURE_A}`)
      expect(evidence.pendingItems).toHaveLength(1)
      expect(evidence.repairRecords).toEqual([])
    })

    test('returns repair records filtered by feature', async () => {
      const projectDir = await setupProject()

      // Create a repair record for this feature
      const repairRecord: GuardianRepairRecord = {
        timestamp: new Date().toISOString(),
        feature: FEATURE_A,
        filePath: 'src/renamed.ts',
        disposition: 'auto_repaired',
        originalSegment: 'old content',
        repairedSegment: 'new content',
        reason: 'test repair',
      }
      await appendGuardianRepair(projectDir, repairRecord)

      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)
      const evidence = await job.getEvidence()

      expect(evidence.repairRecords).toHaveLength(1)
      expect(evidence.repairRecords[0]!.feature).toBe(FEATURE_A)
      expect(evidence.repairRecords[0]!.filePath).toBe('src/renamed.ts')
    })

    test('filters out repair records from other features', async () => {
      const projectDir = await setupProject()

      // Create repair records for two different features
      await appendGuardianRepair(projectDir, {
        timestamp: new Date().toISOString(),
        feature: FEATURE_A,
        filePath: 'src/a.ts',
        disposition: 'auto_repaired',
        originalSegment: '',
        repairedSegment: '',
        reason: 'a',
      })
      await appendGuardianRepair(projectDir, {
        timestamp: new Date().toISOString(),
        feature: FEATURE_B,
        filePath: 'src/b.ts',
        disposition: 'auto_repaired',
        originalSegment: '',
        repairedSegment: '',
        reason: 'b',
      })

      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)
      const evidence = await job.getEvidence()

      expect(evidence.repairRecords).toHaveLength(1)
      expect(evidence.repairRecords[0]!.feature).toBe(FEATURE_A)
    })

    test('returns zero evidence when no activity', async () => {
      const projectDir = await setupProject()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      const evidence = await job.getEvidence()

      expect(evidence.autoRepairs).toBe(0)
      expect(evidence.pendingAmbiguities).toBe(0)
      expect(evidence.unresolvedViolations).toBe(0)
      expect(evidence.repairRecords).toEqual([])
      expect(evidence.pendingItems).toEqual([])
    })
  })

  describe('getState', () => {
    test('returns correct state with feature and session info', async () => {
      const projectDir = await setupProject()
      await setupSrcFile(projectDir, 'unknown.ts', 'export class UnknownService {}')

      const contract = makeContract()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      await job.run('src/unknown.ts', contract)

      const state = job.getState()
      expect(state.feature).toBe(FEATURE_A)
      expect(state.sessionId).toBe(SESSION_ID)
      expect(state.repairsCount).toBe(0)
      expect(state.pendingCount).toBeGreaterThan(0)
      expect(state.startedAt).toBeDefined()
    })

    test('reflects current repair and pending counts', async () => {
      const projectDir = await setupProject()
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)

      let state = job.getState()
      expect(state.repairsCount).toBe(0)
      expect(state.pendingCount).toBe(0)

      // Run a job that produces pending
      await setupSrcFile(projectDir, 'unknown.ts', 'export class UnknownService {}')
      await job.run('src/unknown.ts', makeContract())

      state = job.getState()
      expect(state.pendingCount).toBeGreaterThan(0)
    })
  })

  describe('pendingCount and repairsCount getters', () => {
    test('pendingCount returns current pending items count', async () => {
      const projectDir = await setupProject()
      await setupSrcFile(projectDir, 'unknown.ts', 'export class UnknownService {}')

      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, projectDir)
      expect(job.pendingCount).toBe(0)

      await job.run('src/unknown.ts', makeContract())
      expect(job.pendingCount).toBeGreaterThan(0)
    })

    test('repairsCount starts at zero', () => {
      const job = new ScopedDriftJob(FEATURE_A, SESSION_ID, TEMP_DIR)
      expect(job.repairsCount).toBe(0)
    })
  })
})

// ================================================================
// Integration: GuardianConsumer + ScopedDriftJob + ambiguous drift
// ================================================================

describe('GuardianConsumer integration with ambiguous drift', () => {
  test('full flow: file change → ambiguous drift → pending items → flush → verify on disk', async () => {
    const projectDir = await setupProject()
    const runtime = await setupTestRuntime(projectDir)

    // Create a file matching by module path but with unexpected symbols
    await setupSrcFile(projectDir, 'services/internal.ts', 'export class UnexpectedService {}')
    runtime.registry.set(FEATURE_A, makeContract())

    const consumer = new GuardianConsumer(projectDir)

    // Fire file change event for a module-matching file → ambiguous symbols
    const event = makeFileChangedEvent({ filePath: 'src/services/internal.ts' })
    await consumer.onEvent(event)

    // Job should exist with pending items (UnexpectedService not in expectedSymbols)
    const job = consumer.getJob(FEATURE_A)
    expect(job).toBeDefined()
    expect(job!.pendingCount).toBeGreaterThan(0)

    // Flush pending via session end
    await consumer.onSessionEvent({ type: 'session_end' })

    // Verify pending items on disk
    const pending = await readSessionPending(projectDir, SESSION_ID)
    expect(pending.length).toBeGreaterThan(0)
    expect(pending[0]!.feature).toBe(FEATURE_A)
    expect(pending[0]!.disposition).toBe('ambiguous_needs_confirmation')

    // Verify feature state persisted
    const state = await readFeatureGuardianState(projectDir, FEATURE_A)
    expect(state).not.toBeNull()
    expect(state!.pendingCount).toBeGreaterThan(0)
  })

  test('multiple runs accumulate pending items', async () => {
    const projectDir = await setupProject()
    const runtime = await setupTestRuntime(projectDir)

    // Both files match the contract: foo.ts by file path, internal.ts by module path
    await setupSrcFile(projectDir, 'foo.ts', 'export class FooService {}\nexport class ExtraService {}')
    await setupSrcFile(projectDir, 'services/internal.ts', 'export class UnexpectedService {}')
    runtime.registry.set(FEATURE_A, makeContract())

    const consumer = new GuardianConsumer(projectDir)

    // Two file changes, both produce pending items for ambiguous symbols
    await consumer.onEvent(makeFileChangedEvent({ filePath: 'src/foo.ts' }))
    await consumer.onEvent(makeFileChangedEvent({ filePath: 'src/services/internal.ts' }))

    const job = consumer.getJob(FEATURE_A)
    expect(job).toBeDefined()
    // ExtraService from foo.ts + UnexpectedService from internal.ts → at least 2 pending
    expect(job!.pendingCount).toBeGreaterThanOrEqual(2)
  })
})
