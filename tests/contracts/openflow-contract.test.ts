import { describe, test, expect } from 'bun:test'
import type {
  BehaviorScenario,
  AlignmentItem,
  Constraint,
  OpenFlowContract,
} from '../../src/contracts/openflow-contract.js'
import { defaultConfig } from '../../src/types.js'
import type { DriftDisposition } from '../../src/types.js'

describe('OpenFlowContract types', () => {
  test('BehaviorScenario can be constructed with all fields', () => {
    const scenario: BehaviorScenario = {
      id: 'bs-1',
      name: 'User login',
      given: ['user exists', 'page loaded'],
      when: ['user clicks login'],
      then: ['dashboard shown'],
      mustNot: ['error page shown'],
      criticality: 'critical',
    }
    expect(scenario.id).toBe('bs-1')
    expect(scenario.given).toEqual(['user exists', 'page loaded'])
    expect(scenario.criticality).toBe('critical')
    expect(scenario.mustNot).toEqual(['error page shown'])
  })

  test('BehaviorScenario works without optional mustNot field', () => {
    const scenario: BehaviorScenario = {
      id: 'bs-2',
      name: 'Simple case',
      given: ['setup'],
      when: ['action'],
      then: ['result'],
      criticality: 'normal',
    }
    expect(scenario.mustNot).toBeUndefined()
    expect(scenario.criticality).toBe('normal')
  })

  test('AlignmentItem has all required fields', () => {
    const item: AlignmentItem = {
      behaviorId: 'bs-1',
      designResponse: 'Login flow',
      files: ['src/auth.ts'],
      modules: ['auth'],
      expectedSymbols: ['login', 'authenticate'],
      risk: 'medium',
    }
    expect(item.behaviorId).toBe('bs-1')
    expect(item.risk).toBe('medium')
    expect(item.expectedSymbols).toHaveLength(2)
  })

  test('Constraint supports source current and decision', () => {
    const current: Constraint = {
      source: 'current',
      file: 'docs/current/design.md',
      rule: 'Must not change API',
      severity: 'blocking',
    }
    const decision: Constraint = {
      source: 'decision',
      file: 'docs/decisions/ADR-001.md',
      rule: 'Use PostgreSQL',
      severity: 'warning',
    }
    expect(current.source).toBe('current')
    expect(decision.source).toBe('decision')
    expect(current.severity).toBe('blocking')
  })

  test('OpenFlowContract can be constructed with all fields', () => {
    const contract: OpenFlowContract = {
      feature: 'my-feature',
      sourceFiles: ['docs/changes/2026-01-01-my-feature/design.md'],
      behaviorScenarios: [],
      alignmentItems: [],
      currentConstraints: [],
      decisionConstraints: [],
      extractedAt: '2026-01-01T00:00:00Z',
      sourceHashes: { 'design.md': 'abc123' },
    }
    expect(contract.feature).toBe('my-feature')
    expect(contract.sourceHashes['design.md']).toBe('abc123')
    expect(contract.extractedAt).toBe('2026-01-01T00:00:00Z')
  })
})

describe('Guardian config defaults', () => {
  test('defaultConfig.guardian.enabled is true', () => {
    expect(defaultConfig.guardian.enabled).toBe(true)
  })

  test('defaultConfig.guardian.max_retries is 3', () => {
    expect(defaultConfig.guardian.max_retries).toBe(3)
  })

  test('defaultConfig.guardian.state_dir is correct', () => {
    expect(defaultConfig.guardian.state_dir).toBe('.sisyphus/openflow/guardian')
  })
})

describe('DriftDisposition type', () => {
  test('DriftDisposition accepts all valid values', () => {
    const values: DriftDisposition[] = [
      'auto_repaired',
      'ambiguous_needs_confirmation',
      'violation_needs_fix',
      'no_drift',
    ]
    expect(values).toHaveLength(4)
    expect(values).toContain('auto_repaired')
    expect(values).toContain('no_drift')
  })
})
