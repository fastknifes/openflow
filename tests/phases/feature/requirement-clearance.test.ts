import { describe, expect, test } from 'bun:test'
import { assessRequirementClearance, createInitialClarificationState } from '../../../src/phases/feature/requirement-clearance.js'
import type { FeatureSession } from '../../../src/phases/feature/state-machine.js'

function makeSession(facts: Record<string, string>, overrides: Partial<FeatureSession> = {}): FeatureSession {
  return {
    version: 4,
    feature: 'clearance-test',
    sourceIntent: 'clearance-test',
    workflowState: 'collecting',
    collectedFacts: facts,
    assumptions: [],
    pendingConfirmations: [],
    draftStatus: 'final',
    generatedDocs: [],
    generationAttemptCount: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('assessRequirementClearance', () => {
  test('sparse facts trigger needs_clarification with blocking questions', () => {
    const session = makeSession({
      motivation: 'Optimize the archive workflow to support two usage modes',
      mode1: 'Planned development workflow archival',
      mode2: 'Ad-hoc issue fix archival',
    })

    const report = assessRequirementClearance(session)

    expect(report.status).toBe('needs_clarification')
    expect(report.missingDimensions).toContain('constraints')
    // architecture may match via "workflow" or not, but at least constraints is missing
    expect(report.questions.length).toBeGreaterThanOrEqual(1)
    expect(report.round).toBe(1)
    expect(report.maxRoundsReached).toBe(false)
  })

  test('rich facts pass Gate 1 and return ready_for_generation', () => {
    const session = makeSession({
      problem: 'Current handleArchive is 1284 lines with mixed responsibilities',
      'constraint-compat': 'Must maintain backward compatibility with existing archive directory structure',
      'constraint-isolation': 'Staging directory must be atomic — failure deletes staging',
      'architecture': 'Split into 6 independent phases: resolve, validate, collect, promote, finalize, report',
      'scenario-planned': 'quality-gate confirms readiness → archive validates → collects artifacts → finalizes',
      'scenario-adhoc': 'User calls archive without feature workflow → minimal validation → generates issue-resolution',
    })

    const report = assessRequirementClearance(session)

    expect(report.status).toBe('ready_for_generation')
    expect(report.coveredDimensions).toContain('problem')
    expect(report.coveredDimensions).toContain('constraints')
    expect(report.coveredDimensions).toContain('architecture')
    expect(report.coveredDimensions).toContain('behavior')
    expect(report.questions).toHaveLength(0)
  })

  test('round 1 only asks blocking questions; round 2+ asks non-blocking too', () => {
    const session = makeSession({
      problem: 'Fix the archive command',
      'constraint-1': 'Must maintain backward compatibility',
      'constraint-2': 'Existing module APIs must not change',
      'architecture': 'Split into phases',
      // behavior missing → blocking
    })

    // Round 1: only blocking dimension (behavior) is asked
    const report1 = assessRequirementClearance(session)
    expect(report1.status).toBe('needs_clarification')
    expect(report1.missingDimensions).toContain('behavior')
    // data_contracts, failure_semantics etc. are non-blocking, should NOT be in round 1
    expect(report1.missingDimensions).not.toContain('data_contracts')
    expect(report1.missingDimensions).not.toContain('failure_semantics')

    // Round 2: with clarificationState, non-blocking dimensions now appear
    const session2 = makeSession(session.collectedFacts, {
      clarificationState: { round: 1, maxRounds: 5, unresolvedDimensions: ['behavior'] },
    })
    const report2 = assessRequirementClearance(session2)
    // Now non-blocking dimensions should appear in missing
    expect(report2.missingDimensions).toContain('behavior')
    // Non-blocking dimensions are included in round 2+
    expect(report2.missingDimensions.length).toBeGreaterThan(report1.missingDimensions.length)
  })

  test('max rounds reached triggers escalation flag', () => {
    const session = makeSession(
      { motivation: 'Optimize something' }, // will fail all blocking checks
      {
        clarificationState: { round: 4, maxRounds: 5, unresolvedDimensions: ['problem'] },
      },
    )

    const report = assessRequirementClearance(session)
    expect(report.round).toBe(5)
    expect(report.maxRoundsReached).toBe(true)
  })

  test('no facts at all triggers needs_clarification with all blocking dimensions', () => {
    const session = makeSession({})

    const report = assessRequirementClearance(session)

    expect(report.status).toBe('needs_clarification')
    expect(report.missingDimensions).toContain('problem')
    expect(report.missingDimensions).toContain('constraints')
    expect(report.missingDimensions).toContain('architecture')
    expect(report.missingDimensions).toContain('behavior')
  })

  test('createInitialClarificationState returns round 0', () => {
    const state = createInitialClarificationState()
    expect(state?.round).toBe(0)
    expect(state?.maxRounds).toBe(5)
  })
})
