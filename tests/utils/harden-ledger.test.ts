import { test, expect, describe } from 'bun:test'
import { normalizeFinding, incrementRepeatCount, updateDisposition, buildTraceEntry, buildMinimalSummary } from '../../src/utils/harden-ledger.js'
import type { HardenFinding, HardenResult } from '../../src/types.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<HardenFinding> = {}): HardenFinding {
  return {
    level: 'behavior_violation',
    description: 'Missing error handling',
    evidence: 'No try-catch around file read',
    files: ['src/index.ts'],
    ...overrides,
  }
}

function makeResult(overrides: Partial<HardenResult> = {}): HardenResult {
  return {
    status: 'pass',
    rounds: [],
    budgetConsumed: 100,
    summary: 'ok',
    ...overrides,
  }
}

// ── normalizeFinding ─────────────────────────────────────────────────────────

describe('normalizeFinding', () => {
  test('returns deterministic string for the same finding', () => {
    const finding = makeFinding()
    const key1 = normalizeFinding(finding)
    const key2 = normalizeFinding(finding)
    expect(key1).toBe(key2)
  })

  test('different descriptions produce different keys', () => {
    const key1 = normalizeFinding(makeFinding({ description: 'Missing error handling' }))
    const key2 = normalizeFinding(makeFinding({ description: 'Wrong return type' }))
    expect(key1).not.toBe(key2)
  })

  test('normalizes numbers to #', () => {
    const key1 = normalizeFinding(makeFinding({ description: 'Error on line 42' }))
    const key2 = normalizeFinding(makeFinding({ description: 'Error on line 99' }))
    expect(key1).toBe(key2)
  })

  test('normalizes articles a/an/the', () => {
    const key1 = normalizeFinding(makeFinding({ description: 'The function has a bug in an argument' }))
    const key2 = normalizeFinding(makeFinding({ description: 'function has bug in argument' }))
    expect(key1).toBe(key2)
  })

  test('normalizes whitespace', () => {
    const key1 = normalizeFinding(makeFinding({ description: 'extra   spaces   here' }))
    const key2 = normalizeFinding(makeFinding({ description: 'extra spaces here' }))
    expect(key1).toBe(key2)
  })

  test('normalizes file paths (backslashes to forward slashes)', () => {
    const key1 = normalizeFinding(makeFinding({ files: ['src\\utils\\index.ts'] }))
    const key2 = normalizeFinding(makeFinding({ files: ['src/utils/index.ts'] }))
    expect(key1).toBe(key2)
  })

  test('includes level in signature', () => {
    const key1 = normalizeFinding(makeFinding({ level: 'behavior_violation' }))
    const key2 = normalizeFinding(makeFinding({ level: 'intent_gap' }))
    expect(key1).not.toBe(key2)
  })

  test('includes files in signature', () => {
    const key1 = normalizeFinding(makeFinding({ files: ['src/a.ts'] }))
    const key2 = normalizeFinding(makeFinding({ files: ['src/b.ts'] }))
    expect(key1).not.toBe(key2)
  })

  test('includes text (description + evidence) in signature', () => {
    const key1 = normalizeFinding(makeFinding({ evidence: 'evidence A' }))
    const key2 = normalizeFinding(makeFinding({ evidence: 'evidence B' }))
    expect(key1).not.toBe(key2)
  })

  test('blocking_bug is normalized to behavior_violation in level signature', () => {
    const key = normalizeFinding(makeFinding({ level: 'blocking_bug' }))
    expect(key).toContain('level=behavior_violation')
  })
})

// ── incrementRepeatCount ─────────────────────────────────────────────────────

