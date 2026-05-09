import { describe, expect, test } from 'bun:test'
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classifyReadiness, handleVerify } from '../../src/commands/verify.js'
import {
  VerifyDecisionType,
  VerifyReadinessStatus,
  defaultConfig,
  type AcceptanceState,
  type OpenFlowContext,
  type VerificationConfig,
  type VerifyEvidencePacket,
} from '../../src/types.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'

function createContext(directory: string, verificationOverrides?: Partial<VerificationConfig>): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: {
      ...defaultConfig,
      verification: {
        ...defaultConfig.verification,
        ...verificationOverrides,
        quality: verificationOverrides?.quality ?? [...defaultConfig.verification.quality],
        security: verificationOverrides?.security ?? [...defaultConfig.verification.security],
      },
    },
    enhancedPlans: new Set<string>(),
  }
}

function createEvidence(overrides: Partial<VerifyEvidencePacket> = {}): VerifyEvidencePacket {
  return {
    checksRun: [
      'active_feature_resolution ✅ (demo-feature)',
      'plan_exists ✅ (found .sisyphus/plans/demo-feature.md)',
      'changes_workspace ✅ (found docs/changes/demo-feature)',
      'stable_constraints_current ✅ (found docs/current)',
      'stable_constraints_decisions ✅ (found docs/decisions)',
    ],
    checkResults: [
      { name: 'test', passed: true, category: 'quality', detail: 'mocked pass' },
      { name: 'typecheck', passed: true, category: 'quality', detail: 'mocked pass' },
      { name: 'secret', passed: true, category: 'security', detail: 'mocked pass' },
      { name: 'workspace_consistency', passed: true, category: 'consistency', detail: 'mocked pass' },
    ],
    observedBehaviorSummary: 'Mocked verification evidence.',
    intendedVsActualDelta: 'No delta detected.',
    docAlignmentSummary: 'Docs are aligned.',
    constraintConflictSummary: 'No explicit decision blocker detected.',
    knownRisksOrMissingEvidence: 'No blocking evidence gaps detected.',
    ...overrides,
  }
}

function createAcceptanceState(feature: string, pendingDocUpdates: AcceptanceState['pendingDocUpdates'] = []): AcceptanceState {
  return {
    feature,
    phase: 'acceptance',
    phaseStartedAt: new Date().toISOString(),
    pendingDocUpdates,
  }
}

function createIssueAcceptanceState(
  feature: string,
  overrides: Partial<AcceptanceState> = {},
): AcceptanceState {
  return {
    ...createAcceptanceState(feature, overrides.pendingDocUpdates ?? []),
    mode: 'issue',
    issueSlug: feature,
    rawIssue: feature,
    primaryClassification: 'bugfix',
    classifications: ['bugfix'],
    governancePromotionStatus: 'none',
    issueClarificationPath: `docs/changes/${feature}/issue-clarification.md`,
    ...overrides,
  }
}

