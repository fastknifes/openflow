import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import {
  saveAcceptanceState,
  loadAcceptanceState,
  clearAcceptanceState,
  addPendingDocUpdate,
  setWaitingForDocUpdateConfirm,
  clearWaitingForDocUpdateConfirm,
  enterAcceptancePhase,
  saveVerifyResult,
} from '../../src/utils/acceptance-state.js'
import { VerifyDecisionType, VerifyReadinessStatus, type AcceptanceState, type VerifyResult } from '../../src/types.js'

const TEST_ROOT = join(process.cwd(), '.test-acceptance-state')

describe('acceptance-state', () => {
  test('save and load round-trip', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'demo',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      sessionID: 'session-xyz',
      verificationPromptedAt: new Date().toISOString(),
      verificationFailureCategory: 'quality',
      pendingDocUpdates: [{ file: 'docs/current/design/demo.md', timestamp: new Date().toISOString(), reason: 'sync' }],
      waitingForDocUpdateConfirm: true,
      lastChangedFile: 'src/demo.ts',
      promotionSuggestions: [
        {
          type: 'UPDATE',
          targetArea: 'design',
          sourcePath: 'docs/archive/demo/design',
          targetPath: 'docs/current/design/demo',
          reason: 'test',
        },
      ],
      promotionApplied: false,
    }

    await saveAcceptanceState(TEST_ROOT, state)
    const loaded = await loadAcceptanceState(TEST_ROOT)

    expect(loaded).not.toBeNull()
    expect(loaded?.feature).toBe('demo')
    expect(loaded?.phase).toBe('acceptance')
    expect(loaded?.sessionID).toBe('session-xyz')
    expect(loaded?.pendingDocUpdates.length).toBe(1)
    expect(loaded?.waitingForDocUpdateConfirm).toBe(true)
    expect(loaded?.lastChangedFile).toBe('src/demo.ts')
    expect(loaded?.verificationFailureCategory).toBe('quality')
    expect(loaded?.promotionSuggestions?.length).toBe(1)
    expect(loaded?.promotionApplied).toBe(false)

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('enterAcceptancePhase is idempotent for same feature', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    const first = await enterAcceptancePhase(TEST_ROOT, 'feature-a')
    const second = await enterAcceptancePhase(TEST_ROOT, 'feature-a')

    expect(second.feature).toBe(first.feature)
    expect(second.phaseStartedAt).toBe(first.phaseStartedAt)

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('pending update and waiting flags can be updated and cleared', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    await enterAcceptancePhase(TEST_ROOT, 'feature-b')
    await addPendingDocUpdate(TEST_ROOT, {
      file: 'docs/current/design/feature-b/design.md',
      timestamp: new Date().toISOString(),
      reason: 'post-acceptance change',
    })
    await setWaitingForDocUpdateConfirm(TEST_ROOT, 'src/feature-b/service.ts')

    let loaded = await loadAcceptanceState(TEST_ROOT)
    expect(loaded?.pendingDocUpdates.length).toBe(1)
    expect(loaded?.waitingForDocUpdateConfirm).toBe(true)
    expect(loaded?.lastChangedFile).toBe('src/feature-b/service.ts')

    await clearWaitingForDocUpdateConfirm(TEST_ROOT, 'confirmed')
    loaded = await loadAcceptanceState(TEST_ROOT)
    expect(loaded?.waitingForDocUpdateConfirm).toBe(false)
    expect(loaded?.archiveDocUpdateConfirmationStatus).toBe('confirmed')
    expect(loaded?.archiveDocUpdateConfirmedAt).toBeDefined()
    expect(loaded?.lastChangedFile).toBeUndefined()

    await clearAcceptanceState(TEST_ROOT)
    const cleared = await loadAcceptanceState(TEST_ROOT)
    expect(cleared).toBeNull()

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('clearing waiting confirmation can record declined status without confirmation timestamp', async () => {
    const root = join(TEST_ROOT, 'declined-doc-confirm')
    await rm(root, { recursive: true, force: true })

    await enterAcceptancePhase(root, 'feature-c')
    await setWaitingForDocUpdateConfirm(root, 'src/feature-c/service.ts')
    await clearWaitingForDocUpdateConfirm(root, 'declined')

    const loaded = await loadAcceptanceState(root)
    expect(loaded?.waitingForDocUpdateConfirm).toBe(false)
    expect(loaded?.archiveDocUpdateConfirmationStatus).toBe('declined')
    expect(loaded?.archiveDocUpdateConfirmedAt).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('round-trip with readiness fields', async () => {
    const root = join(TEST_ROOT, 'readiness-round-trip')
    await rm(root, { recursive: true, force: true })

    const verifyResult: VerifyResult = {
      readiness: VerifyReadinessStatus.Ready,
      reasonCodes: ['all_checks_passed', 'docs_current'],
      decisionType: VerifyDecisionType.BusinessDecision,
      evidenceSummary: 'bun test and typecheck passed with updated acceptance metadata.',
      constraintsChecked: ['tests', 'typecheck', 'backward_compatibility'],
      verifiedAt: '2026-04-21T12:34:56.000Z',
    }

    const state: AcceptanceState = {
      feature: 'verify-ready',
      phase: 'acceptance',
      phaseStartedAt: '2026-04-21T11:00:00.000Z',
      pendingDocUpdates: [],
      readiness: VerifyReadinessStatus.Ready,
      verifyResult,
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(loaded?.verifyResult).toEqual(verifyResult)

    await rm(root, { recursive: true, force: true })
  })

  test('legacy state without readiness fields parses successfully', async () => {
    const root = join(TEST_ROOT, 'legacy-no-readiness')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'legacy-state',
      phase: 'acceptance',
      phaseStartedAt: '2026-04-21T11:15:00.000Z',
      pendingDocUpdates: [],
      promotionApplied: false,
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.feature).toBe('legacy-state')
    expect(loaded?.readiness).toBeUndefined()
    expect(loaded?.verifyResult).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('legacy verification_failed maps to not_ready', async () => {
    const root = join(TEST_ROOT, 'legacy-verification-failed')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'legacy-failure',
      phase: 'verification_failed',
      phaseStartedAt: '2026-04-21T11:30:00.000Z',
      pendingDocUpdates: [],
      verificationFailureCategory: 'security',
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.phase).toBe('verification_failed')
    expect(loaded?.verificationFailureCategory).toBe('security')
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.NotReady)
    expect(loaded?.verifyResult).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('saveVerifyResult updates readiness without wiping promotion history', async () => {
    const root = join(TEST_ROOT, 'save-verify-result')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'verify-update',
      phase: 'acceptance',
      phaseStartedAt: '2026-04-21T11:45:00.000Z',
      pendingDocUpdates: [],
      promotionApplied: true,
      promotionAppliedAt: '2026-04-21T11:50:00.000Z',
      promotionDecidedAt: '2026-04-21T11:48:00.000Z',
    }

    const verifyResult: VerifyResult = {
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      reasonCodes: ['docs_update_required'],
      evidenceSummary: 'Verification completed with follow-up doc updates required.',
      constraintsChecked: ['tests', 'typecheck'],
      verifiedAt: '2026-04-21T12:00:00.000Z',
    }

    await saveAcceptanceState(root, state)
    await saveVerifyResult(root, verifyResult)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.ReadyWithDocUpdates)
    expect(loaded?.verifyResult).toEqual(verifyResult)
    expect(loaded?.promotionApplied).toBe(true)
    expect(loaded?.promotionAppliedAt).toBe('2026-04-21T11:50:00.000Z')
    expect(loaded?.promotionDecidedAt).toBe('2026-04-21T11:48:00.000Z')

    await rm(root, { recursive: true, force: true })
  })
})
