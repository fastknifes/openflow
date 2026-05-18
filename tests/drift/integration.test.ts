import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ContractRuntime, getContractRuntime } from '../../src/contracts/runtime.js'
import { ContractExtractor } from '../../src/contracts/contract-extractor.js'
import { GuardianConsumer } from '../../src/drift/guardian-consumer.js'
import { ScopedDriftJob } from '../../src/drift/scoped-job.js'
import { checkDrift } from '../../src/drift/diff-engine.js'
import { executeRepair, isDeterministicRepair } from '../../src/drift/repair-coordinator.js'
import {
  writeFeatureGuardianState,
  deleteFeatureGuardianState,
  readFeatureGuardianState,
  writeSessionPending,
  readSessionPending,
  deleteSessionPending,
  readGuardianRepairs,
  appendGuardianRepair,
} from '../../src/drift/state-store.js'
import type { OpenFlowContract } from '../../src/contracts/openflow-contract.js'
import type { FileChangedEvent, GuardianPendingItem } from '../../src/types.js'
import type { DriftCheckResult } from '../../src/drift/diff-engine.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMP_DIR = join(process.cwd(), '.test-guardian-integration')
const CHANGE_DIR = '2026-05-12-test-feature'
const FEATURE = 'test-feature'
const SESSION_ID = 'session-integration-001'

// ---------------------------------------------------------------------------
// Fixture content
// ---------------------------------------------------------------------------

const DESIGN_META_JSON = {
  feature: 'test-feature',
  constraints: [],
  scopeBoundary: { inScope: ['auth'], outOfScope: [] },
  acceptanceCriteria: [],
  goals: ['Auth module'],
  nonGoals: [],
  expectedSymbols: [
    { name: 'login', kind: 'function', module: 'src/auth/login.ts' },
    { name: 'authenticate', kind: 'function', module: 'src/auth/login.ts' },
  ],
  expectedModules: [
    { path: 'src/auth/login.ts', purpose: 'Login handler' },
  ],
}

const BEHAVIOR_MD = `---
{
  "scenarios": [
    {
      "id": "s1",
      "name": "User can login",
      "given": ["User exists in database"],
      "when": ["POST /auth/login with credentials"],
      "then": ["Returns JWT token"],
      "criticality": "critical"
    },
    {
      "id": "s2",
      "name": "Token validation",
      "given": ["Valid JWT token"],
      "when": ["Call authenticate with token"],
      "then": ["Returns true"],
      "criticality": "normal"
    }
  ]
}
---

# Behavior Spec
`

const DESIGN_MD = `# Design: Auth Module

## Overview
Authentication module with login and token validation.

## Implementation
- src/auth/login.ts: Login handler with authenticate function
`

const CURRENT_DESIGN_MD = `# Current Architecture

## Constraints

- \`src/auth/login.ts\` is @stable and must not change without approval
`

const ADR_001_MD = `# ADR-001: Auth Module Architecture

## Decision

1. Must use \`src/auth/\` directory for all authentication code
2. Must export \`login\` and \`authenticate\` from \`src/auth/login.ts\`
`

const LOGIN_TS = `export async function login(user: string, pass: string): Promise<string> {
  return 'token'
}

export function authenticate(token: string): boolean {
  return true
}
`

const LOGIN_WITH_EXTRA_TS = `export async function login(user: string, pass: string): Promise<string> {
  return 'token'
}

export function authenticate(token: string): boolean {
  return true
}

export function unexpectedHelper(): void {
  // This symbol is not in the contract
}
`

