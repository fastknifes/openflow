import { describe, expect, test } from 'bun:test'
import { filterExecutorFindings } from '../../src/commands/harden.js'
import type { HardenFinding } from '../../src/types.js'

describe('filterExecutorFindings quality-gate-workflow-redesign', () => {
  function makeFinding(overrides: Partial<HardenFinding> & { executorAllowed?: boolean; taxonomy?: string; decision?: string }): HardenFinding {
    return {
      level: 'blocking_bug',
      description: 'test finding',
      evidence: 'evidence',
      files: ['src/test.ts'],
      disposition: 'must_fix',
      ...overrides,
    } as HardenFinding
  }

  test('allows behavior_violation with must_fix', () => {
    const findings = [makeFinding({ level: 'behavior_violation', taxonomy: 'behavior_violation', decision: 'fix_implementation', executorAllowed: true })]
    expect(filterExecutorFindings(findings)).toHaveLength(1)
  })

  test('allows blocking_bug (backward compatibility) mapped to behavior_violation', () => {
    const findings = [makeFinding({ level: 'blocking_bug', taxonomy: 'behavior_violation', decision: 'fix_implementation', executorAllowed: true })]
    expect(filterExecutorFindings(findings)).toHaveLength(1)
  })

  test('allows spec_violation when fixable', () => {
    const findings = [makeFinding({ level: 'spec_violation', taxonomy: 'behavior_violation', decision: 'fix_implementation', executorAllowed: true })]
    expect(filterExecutorFindings(findings)).toHaveLength(1)
  })

  test('allows regression_risk with must_fix', () => {
    const findings = [makeFinding({ level: 'regression_risk', taxonomy: 'regression_risk', decision: 'fix_implementation', executorAllowed: true })]
    expect(filterExecutorFindings(findings)).toHaveLength(1)
  })

  test('filters out intent_gap when aligned (doc update only)', () => {
    const findings = [makeFinding({ level: 'intent_gap', taxonomy: 'intent_gap', decision: 'doc_update_required', executorAllowed: false, disposition: 'accepted_known_issue' })]
    expect(filterExecutorFindings(findings)).toHaveLength(0)
  })

  test('allows intent_gap when misaligned (implementation fix)', () => {
    const findings = [makeFinding({ level: 'intent_gap', taxonomy: 'intent_gap', decision: 'fix_implementation', executorAllowed: true, disposition: 'must_fix' })]
    expect(filterExecutorFindings(findings)).toHaveLength(1)
  })

  test('filters out intent_gap when conflicting or low confidence', () => {
    const findings = [makeFinding({ level: 'intent_gap', taxonomy: 'intent_gap', decision: 'needs_decision', executorAllowed: false, disposition: 'needs_decision' })]
    expect(filterExecutorFindings(findings)).toHaveLength(0)
  })

  test('filters out contract_divergence regardless of disposition', () => {
    const findings = [makeFinding({ level: 'contract_divergence', taxonomy: 'contract_divergence', decision: 'needs_decision', executorAllowed: false, disposition: 'needs_decision' })]
    expect(filterExecutorFindings(findings)).toHaveLength(0)
  })

  test('filters out missing_evidence regardless of disposition', () => {
    const findings = [makeFinding({ level: 'missing_evidence', taxonomy: 'missing_evidence', decision: 'needs_decision', executorAllowed: false, disposition: 'needs_decision' })]
    expect(filterExecutorFindings(findings)).toHaveLength(0)
  })

  test('filters out accepted_known_issue findings', () => {
    const findings = [makeFinding({ level: 'design_ambiguity', taxonomy: 'intent_gap', decision: 'doc_update_required', executorAllowed: false, disposition: 'accepted_known_issue' })]
    expect(filterExecutorFindings(findings)).toHaveLength(0)
  })

  test('filters out style_or_preference', () => {
    const findings = [makeFinding({ level: 'style_or_preference', disposition: undefined })]
    expect(filterExecutorFindings(findings)).toHaveLength(0)
  })

  test('filters out findings without must_fix disposition', () => {
    const findings = [makeFinding({ level: 'behavior_violation', taxonomy: 'behavior_violation', decision: 'fix_implementation', executorAllowed: true, disposition: 'needs_decision' })]
    expect(filterExecutorFindings(findings)).toHaveLength(0)
  })
})