describe('incrementRepeatCount', () => {
  test('sets normalizedKey if missing', () => {
    const finding = makeFinding()
    expect(finding.normalizedKey).toBeUndefined()
    const result = incrementRepeatCount(finding)
    expect(result.normalizedKey).toBeDefined()
    expect(typeof result.normalizedKey).toBe('string')
  })

  test('preserves existing normalizedKey', () => {
    const finding = makeFinding({ normalizedKey: 'existing-key' })
    const result = incrementRepeatCount(finding)
    expect(result.normalizedKey).toBe('existing-key')
  })

  test('increments repeatCount from 0 to 1', () => {
    const finding = makeFinding()
    expect(finding.repeatCount).toBeUndefined()
    const result = incrementRepeatCount(finding)
    expect(result.repeatCount).toBe(1)
  })

  test('increments repeatCount from 1 to 2', () => {
    const finding = makeFinding({ repeatCount: 1 })
    const result = incrementRepeatCount(finding)
    expect(result.repeatCount).toBe(2)
  })

  test('increments repeatCount from 5 to 6', () => {
    const finding = makeFinding({ repeatCount: 5 })
    const result = incrementRepeatCount(finding)
    expect(result.repeatCount).toBe(6)
  })
})

// ── updateDisposition ────────────────────────────────────────────────────────

describe('updateDisposition', () => {
  test('false_positive → status dismissed', () => {
    const result = updateDisposition(makeFinding(), 'false_positive')
    expect(result.disposition).toBe('false_positive')
    expect(result.status).toBe('dismissed')
  })

  test('superseded → status dismissed', () => {
    const result = updateDisposition(makeFinding(), 'superseded')
    expect(result.disposition).toBe('superseded')
    expect(result.status).toBe('dismissed')
  })

  test('accepted_known_issue → status confirmed', () => {
    const result = updateDisposition(makeFinding(), 'accepted_known_issue')
    expect(result.disposition).toBe('accepted_known_issue')
    expect(result.status).toBe('confirmed')
  })

  test('needs_decision → status needs_decision (when not already resolved)', () => {
    const result = updateDisposition(makeFinding(), 'needs_decision')
    expect(result.disposition).toBe('needs_decision')
    expect(result.status).toBe('needs_decision')
  })

  test('must_fix → status confirmed', () => {
    const result = updateDisposition(makeFinding(), 'must_fix')
    expect(result.disposition).toBe('must_fix')
    expect(result.status).toBe('confirmed')
  })

  test('preserves fixed status when disposition is needs_decision', () => {
    const finding = makeFinding({ status: 'fixed' })
    const result = updateDisposition(finding, 'needs_decision')
    expect(result.status).toBe('fixed')
  })

  test('preserves verified status when disposition is needs_decision', () => {
    const finding = makeFinding({ status: 'verified' })
    const result = updateDisposition(finding, 'needs_decision')
    expect(result.status).toBe('verified')
  })

  test('preserves dismissed status when disposition is needs_decision', () => {
    const finding = makeFinding({ status: 'dismissed' })
    const result = updateDisposition(finding, 'needs_decision')
    expect(result.status).toBe('dismissed')
  })

  test('preserves fixed status when disposition is must_fix', () => {
    const finding = makeFinding({ status: 'fixed' })
    const result = updateDisposition(finding, 'must_fix')
    expect(result.status).toBe('fixed')
  })

  test('preserves verified status when disposition is accepted_known_issue', () => {
    const finding = makeFinding({ status: 'verified' })
    const result = updateDisposition(finding, 'accepted_known_issue')
    // accepted_known_issue: returns current ?? 'confirmed', and current is 'verified'
    expect(result.status).toBe('verified')
  })

  test('sets normalizedKey if missing', () => {
    const result = updateDisposition(makeFinding(), 'must_fix')
    expect(result.normalizedKey).toBeDefined()
  })
})

// ── buildTraceEntry ──────────────────────────────────────────────────────────