const CHANGE_UNITS_INDEX = {
  version: 1,
  byFeature: {
    'test-feature': { changeDir: CHANGE_DIR },
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a full fixture project under TEMP_DIR/<subDir>. Returns projectDir. */
async function setupProject(subDir: string): Promise<string> {
  const projectDir = join(TEMP_DIR, subDir)
  await rm(projectDir, { recursive: true, force: true })

  const dirs = [
    join(projectDir, 'docs', 'changes', CHANGE_DIR),
    join(projectDir, 'docs', 'current'),
    join(projectDir, 'docs', 'decisions'),
    join(projectDir, 'src', 'auth'),
    join(projectDir, '.sisyphus'),
  ]
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true })
  }

  await writeFile(
    join(projectDir, '.sisyphus', 'change-units.json'),
    JSON.stringify(CHANGE_UNITS_INDEX, null, 2),
    'utf-8',
  )

  await writeFile(join(projectDir, 'docs', 'changes', CHANGE_DIR, 'design.md'), DESIGN_MD, 'utf-8')
  await writeFile(join(projectDir, 'docs', 'changes', CHANGE_DIR, 'design.meta.json'), JSON.stringify(DESIGN_META_JSON, null, 2), 'utf-8')
  await writeFile(join(projectDir, 'docs', 'changes', CHANGE_DIR, 'behavior.md'), BEHAVIOR_MD, 'utf-8')
  await writeFile(join(projectDir, 'docs', 'current', 'design.md'), CURRENT_DESIGN_MD, 'utf-8')
  await writeFile(join(projectDir, 'docs', 'decisions', 'ADR-001-test.md'), ADR_001_MD, 'utf-8')
  await writeFile(join(projectDir, 'src', 'auth', 'login.ts'), LOGIN_TS, 'utf-8')

  return projectDir
}

/** Build a contract that mirrors what ContractExtractor would produce. */
function makeContract(overrides?: Partial<OpenFlowContract>): OpenFlowContract {
  return {
    feature: FEATURE,
    sourceFiles: ['design.md', 'behavior.md'],
    behaviorScenarios: [
      {
        id: 's1',
        name: 'User can login',
        given: ['User exists in database'],
        when: ['POST /auth/login with credentials'],
        then: ['Returns JWT token'],
        criticality: 'critical',
      },
      {
        id: 's2',
        name: 'Token validation',
        given: ['Valid JWT token'],
        when: ['Call authenticate with token'],
        then: ['Returns true'],
        criticality: 'normal',
      },
    ],
    alignmentItems: [
      {
        behaviorId: 'design',
        designResponse: 'Login handler',
        files: ['src/auth/login.ts'],
        modules: ['src/auth/login.ts'],
        expectedSymbols: ['login', 'authenticate'],
        risk: 'low',
      },
    ],
    currentConstraints: [
      {
        source: 'current',
        file: 'docs/current/design.md',
        rule: '`src/auth/login.ts` is @stable and must not change without approval',
        severity: 'blocking',
      },
    ],
    decisionConstraints: [
      {
        source: 'decision',
        file: 'ADR-001-test.md',
        rule: '1. Must use `src/auth/` directory for all authentication code',
        severity: 'blocking',
      },
    ],
    extractedAt: '2026-05-12T00:00:00Z',
    sourceHashes: { 'design.md': 'abcd1234' },
    ...overrides,
  }
}

function makeEvent(overrides?: Partial<FileChangedEvent>): FileChangedEvent {
  return {
    type: 'file_changed',
    filePath: 'src/auth/login.ts',
    tool: 'write',
    timestamp: Date.now(),
    sessionId: SESSION_ID,
    ...overrides,
  }
}

/** Stop + reset the singleton so tests don't leak into each other. */
async function resetRuntime(): Promise<void> {
  const rt = getContractRuntime()
  if (rt.isStarted) await rt.stop()
  ContractRuntime.resetInstance()
}

// ===========================================================================
// Tests
// ===========================================================================

