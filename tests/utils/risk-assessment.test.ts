import { describe, expect, test } from 'bun:test'
import {
  assessChangeRisk,
  decideQualityGateRisk,
  isHighRisk,
  RISK_REASON_CODES,
} from '../../src/utils/risk-assessment.js'
import type { QualityGateRiskInput } from '../../src/utils/risk-assessment.js'

function mkInput(overrides: Partial<QualityGateRiskInput> = {}): QualityGateRiskInput {
  return {
    files: ['src/utils/helper.ts'],
    diffLines: 5,
    hasNewExports: false,
    ...overrides,
  }
}

// ── decideQualityGateRisk ──────────────────────────────────────────────────

describe('decideQualityGateRisk', () => {
  // -- Trivial / simple cases ------------------------------------------------

  test('trivial single-file small change returns low, no harden', () => {
    const result = decideQualityGateRisk(mkInput())
    expect(result.risk).toBe('low')
    expect(result.shouldHarden).toBe(false)
    expect(result.reasons).toContain(RISK_REASON_CODES.LOW_TRIVIAL_CHANGE)
  })

  test('trivial doc change skips harden', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['README.md'],
      diffLines: 8,
      diffText: diffLinesToString([
        'diff --git a/README.md b/README.md',
        '--- a/README.md',
        '+++ b/README.md',
        '@@ -1,2 +1,4 @@',
        '+new line',
        '+another line',
      ]),
    }))
    expect(result.risk).toBe('low')
    expect(result.shouldHarden).toBe(false)
    expect(result.reasons).toContain(RISK_REASON_CODES.LOW_TRIVIAL_CHANGE)
  })

  test('two-file change without other triggers returns medium, no harden', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/a.ts', 'src/b.ts'],
      diffLines: 20,
    }))
    expect(result.risk).toBe('medium')
    expect(result.shouldHarden).toBe(false)
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_2)
  })

  // -- Multi-file trigger ----------------------------------------------------

  test('multi_file_change: >=3 files forces harden', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      diffLines: 10,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_GE_3)
  })

  // -- Large diff trigger ----------------------------------------------------

  test('large_diff: >=50 diff lines forces harden', () => {
    const result = decideQualityGateRisk(mkInput({
      diffLines: 50,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.DIFF_LINES_GE_50)
  })

  test('49 diff lines does NOT trigger harden', () => {
    const result = decideQualityGateRisk(mkInput({
      diffLines: 49,
    }))
    expect(result.shouldHarden).toBe(false)
  })

  // -- Exported API changes --------------------------------------------------

  test('exported_api_change forces harden', () => {
    const result = decideQualityGateRisk(mkInput({
      hasNewExports: true,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.EXPORTS_NEW_PUBLIC_API)
  })

  // -- Sensitive paths -------------------------------------------------------

  const sensitivePaths = [
    'hooks',
    'commands',
    'config',
    'verify',
    'archive',
    'harden',
    'security',
    'auth',
    'permission',
    'payment',
  ]

  for (const sp of sensitivePaths) {
    test(`sensitive_path:${sp} forces harden`, () => {
      const result = decideQualityGateRisk(mkInput({
        files: [`src/${sp}/some-file.ts`],
      }))
      expect(result.risk).toBe('high')
      expect(result.shouldHarden).toBe(true)
      expect(result.reasons).toContain(`${RISK_REASON_CODES.PATH_SENSITIVE_PREFIX}:${sp}`)
    })

    test(`sensitive_path:${sp} matches nested paths`, () => {
      const result = decideQualityGateRisk(mkInput({
        files: [`src/subdir/${sp}/handler.ts`],
      }))
      expect(result.risk).toBe('high')
      expect(result.shouldHarden).toBe(true)
      expect(result.reasons).toContain(`${RISK_REASON_CODES.PATH_SENSITIVE_PREFIX}:${sp}`)
    })
  }

  test('sensitive path only emits one reason per file match (breaks on first match)', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/hooks/chat-message.ts'],
    }))
    expect(result.reasons.filter(r => r.startsWith(RISK_REASON_CODES.PATH_SENSITIVE_PREFIX)).length).toBe(1)
    expect(result.reasons).toContain(`${RISK_REASON_CODES.PATH_SENSITIVE_PREFIX}:hooks`)
  })

  // -- Critical files (types.ts / index.ts) ----------------------------------

  test('src/types.ts forces harden', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/types.ts'],
      diffLines: 5,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.PATH_CRITICAL_TYPES_OR_INDEX)
  })

  test('src/index.ts forces harden', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/index.ts'],
      diffLines: 5,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.PATH_CRITICAL_TYPES_OR_INDEX)
  })

  // -- Stateful logic --------------------------------------------------------

  test('stateful_logic forces harden', () => {
    const result = decideQualityGateRisk(mkInput({
      isStateful: true,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.STATEFUL_LOGIC)
  })

  // -- Production / data-loss risk -------------------------------------------

  test('production_data_loss_risk forces harden', () => {
    const result = decideQualityGateRisk(mkInput({
      isProductionDataLossRisk: true,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.PRODUCTION_DATA_LOSS_RISK)
  })

  // -- Complexity grading from diffText --------------------------------------

  test('complexity:complex via diffText forces medium (no other triggers)', () => {
    // A 3-file diff makes gradeComplexityFromDiff return 'complex'
    const diff = diffLinesToString([
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,4 @@',
      '-x',
      '+a1',
      '+a2',
      '+a3',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,2 +1,4 @@',
      '-y',
      '+b1',
      '+b2',
      '+b3',
      'diff --git a/src/c.ts b/src/c.ts',
      '--- a/src/c.ts',
      '+++ b/src/c.ts',
      '@@ -1,2 +1,4 @@',
      '-z',
      '+c1',
      '+c2',
      '+c3',
    ])
    // Only 2 files in input — complexity alone gives medium
    const result = decideQualityGateRisk(mkInput({
      files: ['src/utils/a.ts', 'src/utils/b.ts'],
      diffLines: 12,
      diffText: diff,
    }))
    expect(result.risk).toBe('medium')
    expect(result.shouldHarden).toBe(false)
    expect(result.reasons).toContain(RISK_REASON_CODES.COMPLEXITY_COMPLEX)
  })

  test('complexity:complex + another trigger → high, shouldHarden', () => {
    const diff = diffLinesToString([
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,4 @@',
      '-x',
      '+a1',
      '+a2',
      '+a3',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,2 +1,4 @@',
      '-y',
      '+b1',
      '+b2',
      '+b3',
      'diff --git a/src/c.ts b/src/c.ts',
      '--- a/src/c.ts',
      '+++ b/src/c.ts',
      '@@ -1,2 +1,4 @@',
      '-z',
      '+c1',
      '+c2',
      '+c3',
    ])
    const result = decideQualityGateRisk(mkInput({
      files: ['src/hooks/useA.ts', 'src/commands/cmd.ts', 'src/utils/help.ts'],
      diffLines: 12,
      diffText: diff,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_GE_3)
    expect(result.reasons).toContain(RISK_REASON_CODES.COMPLEXITY_COMPLEX)
  })

  // -- Reason accumulation ---------------------------------------------------

  test('multiple triggers produce all reason codes', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/commands/harden.ts', 'src/hooks/auth.ts', 'src/verify/check.ts'],
      diffLines: 100,
      hasNewExports: true,
      isStateful: true,
      isProductionDataLossRisk: true,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_GE_3)
    expect(result.reasons).toContain(RISK_REASON_CODES.DIFF_LINES_GE_50)
    expect(result.reasons).toContain(RISK_REASON_CODES.EXPORTS_NEW_PUBLIC_API)
    expect(result.reasons).toContain(RISK_REASON_CODES.STATEFUL_LOGIC)
    expect(result.reasons).toContain(RISK_REASON_CODES.PRODUCTION_DATA_LOSS_RISK)
    // sensitive path matches first one only
    expect(result.reasons.some(r => r.startsWith(RISK_REASON_CODES.PATH_SENSITIVE_PREFIX))).toBe(true)
  })

  test('empty file list defaults to low', () => {
    const result = decideQualityGateRisk(mkInput({
      files: [],
    }))
    expect(result.risk).toBe('low')
    expect(result.shouldHarden).toBe(false)
    expect(result.reasons).toContain(RISK_REASON_CODES.LOW_TRIVIAL_CHANGE)
  })

  // -- Reason format ────────────────────────────────────────────────────────

  test('reasons are stable string codes, not prose', () => {
    const result = decideQualityGateRisk(mkInput({ files: ['a.ts', 'b.ts', 'c.ts'], diffLines: 5 }))
    for (const reason of result.reasons) {
      expect(reason).not.toMatch(/\s{2,}/)
      expect(reason).not.toMatch(/^[A-Z]/)
    }
  })
})

// ── Legacy exports (compatibility check) ───────────────────────────────────

describe('assessChangeRisk (legacy)', () => {
  test('single file small diff returns low', () => {
    expect(assessChangeRisk(['src/a.ts'], 5, false)).toBe('low')
  })

  test('three files returns high', () => {
    expect(assessChangeRisk(['src/a.ts', 'src/b.ts', 'src/c.ts'], 5, false)).toBe('high')
  })

  test('>=50 lines returns high', () => {
    expect(assessChangeRisk(['src/a.ts'], 50, false)).toBe('high')
  })

  test('hasNewExports returns high', () => {
    expect(assessChangeRisk(['src/a.ts'], 5, true)).toBe('high')
  })

  test('sensitive path returns high', () => {
    expect(assessChangeRisk(['src/hooks/chat.ts'], 5, false)).toBe('high')
  })

  test('harden path returns high', () => {
    expect(assessChangeRisk(['src/harden/audit.ts'], 5, false)).toBe('high')
  })

  test('src/types.ts returns high', () => {
    expect(assessChangeRisk(['src/types.ts'], 5, false)).toBe('high')
  })

  test('src/index.ts returns high', () => {
    expect(assessChangeRisk(['src/index.ts'], 5, false)).toBe('high')
  })

  test('two files returns medium', () => {
    expect(assessChangeRisk(['src/a.ts', 'src/b.ts'], 5, false)).toBe('medium')
  })
})

describe('isHighRisk', () => {
  test('high returns true', () => {
    expect(isHighRisk('high')).toBe(true)
  })

  test('medium returns false', () => {
    expect(isHighRisk('medium')).toBe(false)
  })

  test('low returns false', () => {
    expect(isHighRisk('low')).toBe(false)
  })
})

// ── Helper ─────────────────────────────────────────────────────────────────

function diffLinesToString(lines: string[]): string {
  return lines.join('\n')
}
