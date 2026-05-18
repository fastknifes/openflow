import { describe, expect, test } from 'bun:test'
import type { HardenFinding, HardenResult } from '../../src/types.js'
import {
  buildMinimalSummary,
  buildTraceEntry,
  incrementRepeatCount,
  normalizeFinding,
  updateDisposition,
} from '../../src/utils/harden-ledger.js'

function createFinding(overrides: Partial<HardenFinding> = {}): HardenFinding {
  return {
    level: 'blocking_bug',
    description: 'Null pointer dereference in src/utils/parser.ts',
    evidence: 'Line 42 calls parse() without a null check.',
    files: ['src/utils/parser.ts'],
    ...overrides,
  }
}

describe('normalizeFinding', () => {
  test('normalizes minor wording, spacing, and path differences into the same key', () => {
    const first = createFinding({
      description: 'Null pointer dereference in src/utils/parser.ts',
      evidence: 'Line 42 calls parse() without a null check.',
      files: ['src\\utils\\parser.ts'],
      lines: '42-45',
    })
    const second = createFinding({
      description: '  null pointer   dereference  in SRC/utils/parser.ts  ',
      evidence: 'line: 99 calls parse without null check',
      files: ['src/utils/parser.ts'],
      lines: '99-100',
    })

    expect(normalizeFinding(first)).toBe(normalizeFinding(second))
  })

  test('keeps materially different findings distinct', () => {
    const first = createFinding()
    const second = createFinding({
      files: ['src/utils/serializer.ts'],
      description: 'Null pointer dereference in src/utils/serializer.ts',
    })

    expect(normalizeFinding(first)).not.toBe(normalizeFinding(second))
  })
})

describe('incrementRepeatCount', () => {
  test('increments from zero without mutating the original finding', () => {
    const original = createFinding()
    const updated = incrementRepeatCount(original)

    expect(updated.repeatCount).toBe(1)
    expect(updated.normalizedKey).toBe(normalizeFinding(original))
    expect(original.repeatCount).toBeUndefined()
    expect(original.normalizedKey).toBeUndefined()
  })

  test('increments an existing repeat count', () => {
    const updated = incrementRepeatCount(createFinding({ repeatCount: 2, normalizedKey: 'existing-key' }))
    expect(updated.repeatCount).toBe(3)
    expect(updated.normalizedKey).toBe('existing-key')
  })
})

describe('updateDisposition', () => {
  test('marks must-fix findings as confirmed by default', () => {
    const updated = updateDisposition(createFinding(), 'must_fix')
    expect(updated.disposition).toBe('must_fix')
    expect(updated.status).toBe('confirmed')
    expect(updated.normalizedKey).toBe(normalizeFinding(createFinding()))
  })

  test('preserves resolved status for must-fix findings', () => {
    const updated = updateDisposition(createFinding({ status: 'verified' }), 'must_fix')
    expect(updated.status).toBe('verified')
  })

  test('keeps accepted known issues confirmed when no explicit status exists', () => {
    const updated = updateDisposition(createFinding(), 'accepted_known_issue')
    expect(updated.status).toBe('confirmed')
  })

  test('routes design divergence to needs_decision when unresolved', () => {
    const updated = updateDisposition(createFinding(), 'design_divergence')
    expect(updated.status).toBe('needs_decision')
  })

  test('preserves resolved status for design divergence', () => {
    const updated = updateDisposition(createFinding({ status: 'fixed' }), 'design_divergence')
    expect(updated.status).toBe('fixed')
  })

  test('dismisses false positives and superseded findings', () => {
    expect(updateDisposition(createFinding(), 'false_positive').status).toBe('dismissed')
    expect(updateDisposition(createFinding(), 'superseded').status).toBe('dismissed')
  })

  test('marks explicit needs_decision findings accordingly', () => {
    const updated = updateDisposition(createFinding(), 'needs_decision')
    expect(updated.status).toBe('needs_decision')
  })
})

describe('buildTraceEntry', () => {
  test('builds a trace entry with an ISO timestamp', () => {
    const entry = buildTraceEntry(2, 'oracle', 345, 'review_inconclusive')

    expect(entry.round).toBe(2)
    expect(entry.agent).toBe('oracle')
    expect(entry.tokens).toBe(345)
    expect(entry.result).toBe('review_inconclusive')
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false)
  })
})

describe('buildMinimalSummary', () => {
  test('summarizes unresolved, accepted, and decision-required findings from the latest ledger state', () => {
    const repeatedFindingKey = normalizeFinding(createFinding({ id: 'H-1' }))
    const result: HardenResult = {
      status: 'known_issues_accepted',
      stopReason: 'known_issues_accepted',
      budgetConsumed: 900,
      summary: 'terminal state',
      acceptedFindingsSummary: 'Accepted 1 known issue with documentation follow-up.',
      trace: [buildTraceEntry(1, 'oracle', 120, 'reviewed')],
      rounds: [
        {
          round: 1,
          findings: [
            createFinding({ id: 'H-1', normalizedKey: repeatedFindingKey, disposition: 'must_fix', status: 'confirmed' }),
            createFinding({ id: 'H-2', disposition: 'accepted_known_issue', status: 'confirmed' }),
            createFinding({ id: 'H-3', disposition: 'design_divergence', status: 'needs_decision' }),
          ],
        },
        {
          round: 2,
          findings: [
            createFinding({ id: 'H-1', normalizedKey: repeatedFindingKey, disposition: 'must_fix', status: 'fixed' }),
          ],
        },
      ],
    }

    expect(JSON.parse(buildMinimalSummary(result))).toEqual({
      status: 'known_issues_accepted',
      stopReason: 'known_issues_accepted',
      unresolvedMustFixCount: 0,
      unresolvedNeedsDecisionCount: 1,
      acceptedKnownIssueCount: 1,
      acceptedFindingsSummary: 'Accepted 1 known issue with documentation follow-up.',
    })
  })

  test('falls back to defaults when stop reason or findings are missing', () => {
    const result: HardenResult = {
      status: 'pass',
      budgetConsumed: 100,
      summary: 'clean run',
      rounds: [],
    }

    expect(JSON.parse(buildMinimalSummary(result))).toEqual({
      status: 'pass',
      stopReason: 'unknown',
      unresolvedMustFixCount: 0,
      unresolvedNeedsDecisionCount: 0,
      acceptedKnownIssueCount: 0,
      acceptedFindingsSummary: '',
    })
  })
})
