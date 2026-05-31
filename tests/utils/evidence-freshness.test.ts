import { test, expect, describe } from 'bun:test'
import {
  classifyEvidenceFreshness,
  createEvidenceFreshnessMetadata,
  computeSimpleDiffHash,
  classifyScenarioEvidenceFreshness,
  parseScenarioEvidenceMetadata,
} from '../../src/utils/evidence-freshness.js'
import type { ScenarioEvidenceFreshnessInput } from '../../src/utils/evidence-freshness.js'
import type {
  AcceptanceState,
  CurrentWorkspaceState,
  EvidenceFreshnessMetadata,
} from '../../src/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAcceptanceState(overrides: Partial<AcceptanceState> = {}): AcceptanceState {
  return {
    feature: 'test-feature',
    phase: 'verification_pending',
    phaseStartedAt: '2026-01-01T00:00:00.000Z',
    pendingDocUpdates: [],
    ...overrides,
  }
}

function makeWorkspaceState(overrides: Partial<CurrentWorkspaceState> = {}): CurrentWorkspaceState {
  return {
    gitHead: 'abc123def456',
    changedFiles: [],
    ...overrides,
  }
}

function makeFreshnessMetadata(overrides: Partial<EvidenceFreshnessMetadata> = {}): EvidenceFreshnessMetadata {
  return {
    gitHead: 'abc123def456',
    changedFiles: [],
    diffHash: '12345678',
    recordedAt: '2026-01-01T00:00:00.000Z',
    evidenceChecks: ['test'],
    evidenceSummary: 'All passed',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// classifyEvidenceFreshness
// ---------------------------------------------------------------------------

describe('classifyEvidenceFreshness', () => {
  test('null acceptanceState → missing', () => {
    const result = classifyEvidenceFreshness(null, makeWorkspaceState())
    expect(result.status).toBe('missing')
    expect(result.reason).toContain('No acceptance state')
  })

  test('acceptanceState without verifyResult/readiness → missing', () => {
    const state = makeAcceptanceState()
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('missing')
    expect(result.reason).toContain('No verify result or readiness')
  })

  test('has verify result but no freshness metadata → stale', () => {
    const state = makeAcceptanceState({ verifyResult: { passed: true } as any })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.reason).toContain('freshness metadata')
  })

  test('incomplete metadata (no gitHead or recordedAt) → stale', () => {
    const metadata = makeFreshnessMetadata({ gitHead: '', recordedAt: '' })
    const state = makeAcceptanceState({
      verifyResult: { passed: true } as any,
      evidenceFreshness: metadata,
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toBeDefined()
    expect(result.staleDetails!.some(d => d.includes('incomplete'))).toBe(true)
  })

  test('current state without gitHead → stale', () => {
    const metadata = makeFreshnessMetadata()
    const state = makeAcceptanceState({
      verifyResult: { passed: true } as any,
      evidenceFreshness: metadata,
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState({ gitHead: '' }))
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toBeDefined()
    expect(result.staleDetails!.some(d => d.includes('git HEAD'))).toBe(true)
  })

  test('git HEAD mismatch → stale with git HEAD changed detail', () => {
    const metadata = makeFreshnessMetadata({ gitHead: 'deadbeef0000' })
    const state = makeAcceptanceState({
      verifyResult: { passed: true } as any,
      evidenceFreshness: metadata,
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState({ gitHead: 'abc123def456' }))
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toBeDefined()
    expect(result.staleDetails!.some(d => d.includes('git HEAD changed'))).toBe(true)
  })

  test('changed files mismatch → stale with working tree changed detail', () => {
    const metadata = makeFreshnessMetadata({ changedFiles: ['src/a.ts'] })
    const state = makeAcceptanceState({
      verifyResult: { passed: true } as any,
      evidenceFreshness: metadata,
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState({ changedFiles: ['src/b.ts'] }))
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toBeDefined()
    expect(result.staleDetails!.some(d => d.includes('working tree changed'))).toBe(true)
  })

  test('diff hash mismatch → stale with diff hash mismatch detail', () => {
    const metadata = makeFreshnessMetadata({ diffHash: 'aaaaaaaa' })
    const state = makeAcceptanceState({
      verifyResult: { passed: true } as any,
      evidenceFreshness: metadata,
    })
    // Same gitHead and changedFiles as metadata so we only trigger diff hash mismatch
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toBeDefined()
    expect(result.staleDetails!.some(d => d.includes('diff hash mismatch'))).toBe(true)
  })

  test('all match → fresh', () => {
    const workspace = makeWorkspaceState()
    const metadata = makeFreshnessMetadata({
      diffHash: computeSimpleDiffHash(workspace),
    })
    const state = makeAcceptanceState({
      verifyResult: { passed: true } as any,
      evidenceFreshness: metadata,
    })
    const result = classifyEvidenceFreshness(state, workspace)
    expect(result.status).toBe('fresh')
    expect(result.reason).toContain('matches current workspace')
  })

  test('timestamp: workspace change after evidence → stale', () => {
    const metadata = makeFreshnessMetadata({
      recordedAt: '2026-01-01T00:00:00.000Z',
      diffHash: computeSimpleDiffHash(makeWorkspaceState()),
    })
    const state = makeAcceptanceState({
      verifyResult: { passed: true } as any,
      evidenceFreshness: metadata,
    })
    // Workspace changed at a later time (Unix ms)
    const workspace = makeWorkspaceState({
      latestChangeTimestamp: new Date('2026-06-01T00:00:00.000Z').getTime(),
    })
    const result = classifyEvidenceFreshness(state, workspace)
    expect(result.status).toBe('stale')
    expect(result.staleDetails).toBeDefined()
    expect(result.staleDetails!.some(d => d.includes('workspace modified after evidence'))).toBe(true)
  })

  test('readiness without verifyResult still classifies', () => {
    const metadata = makeFreshnessMetadata({ diffHash: computeSimpleDiffHash(makeWorkspaceState()) })
    const state = makeAcceptanceState({
      readiness: { ready: true } as any,
      evidenceFreshness: metadata,
    })
    const result = classifyEvidenceFreshness(state, makeWorkspaceState())
    expect(result.status).toBe('fresh')
  })
})

// ---------------------------------------------------------------------------
// createEvidenceFreshnessMetadata
// ---------------------------------------------------------------------------

describe('createEvidenceFreshnessMetadata', () => {
  test('creates metadata with sorted changedFiles', () => {
    const ws = makeWorkspaceState({ changedFiles: ['z.ts', 'a.ts', 'm.ts'] })
    const meta = createEvidenceFreshnessMetadata(ws, ['test'], 'All passed')
    expect(meta.changedFiles).toEqual(['a.ts', 'm.ts', 'z.ts'])
  })

  test('uses provided diffHash when given', () => {
    const ws = makeWorkspaceState()
    const meta = createEvidenceFreshnessMetadata(ws, ['test'], 'All passed', 'custom-hash')
    expect(meta.diffHash).toBe('custom-hash')
  })

  test('computes diffHash when not provided', () => {
    const ws = makeWorkspaceState({ changedFiles: ['src/a.ts'] })
    const meta = createEvidenceFreshnessMetadata(ws, ['test'], 'All passed')
    expect(meta.diffHash).toBe(computeSimpleDiffHash(ws))
  })

  test('sets recordedAt to ISO string', () => {
    const ws = makeWorkspaceState()
    const before = new Date().getTime()
    const meta = createEvidenceFreshnessMetadata(ws, ['test'], 'All passed')
    const after = new Date().getTime()
    const recordedMs = new Date(meta.recordedAt).getTime()
    expect(recordedMs).toBeGreaterThanOrEqual(before)
    expect(recordedMs).toBeLessThanOrEqual(after)
  })

  test('preserves evidenceChecks and evidenceSummary', () => {
    const ws = makeWorkspaceState()
    const meta = createEvidenceFreshnessMetadata(ws, ['test', 'typecheck'], '2/2 passed')
    expect(meta.evidenceChecks).toEqual(['test', 'typecheck'])
    expect(meta.evidenceSummary).toBe('2/2 passed')
  })
})

// ---------------------------------------------------------------------------
// computeSimpleDiffHash
// ---------------------------------------------------------------------------

describe('computeSimpleDiffHash', () => {
  test('same state produces same hash', () => {
    const state = makeWorkspaceState({ gitHead: 'aaa', changedFiles: ['a.ts'] })
    expect(computeSimpleDiffHash(state)).toBe(computeSimpleDiffHash(state))
  })

  test('different gitHead produces different hash', () => {
    const a = makeWorkspaceState({ gitHead: 'aaa' })
    const b = makeWorkspaceState({ gitHead: 'bbb' })
    expect(computeSimpleDiffHash(a)).not.toBe(computeSimpleDiffHash(b))
  })

  test('different changedFiles produces different hash', () => {
    const a = makeWorkspaceState({ changedFiles: ['a.ts'] })
    const b = makeWorkspaceState({ changedFiles: ['b.ts'] })
    expect(computeSimpleDiffHash(a)).not.toBe(computeSimpleDiffHash(b))
  })

  test('hash is an 8-char hex string', () => {
    const hash = computeSimpleDiffHash(makeWorkspaceState())
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })
})

// ---------------------------------------------------------------------------
// classifyScenarioEvidenceFreshness
// ---------------------------------------------------------------------------

describe('classifyScenarioEvidenceFreshness', () => {
  test('no timestamp and no gitHead → unknown', () => {
    const result = classifyScenarioEvidenceFreshness({}, makeWorkspaceState())
    expect(result.freshness).toBe('unknown')
    expect(result.reason).toContain('missing timestamp and git HEAD')
  })

  test('gitHead mismatch → stale', () => {
    const evidence: ScenarioEvidenceFreshnessInput = {
      gitHead: 'deadbeef0000',
      timestamp: '2026-01-01T00:00:00.000Z',
    }
    const result = classifyScenarioEvidenceFreshness(evidence, makeWorkspaceState({ gitHead: 'abc123def456' }))
    expect(result.freshness).toBe('stale')
    expect(result.reason).toContain('git HEAD changed')
  })

  test('invalid timestamp → stale', () => {
    const evidence: ScenarioEvidenceFreshnessInput = {
      gitHead: 'abc123def456',
      timestamp: 'not-a-date',
    }
    const result = classifyScenarioEvidenceFreshness(evidence, makeWorkspaceState())
    expect(result.freshness).toBe('stale')
    expect(result.reason).toContain('invalid')
  })

  test('all match → fresh', () => {
    const evidence: ScenarioEvidenceFreshnessInput = {
      gitHead: 'abc123def456',
      timestamp: '2026-01-01T00:00:00.000Z',
    }
    const result = classifyScenarioEvidenceFreshness(evidence, makeWorkspaceState())
    expect(result.freshness).toBe('fresh')
    expect(result.reason).toContain('match')
  })

  test('no current gitHead → unknown', () => {
    const evidence: ScenarioEvidenceFreshnessInput = {
      gitHead: 'abc123def456',
      timestamp: '2026-01-01T00:00:00.000Z',
    }
    const result = classifyScenarioEvidenceFreshness(evidence, makeWorkspaceState({ gitHead: '' }))
    expect(result.freshness).toBe('unknown')
    expect(result.reason).toContain('Current git HEAD is unavailable')
  })

  test('returns missingFields array', () => {
    const evidence: ScenarioEvidenceFreshnessInput = {
      gitHead: 'abc123def456',
      timestamp: '2026-01-01T00:00:00.000Z',
    }
    const result = classifyScenarioEvidenceFreshness(evidence, makeWorkspaceState())
    expect(result.missingFields).toBeDefined()
    expect(result.missingFields!.length).toBeGreaterThan(0)
    // These required fields are missing from the evidence
    expect(result.missingFields).toContain('scenario reference')
    expect(result.missingFields).toContain('evidence type')
  })

  test('workspace modified after evidence timestamp → stale', () => {
    const evidence: ScenarioEvidenceFreshnessInput = {
      gitHead: 'abc123def456',
      timestamp: '2026-01-01T00:00:00.000Z',
    }
    const ws = makeWorkspaceState({
      latestChangeTimestamp: new Date('2026-06-01T00:00:00.000Z').getTime(),
    })
    const result = classifyScenarioEvidenceFreshness(evidence, ws)
    expect(result.freshness).toBe('stale')
    expect(result.reason).toContain('workspace modified after evidence')
  })

  test('timestamp only (no gitHead) is not unknown', () => {
    const evidence: ScenarioEvidenceFreshnessInput = {
      timestamp: '2026-01-01T00:00:00.000Z',
    }
    const result = classifyScenarioEvidenceFreshness(evidence, makeWorkspaceState())
    // Has timestamp so not unknown; should be fresh since no git mismatch
    expect(result.freshness).toBe('fresh')
  })
})

// ---------------------------------------------------------------------------
// parseScenarioEvidenceMetadata
// ---------------------------------------------------------------------------

describe('parseScenarioEvidenceMetadata', () => {
  test('parses scenarioId', () => {
    const result = parseScenarioEvidenceMetadata('Scenario ID: login-flow')
    expect(result.scenarioId).toBe('login-flow')
  })

  test('parses evidenceType', () => {
    const result = parseScenarioEvidenceMetadata('Evidence Type: automated test')
    expect(result.evidenceType).toBe('automated test')
  })

  test('parses testFileOrMethod', () => {
    const result = parseScenarioEvidenceMetadata('Test File: tests/login.test.ts')
    expect(result.testFileOrMethod).toBe('tests/login.test.ts')
  })

  test('parses commandOrSteps', () => {
    const result = parseScenarioEvidenceMetadata('Command: bun test tests/login.test.ts')
    expect(result.commandOrSteps).toBe('bun test tests/login.test.ts')
  })

  test('parses result', () => {
    const result = parseScenarioEvidenceMetadata('Result: passed (3 assertions)')
    expect(result.result).toBe('passed (3 assertions)')
  })

  test('parses timestamp', () => {
    const result = parseScenarioEvidenceMetadata('Timestamp: 2026-01-01T00:00:00.000Z')
    expect(result.timestamp).toBe('2026-01-01T00:00:00.000Z')
  })

  test('parses recorded at as timestamp', () => {
    const result = parseScenarioEvidenceMetadata('Recorded At: 2026-06-15T12:00:00.000Z')
    expect(result.timestamp).toBe('2026-06-15T12:00:00.000Z')
  })

  test('parses gitHead', () => {
    const result = parseScenarioEvidenceMetadata('Git Head: abc123def4567890')
    expect(result.gitHead).toBe('abc123def4567890')
  })

  test('parses coverageRationale', () => {
    const result = parseScenarioEvidenceMetadata('Coverage Rationale: covers happy path')
    expect(result.coverageRationale).toBe('covers happy path')
  })

  test('parses coreCodeMapping', () => {
    const result = parseScenarioEvidenceMetadata('Core Code Mapping: src/auth.ts:login()')
    expect(result.coreCodeMapping).toBe('src/auth.ts:login()')
  })

  test('parses multiple fields from markdown-like content', () => {
    const content = `
Scenario ID: login-flow
Evidence Type: automated test
Test File: tests/login.test.ts
Command: bun test tests/login.test.ts
Result: passed (3 assertions)
Timestamp: 2026-01-01T00:00:00.000Z
Git Head: abc123def4567890
Coverage Rationale: covers happy path and error paths
Core Code Mapping: src/auth.ts:login()
`
    const result = parseScenarioEvidenceMetadata(content)
    expect(result.scenarioId).toBe('login-flow')
    expect(result.evidenceType).toBe('automated test')
    expect(result.testFileOrMethod).toBe('tests/login.test.ts')
    expect(result.commandOrSteps).toBe('bun test tests/login.test.ts')
    expect(result.result).toBe('passed (3 assertions)')
    expect(result.timestamp).toBe('2026-01-01T00:00:00.000Z')
    expect(result.gitHead).toBe('abc123def4567890')
    expect(result.coverageRationale).toBe('covers happy path and error paths')
    expect(result.coreCodeMapping).toBe('src/auth.ts:login()')
  })

  test('returns empty object for unrecognized content', () => {
    const result = parseScenarioEvidenceMetadata('random text with no metadata fields')
    expect(result).toEqual({})
  })

  test('parses bullet-point format fields', () => {
    const content = `
- Scenario: user-signup
- Evidence Type: manual verification
- Result: confirmed
`
    const result = parseScenarioEvidenceMetadata(content)
    expect(result.scenarioId).toBe('user-signup')
    expect(result.evidenceType).toBe('manual verification')
    expect(result.result).toBe('confirmed')
  })

  test('gitHead only matches hex strings of 7-40 chars', () => {
    // Too short (6 chars) → no match
    const result1 = parseScenarioEvidenceMetadata('Git Head: abc123')
    expect(result1.gitHead).toBeUndefined()

    // Valid (7 chars) → match
    const result2 = parseScenarioEvidenceMetadata('Git Head: abc1234')
    expect(result2.gitHead).toBe('abc1234')

    // Valid (40 chars) → match
    const result3 = parseScenarioEvidenceMetadata('Git Head: abc123def456abc123def456abc123def456abc1')
    expect(result3.gitHead).toBe('abc123def456abc123def456abc123def456abc1')
  })

  test('parses Steps field as commandOrSteps', () => {
    const result = parseScenarioEvidenceMetadata('Steps: 1. Open app, 2. Login, 3. Verify dashboard')
    expect(result.commandOrSteps).toBe('1. Open app, 2. Login, 3. Verify dashboard')
  })

  test('parses Step field as commandOrSteps', () => {
    const result = parseScenarioEvidenceMetadata('Step: run the test suite')
    expect(result.commandOrSteps).toBe('run the test suite')
  })

  test('parses Head field as gitHead', () => {
    const result = parseScenarioEvidenceMetadata('Head: abc123def456')
    expect(result.gitHead).toBe('abc123def456')
  })

  test('parses Commit field as gitHead', () => {
    const result = parseScenarioEvidenceMetadata('Commit: abc123def456')
    expect(result.gitHead).toBe('abc123def456')
  })

  test('parses Rationale field as coverageRationale', () => {
    const result = parseScenarioEvidenceMetadata('Rationale: full coverage of boundary cases')
    expect(result.coverageRationale).toBe('full coverage of boundary cases')
  })

  test('parses Code Mapping field as coreCodeMapping', () => {
    const result = parseScenarioEvidenceMetadata('Code Mapping: src/utils.ts:helper()')
    expect(result.coreCodeMapping).toBe('src/utils.ts:helper()')
  })

  test('parses Test Method field as testFileOrMethod', () => {
    const result = parseScenarioEvidenceMetadata('Test Method: testLoginFlow')
    expect(result.testFileOrMethod).toBe('testLoginFlow')
  })

  test('parses Core Code field as coreCodeMapping', () => {
    const result = parseScenarioEvidenceMetadata('Core Code: src/main.ts:run()')
    expect(result.coreCodeMapping).toBe('src/main.ts:run()')
  })
})