describe('Drift Guardian Integration', () => {

  beforeAll(async () => {
    await mkdir(TEMP_DIR, { recursive: true })
  })

  afterAll(async () => {
    await resetRuntime()
    await rm(TEMP_DIR, { recursive: true, force: true })
  })

  // -------------------------------------------------------------------------
  // 1. Full drift → pending → verify flow
  // -------------------------------------------------------------------------
  test('1 — full drift detection through runtime → consumer → pending → evidence', async () => {
    const projectDir = await setupProject('t1')
    await resetRuntime()

    const runtime = getContractRuntime()
    await runtime.start(projectDir)

    // Extract contract so registry has alignment items
    const contract = await runtime.getOrExtractContract(FEATURE)
    expect(contract).not.toBeNull()
    expect(contract!.alignmentItems.length).toBeGreaterThan(0)

    // Register the consumer
    const consumer = new GuardianConsumer(projectDir)
    runtime.consumers.register(consumer)

    // Write file with an unexpected symbol
    await writeFile(join(projectDir, 'src', 'auth', 'login.ts'), LOGIN_WITH_EXTRA_TS, 'utf-8')

    // Fire event through runtime
    await runtime.processFileChange(makeEvent({ filePath: 'src/auth/login.ts' }))

    // Consumer should have created a scoped job for this feature
    const job = consumer.getJob(FEATURE)
    expect(job).toBeDefined()
    expect(job!.pendingCount).toBeGreaterThan(0)

    // Evidence should report the ambiguity
    const evidence = await job!.getEvidence()
    expect(evidence.pendingAmbiguities).toBeGreaterThan(0)
    expect(evidence.pendingItems.some(p => p.item === 'unexpectedHelper')).toBe(true)
    expect(evidence.contractSource).toContain(FEATURE)

    await runtime.stop()
    ContractRuntime.resetInstance()
  })

  // -------------------------------------------------------------------------
  // 2. Auto-repair path: path reference update
  // -------------------------------------------------------------------------
  test('2 — auto-repair via deterministic suggestedFix', async () => {
    const projectDir = await setupProject('t2')

    // Write a file whose content we can deterministically replace
    const filePath = 'src/auth/login.ts'
    await writeFile(join(projectDir, filePath), 'export const OLD_REF = "v1"', 'utf-8')

    // Construct a deterministic repair result (simulates rename detection)
    const driftResult: DriftCheckResult = {
      item: 'OLD_REF',
      type: 'symbol',
      contractReference: 'Symbol reference in design',
      actualValue: 'OLD_REF',
      reason: 'Symbol rename detected: OLD_REF → NEW_REF',
      suggestedFix: 'OLD_REF->NEW_REF',
    }

    expect(isDeterministicRepair(driftResult)).toBe(true)

    // Execute repair
    const result = await executeRepair(driftResult, filePath, projectDir, FEATURE)
    expect(result.success).toBe(true)
    expect(result.repairRecord).toBeDefined()
    expect(result.repairRecord!.disposition).toBe('auto_repaired')
    expect(result.repairRecord!.feature).toBe(FEATURE)

    // File content should reflect the rename
    const updated = await readFile(join(projectDir, filePath), 'utf-8')
    expect(updated).toBe('export const NEW_REF = "v1"')

    // Repair log on disk
    const repairs = await readGuardianRepairs(projectDir)
    expect(repairs.length).toBeGreaterThan(0)
    expect(repairs[0]!.feature).toBe(FEATURE)
    expect(repairs[0]!.disposition).toBe('auto_repaired')
  })

  // -------------------------------------------------------------------------
  // 3. Ambiguous pending: unexpected symbols
  // -------------------------------------------------------------------------
  test('3 — ambiguous pending from unexpected symbol (not repaired)', async () => {
    const projectDir = await setupProject('t3')
    const contract = makeContract()

    // File contains a symbol not listed in expectedSymbols
    await writeFile(join(projectDir, 'src', 'auth', 'login.ts'), LOGIN_WITH_EXTRA_TS, 'utf-8')

    const job = new ScopedDriftJob(FEATURE, SESSION_ID, projectDir)
    await job.run('src/auth/login.ts', contract)

    // Should be pending, NOT repaired
    expect(job.pendingCount).toBeGreaterThan(0)
    expect(job.repairsCount).toBe(0)

    const evidence = await job.getEvidence()
    expect(evidence.pendingAmbiguities).toBeGreaterThan(0)
    expect(evidence.pendingItems.some(p => p.item === 'unexpectedHelper')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // 4. No-drift path: file matches contract exactly
  // -------------------------------------------------------------------------
  test('4 — no drift when file matches contract', async () => {
    const projectDir = await setupProject('t4')
    const contract = makeContract()

    // Write file that perfectly matches the contract
    await writeFile(join(projectDir, 'src', 'auth', 'login.ts'), LOGIN_TS, 'utf-8')

    const { disposition } = await checkDrift('src/auth/login.ts', contract, projectDir)
    expect(disposition).toBe('no_drift')

    // Running through the scoped job must not create any pending/repair records
    const job = new ScopedDriftJob(FEATURE, SESSION_ID, projectDir)
    await job.run('src/auth/login.ts', contract)

    expect(job.pendingCount).toBe(0)
    expect(job.repairsCount).toBe(0)

    const evidence = await job.getEvidence()
    expect(evidence.autoRepairs).toBe(0)
    expect(evidence.pendingAmbiguities).toBe(0)
    expect(evidence.unresolvedViolations).toBe(0)
  })

  // -------------------------------------------------------------------------
  // 5. Idle behavior: unrelated file change
  // -------------------------------------------------------------------------
  test('5 — idle when file change does not match any contract', async () => {
    const projectDir = await setupProject('t5')
    await resetRuntime()

    const runtime = getContractRuntime()
    await runtime.start(projectDir)

    // Extract so registry has a contract
    await runtime.getOrExtractContract(FEATURE)

    const consumer = new GuardianConsumer(projectDir)
    runtime.consumers.register(consumer)

    // Change an unrelated file
    await mkdir(join(projectDir, 'src', 'unrelated'), { recursive: true })
    await writeFile(join(projectDir, 'src', 'unrelated', 'file.ts'), 'export const x = 1', 'utf-8')

    await runtime.processFileChange(makeEvent({ filePath: 'src/unrelated/file.ts' }))

    // No job should have been created for our feature
    expect(consumer.getJob(FEATURE)).toBeUndefined()

    await runtime.stop()
    ContractRuntime.resetInstance()
  })

  // -------------------------------------------------------------------------
  // 6. Contract extraction produces valid contract
  // -------------------------------------------------------------------------
  test('6 — contract extractor produces valid contract with all sections', async () => {
    const projectDir = await setupProject('t6')

    const extractor = new ContractExtractor()
    const contract = await extractor.extract(FEATURE, projectDir)

    expect(contract).not.toBeNull()

    // Feature name
    expect(contract!.feature).toBe(FEATURE)

    // Behavior scenarios (from behavior.md frontmatter)
    expect(contract!.behaviorScenarios.length).toBe(2)
    expect(contract!.behaviorScenarios[0]!.id).toBe('s1')
    expect(contract!.behaviorScenarios[0]!.name).toBe('User can login')
    expect(contract!.behaviorScenarios[1]!.id).toBe('s2')

    // Alignment items (from design.meta.json)
    expect(contract!.alignmentItems.length).toBeGreaterThan(0)
    const ai = contract!.alignmentItems[0]!
    expect(ai.files).toContain('src/auth/login.ts')
    expect(ai.expectedSymbols).toContain('login')
    expect(ai.expectedSymbols).toContain('authenticate')

    // Current constraints (from docs/current/design.md)
    expect(contract!.currentConstraints.length).toBeGreaterThan(0)
    expect(contract!.currentConstraints[0]!.source).toBe('current')
    expect(contract!.currentConstraints[0]!.severity).toBe('blocking')

    // Decision constraints (from docs/decisions/ADR-001-test.md)
    expect(contract!.decisionConstraints.length).toBeGreaterThan(0)
    expect(contract!.decisionConstraints[0]!.source).toBe('decision')

    // Source hashes present
    expect(Object.keys(contract!.sourceHashes).length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // 7. ContractRuntime cache persistence
  // -------------------------------------------------------------------------
  test('7 — contract cache persists across runtime restarts', async () => {
    const projectDir = await setupProject('t7')
    await resetRuntime()

    // --- first lifecycle: extract, then stop (writes cache) ---
    const rt1 = getContractRuntime()
    await rt1.start(projectDir)
    const extracted = await rt1.getOrExtractContract(FEATURE)
    expect(extracted).not.toBeNull()
    expect(rt1.registry.get(FEATURE)).not.toBeNull()
    await rt1.stop()
    ContractRuntime.resetInstance()

    // --- second lifecycle: start (reads cache), verify present ---
    const rt2 = getContractRuntime()
    await rt2.start(projectDir)

    const cached = rt2.registry.get(FEATURE)
    expect(cached).not.toBeNull()
    expect(cached!.feature).toBe(FEATURE)
    expect(cached!.alignmentItems.length).toBeGreaterThan(0)

    // getOrExtractContract should return the cached version (no re-extraction)
    const round2 = await rt2.getOrExtractContract(FEATURE)
    expect(round2).not.toBeNull()
    expect(round2!.feature).toBe(FEATURE)

    await rt2.stop()
    ContractRuntime.resetInstance()
  })

  // -------------------------------------------------------------------------
  // 8. State persistence: pending items survive across events
  // -------------------------------------------------------------------------
  test('8 — pending items persist to disk and can be cleaned up', async () => {
    const projectDir = await setupProject('t8')

    // --- session pending items ---
    const items: GuardianPendingItem[] = [
      {
        timestamp: new Date().toISOString(),
        feature: FEATURE,
        filePath: 'src/auth/login.ts',
        item: 'rogueSymbol',
        disposition: 'ambiguous_needs_confirmation',
        reason: 'Symbol not in contract',
        suggestedFix: 'Remove rogueSymbol',
      },
    ]

    await writeSessionPending(projectDir, SESSION_ID, items)
    const loaded = await readSessionPending(projectDir, SESSION_ID)
    expect(loaded.length).toBe(1)
    expect(loaded[0]!.item).toBe('rogueSymbol')
    expect(loaded[0]!.disposition).toBe('ambiguous_needs_confirmation')

    // Delete → clean
    await deleteSessionPending(projectDir, SESSION_ID)
    expect((await readSessionPending(projectDir, SESSION_ID)).length).toBe(0)

    // --- feature state ---
    const state = {
      feature: FEATURE,
      sessionId: SESSION_ID,
      startedAt: new Date().toISOString(),
      repairsCount: 3,
      pendingCount: 1,
    }
    await writeFeatureGuardianState(projectDir, FEATURE, state)
    const loadedState = await readFeatureGuardianState(projectDir, FEATURE)
    expect(loadedState).not.toBeNull()
    expect(loadedState!.repairsCount).toBe(3)

    await deleteFeatureGuardianState(projectDir, FEATURE)
    expect(await readFeatureGuardianState(projectDir, FEATURE)).toBeNull()
  })

  // -------------------------------------------------------------------------
  // 9. Guardian evidence summary
  // -------------------------------------------------------------------------
  test('9 — evidence summary reports correct counts', async () => {
    const projectDir = await setupProject('t9')
    const contract = makeContract()

    const job = new ScopedDriftJob(FEATURE, SESSION_ID, projectDir)

    // Trigger ambiguous drift by writing file with extra symbol
    await writeFile(join(projectDir, 'src', 'auth', 'login.ts'), LOGIN_WITH_EXTRA_TS, 'utf-8')
    await job.run('src/auth/login.ts', contract)

    // Add a repair record to disk
    await appendGuardianRepair(projectDir, {
      timestamp: new Date().toISOString(),
      feature: FEATURE,
      filePath: 'src/auth/login.ts',
      disposition: 'auto_repaired',
      originalSegment: 'OLD_REF',
      repairedSegment: 'NEW_REF',
      reason: 'test auto-repair',
    })

    const evidence = await job.getEvidence()

    // Pending ambiguities from the unexpected symbol
    expect(evidence.pendingAmbiguities).toBeGreaterThan(0)
    expect(evidence.pendingItems.some(p => p.disposition === 'ambiguous_needs_confirmation')).toBe(true)

    // Repair records on disk for this feature
    expect(evidence.repairRecords.length).toBeGreaterThan(0)
    expect(evidence.repairRecords[0]!.feature).toBe(FEATURE)

    // No auto-repairs from this run (the job.run above only produced ambiguous)
    expect(evidence.autoRepairs).toBe(0)
    // No violations
    expect(evidence.unresolvedViolations).toBe(0)

    expect(evidence.contractSource).toContain(FEATURE)
  })

  // -------------------------------------------------------------------------
  // 10. Full pipeline: extract → monitor → detect → repair → evidence → cleanup
  // -------------------------------------------------------------------------
  test('10 — full pipeline: extract → monitor → detect → repair → evidence → cleanup', async () => {
    const projectDir = await setupProject('t10')
    await resetRuntime()

    // ---- Extract ----
    const runtime = getContractRuntime()
    await runtime.start(projectDir)
    const contract = await runtime.getOrExtractContract(FEATURE)
    expect(contract).not.toBeNull()

    // ---- Monitor (register consumer) ----
    const consumer = new GuardianConsumer(projectDir)
    runtime.consumers.register(consumer)

    // ---- Detect (auto-repairable change) ----
    // Write file with replaceable content and execute repair directly
    const loginPath = 'src/auth/login.ts'
    await writeFile(join(projectDir, loginPath), 'export const API_VER = "v1"', 'utf-8')

    const repairResult: DriftCheckResult = {
      item: 'API_VER',
      type: 'symbol',
      contractReference: 'Symbol reference',
      actualValue: 'API_VER',
      reason: 'Symbol rename detected',
      suggestedFix: 'API_VER->API_V2',
    }

    const repair = await executeRepair(repairResult, loginPath, projectDir, FEATURE)
    expect(repair.success).toBe(true)

    // Verify repair log
    const repairs = await readGuardianRepairs(projectDir)
    expect(repairs.length).toBeGreaterThan(0)
    expect(repairs[0]!.disposition).toBe('auto_repaired')

    // ---- Detect (ambiguous change) ----
    await writeFile(join(projectDir, loginPath), LOGIN_WITH_EXTRA_TS, 'utf-8')

    // Get or create the scoped job and run manually
    const job = new ScopedDriftJob(FEATURE, SESSION_ID, projectDir)
    await job.run(loginPath, contract!)

    // Verify pending items from ambiguous drift
    expect(job.pendingCount).toBeGreaterThan(0)

    // ---- Evidence ----
    const evidence = await job.getEvidence()
    expect(evidence.pendingItems.length).toBeGreaterThan(0)
    expect(evidence.repairRecords.length).toBeGreaterThan(0)
    expect(evidence.pendingAmbiguities).toBeGreaterThan(0)

    // ---- Persist state ----
    await job.flushPending()
    await writeFeatureGuardianState(projectDir, FEATURE, job.getState())

    const persisted = await readFeatureGuardianState(projectDir, FEATURE)
    expect(persisted).not.toBeNull()
    expect(persisted!.feature).toBe(FEATURE)
    expect(persisted!.pendingCount).toBeGreaterThan(0)

    // ---- Cleanup (archive) ----
    await deleteFeatureGuardianState(projectDir, FEATURE)
    await deleteSessionPending(projectDir, SESSION_ID)

    expect(await readFeatureGuardianState(projectDir, FEATURE)).toBeNull()

    await runtime.stop()
    ContractRuntime.resetInstance()
  })
})