describe('buildTraceEntry', () => {
  test('returns object with round, agent, tokens, result, timestamp', () => {
    const entry = buildTraceEntry(1, 'reviewer', 500, 'pass')
    expect(entry.round).toBe(1)
    expect(entry.agent).toBe('reviewer')
    expect(entry.tokens).toBe(500)
    expect(entry.result).toBe('pass')
    expect(entry.timestamp).toBeDefined()
  })

  test('timestamp is a valid ISO string', () => {
    const entry = buildTraceEntry(2, 'executor', 1000, 'fail')
    const parsed = new Date(entry.timestamp)
    expect(parsed.getTime()).not.toBeNaN()
    // Should parse back to same string (ISO format)
    expect(parsed.toISOString()).toBe(entry.timestamp)
  })
})

// ── buildMinimalSummary ──────────────────────────────────────────────────────

describe('buildMinimalSummary', () => {
  test('returns JSON string with status and stopReason', () => {
    const result = makeResult({ status: 'pass', stopReason: 'all_clear' })
    const summary = buildMinimalSummary(result)
    const parsed = JSON.parse(summary)
    expect(parsed.status).toBe('pass')
    expect(parsed.stopReason).toBe('all_clear')
  })

  test('defaults stopReason to unknown when missing', () => {
    const result = makeResult({ stopReason: undefined })
    const parsed = JSON.parse(buildMinimalSummary(result))
    expect(parsed.stopReason).toBe('unknown')
  })

  test('counts unresolved must_fix findings', () => {
    const result = makeResult({
      rounds: [{
        round: 1,
        findings: [
          makeFinding({ id: 'f1', description: 'Bug A', disposition: 'must_fix', status: 'confirmed' }),
          makeFinding({ id: 'f2', description: 'Bug B', disposition: 'must_fix', status: 'confirmed' }),
        ],
      }],
    })
    const parsed = JSON.parse(buildMinimalSummary(result))
    expect(parsed.unresolvedMustFixCount).toBe(2)
  })

  test('excludes resolved must_fix from count', () => {
    const result = makeResult({
      rounds: [{
        round: 1,
        findings: [
          makeFinding({ disposition: 'must_fix', status: 'fixed' }),
          makeFinding({ disposition: 'must_fix', status: 'verified' }),
        ],
      }],
    })
    const parsed = JSON.parse(buildMinimalSummary(result))
    expect(parsed.unresolvedMustFixCount).toBe(0)
  })

  test('counts needs_decision findings', () => {
    const result = makeResult({
      rounds: [{
        round: 1,
        findings: [
          makeFinding({ disposition: 'needs_decision' }),
        ],
      }],
    })
    const parsed = JSON.parse(buildMinimalSummary(result))
    expect(parsed.unresolvedNeedsDecisionCount).toBe(1)
  })

  test('counts accepted_known_issue findings', () => {
    const result = makeResult({
      rounds: [{
        round: 1,
        findings: [
          makeFinding({ id: 'f1', description: 'Issue A', disposition: 'accepted_known_issue' }),
          makeFinding({ id: 'f2', description: 'Issue B', disposition: 'accepted_known_issue' }),
        ],
      }],
    })
    const parsed = JSON.parse(buildMinimalSummary(result))
    expect(parsed.acceptedKnownIssueCount).toBe(2)
  })

  test('zero counts for empty rounds', () => {
    const parsed = JSON.parse(buildMinimalSummary(makeResult()))
    expect(parsed.unresolvedMustFixCount).toBe(0)
    expect(parsed.unresolvedNeedsDecisionCount).toBe(0)
    expect(parsed.acceptedKnownIssueCount).toBe(0)
  })

  test('later round overrides earlier finding with same key', () => {
    const f1 = makeFinding({ id: 'f1', disposition: 'must_fix', status: 'confirmed' })
    const f2 = makeFinding({ id: 'f1', disposition: 'must_fix', status: 'fixed' })
    const result = makeResult({
      rounds: [
        { round: 1, findings: [f1] },
        { round: 2, findings: [f2] },
      ],
    })
    const parsed = JSON.parse(buildMinimalSummary(result))
    // f2 (fixed) overrides f1 (confirmed), so unresolved count is 0
    expect(parsed.unresolvedMustFixCount).toBe(0)
  })
})
