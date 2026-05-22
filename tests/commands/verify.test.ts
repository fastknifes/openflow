import { describe, expect, test } from 'bun:test'
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classifyReadiness, handleVerify, stripOpenFlowCommandTokens } from '../../src/commands/verify.js'
import { ContractRuntime } from '../../src/contracts/runtime.js'
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
      'context_alignment ✅ (found docs/changes/demo-feature/design.md)',
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
  test('derives behavior scenario status from verification mapping evidence', async () => {
    const testDir = join(process.cwd(), '.test-verify-behavior-mapping-evidence')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'change-units.json'),
      JSON.stringify({ version: 1, byFeature: { 'demo-feature': { changeDir: '2026-01-01-demo-feature' } } }),
      'utf-8',
    )
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    const workspace = join(testDir, 'docs', 'changes', '2026-01-01-demo-feature')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, 'design.md'), '# Design', 'utf-8')
    await writeFile(join(workspace, 'behavior.md'), `# Behavior Contract: demo-feature

## Behavior Scenarios

### Scenario: core behavior

Given:
- user has input

When:
- user runs command

Then:
- output is produced

## Verification Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|---|---|---|---|
| core behavior | test | tests/demo.test.ts | verified |
`, 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('- status: ready')
    expect(result).toContain('scenario-0: core behavior ✅ (verified')
    expect(result).toContain('1/1 behavior scenarios verified')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  test('resolves active feature, persists verify result, and returns structured readiness output', async () => {
    const testDir = join(process.cwd(), '.test-verify-active-feature')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'older-feature.md'), '# older', 'utf-8')
    await writeFile(join(plansDir, 'latest-feature.md'), '# latest', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'latest-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'latest-feature', 'design.md'), '# Design', 'utf-8')
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

  test('returns not_ready when context alignment or changes workspace evidence is missing', async () => {
    const context = createContext(process.cwd(), { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence({
        checksRun: [
          'active_feature_resolution ✅ (demo-feature)',
          'plan_exists ⚠️ (missing .sisyphus/plans/demo-feature.md)',
          'context_alignment ⚠️ (missing docs/changes/demo-feature/design.md)',
          'changes_workspace ⚠️ (missing docs/changes/demo-feature)',
          'stable_constraints_current ✅ (found docs/current)',
          'stable_constraints_decisions ✅ (found docs/decisions)',
        ],
        knownRisksOrMissingEvidence: 'Missing evidence: context alignment artifact, change workspace.',
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toEqual(['context_alignment_missing', 'changes_workspace_missing'])
    expect(readiness.classifiedEvidenceGaps?.map(gap => gap.kind)).toEqual(['workflow_stage_missing', 'workflow_stage_missing'])
  })

  test('verify output exposes classified evidence gaps for missing workflow artifacts', async () => {
    const testDir = join(process.cwd(), '.test-verify-classified-gaps')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# demo', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('classified_evidence_gaps')
    expect(result).toContain('context_alignment_missing: workflow_stage_missing')
    expect(result).toContain('do not create a minimal design artifact just to satisfy verify')

    await rm(testDir, { recursive: true, force: true })
  })

  test('limited-context code fix reports missing design as limited context without blocking readiness', async () => {
    const testDir = join(process.cwd(), '.test-verify-limited-context-code-fix')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(join(testDir, 'src', 'fix.ts'), 'export const fixed = true\n', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, {
      ...createAcceptanceState('demo-feature'),
      implementationState: {
        state: 'dirty',
        updatedAt: new Date().toISOString(),
        changedFiles: ['src/fix.ts'],
      },
    })

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')
    const acceptanceState = await loadAcceptanceState(testDir)

    expect(result).toContain('- status: ready')
    expect(result).toContain('context_alignment_missing: limited_context_gap')
    expect(result).toContain('changes_workspace_missing: limited_context_gap')
    expect(result).not.toContain('workflow_stage_missing')
    expect(acceptanceState?.verifyResult?.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
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

  test('does not block readiness for optional behavior scenario evidence gaps', async () => {
    const testDir = join(process.cwd(), '.test-verify-optional-behavior')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Boundary: optional fallback\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'boundary-0',
          name: 'optional fallback',
          criticality: 'optional',
          status: 'missing_evidence',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })

  test('blocks readiness for critical behavior scenario evidence gaps', async () => {
    const testDir = join(process.cwd(), '.test-verify-critical-behavior')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'missing_evidence',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
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
    expect(result).toContain('context_alignment_missing')
    expect(result).toContain('changes_workspace_missing')
    expect(result).not.toContain('### 失败后的可选操作')
    expect(acceptanceState?.acceptedFailures).toBe(true)
    expect(acceptanceState?.verifyResult?.readiness).toBe(VerifyReadinessStatus.Ready)
    expect(acceptanceState?.verifyResult?.reasonCodes).toContain('context_alignment_missing')

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
    expect(result).toContain('context_alignment_missing')
    expect(result).toContain('changes_workspace_missing')
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
    expect(result).toContain('context_alignment ✅')

    await rm(testDir, { recursive: true, force: true })
  })

  test('issue mode with issue-clarification.md and no plan does not report missing active plan file', async () => {
    const testDir = join(process.cwd(), '.test-verify-issue-no-plan-context-alignment')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-issue'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-issue', 'issue-clarification.md'), '# clarification', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createIssueAcceptanceState('demo-issue'))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-issue')

    expect(result).not.toContain('Missing evidence: active plan file')
    expect(result).not.toContain('Missing evidence: context alignment artifact')
    expect(result).toContain('context_alignment ✅')
    expect(result).toContain('plan_exists ℹ️')
    expect(result).toContain('- status: ready')

    await rm(testDir, { recursive: true, force: true })
  })

  test('does not hard-block generic issue-mode state when issue clarification is absent', async () => {
    const testDir = join(process.cwd(), '.test-verify-issue-missing-clarification')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-issue'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createIssueAcceptanceState('demo-issue'))

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-issue')

    expect(result).toContain('- status: ready')
    expect(result).not.toContain('issue_clarification_missing')

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

  test('strips OpenFlow command tokens from feature parameter', () => {
    // Regression test for the mangled feature name bug
    expect(stripOpenFlowCommandTokens('auto-slash-command-openflow-command-openflow-verify')).toBe('')
    expect(stripOpenFlowCommandTokens('openflow-verify')).toBe('')
    expect(stripOpenFlowCommandTokens('my-feature')).toBe('my-feature')
    expect(stripOpenFlowCommandTokens('phone-change-sync-optimization')).toBe('phone-change-sync-optimization')
    expect(stripOpenFlowCommandTokens('openflow-verify-my-feature')).toBe('my-feature')
    expect(stripOpenFlowCommandTokens('auto-slash-command-my-feature')).toBe('my-feature')
  })

  test('resolves feature from session active feature when no explicit feature is given', async () => {
    const testDir = join(process.cwd(), '.test-verify-session-resolution')
    await rm(testDir, { recursive: true, force: true })

    // Set up plans directory with a "wrong" (stale) plan
    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'stale-feature.md'), '# stale', 'utf-8')

    // Set up the session active feature index pointing to the correct feature
    const featureDir = join(testDir, '.sisyphus', 'feature')
    await mkdir(featureDir, { recursive: true })
    await writeFile(
      join(featureDir, 'active.json'),
      JSON.stringify({
        bySessionID: {
          'test-session-123': {
            feature: 'correct-feature',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8',
    )
    // Create the feature session file (required by loadAndCleanActiveFeatureIndex)
    await writeFile(
      join(featureDir, 'correct-feature.json'),
      JSON.stringify({ workflowState: 'in_progress', currentQuestionIndex: 0, answers: [] }),
      'utf-8',
    )

    // Set up workspace for correct-feature
    await mkdir(join(testDir, 'docs', 'changes', 'correct-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'correct-feature', 'design.md'), '# Design', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('correct-feature'))

    // Without sessionID → falls back to filesystem (stale-feature)
    const resultNoSession = await handleVerify(
      createContext(testDir, { quality: [], security: [] }),
    )
    expect(resultNoSession).toContain('Feature: stale-feature')

    // With sessionID → resolves to correct-feature from session index
    const resultWithSession = await handleVerify(
      createContext(testDir, { quality: [], security: [] }),
      undefined,
      undefined,
      undefined,
      'test-session-123',
    )
    expect(resultWithSession).toContain('Feature: correct-feature')

    await rm(testDir, { recursive: true, force: true })
  })

  test('sanitizes mangled feature parameter and falls back to session active feature', async () => {
    const testDir = join(process.cwd(), '.test-verify-mangled-sanitize')
    await rm(testDir, { recursive: true, force: true })

    // Set up session active feature
    const featureDir = join(testDir, '.sisyphus', 'feature')
    await mkdir(featureDir, { recursive: true })
    await writeFile(
      join(featureDir, 'active.json'),
      JSON.stringify({
        bySessionID: {
          'test-session-456': {
            feature: 'phone-change-sync-optimization',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8',
    )
    await writeFile(
      join(featureDir, 'phone-change-sync-optimization.json'),
      JSON.stringify({ workflowState: 'in_progress', currentQuestionIndex: 0, answers: [] }),
      'utf-8',
    )

    // Set up workspace
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'plans', 'phone-change-sync-optimization.md'),
      '# plan',
      'utf-8',
    )
    await mkdir(join(testDir, 'docs', 'changes', 'phone-change-sync-optimization'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'phone-change-sync-optimization', 'design.md'), '# Design', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('phone-change-sync-optimization'))

    // Pass the mangled feature name — should be stripped to empty, then fall back to session
    const result = await handleVerify(
      createContext(testDir, { quality: [], security: [] }),
      'auto-slash-command-openflow-command-openflow-verify',
      undefined,
      undefined,
      'test-session-456',
    )
    expect(result).toContain('Feature: phone-change-sync-optimization')

    await rm(testDir, { recursive: true, force: true })
  })

  test('persists explicit verify result under the target feature even when acceptance state belongs to a different feature', async () => {
    const testDir = join(process.cwd(), '.test-verify-feature-binding')
    await rm(testDir, { recursive: true, force: true })

    // Create acceptance state for a STALE feature (simulating leftover state from
    // a prior workflow that was never cleaned up)
    await saveAcceptanceState(testDir, {
      feature: 'stale-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    // Set up workspace for the TARGET feature
    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'target-feature.md'), '# target', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'target-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'target-feature', 'design.md'), '# Design', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })

    // Verify the TARGET feature explicitly
    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'target-feature')

    // The verify result should reference the target feature
    expect(result).toContain('Feature: target-feature')

    // Acceptance state should now belong to the target feature, NOT the stale one
    const acceptanceState = await loadAcceptanceState(testDir)
    expect(acceptanceState?.feature).toBe('target-feature')
    expect(acceptanceState?.verifyResult?.readiness).toBe(VerifyReadinessStatus.Ready)

    await rm(testDir, { recursive: true, force: true })
  })

  test('strips markdown backtick residue from feature parameter', () => {
    expect(stripOpenFlowCommandTokens('`openflow-verify`')).toBe('')
    expect(stripOpenFlowCommandTokens('`my-feature`')).toBe('my-feature')
    expect(stripOpenFlowCommandTokens('```openflow-verify```')).toBe('')
    expect(stripOpenFlowCommandTokens('```my-feature```')).toBe('my-feature')
    expect(stripOpenFlowCommandTokens('`phone-change-sync-optimization`')).toBe('phone-change-sync-optimization')
  })

  test('parses new 8-column evidence table format with coverageLevel and freshness', async () => {
    const testDir = join(process.cwd(), '.test-verify-new-format')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'change-units.json'),
      JSON.stringify({ version: 1, byFeature: { 'demo-feature': { changeDir: '2026-01-01-demo-feature' } } }),
      'utf-8',
    )
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    const workspace = join(testDir, 'docs', 'changes', '2026-01-01-demo-feature')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, 'design.md'), '# Design', 'utf-8')
    await writeFile(join(workspace, 'behavior.md'), `# Behavior Contract: demo-feature

## Behavior Scenarios

### Scenario: core behavior

Given:
- user has input

When:
- user runs command

Then:
- output is produced

## Verification Mapping

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|
| core behavior | critical | tests/demo.test.ts | test | exact | N/A | fresh | verified |
`, 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('- status: ready')
    expect(result).toContain('1/1 behavior scenarios verified')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  test('old 4-column table format still works with backward-compatible defaults', async () => {
    const testDir = join(process.cwd(), '.test-verify-old-format-compat')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'change-units.json'),
      JSON.stringify({ version: 1, byFeature: { 'demo-feature': { changeDir: '2026-01-01-demo-feature' } } }),
      'utf-8',
    )
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    const workspace = join(testDir, 'docs', 'changes', '2026-01-01-demo-feature')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, 'design.md'), '# Design', 'utf-8')
    await writeFile(join(workspace, 'behavior.md'), `# Behavior Contract: demo-feature

## Behavior Scenarios

### Scenario: core behavior

Given:
- user has input

When:
- user runs command

Then:
- output is produced

## Verification Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|---|---|---|---|
| core behavior | test | tests/demo.test.ts | verified |
`, 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('- status: ready')
    expect(result).toContain('1/1 behavior scenarios verified')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  test('new format blocks on partial coverage for critical scenario', async () => {
    const testDir = join(process.cwd(), '.test-verify-partial-blocking')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'partial',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
  })

  test('new format blocks on stale freshness for critical scenario', async () => {
    const testDir = join(process.cwd(), '.test-verify-stale-blocking')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'stale',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('stale_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
  })

  test('new format does not block when coverage is exact and freshness is fresh', async () => {
    const testDir = join(process.cwd(), '.test-verify-exact-fresh-pass')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })

  test('equivalent coverage without rationale downgrades to partial', async () => {
    const testDir = join(process.cwd(), '.test-verify-equiv-no-rationale')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'change-units.json'),
      JSON.stringify({ version: 1, byFeature: { 'demo-feature': { changeDir: '2026-01-01-demo-feature' } } }),
      'utf-8',
    )
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    const workspace = join(testDir, 'docs', 'changes', '2026-01-01-demo-feature')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, 'design.md'), '# Design', 'utf-8')
    await writeFile(join(workspace, 'behavior.md'), `# Behavior Contract: demo-feature

## Behavior Scenarios

### Scenario: core behavior

Given:
- user has input

When:
- user runs command

Then:
- output is produced

## Verification Mapping

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|
| core behavior | critical | tests/demo.test.ts | test | equivalent | N/A | fresh | verified |
`, 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })

    // This should be NotReady because equivalent without rationale → partial → critical blocks
    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('- status: not_ready')
    expect(result).toContain('missing_integration_evidence')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  test('unknown freshness on critical scenario blocks readiness', async () => {
    const testDir = join(process.cwd(), '.test-verify-unknown-freshness-blocking')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'unknown',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('integration_evidence_needs_decision')

    await rm(testDir, { recursive: true, force: true })
  })

  test('normal criticality scenario does not block on stale freshness', async () => {
    const testDir = join(process.cwd(), '.test-verify-normal-stale-pass')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'normal',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'stale',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })

  // === Coverage / Freshness Matrix Tests (Task 3) ===

  test('equivalent coverage with rationale and fresh freshness passes readiness', async () => {
    const testDir = join(process.cwd(), '.test-verify-equiv-rationale-pass')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'change-units.json'),
      JSON.stringify({ version: 1, byFeature: { 'demo-feature': { changeDir: '2026-01-01-demo-feature' } } }),
      'utf-8',
    )
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    const workspace = join(testDir, 'docs', 'changes', '2026-01-01-demo-feature')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, 'design.md'), '# Design', 'utf-8')
    await writeFile(join(workspace, 'behavior.md'), `# Behavior Contract: demo-feature

## Behavior Scenarios

### Scenario: core behavior

Given:
- user has input

When:
- user runs command

Then:
- output is produced

## Verification Mapping

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|
| core behavior | critical | tests/demo.test.ts | test | equivalent | Same input/output via integration test | fresh | verified |
`, 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('- status: ready')
    expect(result).toContain('1/1 behavior scenarios verified')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  test('equivalent coverage without rationale at classifyReadiness level blocks readiness', async () => {
    const testDir = join(process.cwd(), '.test-verify-equiv-no-rationale-classify')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    // Simulate the parser downgrade: equivalent without rationale → coverageLevel: partial
    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'missing_evidence',
          coverageLevel: 'partial',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
  })

  test('missing coverageLevel on critical scenario blocks readiness', async () => {
    const testDir = join(process.cwd(), '.test-verify-missing-coverage')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'missing_evidence',
          coverageLevel: 'missing',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
  })

  test('optional scenario with missing evidence produces advisory gap and does not block', async () => {
    const testDir = join(process.cwd(), '.test-verify-optional-advisory')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Boundary: optional fallback\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'boundary-0',
          name: 'optional fallback',
          criticality: 'optional',
          status: 'not_applicable',
          coverageLevel: 'not_applicable',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })

  test('optional scenario with missing_evidence status does not block readiness', async () => {
    const testDir = join(process.cwd(), '.test-verify-optional-missing-no-block')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Boundary: optional fallback\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'boundary-0',
          name: 'optional fallback',
          criticality: 'optional',
          status: 'missing_evidence',
          coverageLevel: 'missing',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    // Optional scenarios should not block even with missing_evidence
    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })

  test('old format (undefined freshness) does not block on freshness grounds', async () => {
    const testDir = join(process.cwd(), '.test-verify-old-format-no-freshness-block')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    // Old format: no freshness field at all (undefined)
    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          // freshness is deliberately undefined — old format
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    // Old format without freshness should pass — backward compatibility
    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })

  test('classified evidence gap encodes unknown freshness as distinct code', async () => {
    const testDir = join(process.cwd(), '.test-verify-gap-unknown-freshness')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'unknown',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('integration_evidence_needs_decision')
    // The classified gap should carry freshness_unknown code
    expect(readiness.classifiedEvidenceGaps?.some(g => g.code.includes('freshness_unknown'))).toBe(true)

    await rm(testDir, { recursive: true, force: true })
  })

  test('classified evidence gap encodes stale freshness as distinct code', async () => {
    const testDir = join(process.cwd(), '.test-verify-gap-stale-freshness')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'stale',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('stale_integration_evidence')
    expect(readiness.classifiedEvidenceGaps?.some(g => g.code.includes('freshness_stale'))).toBe(true)

    await rm(testDir, { recursive: true, force: true })
  })

  test('classified evidence gap encodes partial coverage as distinct code', async () => {
    const testDir = join(process.cwd(), '.test-verify-gap-partial-coverage')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core behavior\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core behavior',
          criticality: 'critical',
          status: 'missing_evidence',
          coverageLevel: 'partial',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.classifiedEvidenceGaps?.some(g => g.code.includes('coverage_partial'))).toBe(true)

    await rm(testDir, { recursive: true, force: true })
  })

  // === Task 4: Integration Evidence Reason Code Mapping ===

  test('maps coverage partial to missing_integration_evidence reason code', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-partial')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'partial',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')
    expect(readiness.reasonCodes).not.toContain('behavior_evidence_incomplete')

    await rm(testDir, { recursive: true, force: true })
  })

  test('maps stale freshness to stale_integration_evidence reason code', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-stale')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'stale',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('stale_integration_evidence')
    expect(readiness.reasonCodes).not.toContain('behavior_evidence_incomplete')

    await rm(testDir, { recursive: true, force: true })
  })

  test('maps unknown freshness to integration_evidence_needs_decision reason code', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-unknown')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core',
          criticality: 'critical',
          status: 'verified',
          coverageLevel: 'exact',
          freshness: 'unknown',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('integration_evidence_needs_decision')
    expect(readiness.reasonCodes).not.toContain('behavior_evidence_incomplete')

    await rm(testDir, { recursive: true, force: true })
  })

  test('maps failed status to missing_integration_evidence reason code', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-failed')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core',
          criticality: 'critical',
          status: 'failed',
          coverageLevel: 'exact',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
  })

  test('maps missing evidence to missing_integration_evidence reason code', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-missing')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [{
          scenarioId: 'scenario-0',
          name: 'core',
          criticality: 'critical',
          status: 'missing_evidence',
          coverageLevel: 'missing',
          freshness: 'fresh',
        }],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
  })

  test('deduplicates multiple scenarios with same reason code', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-dedup')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core\n### Scenario: edge\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [
          {
            scenarioId: 'scenario-0',
            name: 'core',
            criticality: 'critical',
            status: 'verified',
            coverageLevel: 'partial',
            freshness: 'fresh',
          },
          {
            scenarioId: 'scenario-1',
            name: 'edge',
            criticality: 'critical',
            status: 'missing_evidence',
            coverageLevel: 'missing',
            freshness: 'fresh',
          },
        ],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    // Both scenarios map to missing_integration_evidence, should appear only once
    const missingCount = readiness.reasonCodes.filter(c => c === 'missing_integration_evidence').length
    expect(missingCount).toBe(1)

    await rm(testDir, { recursive: true, force: true })
  })

  test('emits multiple distinct reason codes when different gap types coexist', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-multi-codes')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'behavior.md'), '### Scenario: core\n### Scenario: edge\n', 'utf-8')

    const readiness = await classifyReadiness(
      createContext(testDir, { quality: [], security: [] }),
      'demo-feature',
      createEvidence({
        behaviorScenarios: [
          {
            scenarioId: 'scenario-0',
            name: 'core',
            criticality: 'critical',
            status: 'verified',
            coverageLevel: 'exact',
            freshness: 'stale',
          },
          {
            scenarioId: 'scenario-1',
            name: 'edge',
            criticality: 'critical',
            status: 'missing_evidence',
            coverageLevel: 'missing',
            freshness: 'fresh',
          },
        ],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.NotReady)
    expect(readiness.reasonCodes).toContain('stale_integration_evidence')
    expect(readiness.reasonCodes).toContain('missing_integration_evidence')

    await rm(testDir, { recursive: true, force: true })
  })

  test('skipped quality checks do not produce quality_checks_failed reason code', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-skipped-quality')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'demo-feature.md'), '# demo', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'design.md'), '# Design', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    // Use security: [] to avoid test isolation issues (security scanners may find
    // leftover files from other tests in the shared working directory)
    const result = await handleVerify(createContext(testDir, { security: [] }), 'demo-feature')

    // Quality checks pass=true (skipped), so no quality_checks_failed
    expect(result).not.toContain('quality_checks_failed')
    expect(result).toContain('- status: ready')

    await rm(testDir, { recursive: true, force: true })
  })

  test('collectEvidence includes integration evidence coverage summary', async () => {
    const testDir = join(process.cwd(), '.test-verify-task4-coverage-summary')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'change-units.json'),
      JSON.stringify({ version: 1, byFeature: { 'demo-feature': { changeDir: '2026-01-01-demo-feature' } } }),
      'utf-8',
    )
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    const workspace = join(testDir, 'docs', 'changes', '2026-01-01-demo-feature')
    await mkdir(workspace, { recursive: true })
    await writeFile(join(workspace, 'design.md'), '# Design', 'utf-8')
    await writeFile(join(workspace, 'behavior.md'), `# Behavior Contract: demo-feature

## Behavior Scenarios

### Scenario: core behavior

Given:
- user has input

When:
- user runs command

Then:
- output is produced

## Verification Mapping

| Scenario ID | Criticality | Evidence Ref | Evidence Type | Coverage Level | Equivalence Rationale | Freshness | Status |
|-------------|-------------|--------------|---------------|----------------|-----------------------|-----------|--------|
| core behavior | critical | tests/demo.test.ts | test | exact | N/A | fresh | verified |
`, 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('Integration evidence coverage:')
    expect(result).toContain('1/1 critical scenarios covered')
    expect(result).toContain('1 exact')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  // === Compilation Probe Tests (Task 8) ===

  test('compilation probe detects TypeScript project and runs tsc --noEmit', async () => {
    const testDir = join(process.cwd(), '.test-verify-compilation-ts')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'design.md'), '# Design', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    // Create tsconfig.json to trigger TypeScript detection
    await writeFile(join(testDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }), 'utf-8')

    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    // Should contain compilation_probe in check results
    expect(result).toContain('compilation:compilation_probe')
    // Either passed (✅), failed (❌), or skipped — tsc may fail on empty project
    expect(result).toMatch(/compilation:compilation_probe (✅|❌|⚠️)/)

    // Compilation probe failure should not block readiness
    expect(result).toContain('- status: ready')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  test('compilation probe skips when no project language is detected', async () => {
    const testDir = join(process.cwd(), '.test-verify-compilation-no-lang')
    await rm(testDir, { recursive: true, force: true })
    ContractRuntime.resetInstance()

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')
    await mkdir(join(testDir, 'docs', 'changes', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'demo-feature', 'design.md'), '# Design', 'utf-8')
    await mkdir(join(testDir, 'docs', 'current'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'decisions'), { recursive: true })
    await saveAcceptanceState(testDir, createAcceptanceState('demo-feature'))

    // No language marker files — probe should skip
    const result = await handleVerify(createContext(testDir, { quality: [], security: [] }), 'demo-feature')

    expect(result).toContain('compilation:compilation_probe ✅ (skipped:')
    expect(result).toContain('No compilation probe available')

    ContractRuntime.resetInstance()
    await rm(testDir, { recursive: true, force: true })
  })

  test('compilation probe failure does not block readiness', async () => {
    const testDir = join(process.cwd(), '.test-verify-compilation-no-block')
    await rm(testDir, { recursive: true, force: true })

    const context = createContext(testDir, { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence({
        checkResults: [
          { name: 'test', passed: true, category: 'quality', detail: 'pass' },
          { name: 'compilation_probe', passed: false, category: 'compilation', detail: 'Compilation probe failed (exit code 1)' },
        ],
      }),
      createAcceptanceState('demo-feature'),
    )

    // Compilation failure should NOT block readiness
    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).not.toContain('compilation_checks_failed')
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })

  test('compilation probe success appears in evidence', async () => {
    const testDir = join(process.cwd(), '.test-verify-compilation-success-evidence')
    await rm(testDir, { recursive: true, force: true })

    const context = createContext(testDir, { quality: [], security: [] })
    const readiness = await classifyReadiness(
      context,
      'demo-feature',
      createEvidence({
        checkResults: [
          { name: 'test', passed: true, category: 'quality', detail: 'pass' },
          { name: 'compilation_probe', passed: true, category: 'compilation', detail: 'passed: tsc --noEmit — Compilation probe passed' },
        ],
      }),
      createAcceptanceState('demo-feature'),
    )

    expect(readiness.status).toBe(VerifyReadinessStatus.Ready)
    expect(readiness.reasonCodes).toEqual(['all_checks_passed'])

    await rm(testDir, { recursive: true, force: true })
  })
})
