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
  markImplementationDirty,
  markImplementationVerified,
  markImplementationStale,
  markImplementationBlocked,
  clearImplementationState,
  getImplementationState,
  isFreshReadiness,
  saveIssueClarificationState,
  type IssueClarificationState,
} from '../../src/utils/acceptance-state.js'
import { VerifyDecisionType, VerifyReadinessStatus, type AcceptanceState, type VerifyResult } from '../../src/types.js'

const TEST_ROOT = join(process.cwd(), '.test-acceptance-state')

type FutureHardenTerminalSummary = {
  status: string
  stopReason: string
  unresolvedMustFixCount: number
  unresolvedNeedsDecisionCount: number
  acceptedKnownIssueCount: number
}

type FutureAcceptedKnownIssueSummary = {
  findingId: string
  disposition: 'accepted_known_issue' | 'design_divergence'
  rationale: string
  archiveEffect: 'non_blocking' | 'doc_update_required' | 'decision_required'
  evidenceRefs: string[]
  verifyStatus: string
}

type FutureAcceptanceState = AcceptanceState & {
  hardenTerminalSummary?: FutureHardenTerminalSummary
  acceptedKnownIssues?: FutureAcceptedKnownIssueSummary[]
}

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

  test('minimal harden terminal summary round-trips through acceptance state', async () => {
    const root = join(TEST_ROOT, 'harden-terminal-summary-round-trip')
    await rm(root, { recursive: true, force: true })

    const state: FutureAcceptanceState = {
      feature: 'harden-summary-demo',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-18T10:00:00.000Z',
      pendingDocUpdates: [],
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      hardenTerminalSummary: {
        status: 'budget_exhausted',
        stopReason: 'known_issues_accepted',
        unresolvedMustFixCount: 0,
        unresolvedNeedsDecisionCount: 0,
        acceptedKnownIssueCount: 1,
      },
    }

    await saveAcceptanceState(root, state as AcceptanceState)
    const loaded = await loadAcceptanceState(root) as FutureAcceptanceState | null

    expect(loaded).not.toBeNull()
    expect(loaded?.hardenTerminalSummary).toEqual(state.hardenTerminalSummary)

    await rm(root, { recursive: true, force: true })
  })

  test('accepted known issues summary round-trips through acceptance state', async () => {
    const root = join(TEST_ROOT, 'accepted-known-issues-round-trip')
    await rm(root, { recursive: true, force: true })

    const state: FutureAcceptanceState = {
      feature: 'known-issues-demo',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-18T10:30:00.000Z',
      pendingDocUpdates: [],
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      hardenTerminalSummary: {
        status: 'pass_with_risks',
        stopReason: 'known_issues_accepted',
        unresolvedMustFixCount: 0,
        unresolvedNeedsDecisionCount: 0,
        acceptedKnownIssueCount: 1,
      },
      acceptedKnownIssues: [
        {
          findingId: 'H-701',
          disposition: 'accepted_known_issue',
          rationale: 'Design divergence is acceptable in Wave 1 and must stay visible in archive.',
          archiveEffect: 'doc_update_required',
          evidenceRefs: ['EV-DESIGN-001', 'EV-VERIFY-001'],
          verifyStatus: 'ready',
        },
      ],
    }

    await saveAcceptanceState(root, state as AcceptanceState)
    const loaded = await loadAcceptanceState(root) as FutureAcceptanceState | null

    expect(loaded).not.toBeNull()
    expect(loaded?.acceptedKnownIssues).toEqual(state.acceptedKnownIssues)

    await rm(root, { recursive: true, force: true })
  })

  test('issue-mode fields round-trip correctly', async () => {
    const root = join(TEST_ROOT, 'issue-mode-round-trip')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'issue-demo',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-09T10:00:00.000Z',
      pendingDocUpdates: [],
      mode: 'issue',
      issueSlug: 'login-crash-on-mobile',
      rawIssue: 'App crashes when user taps login on mobile Safari',
      primaryClassification: 'bugfix',
      classifications: ['bugfix', 'data_issue'],
      governancePromotionStatus: 'candidate_created',
      issueClarificationPath: 'docs/changes/2026-05-09-login-crash-on-mobile/issue-clarification.md',
      promotionCandidatePath: 'docs/decisions/login-crash-fix.md',
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.mode).toBe('issue')
    expect(loaded?.issueSlug).toBe('login-crash-on-mobile')
    expect(loaded?.rawIssue).toBe('App crashes when user taps login on mobile Safari')
    expect(loaded?.primaryClassification).toBe('bugfix')
    expect(loaded?.classifications).toEqual(['bugfix', 'data_issue'])
    expect(loaded?.governancePromotionStatus).toBe('candidate_created')
    expect(loaded?.issueClarificationPath).toBe('docs/changes/2026-05-09-login-crash-on-mobile/issue-clarification.md')
    expect(loaded?.promotionCandidatePath).toBe('docs/decisions/login-crash-fix.md')

    await rm(root, { recursive: true, force: true })
  })

  test('legacy files without mode field default to feature mode', async () => {
    const root = join(TEST_ROOT, 'legacy-default-feature-mode')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'legacy-no-mode',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-09T11:00:00.000Z',
      pendingDocUpdates: [],
      promotionApplied: false,
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.feature).toBe('legacy-no-mode')
    expect(loaded?.mode).toBe('feature')
    expect(loaded?.issueSlug).toBeUndefined()
    expect(loaded?.rawIssue).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('saveVerifyResult preserves issue-mode fields', async () => {
    const root = join(TEST_ROOT, 'verify-preserves-issue-fields')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'issue-verify-demo',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-09T12:00:00.000Z',
      pendingDocUpdates: [],
      mode: 'issue',
      issueSlug: 'data-loss-bug',
      rawIssue: 'User data is lost after logout',
      primaryClassification: 'data_issue',
      classifications: ['data_issue'],
      governancePromotionStatus: 'needs_decision',
    }

    const verifyResult: VerifyResult = {
      readiness: VerifyReadinessStatus.NotReady,
      reasonCodes: ['fix_incomplete'],
      evidenceSummary: 'Data still lost in edge cases.',
      constraintsChecked: ['tests', 'typecheck'],
      verifiedAt: '2026-05-09T13:00:00.000Z',
    }

    await saveAcceptanceState(root, state)
    await saveVerifyResult(root, verifyResult)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.mode).toBe('issue')
    expect(loaded?.issueSlug).toBe('data-loss-bug')
    expect(loaded?.rawIssue).toBe('User data is lost after logout')
    expect(loaded?.primaryClassification).toBe('data_issue')
    expect(loaded?.classifications).toEqual(['data_issue'])
    expect(loaded?.governancePromotionStatus).toBe('needs_decision')
    expect(loaded?.readiness).toBe(VerifyReadinessStatus.NotReady)
    expect(loaded?.verifyResult).toEqual(verifyResult)

    await rm(root, { recursive: true, force: true })
  })

  test('saveIssueClarificationState updates existing state with issue fields', async () => {
    const root = join(TEST_ROOT, 'save-issue-clarification')
    await rm(root, { recursive: true, force: true })

    await enterAcceptancePhase(root, 'clarify-demo')

    const issueState: IssueClarificationState = {
      issueSlug: 'slow-query-perf',
      rawIssue: 'Dashboard queries take 30+ seconds',
      primaryClassification: 'config_issue',
      classifications: ['config_issue', 'data_issue'],
      governancePromotionStatus: 'candidate_created',
      issueClarificationPath: 'docs/changes/2026-05-09-slow-query-perf/issue-clarification.md',
    }

    await saveIssueClarificationState(root, issueState)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.feature).toBe('clarify-demo')
    expect(loaded?.mode).toBe('issue')
    expect(loaded?.issueSlug).toBe('slow-query-perf')
    expect(loaded?.rawIssue).toBe('Dashboard queries take 30+ seconds')
    expect(loaded?.primaryClassification).toBe('config_issue')
    expect(loaded?.classifications).toEqual(['config_issue', 'data_issue'])
    expect(loaded?.governancePromotionStatus).toBe('candidate_created')
    expect(loaded?.issueClarificationPath).toBe('docs/changes/2026-05-09-slow-query-perf/issue-clarification.md')

    await rm(root, { recursive: true, force: true })
  })

  test('implementation state round-trips through acceptance state', async () => {
    const root = join(TEST_ROOT, 'implementation-state-round-trip')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'impl-state-demo',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-18T12:00:00.000Z',
      pendingDocUpdates: [],
      implementationState: {
        state: 'stale',
        updatedAt: '2026-05-18T12:05:00.000Z',
        changedFiles: ['src/demo.ts', 'tests/demo.test.ts'],
        gitHead: 'abc12345',
        fromVerify: false,
      },
    }

    await saveAcceptanceState(root, state)
    const loaded = await loadAcceptanceState(root)

    expect(loaded).not.toBeNull()
    expect(loaded?.implementationState).toEqual(state.implementationState)

    await rm(root, { recursive: true, force: true })
  })

  test('legacy state without implementationState defaults to clean helper state', async () => {
    const root = join(TEST_ROOT, 'legacy-no-implementation-state')
    await rm(root, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'legacy-impl-clean',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-18T12:10:00.000Z',
      pendingDocUpdates: [],
      readiness: VerifyReadinessStatus.Ready,
    }

    await saveAcceptanceState(root, state)
    const implementationState = await getImplementationState(root)

    expect(implementationState).toEqual({
      state: 'clean',
      updatedAt: '2026-05-18T12:10:00.000Z',
    })
    expect(await isFreshReadiness(root)).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  test('implementation state helper transitions persist and freshness follows state', async () => {
    const root = join(TEST_ROOT, 'implementation-state-transitions')
    await rm(root, { recursive: true, force: true })

    await saveAcceptanceState(root, {
      feature: 'impl-transitions',
      phase: 'acceptance',
      phaseStartedAt: '2026-05-18T12:20:00.000Z',
      pendingDocUpdates: [],
      readiness: VerifyReadinessStatus.Ready,
    })

    await markImplementationDirty(root, { changedFiles: ['src/dirty.ts'], gitHead: 'dirty1234' })
    let implementationState = await getImplementationState(root)
    expect(implementationState?.state).toBe('dirty')
    expect(implementationState?.changedFiles).toEqual(['src/dirty.ts'])
    expect(implementationState?.gitHead).toBe('dirty1234')
    expect(await isFreshReadiness(root)).toBe(false)

    await markImplementationVerified(root, { changedFiles: ['src/dirty.ts'], gitHead: 'verify123' })
    implementationState = await getImplementationState(root)
    expect(implementationState?.state).toBe('verified')
    expect(implementationState?.fromVerify).toBe(true)
    expect(await isFreshReadiness(root)).toBe(true)

    await markImplementationStale(root, { changedFiles: ['src/dirty.ts', 'src/more.ts'] })
    implementationState = await getImplementationState(root)
    expect(implementationState?.state).toBe('stale')
    expect(implementationState?.changedFiles).toEqual(['src/dirty.ts', 'src/more.ts'])
    expect(await isFreshReadiness(root)).toBe(false)

    await markImplementationBlocked(root)
    implementationState = await getImplementationState(root)
    expect(implementationState?.state).toBe('blocked')
    expect(await isFreshReadiness(root)).toBe(false)

    await clearImplementationState(root)
    implementationState = await getImplementationState(root)
    expect(implementationState).toEqual({
      state: 'clean',
      updatedAt: '2026-05-18T12:20:00.000Z',
    })
    expect(await isFreshReadiness(root)).toBe(true)

    await rm(root, { recursive: true, force: true })
  })
})
