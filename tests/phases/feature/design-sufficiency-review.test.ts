import { describe, expect, test } from 'bun:test'
import { evaluateDesignSufficiency } from '../../../src/phases/feature/design-sufficiency-review.js'
import type { RequirementModelV2 } from '../../../src/phases/feature/requirement-model-v2.js'

function makeBaseModel(overrides: Partial<RequirementModelV2> = {}): RequirementModelV2 {
  return {
    feature: 'test-feature',
    title: 'test feature',
    problem: {
      currentState: 'Current state',
      painPoints: [],
      desiredChange: 'Desired change',
      sourceEvidenceIds: [],
    },
    goals: [],
    decisions: [],
    constraints: [],
    nonGoals: [],
    behaviorScenarios: [],
    successCriteria: [],
    risks: [],
    openQuestions: [],
    completeness: 'missing_goals',
    evidence: {
      feature: 'test-feature',
      problems: [],
      goals: [],
      decisions: [],
      constraints: [],
      nonGoals: [],
      examples: [],
      risks: [],
      openQuestions: [],
      architectureNotes: [],
      integrationNotes: [],
      dataContractNotes: [],
      rawSources: [],
    },
    ...overrides,
  }
}

describe('evaluateDesignSufficiency', () => {
  test('marks structurally incomplete models as not ready', () => {
    const report = evaluateDesignSufficiency(makeBaseModel(), [])

    expect(report.status).toBe('not_ready')
    expect(report.structuralCompleteness).toBe('missing_goals')
    expect(report.designReadiness).toBe('not_ready')
    expect(report.findings.some((finding) => finding.severity === 'blocking')).toBe(true)
  })

  test('detects structurally complete but implementation-insufficient harden design', () => {
    const model = makeBaseModel({
      goals: [{ id: 'g-0001', description: 'Create harden DAG flow', sourceEvidenceIds: [] }],
      constraints: [
        {
          id: 'c-0001',
          category: 'scope',
          severity: 'must',
          description: 'quality-gate triggers harden DAG and reviewer/executor sessions exchange findings',
          rationale: 'test',
          verificationMethod: 'Review implementation against constraint',
          sourceEvidenceIds: [],
        },
      ],
      behaviorScenarios: [
        {
          id: 'bs-0001',
          title: 'quality-gate starts harden DAG',
          actor: 'quality-gate',
          given: ['quality-gate invoked'],
          when: 'harden is needed',
          then: ['quality-gate triggers harden DAG'],
          sourceEvidenceIds: [],
        },
      ],
      successCriteria: [
        {
          id: 'sc-0001',
          outcome: 'Verify that quality-gate triggers harden DAG',
          verificationMethod: 'Design and implementation review',
          evidenceType: 'manual-review',
          sourceEvidenceIds: [],
        },
      ],
      architecture: {
        components: [{ name: 'quality-gate', role: 'trigger', responsibilities: ['starts harden DAG'] }],
        taskFlows: [{ id: 'tf-0001', title: 'harden flow', steps: [{ id: '1', actor: 'quality-gate', action: 'start harden DAG' }] }],
        payloadSchemas: [],
        integrationBoundaries: [],
      },
      completeness: 'complete',
    })

    const report = evaluateDesignSufficiency(model, [])

    expect(report.status).toBe('not_ready')
    expect(report.structuralCompleteness).toBe('structurally_complete')
    expect(report.designReadiness).not.toBe('ready_for_planning')
    expect(report.missingImplementationFacts.length).toBeGreaterThan(0)
  })

  test('allows planning when constraints have behavior, contract, failure, boundary, and automated verification coverage', () => {
    const model = makeBaseModel({
      goals: [{ id: 'g-0001', description: 'Run isolated harden DAG with explicit abort and output contract', sourceEvidenceIds: [] }],
      constraints: [
        {
          id: 'c-0001',
          category: 'scope',
          severity: 'must',
          description: 'harden DAG uses task id prefix and harden_result schema with abort timeout cancelled state',
          rationale: 'test',
          verificationMethod: 'Automated integration test',
          sourceEvidenceIds: [],
        },
      ],
      behaviorScenarios: [
        {
          id: 'bs-0001',
          title: 'isolated harden DAG aborts on timeout',
          actor: 'quality-gate',
          given: ['harden DAG is running'],
          when: 'timeout occurs',
          then: ['pending tasks are cancelled and harden_result records timeout status'],
          sourceEvidenceIds: [],
        },
      ],
      successCriteria: [
        {
          id: 'sc-0001',
          outcome: 'harden DAG uses task id prefix and harden_result schema with abort timeout cancelled state',
          verificationMethod: 'Automated integration test',
          evidenceType: 'test',
          sourceEvidenceIds: [],
        },
      ],
      architecture: {
        components: [{ name: 'harden DAG', role: 'isolated execution', responsibilities: ['task id prefix', 'abort timeout cancelled state'] }],
        taskFlows: [{ id: 'tf-0001', title: 'abort flow', steps: [{ id: '1', actor: 'quality-gate', action: 'abort timeout', output: 'harden_result schema' }] }],
        payloadSchemas: [{
          name: 'harden_result',
          purpose: 'output contract',
          fields: [
            { name: 'readiness', type: 'enum', required: true, description: 'ready/not_ready/timeout' },
            { name: 'status', type: 'enum', required: true, description: 'succeeded/failed/cancelled' },
          ],
        }],
        integrationBoundaries: [{
          from: 'quality-gate',
          to: 'harden DAG',
          contract: 'quality-gate owns abort timeout and reads harden_result schema',
          allowedChanges: ['create isolated harden DAG'],
          forbiddenChanges: ['bypass readiness ownership'],
        }],
      },
      completeness: 'complete',
    })

    const report = evaluateDesignSufficiency(model, [])

    expect(report.status).toBe('ready')
    expect(report.designReadiness).toBe('ready_for_planning')
  })
})
