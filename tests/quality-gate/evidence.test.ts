import { describe, expect, test } from 'bun:test'
import {
  classifyEvidenceFreshness,
  createEvidenceFreshnessMetadata,
  computeSimpleDiffHash,
} from '../../src/utils/evidence-freshness.js'
import type {
  AcceptanceState,
  CurrentWorkspaceState,
  EvidenceFreshnessMetadata,
} from '../../src/types.js'
import { VerifyReadinessStatus } from '../../src/types.js'

/** Minimal valid AcceptanceState with verify evidence */
function mkState(overrides: Partial<AcceptanceState> = {}): AcceptanceState {
  return {
    feature: 'test-feature',
    phase: 'acceptance',
    phaseStartedAt: '2026-05-14T00:00:00.000Z',
    pendingDocUpdates: [],
    readiness: VerifyReadinessStatus.Ready,
    verifyResult: {
      readiness: VerifyReadinessStatus.Ready,
      reasonCodes: ['all_checks_passed'],
      evidenceSummary: 'All checks passed.',
      constraintsChecked: ['typecheck', 'test'],
      verifiedAt: '2026-05-14T10:00:00.000Z',
    },
    ...overrides,
  }
}

const HEAD_A = 'abc123def456789012345678901234567890abcd'
const HEAD_B = 'fed987654321098765432109876543210abcdef0'

/** Minimal CurrentWorkspaceState for tests */
function mkCurrent(overrides: Partial<CurrentWorkspaceState> = {}): CurrentWorkspaceState {
  return {
    gitHead: HEAD_A,
    changedFiles: ['src/utils/helper.ts'],
    ...overrides,
  }
}

/** Create metadata matching a given current state */
function matchingMetadata(
  state: CurrentWorkspaceState,
  overrides: Partial<EvidenceFreshnessMetadata> = {},
): EvidenceFreshnessMetadata {
  return {
    gitHead: state.gitHead,
    changedFiles: [...state.changedFiles].sort(),
    diffHash: computeSimpleDiffHash(state),
    recordedAt: '2026-05-14T10:00:00.000Z',
    evidenceChecks: ['typecheck', 'test'],
    evidenceSummary: 'All checks passed.',
    ...overrides,
  }
}

// ── classifyEvidenceFreshness ──────────────────────────────────────────────

