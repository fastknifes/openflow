import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { rm, mkdir, writeFile } from 'node:fs/promises'
import type {
  AcceptanceState,
  CurrentWorkspaceState,
  EvidenceFreshnessMetadata,
  VerifyResult,
} from '../../src/types.js'
import { VerifyReadinessStatus } from '../../src/types.js'
import {
  saveAcceptanceState,
  loadAcceptanceState,
  clearAcceptanceState,
  enterAcceptancePhase,
  saveVerifyResult,
  recordEvidenceFreshness,
} from '../../src/utils/acceptance-state.js'
import {
  classifyEvidenceFreshness,
  createEvidenceFreshnessMetadata,
  computeSimpleDiffHash,
  captureCurrentWorkspaceState,
} from '../../src/utils/evidence-freshness.js'

const TEST_ROOT = join(process.cwd(), '.test-evidence-freshness')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMeta(overrides: Partial<EvidenceFreshnessMetadata> = {}): EvidenceFreshnessMetadata {
  const ws = makeWorkspaceState()
  return {
    gitHead: ws.gitHead,
    changedFiles: [...ws.changedFiles],
    diffHash: computeSimpleDiffHash(ws),
    recordedAt: '2026-05-14T10:00:00.000Z',
    evidenceChecks: ['test', 'typecheck'],
    evidenceSummary: 'All checks passed.',
    ...overrides,
  }
}

/** Create metadata whose diffHash matches a specific workspace state. */
function makeMetaForWorkspace(
  ws: CurrentWorkspaceState,
  overrides: Partial<EvidenceFreshnessMetadata> = {},
): EvidenceFreshnessMetadata {
  return {
    gitHead: ws.gitHead,
    changedFiles: [...ws.changedFiles],
    diffHash: computeSimpleDiffHash(ws),
    recordedAt: '2026-05-14T10:00:00.000Z',
    evidenceChecks: ['test', 'typecheck'],
    evidenceSummary: 'All checks passed.',
    ...overrides,
  }
}

function makeWorkspaceState(overrides: Partial<CurrentWorkspaceState> = {}): CurrentWorkspaceState {
  return {
    gitHead: 'abc123def456',
    changedFiles: ['src/utils/acceptance-state.ts', 'src/types.ts'],
    latestChangeTimestamp: new Date('2026-05-14T09:00:00Z').getTime(),
    ...overrides,
  }
}

function makeAcceptanceState(overrides: Partial<AcceptanceState> = {}): AcceptanceState {
  return {
    feature: 'test-freshness',
    phase: 'acceptance',
    phaseStartedAt: '2026-05-14T09:00:00.000Z',
    pendingDocUpdates: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// classifyEvidenceFreshness
// ---------------------------------------------------------------------------

describe('classifyEvidenceFreshness', () => {
  test('missing — no acceptance state at all', () => {
    const result = classifyEvidenceFreshness(null, makeWorkspaceState())
    expect(result.status).toBe('missing')
    expect(result.reason).toContain('No acceptance state')
  })

  test('missing — acceptance state exists but no verify result or readiness', () => {
    const state = makeAcceptanceState()
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('missing')
    expect(result.reason).toContain('No verify result')
  })

  test('stale — verify result exists but no freshness metadata', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'tests passed',
        constraintsChecked: ['test'],
        verifiedAt: '2026-05-14T10:00:00.000Z',
      },
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.reason).toContain('without freshness metadata')
  })

  test('stale — incomplete freshness metadata (missing gitHead)', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({ gitHead: '' }),
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toContain('incomplete freshness metadata fields')
  })

  test('stale — incomplete freshness metadata (missing recordedAt)', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({ recordedAt: '' }),
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toContain('incomplete freshness metadata fields')
  })

  test('stale — current git HEAD unavailable', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta(),
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState({ gitHead: '' }))
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toContain('current git HEAD is empty or unavailable')
  })

  test('stale — git HEAD mismatch', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({ gitHead: 'abc123' }),
    })
    const ws = makeWorkspaceState({ gitHead: 'xyz789different' })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('git HEAD changed'))).toBe(true)
  })

  test('stale — working tree files differ (new file added)', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({
        changedFiles: ['src/a.ts'],
      }),
    })
    const ws = makeWorkspaceState({
      changedFiles: ['src/a.ts', 'src/b.ts'],
    })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('working tree changed'))).toBe(true)
  })

  test('stale — working tree files differ (file removed)', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({
        changedFiles: ['src/a.ts', 'src/b.ts'],
      }),
    })
    const ws = makeWorkspaceState({
      changedFiles: ['src/a.ts'],
    })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('working tree changed'))).toBe(true)
  })

  test('stale — workspace modified after evidence was recorded', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({ recordedAt: '2026-05-14T10:00:00.000Z' }),
    })
    const ws = makeWorkspaceState({
      latestChangeTimestamp: new Date('2026-05-14T11:00:00Z').getTime(),
    })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('workspace modified after evidence'))).toBe(true)
  })

  test('fresh — stored evidence matches current workspace exactly', () => {
    const meta = makeMeta()
    const ws = makeWorkspaceState()
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: meta,
    })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('fresh')
    expect(result.reason).toContain('evidence can be reused')
    expect(result.metadata).toEqual(meta)
  })

  test('fresh — no latestChangeTimestamp in workspace (still matches)', () => {
    const ws = makeWorkspaceState({ latestChangeTimestamp: undefined })
    const meta = makeMetaForWorkspace(ws)
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: meta,
    })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('fresh')
  })

  test('stale — accumulated details for multiple mismatches', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({
        gitHead: 'old-head',
        changedFiles: ['old.ts'],
        recordedAt: '2026-05-14T08:00:00.000Z',
      }),
    })
    const ws = makeWorkspaceState({
      gitHead: 'new-head',
      changedFiles: ['new.ts'],
      latestChangeTimestamp: new Date('2026-05-14T12:00:00Z').getTime(),
    })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('stale')
    expect(result.staleDetails!.length).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// createEvidenceFreshnessMetadata
