import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ArchiveContext } from '../../../src/phases/archive/types.js'
import { validateArchive } from '../../../src/phases/archive/validate.js'
import type { AcceptanceState, OpenFlowContext } from '../../../src/types.js'
import { VerifyReadinessStatus } from '../../../src/types.js'

const feature = 'archive-test-feature'

function createMockContext(): OpenFlowContext {
  const directory = mkdtempSync(join(tmpdir(), 'openflow-archive-validate-'))
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: {
      archive: { drift_check: false },
      acceptance: { drift_detection: false },
    },
    enhancedPlans: new Set<string>(),
  } as OpenFlowContext
}

function createAcceptanceState(overrides: Partial<AcceptanceState> = {}): AcceptanceState {
  return {
    feature,
    phase: 'acceptance',
    phaseStartedAt: '2026-01-01T00:00:00.000Z',
    readiness: VerifyReadinessStatus.Ready,
    pendingDocUpdates: [],
    ...overrides,
  }
}

function createArchiveContext(overrides: Partial<ArchiveContext> = {}): ArchiveContext {
  const acceptanceState = createAcceptanceState()
  return {
    feature,
    mode: 'planned',
    acceptanceState,
    rawAcceptanceState: acceptanceState,
    implementationRun: null,
    issueMode: 'feature',
    sourcePaths: {
      design: null,
      plan: null,
      prd: null,
      behavior: null,
      changeWorkspace: '',
      implementationMapper: null,
      issueClarification: null,
      promotionCandidate: null,
      issueResolution: null,
      artifactRoot: '',
    },
    planPath: '',
    archiveDir: '',
    archiveRoot: '',
    stagingDir: '',
    designExists: false,
    planExists: false,
    requirementsExists: false,
    hasImplementationMapper: false,
    issueClarificationExists: false,
    promotionCandidateExists: false,
    hasAcceptanceChanges: false,
    hasAcceptedKnownIssues: false,
    readiness: VerifyReadinessStatus.Ready,
    useLegacyReadinessFallback: false,
    isPostHocIssue: false,
    postHocIssueReady: false,
    skipQualityGateChecks: false,
    ...overrides,
  }
}

describe('validateArchive', () => {
  test('planned mode + readiness=Ready + no issues allows archive', async () => {
    const result = await validateArchive(createMockContext(), createArchiveContext())

    expect(result.allowed).toBe(true)
    expect(result.blockers).toEqual([])
  })

  test('planned mode + readiness=NotReady blocks archive with readiness blocker', async () => {
    const result = await validateArchive(
      createMockContext(),
      createArchiveContext({ readiness: VerifyReadinessStatus.NotReady }),
    )

    expect(result.allowed).toBe(false)
    expect(result.blockers.some(blocker => blocker.type === 'readiness')).toBe(true)
  })

  test('planned mode + harden unresolved must-fix blocks archive with harden blocker', async () => {
    const acceptanceState = createAcceptanceState({
      hardenTerminalSummary: {
        status: 'needs_human',
        stopReason: 'must_fix',
        unresolvedMustFixCount: 1,
        unresolvedNeedsDecisionCount: 0,
        acceptedKnownIssueCount: 0,
      },
    })

    const result = await validateArchive(
      createMockContext(),
      createArchiveContext({ acceptanceState, rawAcceptanceState: acceptanceState }),
    )

    expect(result.allowed).toBe(false)
    expect(result.blockers.some(blocker => blocker.type === 'harden')).toBe(true)
  })

  test('planned mode + doc update not confirmed blocks archive with doc_update blocker', async () => {
    const acceptanceState = createAcceptanceState({
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      pendingDocUpdates: [{ file: 'docs/current/design/example.md', timestamp: '2026-01-01T00:00:00.000Z' }],
    })

    const result = await validateArchive(
      createMockContext(),
      createArchiveContext({
        acceptanceState,
        rawAcceptanceState: acceptanceState,
        readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      }),
    )

    expect(result.allowed).toBe(false)
    expect(result.blockers.some(blocker => blocker.type === 'doc_update')).toBe(true)
  })

  test('ad-hoc mode + no readiness allows archive', async () => {
    const result = await validateArchive(
      createMockContext(),
      createArchiveContext({
        mode: 'ad-hoc',
        acceptanceState: null,
        rawAcceptanceState: null,
        readiness: undefined,
      }),
    )

    expect(result.allowed).toBe(true)
    expect(result.blockers).toEqual([])
  })

  test('ad-hoc mode + no readiness/harden/drift checks does not produce readiness or harden blockers', async () => {
    const acceptanceState = createAcceptanceState({
      readiness: VerifyReadinessStatus.NotReady,
      hardenTerminalSummary: {
        status: 'needs_human',
        stopReason: 'must_fix',
        unresolvedMustFixCount: 1,
        unresolvedNeedsDecisionCount: 1,
        acceptedKnownIssueCount: 0,
      },
    })

    const result = await validateArchive(
      createMockContext(),
      createArchiveContext({
        mode: 'ad-hoc',
        acceptanceState,
        rawAcceptanceState: acceptanceState,
        readiness: VerifyReadinessStatus.NotReady,
      }),
    )

    expect(result.allowed).toBe(true)
    expect(result.blockers.some(blocker => blocker.type === 'readiness')).toBe(false)
    expect(result.blockers.some(blocker => blocker.type === 'harden')).toBe(false)
  })

  test('planned mode + skipQualityGateChecks=true allows archive even when readiness=NotReady', async () => {
    const result = await validateArchive(
      createMockContext(),
      createArchiveContext({
        readiness: VerifyReadinessStatus.NotReady,
        skipQualityGateChecks: true,
      }),
    )

    expect(result.allowed).toBe(true)
    expect(result.blockers).toEqual([])
  })
})