describe('classifyEvidenceFreshness', () => {
  // -- fresh ----------------------------------------------------------------

  test('evidence is fresh when git HEAD and changed files match', () => {
    const current = mkCurrent()
    const metadata = matchingMetadata(current)
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('fresh')
    expect(result.metadata).toBeDefined()
    expect(result.reason).toContain('reuse')
  })

  test('evidence is fresh with empty changed files', () => {
    const current = mkCurrent({ changedFiles: [] })
    const metadata = matchingMetadata(current)
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('fresh')
  })

  test('evidence is fresh with multiple changed files', () => {
    const current = mkCurrent({ changedFiles: ['a.ts', 'b.ts', 'c.ts'] })
    const metadata = matchingMetadata(current)
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('fresh')
  })

  // -- stale: no metadata ---------------------------------------------------

  test('evidence is stale when verify result exists but no freshness metadata', () => {
    const current = mkCurrent()
    const state = mkState() // has verifyResult but no evidenceFreshness

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.reason).toContain('without freshness metadata')
    expect(result.staleDetails).toContain('no freshness metadata attached to acceptance state')
  })

  // -- stale: git HEAD changed ----------------------------------------------

  test('evidence is stale when git HEAD changed', () => {
    const current = mkCurrent({ gitHead: HEAD_B })
    const metadata = matchingMetadata(mkCurrent({ gitHead: HEAD_A })) // stored with HEAD_A
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails).toBeDefined()
    expect(result.staleDetails!.some(d => d.includes('git HEAD changed'))).toBe(true)
  })

  // -- stale: changed files differ ------------------------------------------

  test('evidence is stale when changed files differ', () => {
    const stored = mkCurrent({ changedFiles: ['old.ts'] })
    const current = mkCurrent({ changedFiles: ['new.ts'] })
    const metadata = matchingMetadata(stored)
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('working tree changed'))).toBe(true)
  })

  test('evidence is stale when new files are added', () => {
    const stored = mkCurrent({ changedFiles: ['a.ts'] })
    const current = mkCurrent({ changedFiles: ['a.ts', 'b.ts'] })
    const metadata = matchingMetadata(stored)
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('working tree changed'))).toBe(true)
    expect(result.staleDetails!.some(d => d.includes('1 new'))).toBe(true)
  })

  test('evidence is stale when files were removed from changed set', () => {
    const stored = mkCurrent({ changedFiles: ['a.ts', 'b.ts'] })
    const current = mkCurrent({ changedFiles: ['a.ts'] })
    const metadata = matchingMetadata(stored)
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('working tree changed'))).toBe(true)
    expect(result.staleDetails!.some(d => d.includes('1 absent'))).toBe(true)
  })

  // -- stale: diff hash mismatch ------------------------------------------

  test('evidence is stale when diff hash differs despite same HEAD and files', () => {
    // Same git HEAD, same changed files — but the workspace identity changed
    // (e.g. timestamp drift or a different latestChangeTimestamp)
    const stored: CurrentWorkspaceState = {
      gitHead: HEAD_A,
      changedFiles: ['a.ts', 'b.ts'],
    }
    const current: CurrentWorkspaceState = {
      gitHead: HEAD_A,
      changedFiles: ['a.ts', 'b.ts'],
      latestChangeTimestamp: new Date('2026-05-14T11:00:00.000Z').getTime(),
    }
    const metadata = matchingMetadata(stored, {
      recordedAt: '2026-05-14T10:00:00.000Z',
    })
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('diff hash mismatch'))).toBe(true)
  })

  // -- stale: workspace modified after evidence -----------------------------

  test('evidence is stale when workspace has newer changes', () => {
    const current = mkCurrent({
      gitHead: HEAD_A,
      changedFiles: ['src/utils/helper.ts'],
      latestChangeTimestamp: new Date('2026-05-14T11:00:00.000Z').getTime(),
    })
    const metadata = matchingMetadata(current, {
      recordedAt: '2026-05-14T10:00:00.000Z', // older than latestChangeTimestamp
    })
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails!.some(d => d.includes('workspace modified after evidence'))).toBe(true)
  })

  // -- stale: incomplete metadata -------------------------------------------

  test('evidence is stale when freshness metadata is missing gitHead', () => {
    const current = mkCurrent()
    const metadata: EvidenceFreshnessMetadata = {
      gitHead: '',
      changedFiles: ['a.ts'],
      diffHash: 'abc',
      recordedAt: '2026-05-14T10:00:00.000Z',
      evidenceChecks: ['test'],
      evidenceSummary: '...',
    }
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.reason).toContain('incomplete')
  })

  test('evidence is stale when freshness metadata is missing recordedAt', () => {
    const current = mkCurrent()
    const metadata: EvidenceFreshnessMetadata = {
      gitHead: HEAD_A,
      changedFiles: ['a.ts'],
      diffHash: 'abc',
      recordedAt: '',
      evidenceChecks: ['test'],
      evidenceSummary: '...',
    }
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.reason).toContain('incomplete')
  })

  // -- stale: current state unavailable -------------------------------------

  test('evidence is stale when current git HEAD is unavailable', () => {
    const current = mkCurrent({ gitHead: '' })
    const metadata = matchingMetadata(mkCurrent({ gitHead: HEAD_A }))
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails).toContain('current git HEAD is empty or unavailable')
  })

  // -- missing: no acceptance state -----------------------------------------

  test('evidence is missing when acceptance state is null', () => {
    const current = mkCurrent()

    const result = classifyEvidenceFreshness(null, current)

    expect(result.status).toBe('missing')
    expect(result.reason).toContain('never been recorded')
    expect(result.metadata).toBeUndefined()
  })

  // -- missing: no verify result --------------------------------------------

  test('evidence is missing when no readiness or verify result exists', () => {
    const current = mkCurrent()
    const state = mkState({
      readiness: undefined,
      verifyResult: undefined,
    })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('missing')
    expect(result.reason).toContain('No verify result')
  })

  // -- natural language is not evidence -------------------------------------

  test('state with only readiness but no verifyResult is not fresh', () => {
    // Natural-language claim like "tests passed" in readiness but no verifyResult
    const current = mkCurrent()
    const state = mkState({
      verifyResult: undefined, // no structured verify result
      readiness: VerifyReadinessStatus.Ready, // only a text claim
    })

    const result = classifyEvidenceFreshness(state, current)

    // Has readiness but no verifyResult and no freshness metadata → stale
    expect(result.status).toBe('stale')
  })

  // -- multiple stale reasons -----------------------------------------------

  test('multiple staleness reasons are all reported', () => {
    const storedCurrent = mkCurrent({ gitHead: HEAD_A, changedFiles: ['old.ts'] })
    const current: CurrentWorkspaceState = {
      gitHead: HEAD_B,
      changedFiles: ['new.ts'],
      latestChangeTimestamp: new Date('2026-05-14T11:00:00.000Z').getTime(),
    }
    const metadata = matchingMetadata(storedCurrent, {
      recordedAt: '2026-05-14T10:00:00.000Z',
    })
    const state = mkState({ evidenceFreshness: metadata })

    const result = classifyEvidenceFreshness(state, current)

    expect(result.status).toBe('stale')
    expect(result.staleDetails!.length).toBeGreaterThanOrEqual(2)
  })
})