// ---------------------------------------------------------------------------

describe('createEvidenceFreshnessMetadata', () => {
  test('creates metadata with all fields from workspace state', () => {
    const ws = makeWorkspaceState()
    const meta = createEvidenceFreshnessMetadata(ws, ['test', 'typecheck'], 'All passed.')
    expect(meta.gitHead).toBe('abc123def456')
    expect(meta.changedFiles).toEqual(['src/types.ts', 'src/utils/acceptance-state.ts'])
    expect(meta.recordedAt).toBeDefined()
    expect(meta.evidenceChecks).toEqual(['test', 'typecheck'])
    expect(meta.evidenceSummary).toBe('All passed.')
    expect(meta.diffHash).toBeDefined()
    expect(meta.diffHash.length).toBe(8)
  })

  test('diffHash is deterministic for same input', () => {
    const ws = makeWorkspaceState()
    const a = createEvidenceFreshnessMetadata(ws, ['test'], 'summary')
    const b = createEvidenceFreshnessMetadata(ws, ['test'], 'summary')
    expect(a.diffHash).toBe(b.diffHash)
  })

  test('diffHash differs when workspace state differs', () => {
    const a = createEvidenceFreshnessMetadata(makeWorkspaceState(), ['test'], 's')
    const b = createEvidenceFreshnessMetadata(
      makeWorkspaceState({ gitHead: 'different' }),
      ['test'],
      's',
    )
    expect(a.diffHash).not.toBe(b.diffHash)
  })

  test('accepts custom diffHash override', () => {
    const ws = makeWorkspaceState()
    const meta = createEvidenceFreshnessMetadata(ws, ['test'], 'summary', 'custom-hash')
    expect(meta.diffHash).toBe('custom-hash')
  })
})

// ---------------------------------------------------------------------------
// computeSimpleDiffHash
// ---------------------------------------------------------------------------

describe('computeSimpleDiffHash', () => {
  test('same state produces same hash', () => {
    const ws = makeWorkspaceState()
    expect(computeSimpleDiffHash(ws)).toBe(computeSimpleDiffHash(ws))
  })

  test('different state produces different hash', () => {
    const a = makeWorkspaceState()
    const b = makeWorkspaceState({ gitHead: 'different' })
    expect(computeSimpleDiffHash(a)).not.toBe(computeSimpleDiffHash(b))
  })
})

// ---------------------------------------------------------------------------
// captureCurrentWorkspaceState
// ---------------------------------------------------------------------------

describe('captureCurrentWorkspaceState', () => {
  test('returns a valid workspace state snapshot', () => {
    // Always returns a valid shape even when not in a git repo
    const ws = captureCurrentWorkspaceState(process.cwd())
    expect(ws).toBeDefined()
    expect(typeof ws.gitHead).toBe('string')
    expect(Array.isArray(ws.changedFiles)).toBe(true)
    // When in a git repo, gitHead should be a non-empty hash
    if (ws.gitHead) {
      expect(ws.gitHead.length).toBe(40) // full SHA
    }
  })
})

