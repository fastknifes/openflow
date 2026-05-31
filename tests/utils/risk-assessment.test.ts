import { test, expect, describe } from 'bun:test'
import { assessChangeRisk, isHighRisk, decideQualityGateRisk, RISK_REASON_CODES } from '../../src/utils/risk-assessment.js'
import type { QualityGateRiskInput } from '../../src/utils/risk-assessment.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<QualityGateRiskInput> = {}): QualityGateRiskInput {
  return {
    files: [],
    diffLines: 0,
    hasNewExports: false,
    ...overrides,
  }
}

// ── assessChangeRisk ─────────────────────────────────────────────────────────

describe('assessChangeRisk', () => {
  test('3 or more files → high', () => {
    expect(assessChangeRisk(['a.ts', 'b.ts', 'c.ts'], 5, false)).toBe('high')
  })

  test('exactly 3 files → high', () => {
    expect(assessChangeRisk(['a.ts', 'b.ts', 'c.ts'], 0, false)).toBe('high')
  })

  test('50 or more diff lines → high', () => {
    expect(assessChangeRisk(['a.ts'], 50, false)).toBe('high')
  })

  test('49 diff lines → not high (unless other trigger)', () => {
    expect(assessChangeRisk(['a.ts'], 49, false)).toBe('low')
  })

  test('hasNewExports → high', () => {
    expect(assessChangeRisk(['a.ts'], 5, true)).toBe('high')
  })

  test('sensitive path /hooks/ → high', () => {
    expect(assessChangeRisk(['src/hooks/useAuth.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /commands/ → high', () => {
    expect(assessChangeRisk(['src/commands/run.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /config/ → high', () => {
    expect(assessChangeRisk(['src/config/settings.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /verify/ → high', () => {
    expect(assessChangeRisk(['src/verify/check.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /archive/ → high', () => {
    expect(assessChangeRisk(['src/archive/store.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /harden/ → high', () => {
    expect(assessChangeRisk(['src/harden/run.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /security/ → high', () => {
    expect(assessChangeRisk(['src/security/auth.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /auth/ → high', () => {
    expect(assessChangeRisk(['src/auth/login.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /permission/ → high', () => {
    expect(assessChangeRisk(['src/permission/role.ts'], 5, false)).toBe('high')
  })

  test('sensitive path /payment/ → high', () => {
    expect(assessChangeRisk(['src/payment/charge.ts'], 5, false)).toBe('high')
  })

  test('src/types.ts → high', () => {
    expect(assessChangeRisk(['src/types.ts'], 5, false)).toBe('high')
  })

  test('src/index.ts → high', () => {
    expect(assessChangeRisk(['src/index.ts'], 5, false)).toBe('high')
  })

  test('2 files with no other triggers → medium', () => {
    expect(assessChangeRisk(['a.ts', 'b.ts'], 5, false)).toBe('medium')
  })

  test('1 file with small diff → low', () => {
    expect(assessChangeRisk(['a.ts'], 5, false)).toBe('low')
  })

  test('empty files with no diff → low', () => {
    expect(assessChangeRisk([], 0, false)).toBe('low')
  })
})

// ── isHighRisk ───────────────────────────────────────────────────────────────

describe('isHighRisk', () => {
  test("'high' → true", () => {
    expect(isHighRisk('high')).toBe(true)
  })

  test("'medium' → false", () => {
    expect(isHighRisk('medium')).toBe(false)
  })

  test("'low' → false", () => {
    expect(isHighRisk('low')).toBe(false)
  })
})

// ── decideQualityGateRisk ────────────────────────────────────────────────────

describe('decideQualityGateRisk', () => {
  test('low trivial change → low risk, no harden, LOW_TRIVIAL_CHANGE reason', () => {
    const result = decideQualityGateRisk(makeInput())
    expect(result.risk).toBe('low')
    expect(result.shouldHarden).toBe(false)
    expect(result.reasons).toContain(RISK_REASON_CODES.LOW_TRIVIAL_CHANGE)
  })

  test('3 files → high risk, shouldHarden', () => {
    const result = decideQualityGateRisk(makeInput({ files: ['a.ts', 'b.ts', 'c.ts'] }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_GE_3)
  })

  test('50+ diff lines → high risk', () => {
    const result = decideQualityGateRisk(makeInput({ diffLines: 50 }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.DIFF_LINES_GE_50)
  })

  test('hasNewExports → high risk', () => {
    const result = decideQualityGateRisk(makeInput({ hasNewExports: true }))
    expect(result.risk).toBe('high')
    expect(result.reasons).toContain(RISK_REASON_CODES.EXPORTS_NEW_PUBLIC_API)
  })

  test('stateful logic → high risk', () => {
    const result = decideQualityGateRisk(makeInput({ isStateful: true }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.STATEFUL_LOGIC)
  })

  test('production data loss risk → high risk', () => {
    const result = decideQualityGateRisk(makeInput({ isProductionDataLossRisk: true }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.PRODUCTION_DATA_LOSS_RISK)
  })

  test('sensitive path → high risk with path label', () => {
    const result = decideQualityGateRisk(makeInput({ files: ['src/hooks/useAuth.ts'] }))
    expect(result.risk).toBe('high')
    expect(result.reasons).toContain('path:sensitive:hooks')
  })

  test('src/types.ts → high risk', () => {
    const result = decideQualityGateRisk(makeInput({ files: ['src/types.ts'] }))
    expect(result.risk).toBe('high')
    expect(result.reasons).toContain(RISK_REASON_CODES.PATH_CRITICAL_TYPES_OR_INDEX)
  })

  test('2 files with no other triggers → medium risk', () => {
    const result = decideQualityGateRisk(makeInput({ files: ['a.ts', 'b.ts'] }))
    expect(result.risk).toBe('medium')
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_2)
  })

  test('complex diff but no other triggers → medium risk, shouldHarden true', () => {
    // Use a diff with many changed lines and new function definitions to trigger 'complex'
    const complexDiff = [
      'diff --git a/src/utils.ts b/src/utils.ts',
      '--- a/src/utils.ts',
      '+++ b/src/utils.ts',
      '+export function newFeature() {',
      '+  const result = complex();',
      '+  return result;',
      '+}',
      '+export function anotherFeature() {',
      '+  const result = complex2();',
      '+  return result;',
      '+}',
      '+export function thirdFeature() {',
      '+  const result = complex3();',
      '+  return result;',
      '+}',
      '-// old code line 1',
      '-// old code line 2',
      '-// old code line 3',
    ].join('\n')
    const result = decideQualityGateRisk(makeInput({ diffText: complexDiff }))
    expect(result.reasons).toContain(RISK_REASON_CODES.COMPLEXITY_COMPLEX)
    expect(result.shouldHarden).toBe(true)
    // risk is medium when complex is the only trigger
    expect(result.risk).toBe('medium')
  })

  test('complex diff combined with stateful logic → high risk', () => {
    // Need >10 totalLines for a single file to escape 'trivial' grade,
    // plus hasNewDefinitions trigger (export function) for 'complex' grade
    const lines = [
      'diff --git a/src/utils.ts b/src/utils.ts',
      '--- a/src/utils.ts',
      '+++ b/src/utils.ts',
    ]
    for (let i = 0; i < 6; i++) {
      lines.push(`+export function feature${i}() { return ${i}; }`)
    }
    for (let i = 0; i < 6; i++) {
      lines.push(`-// removed old line ${i}`)
    }
    const complexDiff = lines.join('\n')
    const result = decideQualityGateRisk(makeInput({ diffText: complexDiff, isStateful: true }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.STATEFUL_LOGIC)
    expect(result.reasons).toContain(RISK_REASON_CODES.COMPLEXITY_COMPLEX)
  })
})
