import { describe, expect, test } from 'bun:test'
import { VerifyDecisionType, VerifyReadinessStatus } from '../../src/types.js'
import type { AcceptanceState, DevelopmentPhase, VerifyResult } from '../../src/types.js'

describe('readiness contract types', () => {
  test('phase and readiness coexist independently', () => {
    const phase: DevelopmentPhase = 'acceptance'
    const readiness: VerifyReadinessStatus = VerifyReadinessStatus.ReadyWithDocUpdates
    const decisionType: VerifyDecisionType = VerifyDecisionType.CurrentConflict

    const verifyResult: VerifyResult = {
      readiness,
      reasonCodes: ['doc-update-required'],
      decisionType,
      evidenceSummary: 'core evidence is sufficient; docs need updates',
      constraintsChecked: ['design', 'current'],
      verifiedAt: new Date().toISOString(),
    }

    const state: AcceptanceState = {
      feature: 'demo',
      phase,
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      readiness,
      verifyResult,
    }

    expect(state.phase).toBe(phase)
    expect(state.readiness).toBe(readiness)
    expect(state.verifyResult).toEqual(verifyResult)
  })
})
