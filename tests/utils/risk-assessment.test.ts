import { describe, expect, test } from 'bun:test'
import {
  decideQualityGateRisk,
  assessChangeRisk,
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

  test('two-file change without other triggers returns medium, no harden', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/a.ts', 'src/b.ts'],
      diffLines: 20,
    }))
    expect(result.risk).toBe('medium')
    expect(result.shouldHarden).toBe(false)
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_2)
  })

  test('trivial doc change skips harden (no high triggers, no sensitive paths)', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['README.md'],
      diffLines: 8,
    }))
    expect(result.shouldHarden).toBe(false)
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

  test('49 diff lines does NOT trigger diff_lines threshold', () => {
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

  test('sensitive path only emits one reason per matching file', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/hooks/chat-message.ts'],
    }))
    const pathReasons = result.reasons.filter(r => r.startsWith(RISK_REASON_CODES.PATH_SENSITIVE_PREFIX))
    expect(pathReasons.length).toBe(1)
  })

  test('sensitive path reason accumulates even when earlier trigger already set risk high', () => {
    // File count (>=3) triggers high first; file[2] is a sensitive path — its reason must still appear
    const result = decideQualityGateRisk(mkInput({
      files: ['src/app.ts', 'src/utils/helper.ts', 'src/hooks/useAuth.ts'],
      diffLines: 5,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_GE_3)
    expect(result.reasons).toContain(`${RISK_REASON_CODES.PATH_SENSITIVE_PREFIX}:hooks`)
  })

  test('sensitive path in later file is detected even when file count already made risk high', () => {
    // files[0] and files[1] are non-sensitive — >=3 sets risk high.
    // files[2] is a sensitive path — it must still be detected and added to reasons.
    const result = decideQualityGateRisk(mkInput({
      files: ['src/utils/helper.ts', 'src/lib/utils.ts', 'src/commands/run.ts'],
      diffLines: 10,
    }))
    expect(result.risk).toBe('high')
    expect(result.reasons).toContain(RISK_REASON_CODES.FILES_COUNT_GE_3)
    expect(result.reasons).toContain(`${RISK_REASON_CODES.PATH_SENSITIVE_PREFIX}:commands`)
  })

  // -- Type system files -----------------------------------------------------

  test('src/types.ts forces harden via critical_path reason', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/types.ts'],
      diffLines: 5,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.PATH_CRITICAL_TYPES_OR_INDEX)
  })

  test('src/index.ts forces harden via critical_path reason', () => {
    const result = decideQualityGateRisk(mkInput({
      files: ['src/index.ts'],
      diffLines: 5,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
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

  test('complexity:complex via diffText forces harden', () => {
    // Diff that gradeComplexityFromDiff classifies as 'complex'
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,2 +1,12 @@',
      '+export class NewService {',
      '+  private name: string',
      '+  private age: number',
      '+  constructor(name: string, age: number) {',
      '+    this.name = name',
      '+    this.age = age',
      '+  }',
      '+}',
      '-old line 1',
      '-old line 2',
      '-old line 3',
    ].join('\n')

    const result = decideQualityGateRisk(mkInput({
      diffText: diff,
    }))
    expect(result.risk).toBe('high')
    expect(result.shouldHarden).toBe(true)
    expect(result.reasons).toContain(RISK_REASON_CODES.COMPLEXITY_COMPLEX)
  })

  // -- Reason accumulation ---------------------------------------------------

  test('multiple triggers produce all expected reason codes', () => {
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
    expect(result.reasons).toContain(`${RISK_REASON_CODES.PATH_SENSITIVE_PREFIX}:commands`)
    expect(result.reasons).toContain(RISK_REASON_CODES.STATEFUL_LOGIC)
    expect(result.reasons).toContain(RISK_REASON_CODES.PRODUCTION_DATA_LOSS_RISK)
  })

  test('empty files array defaults to low with trivial reason', () => {
    const result = decideQualityGateRisk(mkInput({
      files: [],
    }))
    expect(result.risk).toBe('low')
    expect(result.shouldHarden).toBe(false)
  })

  test('nullish/empty files defaults to low', () => {
    // @ts-expect-error testing null input path
    const result = decideQualityGateRisk(mkInput({ files: null }))
    expect(result.risk).toBe('low')
    expect(result.shouldHarden).toBe(false)
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

  test('src/types.ts returns high', () => {
    expect(assessChangeRisk(['src/types.ts'], 5, false)).toBe('high')
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
