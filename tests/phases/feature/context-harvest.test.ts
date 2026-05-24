import { describe, expect, test } from 'bun:test'
import {
  applyConfirmedHarvestToRequirementModel,
  applyHarvestToSession,
  selectConfirmedItems,
  type HarvestChoice,
} from '../../../src/phases/feature/context-harvest.js'
import type { BrainstormContextPacket } from '../../../src/phases/feature/context-packet.js'
import { buildRequirementModel } from '../../../src/phases/feature/constraint-derivation.js'
import { createInitialFeatureSession } from '../../../src/phases/feature/state-machine.js'

function makePacket(items: BrainstormContextPacket['items']): BrainstormContextPacket {
  const now = new Date().toISOString()
  return {
    id: 'pkt-context-harvest-test',
    version: 1,
    featureHint: 'user-login',
    sourceSessionID: 'session-context-harvest-test',
    createdAt: now,
    updatedAt: now,
    items,
  }
}

describe('context harvest RequirementModel injection', () => {
  test('filters raw harvest items to high confidence or explicitly confirmed items', () => {
    const confirmed = selectConfirmedItems([
      { type: 'constraint', content: 'High confidence constraint', confidence: 'high', source: 'user' },
      { type: 'risk', content: 'Unconfirmed medium risk', confidence: 'medium', source: 'assistant' },
      { type: 'decision', content: 'Confirmed low decision', confidence: 'low', source: 'user', confirmedBy: 'alice' },
    ])

    expect(confirmed.map((item) => item.content)).toEqual([
      'High confidence constraint',
      'Confirmed low decision',
    ])
  })

  test('maps confirmed harvest fields without overwriting manual answers', () => {
    const model = buildRequirementModel('user-login', {
      problem: 'Manual problem remains authoritative',
      scope: 'new-feature',
      constraints: 'Must keep existing auth flow',
    })

    const injected = applyConfirmedHarvestToRequirementModel(model, [
      { type: 'problem', content: 'Packet problem should not replace manual problem', confidence: 'high', source: 'user' },
      { type: 'constraint', content: 'Keep SSO integration stable', confidence: 'high', source: 'assistant' },
      { type: 'decision', content: 'Use the existing session binding model', confidence: 'medium', source: 'user', confirmedBy: 'reviewer' },
      { type: 'nonGoal', content: 'Do not redesign password reset', confidence: 'high', source: 'user' },
      { type: 'risk', content: 'Session migration can regress active users', confidence: 'high', source: 'assistant' },
      { type: 'example', content: 'User submits login and the system returns an SSO challenge', confidence: 'high', source: 'user' },
      { type: 'constraint', content: 'Unconfirmed medium item is omitted', confidence: 'medium', source: 'assistant' },
    ])

    expect(injected.problemStatement).toBe('Manual problem remains authoritative')
    expect(injected.constraints.some((constraint) => constraint.description.includes('Keep SSO integration stable'))).toBe(true)
    expect(injected.constraints.some((constraint) => constraint.description.includes('Decision from brainstorm: Use the existing session binding model'))).toBe(true)
    expect(injected.constraints.some((constraint) => constraint.description.includes('Unconfirmed medium item is omitted'))).toBe(false)
    expect(injected.nonGoals.some((nonGoal) => nonGoal.includes('Do not redesign password reset'))).toBe(true)
    expect(injected.risks?.some((risk) => risk.description.includes('Session migration can regress active users'))).toBe(true)
    expect(injected.acceptanceCriteria.some((criterion) => criterion.description.includes('system returns an SSO challenge'))).toBe(true)
  })

  test('keeps brainstorm open questions as pending confirmations only', () => {
    const model = buildRequirementModel('user-login', {
      problem: 'Reduce repeated login work',
      scope: 'new-feature',
      constraints: 'Must keep existing auth flow',
    })

    const injected = applyConfirmedHarvestToRequirementModel(model, [
      { type: 'openQuestion', content: 'Should this support SAML on day one?', confidence: 'high', source: 'user' },
    ])

    expect(injected.pendingConfirmations?.some((item) => item.includes('Should this support SAML on day one?'))).toBe(true)
    expect(injected.constraints.some((constraint) => constraint.description.includes('Should this support SAML'))).toBe(false)
    expect(injected.nonGoals.some((nonGoal) => nonGoal.includes('Should this support SAML'))).toBe(false)
  })

  test('explicit use stores selected medium and low confidence items as confirmed session harvest', () => {
    const packet = makePacket([
      { type: 'constraint', content: 'Medium packet constraint', confidence: 'medium', source: 'assistant' },
      { type: 'decision', content: 'Low packet decision', confidence: 'low', source: 'user' },
    ])
    const choice: HarvestChoice = {
      kind: 'use',
      candidate: { packet, matchType: 'exact', items: packet.items ?? [] },
    }

    const session = applyHarvestToSession(createInitialFeatureSession('user-login'), choice)

    expect(session.pendingContextHarvest?.confirmedItems?.map((item) => item.content)).toEqual([
      'Medium packet constraint',
      'Low packet decision',
    ])
    expect(session.pendingContextHarvest?.confirmedItems?.every((item) => item.confirmedBy === 'context-harvest')).toBe(true)
  })
})
