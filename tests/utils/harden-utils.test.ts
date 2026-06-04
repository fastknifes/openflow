import { describe, expect, test } from 'bun:test'
import { classifyFindings, gradeComplexityFromDiff } from '../../src/utils/harden-utils.js'

describe('gradeComplexityFromDiff', () => {
  test('empty diff returns trivial', () => {
    expect(gradeComplexityFromDiff('')).toBe('trivial')
    expect(gradeComplexityFromDiff('   ')).toBe('trivial')
  })

  test('diff with 3 or fewer changed lines returns trivial', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abc..def 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,3 @@',
      '- old line',
      '+ new line',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('trivial')
  })

  test('single file tiny diff (<=10 lines) returns trivial', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,5 +1,5 @@',
      '-line1',
      '-line2',
      '+line1a',
      '+line2a',
      '+line3',
      '+line4',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('trivial')
  })

  test('single file medium diff (11-50 lines) returns simple', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,5 +1,30 @@',
      '-old',
      ...Array.from({ length: 19 }, (_, i) => `+new line ${i}`),
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('simple')
  })

  test('two-file simple diff returns simple', () => {
    const diff = [
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
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('simple')
  })

  test('three-file diff returns complex', () => {
    const diff = [
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
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('complex')
  })

  test('50+ changed lines returns complex', () => {
    const lines: string[] = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
    ]
    for (let i = 0; i < 30; i++) {
      lines.push(`+new line ${i}`)
      lines.push(`-old line ${i}`)
    }
    expect(gradeComplexityFromDiff(lines.join('\n'))).toBe('complex')
  })

  test('exported function definition returns complex', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,2 +1,10 @@',
      '+export function newHelper() {',
      '+  const a = 1',
      '+  const b = 2',
      '+  const c = 3',
      '+  const d = 4',
      '+  const e = 5',
      '+  return a + b + c + d + e',
      '+}',
      '-old line 1',
      '-old line 2',
      '-old line 3',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('complex')
  })

  test('class definition returns complex', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,2 +1,12 @@',
      '+class NewService {',
      '+  private name: string',
      '+  private age: number',
      '+  private email: string',
      '+  constructor(name: string, age: number) {',
      '+    this.name = name',
      '+    this.age = age',
      '+    this.email = ""',
      '+  }',
      '+}',
      '-old line 1',
      '-old line 2',
      '-old line 3',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('complex')
  })

  test('doc-only files (.md) returns trivial', () => {
    const diff = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,5 +1,10 @@',
      '-old text',
      '+new text',
      '+more new text',
      '+even more new text',
      '+and more',
      '+extra line',
      '+another line',
      '+yet another line',
      '+still going',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('trivial')
  })
})