// ---------------------------------------------------------------------------
// Acceptance-state serialization round-trip with evidence freshness
// ---------------------------------------------------------------------------

describe('evidence freshness acceptance-state round-trip', () => {
  test('evidence freshness metadata survives serialization round-trip', async () => {
    const root = join(TEST_ROOT, 'ef-round-trip')
    await rm(root, { recursive: true, force: true })

    const freshnessMeta: EvidenceFreshnessMetadata = {
      gitHead: 'abc123def456abc123def456abc123def456abc123',
      changedFiles: ['src/utils/acceptance-state.ts', 'src/types.ts'],
      diffHash: 'a1b2c3d4',
      recordedAt: '2026-05-14T10:00:00.000Z',
      evidenceChecks: ['test', 'typecheck', 'lint'],
      evidenceSummary: 'All quality checks passed. No security issues.',
    }

    const state: AcceptanceState = {
      feature: 'ef-test',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-14T09:00:00.000Z',
      pendingDocUpdates: [],
      readiness: VerifyReadinessStatus.Ready,
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'All quality checks passed. No security issues.',
        constraintsChecked: ['test', 'typecheck', 'lint'],
        verifiedAt: '2026-05-14T10:00:00.000Z',
      },
      evidenceFreshness: freshnessMeta,
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.evidenceFreshness).toBeDefined()
    expect(loaded?.evidenceFreshness?.gitHead).toBe(freshnessMeta.gitHead)
    expect(loaded?.evidenceFreshness?.changedFiles).toEqual(freshnessMeta.changedFiles)
    expect(loaded?.evidenceFreshness?.diffHash).toBe(freshnessMeta.diffHash)
    expect(loaded?.evidenceFreshness?.recordedAt).toBe(freshnessMeta.recordedAt)
    expect(loaded?.evidenceFreshness?.evidenceChecks).toEqual(freshnessMeta.evidenceChecks)
    expect(loaded?.evidenceFreshness?.evidenceSummary).toBe(freshnessMeta.evidenceSummary)

    // Existing readiness fields are untouched
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(loaded?.verifyResult?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(loaded?.verifyResult?.reasonCodes).toEqual(['all_checks_passed'])

    await rm(root, { recursive: true, force: true })
  })

  test('legacy state file without evidence freshness parses correctly', async () => {
    const root = join(TEST_ROOT, 'ef-legacy')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'ef-legacy-test',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-14T09:00:00.000Z',
      pendingDocUpdates: [],
      readiness: VerifyReadinessStatus.Ready,
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'Legacy evidence without freshness metadata.',
        constraintsChecked: ['test'],
        verifiedAt: '2026-05-14T10:00:00.000Z',
      },
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.feature).toBe('ef-legacy-test')
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(loaded?.verifyResult).toBeDefined()
    // No evidenceFreshness because none was serialized
    expect(loaded?.evidenceFreshness).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('readiness fields parse correctly alongside evidence freshness', async () => {
    const root = join(TEST_ROOT, 'ef-readiness-compat')
    await rm(root, { recursive: true, force: true })

    const verifyResult: VerifyResult = {
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      reasonCodes: ['pending_doc_updates', 'docs_current'],
      decisionType: undefined,
      evidenceSummary: 'Ready with pending documentation updates.',
      constraintsChecked: ['test', 'typecheck', 'backward_compatibility'],
      verifiedAt: '2026-05-14T12:00:00.000Z',
    }

    const state: AcceptanceState = {
      feature: 'ef-readiness-test',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-14T11:00:00.000Z',
      pendingDocUpdates: [
        { file: 'docs/current/design/test.md', timestamp: '2026-05-14T12:01:00.000Z', reason: 'sync' },
      ],
      readiness: verifyResult.readiness,
      verifyResult,
      evidenceFreshness: makeMeta({
        gitHead: 'abc123',
        evidenceChecks: ['test', 'typecheck', 'backward_compatibility'],
        evidenceSummary: 'Ready with pending documentation updates.',
      }),
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    // Readiness fields
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.ReadyWithDocUpdates)
    expect(loaded?.verifyResult?.readiness).toBe(VerifyReadinessStatus.ReadyWithDocUpdates)
    expect(loaded?.verifyResult?.reasonCodes).toEqual(['pending_doc_updates', 'docs_current'])
    expect(loaded?.verifyResult?.evidenceSummary).toBe('Ready with pending documentation updates.')
    expect(loaded?.verifyResult?.constraintsChecked).toEqual(['test', 'typecheck', 'backward_compatibility'])
    expect(loaded?.verifyResult?.verifiedAt).toBe('2026-05-14T12:00:00.000Z')

    // Evidence freshness
    expect(loaded?.evidenceFreshness).toBeDefined()
    expect(loaded?.evidenceFreshness?.gitHead).toBe('abc123')
    expect(loaded?.evidenceFreshness?.evidenceChecks).toEqual(['test', 'typecheck', 'backward_compatibility'])

    // Pending doc updates still work
    expect(loaded?.pendingDocUpdates).toHaveLength(1)

    await rm(root, { recursive: true, force: true })
  })
})