// ── createEvidenceFreshnessMetadata ────────────────────────────────────────

describe('createEvidenceFreshnessMetadata', () => {
  test('creates metadata from current workspace state', () => {
    const current = mkCurrent()

    const meta = createEvidenceFreshnessMetadata(
      current,
      ['typecheck', 'test'],
      'All checks passed.',
    )

    expect(meta.gitHead).toBe(current.gitHead)
    expect(meta.changedFiles).toEqual([...current.changedFiles].sort())
    expect(meta.diffHash).toBeTruthy()
    expect(meta.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(meta.evidenceChecks).toEqual(['typecheck', 'test'])
    expect(meta.evidenceSummary).toBe('All checks passed.')
  })

  test('accepts explicit diffHash override', () => {
    const current = mkCurrent()

    const meta = createEvidenceFreshnessMetadata(
      current,
      ['test'],
      'summary',
      'custom-hash',
    )

    expect(meta.diffHash).toBe('custom-hash')
  })

  test('sorts changed files for deterministic output', () => {
    const current = mkCurrent({ changedFiles: ['c.ts', 'a.ts', 'b.ts'] })

    const meta = createEvidenceFreshnessMetadata(current, [], '')

    expect(meta.changedFiles).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })
})

// ── computeSimpleDiffHash ──────────────────────────────────────────────────

describe('computeSimpleDiffHash', () => {
  test('same state produces same hash', () => {
    const state = mkCurrent()
    expect(computeSimpleDiffHash(state)).toBe(computeSimpleDiffHash(state))
  })

  test('different git HEAD produces different hash', () => {
    const a = mkCurrent({ gitHead: HEAD_A })
    const b = mkCurrent({ gitHead: HEAD_B })
    expect(computeSimpleDiffHash(a)).not.toBe(computeSimpleDiffHash(b))
  })

  test('different changed files produce different hash', () => {
    const a = mkCurrent({ changedFiles: ['a.ts'] })
    const b = mkCurrent({ changedFiles: ['b.ts'] })
    expect(computeSimpleDiffHash(a)).not.toBe(computeSimpleDiffHash(b))
  })

  test('sorted changed files produce consistent hash', () => {
    const a: CurrentWorkspaceState = { gitHead: HEAD_A, changedFiles: ['b.ts', 'a.ts'] }
    const b: CurrentWorkspaceState = { gitHead: HEAD_A, changedFiles: ['a.ts', 'b.ts'] }
    expect(computeSimpleDiffHash(a)).toBe(computeSimpleDiffHash(b))
  })

  test('handles undefined latestChangeTimestamp', () => {
    const state: CurrentWorkspaceState = { gitHead: HEAD_A, changedFiles: [] }
    expect(() => computeSimpleDiffHash(state)).not.toThrow()
  })
})