describe('verify command', () => {
  test('resolves active feature, persists verify result, and returns structured readiness output', async () => {
    const testDir = join(process.cwd(), '.test-verify-active-feature')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'older-feature.md'), '# older', 'utf-8')
    await writeFile(join(plansDir, 'latest-feature.md'), '# latest', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'latest-feature'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('latest-feature'))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }))
    const acceptanceState = await loadAcceptanceState(testDir)

    expect(result).toContain('## Verify')
    expect(result).toContain('Feature: latest-feature')
    expect(result).toContain('### Evidence')
    expect(result).toContain('check_results:')
    expect(result).toContain('### Readiness')
    expect(result).toContain('- status: ready')
    expect(result).toContain('- reason_codes: all_checks_passed')
    expect(acceptanceState?.verifyResult?.readiness).toBe(VerifyReadinessStatus.Ready)

    await rm(testDir, { recursive: true, force: true })
  })

  test('keeps verify read-only and does not create current or archive artifacts', async () => {
    const testDir = join(process.cwd(), '.test-verify-read-only')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'demo-feature.md'), '# demo', 'utf-8')

    const docsDir = join(testDir, 'docs')
    await mkdir(docsDir, { recursive: true })
    const docsBefore = await stat(docsDir)

    await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    const docsAfter = await stat(docsDir)
    expect(docsAfter.mtimeMs).toBe(docsBefore.mtimeMs)
    await expect(access(join(testDir, 'docs', 'current'))).rejects.toBeDefined()
    await expect(access(join(testDir, 'docs', 'archive'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('classifies rule/current/business conflicts as needs_decision', async () => {
    const context = createContext(process.cwd(), { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence({ constraintConflictSummary: 'A rule conflict blocks release readiness.' }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NeedsDecision)
    expect(readiness.reasonCodes).toEqual([VerifyDecisionType.RuleConflict])
    expect(readiness.decisionType).toBe(VerifyDecisionType.RuleConflict)
  })

  test('returns not_ready for failed quality or security evidence and never mislabels that as needs_decision', async () => {
    const context = createContext(process.cwd(), { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence({
        checkResults: [
          { name: 'test', passed: false, category: 'quality', detail: 'mocked failure' },
          { name: 'secret', passed: false, category: 'security', detail: 'mocked failure' },
          { name: 'workspace_consistency', passed: true, category: 'consistency', detail: 'mocked pass' },
        ],
        constraintConflictSummary: 'No explicit decision blocker detected.',
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('quality_checks_failed')
    expect(readiness.reasonCodes).toContain('security_checks_failed')
    expect(readiness.decisionType).toBeUndefined()
  })

  test('returns not_ready when plan or changes workspace evidence is missing', async () => {
    const context = createContext(process.cwd(), { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence({
        checksRun: [
          'active_feature_resolution ✅ (demo-feature)',
          'plan_exists ⚠️ (missing .sisyphus/plans/demo-feature.md)',
          'changes_workspace ⚠️ (missing docs/changes/demo-feature)',
          'stable_constraints_current ✅ (found docs/current)',
          'stable_constraints_decisions ✅ (found docs/decisions)',
        ],
        knownRisksOrMissingEvidence: 'Missing evidence: active plan file, change workspace.',
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toEqual(['plan_missing', 'changes_workspace_missing'])
  })

  test('returns ready_with_doc_updates when checks pass but pending doc updates remain', async () => {
    const context = createContext(process.cwd(), { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence(),
      createAcceptanceState('demo-feature', [
        {
          file: 'docs/current/design/demo.md',
          timestamp: new Date().toISOString(),
          reason: 'sync pending',
        },
      ]),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.ReadyWithDocUpdates)
    expect(readiness.reasonCodes).toEqual(['pending_doc_updates'])
  })

  test('returns ready when checks pass and no pending doc updates remain', async () => {
    const context = createContext(process.cwd(), { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence(),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])
  })

  test('supports accepting current verification failures via flag and persists acceptance state', async () => {
    const testDir = join(process.cwd(), '.test-verify-accept-failures')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'demo-feature.md'), '# demo', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    const result = await handleVerify(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      true,
    )
    const acceptanceState = await loadAcceptanceState(testDir)

    expect(result).toContain('- status: ready')
    expect(result).toContain('- reason_codes: changes_workspace_missing')
    expect(result).not.toContain('### 失败后的可选操作')
    expect(acceptanceState?.acceptedFailures).toBe(true)
    expect(acceptanceState?.verifyResult?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(acceptanceState?.verifyResult?.reasonCodes).toContain('changes_workspace_missing')

    await rm(testDir, { recursive: true, force: true })
  })

  test('shows clear chinese options when verification remains not ready', async () => {
    const testDir = join(process.cwd(), '.test-verify-failure-options')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'demo-feature.md'), '# demo', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    const result = await handleVerify(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
    )

    expect(result).toContain('- status: not_ready')
    expect(result).toContain('### 失败后的可选操作')
    expect(result).toContain('**Option 1**: 修复失败的检查，然后重新运行 /openflow-verify')
    expect(result).toContain('**Option 2**: 如果你确定这些失败是可接受的，运行 /openflow-verify --accept-failures 来标记成功')

    await rm(testDir, { recursive: true, force: true })
  })

  test('uses interactive toolContext to accept current verification failures and returns ready', async () => {
    const testDir = join(process.cwd(), '.test-verify-interactive-accept')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'demo-feature.md'), '# demo', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    const mockToolContext = {
      askQuestion: async () => [['标记成功']],
    }

    const result = await handleVerify(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      undefined,
      mockToolContext,
    )

    expect(result).toContain('- status: ready')
    expect(result).toContain('- reason_codes: changes_workspace_missing')
    expect(result).not.toContain('### 失败后的可选操作')

    await rm(testDir, { recursive: true, force: true })
  })

  test('uses interactive toolContext to keep failed verification as not_ready when user chooses fix', async () => {
    const testDir = join(process.cwd(), '.test-verify-interactive-fix')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'demo-feature.md'), '# demo', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    const mockToolContext = {
      askQuestion: async () => [['修复问题']],
    }

    const result = await handleVerify(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      undefined,
      mockToolContext,
    )

    expect(result).toContain('- status: not_ready')
    expect(result).toContain('### 失败后的可选操作')

    await rm(testDir, { recursive: true, force: true })
  })

  test('verifies issue-only workspace without requiring a feature plan', async () => {
    const testDir = join(process.cwd(), '.test-verify-issue-mode')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-issue'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-issue', 'issue-clarification.md'), '# clarification', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createIssueAcceptanceState('demo-issue'))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-issue')

    expect(result).toContain('- status: ready')
    expect(result).toContain('- reason_codes: all_checks_passed')
    expect(result).toContain('plan_exists ℹ️')
    expect(result).toContain('issue_clarification_exists ✅')

    await rm(testDir, { recursive: true, force: true })
  })

  test('returns not_ready when issue clarification is missing in issue mode', async () => {
    const testDir = join(process.cwd(), '.test-verify-issue-missing-clarification')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-issue'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createIssueAcceptanceState('demo-issue'))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-issue')

    expect(result).toContain('- status: not_ready')
    expect(result).toContain('issue_clarification_missing')

    await rm(testDir, { recursive: true, force: true })
  })

  test('maps governance needs_decision to readiness needs_decision in issue mode', async () => {
    const testDir = join(process.cwd(), '.test-verify-issue-governance-needs-decision')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-issue'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-issue', 'issue-clarification.md'), '# clarification', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createIssueAcceptanceState('demo-issue', {
      governancePromotionStatus: 'needs_decision',
    }))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-issue')

    expect(result).toContain('- status: needs_decision')
    expect(result).toContain('- reason_codes: governance_needs_decision')

    await rm(testDir, { recursive: true, force: true })
  })

  test('prevents ready when issue governance is blocked by unapproved decision promotion', async () => {
    const testDir = join(process.cwd(), '.test-verify-issue-blocked-unapproved')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-issue'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-issue', 'issue-clarification.md'), '# clarification', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createIssueAcceptanceState('demo-issue', {
      governancePromotionStatus: 'blocked_unapproved',
      promotionSuggestions: [{
        type: 'ADD',
        targetArea: 'design',
        targetPath: 'docs/decisions/ADR-demo.md',
        reason: 'needs approval',
      }],
    }))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-issue')

    expect(result).toContain('- status: not_ready')
    expect(result).toContain('governance_blocked_unapproved')
    expect(result).not.toContain('- status: ready')

    await rm(testDir, { recursive: true, force: true })
  })
})