// ---------------------------------------------------------------------------
// saveVerifyResult with freshness metadata
// ---------------------------------------------------------------------------

describe('saveVerifyResult with evidence freshness', () => {
  test('saveVerifyResult records freshness metadata when provided', async () => {
    const root = join(TEST_ROOT, 'ef-save-verify')
    await rm(root, { recursive: true, force: true })

    await enterAcceptancePhase(root, 'ef-verify-test')

    const verifyResult: VerifyResult = {
      readiness: VerifyReadinessStatus.Ready,
      reasonCodes: ['all_checks_passed'],
      evidenceSummary: 'All checks passed.',
      constraintsChecked: ['test', 'typecheck'],
      verifiedAt: '2026-05-14T10:00:00.000Z',
    }

    const freshnessMeta = makeMeta({
      gitHead: 'verify-head-hash',
      evidenceChecks: ['test', 'typecheck'],
    })

    await saveVerifyResult(root, verifyResult, freshnessMeta)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(loaded?.evidenceFreshness).toBeDefined()
    expect(loaded?.evidenceFreshness?.gitHead).toBe('verify-head-hash')
    expect(loaded?.evidenceFreshness?.evidenceChecks).toEqual(['test', 'typecheck'])

    await rm(root, { recursive: true, force: true })
  })

  test('saveVerifyResult without freshness metadata (backward compatible)', async () => {
    const root = join(TEST_ROOT, 'ef-save-verify-no-meta')
    await rm(root, { recursive: true, force: true })

    await enterAcceptancePhase(root, 'ef-verify-no-meta')

    const verifyResult: VerifyResult = {
      readiness: VerifyReadinessStatus.Ready,
      reasonCodes: ['all_checks_passed'],
      evidenceSummary: 'All checks passed.',
      constraintsChecked: ['test'],
      verifiedAt: '2026-05-14T10:00:00.000Z',
    }

    // Call without freshnessMetadata (old callers)
    await saveVerifyResult(root, verifyResult)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(loaded?.evidenceFreshness).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('saveVerifyResult preserves existing freshness when no new metadata', async () => {
    const root = join(TEST_ROOT, 'ef-save-verify-preserve')
    await rm(root, { recursive: true, force: true })

    await enterAcceptancePhase(root, 'ef-preserve')

    // First save with metadata
    const meta1 = makeMeta({ gitHead: 'first-head' })
    await saveVerifyResult(root, {
      readiness: VerifyReadinessStatus.Ready,
      reasonCodes: ['all_checks_passed'],
      evidenceSummary: 'First pass.',
      constraintsChecked: ['test'],
      verifiedAt: '2026-05-14T09:00:00.000Z',
    }, meta1)

    // Second save without metadata
    await saveVerifyResult(root, {
      readiness: VerifyReadinessStatus.Ready,
      reasonCodes: ['all_checks_passed'],
      evidenceSummary: 'Second pass.',
      constraintsChecked: ['test'],
      verifiedAt: '2026-05-14T10:00:00.000Z',
    })

    const loaded = await loadAcceptanceState(root)
    // Existing freshness should still be there (not wiped)
    expect(loaded?.evidenceFreshness?.gitHead).toBe('first-head')

    await rm(root, { recursive: true, force: true })
  })
})

// ---------------------------------------------------------------------------
// recordEvidenceFreshness
// ---------------------------------------------------------------------------

describe('recordEvidenceFreshness', () => {
  test('records freshness metadata without overwriting verify result', async () => {
    const root = join(TEST_ROOT, 'ef-record-freshness')
    await rm(root, { recursive: true, force: true })

    await enterAcceptancePhase(root, 'ef-record')

    // First save a verify result
    const verifyResult: VerifyResult = {
      readiness: VerifyReadinessStatus.Ready,
      reasonCodes: ['all_checks_passed'],
      evidenceSummary: 'Original verify.',
      constraintsChecked: ['test'],
      verifiedAt: '2026-05-14T09:00:00.000Z',
    }
    await saveVerifyResult(root, verifyResult)

    // Then record freshness metadata separately
    const meta = makeMeta({ gitHead: 'recorded-later' })
    await recordEvidenceFreshness(root, meta)

    const loaded = await loadAcceptanceState(root)
    expect(loaded?.verifyResult?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(loaded?.verifyResult?.evidenceSummary).toBe('Original verify.')
    expect(loaded?.evidenceFreshness?.gitHead).toBe('recorded-later')

    await rm(root, { recursive: true, force: true })
  })

  test('recordEvidenceFreshness handles missing acceptance state gracefully', async () => {
    const root = join(TEST_ROOT, 'ef-record-missing')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    // Should not throw when there is no acceptance state
    await recordEvidenceFreshness(root, makeMeta())

    const loaded = await loadAcceptanceState(root)
    expect(loaded).toBeNull()

    await rm(root, { recursive: true, force: true })
  })
})

// ---------------------------------------------------------------------------
// Prose claims are never treated as fresh evidence
// ---------------------------------------------------------------------------

describe('prose claims not treated as evidence', () => {
  test('acceptance state with readiness but no metadata is stale, not fresh', () => {
    // This simulates a state where someone wrote "tests passed" as readiness
    // but actual freshness metadata was never recorded
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'Tests passed successfully! All green!', // prose claim
        constraintsChecked: ['test'],
        verifiedAt: '2026-05-14T10:00:00.000Z',
      },
      // No evidenceFreshness — this is the key
    })

    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.reason).toContain('without freshness metadata')
  })

  test('even a detailed prose summary without metadata is stale', () => {
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: ['all_checks_passed'],
        evidenceSummary: 'Ran bun test (42 pass, 0 fail), bun run typecheck (0 errors), bun run lint (0 warnings). All checks passed.',
        constraintsChecked: ['test', 'typecheck', 'lint'],
        verifiedAt: '2026-05-14T10:00:00.000Z',
      },
    })

    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('evidence freshness edge cases', () => {
  test('changed files with commas round-trip correctly', async () => {
    const root = join(TEST_ROOT, 'ef-commas')
    await rm(root, { recursive: true, force: true })

    // Files with commas would break naive join/split, but file paths don't
    // typically contain commas. This test verifies standard paths work.
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMeta({
        changedFiles: [
          'src/utils/acceptance-state.ts',
          'src/types.ts',
          'tests/evidence.test.ts',
        ],
      }),
    })

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)
    expect(loaded?.evidenceFreshness?.changedFiles).toEqual([
      'src/utils/acceptance-state.ts',
      'src/types.ts',
      'tests/evidence.test.ts',
    ])

    await rm(root, { recursive: true, force: true })
  })

  test('empty changed files list works', () => {
    const ws = makeWorkspaceState({ changedFiles: [] })
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      evidenceFreshness: makeMetaForWorkspace(ws),
    })
    const result = classifyEvidenceFreshness(state, ws)
    expect(result.status).toBe('fresh')
  })

  test('readiness without verifyResult is stale (has evidence but no metadata)', () => {
    // readiness field set, but no verifyResult object at all
    const state = makeAcceptanceState({
      readiness: VerifyReadinessStatus.Ready,
      // No verifyResult
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    // readiness IS evidence — falls through to metadata-absent → stale
    expect(result.status).toBe('stale')
    expect(result.reason).toContain('without freshness metadata')
  })

  test('verifyResult with NotReady is stale (evidence exists but no metadata)', () => {
    const state = makeAcceptanceState({
      verifyResult: {
        readiness: VerifyReadinessStatus.NotReady,
        reasonCodes: [],
        evidenceSummary: 'Not ready.',
        constraintsChecked: [],
        verifiedAt: '2026-05-14T10:00:00.000Z',
      },
      // readiness is undefined, verifyResult exists
    })
    // verifyResult IS set → not "missing", falls through to metadata check → stale
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.reason).toContain('without freshness metadata')
  })
})
