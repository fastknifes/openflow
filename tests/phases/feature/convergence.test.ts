import { describe, expect, test } from 'bun:test'
import { evaluateFeatureConvergence } from '../../../src/phases/feature/convergence.js'
import { createInitialFeatureSession, type FeatureSession } from '../../../src/phases/feature/state-machine.js'

function session(overrides: Partial<FeatureSession>): FeatureSession {
  return {
    ...createInitialFeatureSession('feature-convergence'),
    ...overrides,
  }
}

describe('evaluateFeatureConvergence', () => {
  test('does not require target-users when intent, problem, scope, and outcome are clear', () => {
    const decision = evaluateFeatureConvergence(session({
      sourceIntent: 'Make /openflow-feature accept natural language',
      answers: {
        problem: 'The command requires users to invent a slug',
        scope: 'workflow',
        constraints: 'Do not expose sanitization errors',
      },
    }))

    expect(decision.kind).toBe('ready_to_generate')
  })

  test('asks one key question for vague input', () => {
    const decision = evaluateFeatureConvergence(session({ answers: {} }))

    expect(decision.kind).toBe('ask_next')
    expect(decision.question?.id).toBe('problem')
  })

  test('source intent alone does not satisfy boundary and outcome readiness', () => {
    const decision = evaluateFeatureConvergence(session({
      sourceIntent: '为 quality gate 引入 evidence-ledger 机制',
      featureTitle: '为 quality gate 引入 evidence-ledger 机制',
      answers: {},
    }))

    expect(decision.kind).toBe('ask_next')
    expect(decision.question?.id).toBe('scope')
  })

  test('proceed feedback produces draft with assumptions', () => {
    const decision = evaluateFeatureConvergence(session({
      answers: { problem: 'Need a softer design assistant' },
    }), '先生成草稿')

    expect(decision.kind).toBe('draft_with_assumptions')
    expect(decision.assumptions.length).toBeGreaterThan(0)
  })
})