describe('classifyFindings quality-gate-workflow-redesign red phase', () => {
  test('SC-003 records explicit behavior violation as fixable and blocking', () => {
    const result = classifyFindings([
      '### Finding H-SC-003',
      'Level: spec_violation',
      'The behavior.md explicitly requires behavior X, but src/gate.ts implements behavior Y.',
      'Evidence: docs/changes/feature/behavior.md says X; src/gate.ts does Y.',
      'Files: src/gate.ts',
    ].join('\n'), [])

    const finding = result.actionable[0] as Record<string, unknown>
    expect(finding?.taxonomy).toBe('behavior_violation')
    expect(finding?.decision).toBe('fix_implementation')
    expect(finding?.readinessEffect).toBe('blocks_until_resolved')
  })

  test('SC-004 records aligned inferable intent gap without blocking readiness', () => {
    const result = classifyFindings([
      '### Finding H-SC-004',
      'Level: design_ambiguity',
      'Approved docs do not explicitly cover fallback logging, but surrounding context implies it should be allowed.',
      'Evidence: design context supports the current implementation.',
      'Files: src/fallback.ts',
    ].join('\n'), [])

    const finding = [...result.ambiguous, ...result.nonBlocking][0] as Record<string, unknown>
    expect(finding?.taxonomy).toBe('intent_gap')
    expect(finding?.inferredIntent).toContain('fallback logging should be allowed')
    expect(finding?.confidence).toBe('medium')
    expect(finding?.alignment).toBe('aligned')
    expect(finding?.decision).toBe('doc_update_required')
    expect(finding?.readinessEffect).toBe('ready_with_doc_updates_allowed')
  })

  test('SC-005 records misaligned inferable intent gap as implementation fix', () => {
    const result = classifyFindings([
      '### Finding H-SC-005',
      'Level: design_ambiguity',
      'Docs omit retry semantics, but current/design context implies retry once; implementation retries forever.',
      'Evidence: docs/current/workflow/retry.md implies bounded retry.',
      'Files: src/retry.ts',
    ].join('\n'), [])

    const finding = result.actionable[0] as Record<string, unknown>
    expect(finding?.taxonomy).toBe('intent_gap')
    expect(finding?.alignment).toBe('misaligned')
    expect(finding?.decision).toBe('fix_implementation')
    expect(finding?.executorAllowed).toBe(true)
  })

  test('SC-006 records uninferable intent gap as needs decision', () => {
    const result = classifyFindings([
      '### Finding H-SC-006',
      'Level: design_ambiguity',
      'Docs do not cover archive retry order and two reasonable interpretations exist.',
      'Evidence: behavior.md and design.md are silent.',
      'Files: src/archive.ts',
    ].join('\n'), [])

    const finding = result.ambiguous[0] as Record<string, unknown>
    expect(finding?.taxonomy).toBe('intent_gap')
    expect(finding?.confidence).toBe('low')
    expect(finding?.decision).toBe('needs_decision')
    expect(finding?.decisionQuestion).toContain('archive retry order')
  })

  test('SC-007 records contract divergence as decision-required and not silently fixable', () => {
    const result = classifyFindings([
      '### Finding H-SC-007',
      'Level: spec_violation',
      'Implementation changes the approved archive readiness contract by auto-archiving after ready.',
      'Evidence: behavior.md requires awaiting archive confirmation.',
      'Files: src/commands/archive.ts',
    ].join('\n'), [])

    const finding = result.ambiguous[0] as Record<string, unknown>
    expect(finding?.taxonomy).toBe('contract_divergence')
    expect(finding?.decision).toBe('needs_decision')
    expect(finding?.executorAllowed).toBe(false)
  })

  test('SC-008 recognizes explicit behavior_violation as actionable and fixable', () => {
    const result = classifyFindings([
      '### Finding H-SC-008',
      'Level: behavior_violation',
      'The implementation returns 404 instead of 403 for unauthorized access.',
      'Evidence: src/auth.ts line 45 returns 404.',
      'Files: src/auth.ts',
    ].join('\n'), [])

    const finding = result.actionable[0] as Record<string, unknown>
    expect(finding?.level).toBe('behavior_violation')
    expect(finding?.taxonomy).toBe('behavior_violation')
    expect(finding?.decision).toBe('fix_implementation')
    expect(finding?.executorAllowed).toBe(true)
    expect(finding?.readinessEffect).toBe('blocks_until_resolved')
  })

  test('SC-009 recognizes explicit intent_gap aligned as non-blocking doc update', () => {
    const result = classifyFindings([
      '### Finding H-SC-009',
      'Level: intent_gap',
      'Docs do not explicitly cover retry count, but surrounding context implies bounded retry.',
      'Evidence: current implementation matches the inferred intent.',
      'Files: src/retry.ts',
    ].join('\n'), [])

    const finding = result.nonBlocking[0] as Record<string, unknown>
    expect(finding?.level).toBe('intent_gap')
    expect(finding?.taxonomy).toBe('intent_gap')
    expect(finding?.decision).toBe('doc_update_required')
    expect(finding?.executorAllowed).toBe(false)
    expect(finding?.readinessEffect).toBe('ready_with_doc_updates_allowed')
  })

  test('SC-010 recognizes explicit intent_gap misaligned as actionable fix', () => {
    const result = classifyFindings([
      '### Finding H-SC-010',
      'Level: intent_gap',
      'Docs omit retry semantics, but context implies retry once; implementation retries forever.',
      'Evidence: implementation retries forever.',
      'Files: src/retry.ts',
    ].join('\n'), [])

    const finding = result.actionable[0] as Record<string, unknown>
    expect(finding?.level).toBe('intent_gap')
    expect(finding?.taxonomy).toBe('intent_gap')
    expect(finding?.decision).toBe('fix_implementation')
    expect(finding?.executorAllowed).toBe(true)
  })

  test('SC-011 recognizes explicit contract_divergence as ambiguous and not executor-fixable', () => {
    const result = classifyFindings([
      '### Finding H-SC-011',
      'Level: contract_divergence',
      'Implementation silently modifies the approved contract by changing archive behavior.',
      'Evidence: behavior.md requires awaiting confirmation.',
      'Files: src/archive.ts',
    ].join('\n'), [])

    const finding = result.ambiguous[0] as Record<string, unknown>
    expect(finding?.level).toBe('contract_divergence')
    expect(finding?.taxonomy).toBe('contract_divergence')
    expect(finding?.decision).toBe('needs_decision')
    expect(finding?.executorAllowed).toBe(false)
  })

  test('SC-012 recognizes explicit missing_evidence as ambiguous', () => {
    const result = classifyFindings([
      '### Finding H-SC-012',
      'Level: missing_evidence',
      'Cannot verify the retry logic without more context.',
      'Evidence: insufficient.',
      'Files: src/retry.ts',
    ].join('\n'), [])

    const finding = result.ambiguous[0] as Record<string, unknown>
    expect(finding?.level).toBe('missing_evidence')
    expect(finding?.taxonomy).toBe('missing_evidence')
    expect(finding?.decision).toBe('needs_decision')
    expect(finding?.executorAllowed).toBe(false)
  })

  test('SC-013 recognizes explicit regression_risk as actionable when evidence present', () => {
    const result = classifyFindings([
      '### Finding H-SC-013',
      'Level: regression_risk',
      'Changing the default timeout may break existing clients.',
      'Evidence: src/client.ts depends on the old default.',
      'Files: src/client.ts',
    ].join('\n'), [])

    const finding = result.actionable[0] as Record<string, unknown>
    expect(finding?.level).toBe('regression_risk')
    expect(finding?.taxonomy).toBe('regression_risk')
    expect(finding?.decision).toBe('fix_implementation')
    expect(finding?.executorAllowed).toBe(true)
  })

  test('SC-014 maps legacy blocking_bug to behavior_violation without losing compatibility', () => {
    const result = classifyFindings([
      '### Finding H-SC-014',
      'Level: blocking_bug',
      'The function crashes on null input.',
      'Evidence: src/parse.ts line 12 throws.',
      'Files: src/parse.ts',
    ].join('\n'), [])

    const finding = result.actionable[0] as Record<string, unknown>
    expect(finding?.level).toBe('blocking_bug')
    expect(finding?.taxonomy).toBe('behavior_violation')
    expect(finding?.decision).toBe('fix_implementation')
    expect(finding?.executorAllowed).toBe(true)
  })

  test('SC-015 parses inline level keywords for new taxonomy levels', () => {
    const result = classifyFindings([
      'Some review text without markdown headers',
      'behavior_violation: the implementation contradicts approved behavior.',
      'Evidence: confirmed by comparing spec section 3.2 with src/handler.ts output.',
      'intent_gap: docs do not cover this case but context implies it.',
      'contract_divergence: implementation changes the contract.',
      'missing_evidence: cannot verify this claim.',
    ].join('\n'), [])

    expect(result.actionable.length).toBeGreaterThanOrEqual(1)
    expect(result.ambiguous.length).toBeGreaterThanOrEqual(2)
    const levels = [
      ...result.actionable.map(f => (f as Record<string, unknown>).level),
      ...result.ambiguous.map(f => (f as Record<string, unknown>).level),
      ...result.nonBlocking.map(f => (f as Record<string, unknown>).level),
    ]
    expect(levels).toContain('behavior_violation')
    expect(levels).toContain('contract_divergence')
    expect(levels).toContain('missing_evidence')
  })
})
