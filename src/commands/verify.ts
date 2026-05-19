import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import type {
  AcceptanceState,
  AdapterConfig,
  BehaviorScenarioCheckResult,
  ClassifiedEvidenceGap,
  OpenFlowContext,
  QualityCheckType,
  VerifyEvidenceCheckResult,
  VerifyEvidencePacket,
  VerifyResult,
} from '../types.js'
import {
  VerifyDecisionType,
  VerifyReadinessStatus,
} from '../types.js'
import { AdapterCache } from '../adapters/cache.js'
import type { EvidenceAdapter, AdapterContext } from '../adapters/types.js'
import { getContractRuntime } from '../contracts/runtime.js'
import { fileExists } from '../hooks/file-utils.js'
import {
  ISSUE_CLARIFICATION_FILENAME,
  detectMode,
  type IssueMode,
} from '../utils/issue-utils.js'
import { resolveChangeUnitDir } from '../utils/change-units.js'
import { loadAcceptanceState, saveAcceptanceState, saveVerifyResult } from '../utils/acceptance-state.js'
import { createSafePath, escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { getActiveFeatureSession } from '../hooks/feature-workflow.js'
import { loadExecutionPolicy } from '../utils/execution-policy.js'
import { captureCurrentWorkspaceState, createEvidenceFreshnessMetadata } from '../utils/evidence-freshness.js'
import { detectOmoExecutionFlow } from '../utils/omo-detection.js'
import {
  readFeatureGuardianState,
  readGuardianRepairs,
  readSessionPending,
} from '../drift/state-store.js'

export interface VerifyReadinessResult {
  status: VerifyReadinessStatus
  reasonCodes: string[]
  reason: string
  nextStep: string
  decisionType?: VerifyDecisionType
  classifiedEvidenceGaps?: ClassifiedEvidenceGap[]
}

interface VerifyQuestionInput {
  question: string
  header: string
  options: Array<{
    label: string
    description: string
  }>
  multiple?: boolean
  custom?: boolean
}

type VerifyQuestionAnswer = string[]

export interface VerifyInteractiveToolContext {
  askQuestion(input: { questions: VerifyQuestionInput[] }): Promise<VerifyQuestionAnswer[]>
}

export type VerifyFailureOption = 'fix' | 'accept'

const OPENFLOW_COMMAND_TOKENS = [
  'openflow-feature',
  'openflow-change',
  'openflow-verify',
  'openflow-archive',
  'openflow-init',
  'openflow-status',
  'openflow-config',
  'openflow-harden',
  'openflow-issue',
  'openflow-migrate-docs',
  'openflow-writing-plan',
  'openflow-brainstorm',
  'slash-command',
  'command',
  'auto',
]

/**
 * Strips OpenFlow command-related tokens from a feature parameter that may
 * have been mangled by the AI agent's argument parsing.  For example:
 *   "auto-slash-command-openflow-command-openflow-verify" → ""
 *   "openflow-verify-my-feature" → "my-feature"
 *
 * If the result is empty, callers treat it as "no explicit feature" and fall
 * through to session-based or filesystem-based resolution.
 */
export function stripOpenFlowCommandTokens(feature: string): string {
  // Strip markdown backtick residue first so command tokens inside backticks
  // are exposed for matching (e.g. "`openflow-verify`" → "openflow-verify" → "")
  let cleaned = feature.replace(/^`+|`+$/g, '')

  // Iteratively strip known tokens (may need multiple passes because removals
  // can expose new boundary matches, e.g. "auto-slash-command-openflow-verify"
  // → strip "slash-command" → "auto--openflow-verify" → strip "openflow-verify" → "auto-")
  let previous: string
  do {
    previous = cleaned
    for (const token of OPENFLOW_COMMAND_TOKENS) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Match token when surrounded by start-of-string/dash and dash/end-of-string
      const pattern = new RegExp(`(^|-)${escaped}(-|$)`, 'g')
      cleaned = cleaned.replace(pattern, '$1')
    }
    // Clean up consecutive hyphens and leading/trailing hyphens
    cleaned = cleaned.replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  } while (cleaned !== previous)

  // Final cleanup: if the remaining string is just the bare "openflow" prefix
  // with no real content, it's command residue, not a feature name.
  if (cleaned === 'openflow' || cleaned === 'openflow-') {
    return ''
  }

  return cleaned
}

export async function handleVerify(
  ctx: OpenFlowContext,
  feature?: string,
  acceptFailures?: boolean,
  toolContext?: unknown,
  sessionID?: string,
): Promise<string> {
  // Step 1: Sanitize the feature parameter to remove OpenFlow command tokens
  let candidateFeature = feature?.trim() ? stripOpenFlowCommandTokens(feature.trim()) : undefined

  // Step 2: Sanitized away to empty string → treat as undefined
  if (candidateFeature === '') candidateFeature = undefined

  // Step 3: Resolution chain: explicit arg → session active feature → filesystem fallback
  const resolvedFeature = candidateFeature
    ?? (sessionID ? await getActiveFeatureSession(ctx.directory, sessionID) : undefined)
    ?? await findActiveFeature(ctx)

  if (!resolvedFeature) {
    return `## Verify

### Evidence
- checks_run: active_feature_resolution ❌ (no explicit feature and no active plan in .sisyphus/plans)
- observed_behavior_summary: no verification context was resolved
- intended_vs_actual_delta: unknown (feature context missing)
- doc_alignment_summary: skipped (feature context missing)
- current_decisions_conflict_summary: skipped (feature context missing)
- known_risks_or_missing_evidence: missing active feature context

### Readiness
- status: ${VerifyReadinessStatus.NotReady}
- reason: active feature is required to build an evidence packet
- next_step: run /openflow-verify <feature-name> or create an active plan under .sisyphus/plans/
`
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const acceptanceState = await loadAcceptanceState(ctx.directory)
  const matchingAcceptanceState = acceptanceState?.feature === sanitizedFeature ? acceptanceState : null
  const detectedMode = await detectMode(ctx, sanitizedFeature)
  const mode = resolveVerifyMode(detectedMode, matchingAcceptanceState)
  const evidence = await collectEvidence(ctx, sanitizedFeature, mode, matchingAcceptanceState)

  if (matchingAcceptanceState) {
    if (acceptFailures === true) {
      matchingAcceptanceState.acceptedFailures = true
      await saveAcceptanceState(ctx.directory, matchingAcceptanceState)
    } else if (matchingAcceptanceState.acceptedFailures) {
      delete matchingAcceptanceState.acceptedFailures
      await saveAcceptanceState(ctx.directory, matchingAcceptanceState)
    }
  }

  const readiness = await classifyReadiness(
    ctx,
    sanitizedFeature,
    evidence,
    matchingAcceptanceState,
    acceptFailures,
    mode,
  )
  const verifyResult: VerifyResult = {
    readiness: readiness.status,
    reasonCodes: readiness.reasonCodes,
    evidenceSummary: buildEvidenceSummary(evidence, readiness),
    constraintsChecked: collectConstraintNames(evidence),
    verifiedAt: new Date().toISOString(),
  }

  if (readiness.decisionType) {
    verifyResult.decisionType = readiness.decisionType
  }

  const freshnessMetadata = createEvidenceFreshnessMetadata(
    captureCurrentWorkspaceState(ctx.directory),
    verifyResult.constraintsChecked,
    verifyResult.evidenceSummary,
  )
  await saveVerifyResult(ctx.directory, verifyResult, freshnessMetadata, sanitizedFeature)

  if (readiness.status === VerifyReadinessStatus.NotReady && hasAskQuestion(toolContext)) {
    const selectedOption = await askVerifyFailureQuestion(toolContext)

    if (selectedOption === 'accept') {
      return handleVerify(ctx, sanitizedFeature, true, toolContext, sessionID)
    }
  }

  return await formatVerifyResult(ctx, sanitizedFeature, evidence, readiness)
}



async function collectEvidence(
  ctx: OpenFlowContext,
  feature: string,
  mode: IssueMode,
  acceptanceState?: AcceptanceState | null,
): Promise<VerifyEvidencePacket> {
  const changeDir = await resolveChangeUnitDir(ctx.directory, feature)
  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${feature}.md`)
  const changesPath = createSafePath(ctx.directory, 'docs', 'changes', changeDir)
  const currentPath = createSafePath(ctx.directory, 'docs', 'current')
  const decisionsPath = createSafePath(ctx.directory, 'docs', 'decisions')
  const issueClarificationPath = acceptanceState?.issueClarificationPath
    ? createSafePath(ctx.directory, acceptanceState.issueClarificationPath)
    : createSafePath(ctx.directory, 'docs', 'changes', changeDir, ISSUE_CLARIFICATION_FILENAME)

  const planExists = await fileExists(planPath)
  const changesExists = await fileExists(changesPath)
  const currentExists = await fileExists(currentPath)
  const decisionsExists = await fileExists(decisionsPath)
  const issueClarificationExists = await fileExists(issueClarificationPath)
  const issueSignals = evaluateIssueSignals(acceptanceState, issueClarificationExists)

  const changeBehaviorPath = path.join(changesPath, 'behavior.md')
  const behaviorExists = await fileExists(changeBehaviorPath)

  // Context alignment: feature mode uses design.md, issue/mixed mode uses issue-clarification.md
  const designPath = path.join(changesPath, 'design.md')
  const designExists = changesExists && await fileExists(designPath)
  const contextAlignmentPresent = mode === 'feature'
    ? designExists
    : issueClarificationExists
  const contextAlignmentPath = mode === 'feature'
    ? `docs/changes/${changeDir}/design.md`
    : `docs/changes/${changeDir}/${ISSUE_CLARIFICATION_FILENAME}`

  const checksRun = [
    `active_feature_resolution ✅ (${feature})`,
    `plan_exists ${planExists ? '✅' : mode === 'issue' ? 'ℹ️' : '⚠️'} (${planExists ? 'found' : mode === 'issue' ? `not required in issue mode (.sisyphus/plans/${feature}.md)` : `missing .sisyphus/plans/${feature}.md`})`,
    `context_alignment ${contextAlignmentPresent ? '✅' : '⚠️'} (${contextAlignmentPresent ? `found ${contextAlignmentPath}` : `missing ${contextAlignmentPath}`})`,
    `behavior_exists ${behaviorExists ? '✅' : 'ℹ️'} (${behaviorExists ? 'found' : 'not found'} docs/changes/${changeDir}/behavior.md)`,
    `changes_workspace ${changesExists ? '✅' : '⚠️'} (${changesExists ? 'found' : 'missing'} docs/changes/${changeDir})`,
    `stable_constraints_current ${currentExists ? '✅' : '⚠️'} (${currentExists ? 'found' : 'missing'} docs/current)`,
    `stable_constraints_decisions ${decisionsExists ? '✅' : '⚠️'} (${decisionsExists ? 'found' : 'missing'} docs/decisions)`,
  ]

  if (mode !== 'feature') {
    checksRun.push(
      `issue_clarification_exists ${issueClarificationExists ? '✅' : '⚠️'} (${issueClarificationExists ? 'found' : 'missing'} docs/changes/${changeDir}/${ISSUE_CLARIFICATION_FILENAME})`,
      `root_cause_closure ${issueSignals.rootCauseClosed ? '✅' : '⚠️'} (${issueSignals.rootCauseDetail})`,
      `semantic_contract_integrity ${issueSignals.semanticContractIntact ? '✅' : '⚠️'} (${issueSignals.semanticContractDetail})`,
      `recommended_action_execution ${issueSignals.recommendedActionExecuted ? '✅' : '⚠️'} (${issueSignals.recommendedActionDetail})`,
      `unintended_behavior_change ${issueSignals.unintendedBehaviorChangeClear ? '✅' : '⚠️'} (${issueSignals.unintendedBehaviorDetail})`,
      `governance_promotion_status ${issueSignals.governanceReady ? '✅' : '⚠️'} (${issueSignals.governanceDetail})`,
    )
  }

  const cache = new AdapterCache()
  const contractRuntime = getContractRuntime()
  await contractRuntime.start(ctx.directory)
  const contract = await contractRuntime.getOrExtractContract(feature)

  const qualityResults = await runQualityChecks(ctx)
  const securityResults = await runSecurityChecks(ctx, cache)
  const consistencyResults = await runConsistencyChecks(ctx, cache, feature, contract, acceptanceState)
  const checkResults = [...qualityResults, ...securityResults, ...consistencyResults]
  const failedChecks = checkResults.filter(result => !result.passed)

  const behaviorEvidence = behaviorExists
    ? await parseBehaviorEvidenceMappings(changeBehaviorPath)
    : []
  const behaviorScenarios = evaluateBehaviorScenarios(contract, behaviorEvidence)

  const missingEvidence: string[] = []
  if (!contextAlignmentPresent) missingEvidence.push('context alignment artifact')
  if (!changesExists) missingEvidence.push('change workspace')
  if (mode !== 'feature' && !issueClarificationExists) missingEvidence.push('issue clarification')

  const issueFailures: string[] = []
  if (mode !== 'feature') {
    if (!issueSignals.rootCauseClosed) issueFailures.push('root cause closure')
    if (!issueSignals.semanticContractIntact) issueFailures.push('semantic contract integrity')
    if (!issueSignals.recommendedActionExecuted) issueFailures.push('recommended action execution')
    if (!issueSignals.unintendedBehaviorChangeClear) issueFailures.push('unintended behavior change review')
    if (!issueSignals.governanceReady) issueFailures.push('governance promotion status')
  }

  const evidenceGaps: string[] = []
  if (missingEvidence.length > 0) {
    evidenceGaps.push(`Missing evidence: ${missingEvidence.join(', ')}.`)
  }
  if (issueFailures.length > 0) {
    evidenceGaps.push(`Issue-mode checks need follow-up: ${issueFailures.join(', ')}.`)
  }
  if (failedChecks.length > 0) {
    evidenceGaps.push(`Failed checks: ${failedChecks.map(formatFailedCheckSummary).join(', ')}.`)
  }
  if (behaviorScenarios) {
    const unverified = behaviorScenarios.filter(s => s.status !== 'verified' && s.status !== 'not_applicable')
    if (unverified.length > 0) {
      evidenceGaps.push(`Behavior scenarios needing evidence: ${unverified.map(s => `${s.name} (${s.status})`).join(', ')}.`)
    }
  }

  const classifiedEvidenceGaps = classifyEvidenceGaps({
    mode,
    contextAlignmentPresent,
    changesExists,
    issueClarificationExists,
    issueFailures,
    failedChecks,
    behaviorScenarios,
  })

  const verifiedCount = behaviorScenarios
    ? behaviorScenarios.filter(s => s.status === 'verified').length
    : 0
  const scenarioSummary = behaviorScenarios
    ? ` ${verifiedCount}/${behaviorScenarios.length} behavior scenarios verified.`
    : ''

  const packet: VerifyEvidencePacket = {
    checksRun,
    checkResults,
    observedBehaviorSummary: `Collected ${checkResults.length} verification check result(s); ${checkResults.filter(result => result.passed).length} passed and ${failedChecks.length} failed.${scenarioSummary}`,
    intendedVsActualDelta: failedChecks.length > 0 || issueFailures.length > 0
      ? `Verification evidence is incomplete because ${[failedChecks.length > 0 ? `${failedChecks.length} configured check(s) failed` : '', issueFailures.length > 0 ? `${issueFailures.length} issue-mode expectation(s) remain unresolved` : ''].filter(Boolean).join(' and ')}.`
      : 'Configured verification checks did not expose an intended-vs-actual delta.',
    docAlignmentSummary: changesExists
      ? contextAlignmentPresent
        ? mode === 'feature'
          ? `Change workspace and design.md provide context alignment; document alignment can be reviewed from the active changes workspace.`
          : `Change workspace and issue clarification provide context alignment; issue intent and documentation alignment can be reviewed together.`
        : 'Change workspace exists but context alignment artifact is missing; intent cannot be fully assessed.'
      : 'Change workspace missing; document alignment cannot be fully assessed.',
    constraintConflictSummary: currentExists || decisionsExists
      ? mode === 'feature'
        ? 'Constraint baselines were located; no explicit decision blocker was detected by shell evidence.'
        : `Constraint baselines were located; governance promotion status is ${acceptanceState?.governancePromotionStatus ?? 'none'}.`
      : 'No current/decisions baseline detected; constraint conflict review is limited.',
    knownRisksOrMissingEvidence: evidenceGaps.length > 0
      ? evidenceGaps.join(' ')
      : 'No blocking evidence gaps detected.',
  }
  if (behaviorScenarios) {
    packet.behaviorScenarios = behaviorScenarios
  }
  if (classifiedEvidenceGaps.length > 0) {
    packet.classifiedEvidenceGaps = classifiedEvidenceGaps
  }
  if (behaviorEvidence.length > 0) {
    packet.behaviorEvidence = behaviorEvidence
  }
  return packet
}

function classifyEvidenceGaps(input: {
  mode: IssueMode
  contextAlignmentPresent: boolean
  changesExists: boolean
  issueClarificationExists: boolean
  issueFailures: string[]
  failedChecks: VerifyEvidenceCheckResult[]
  behaviorScenarios: BehaviorScenarioCheckResult[] | undefined
}): ClassifiedEvidenceGap[] {
  const gaps: ClassifiedEvidenceGap[] = []

  if (!input.contextAlignmentPresent) {
    gaps.push({
      code: 'context_alignment_missing',
      kind: input.mode === 'feature' ? 'workflow_stage_missing' : 'blocking_evidence_gap',
      message: input.mode === 'feature'
        ? 'Feature verification is missing design/context alignment from the workflow stage.'
        : 'Issue verification is missing issue clarification context alignment.',
      nextStep: input.mode === 'feature'
        ? 'Enter the explicit feature workflow or planning workflow; do not create a minimal design artifact just to satisfy verify.'
        : 'Provide issue clarification before resolving or archiving the issue.',
    })
  }

  if (!input.changesExists) {
    gaps.push({
      code: 'changes_workspace_missing',
      kind: input.mode === 'feature' ? 'workflow_stage_missing' : 'limited_context_gap',
      message: 'Change workspace is missing, so document alignment evidence is incomplete.',
      nextStep: 'Use the explicit OpenFlow workflow stage if semantic readiness is required; otherwise treat this as limited context.',
    })
  }

  if (input.mode !== 'feature' && !input.issueClarificationExists) {
    gaps.push({
      code: 'issue_clarification_missing',
      kind: 'blocking_evidence_gap',
      message: 'Issue-mode readiness requires an issue clarification artifact.',
      nextStep: 'Run the issue clarification workflow before archive readiness.',
    })
  }

  for (const issueFailure of input.issueFailures) {
    gaps.push({
      code: issueFailure.replace(/\s+/g, '_'),
      kind: 'blocking_evidence_gap',
      message: `Issue-mode evidence is incomplete: ${issueFailure}.`,
      nextStep: 'Resolve the issue-mode evidence gap before claiming readiness.',
    })
  }

  for (const failedCheck of input.failedChecks) {
    gaps.push({
      code: `${failedCheck.category}_${failedCheck.name}_failed`,
      kind: 'blocking_evidence_gap',
      message: `${failedCheck.category} check ${failedCheck.name} failed.`,
      nextStep: 'Fix the failed check or explicitly accept non-hard-blocking failures where allowed.',
    })
  }

  const behaviorGaps = input.behaviorScenarios?.filter(isBlockingBehaviorScenarioGap) ?? []
  for (const scenario of behaviorGaps) {
    gaps.push({
      code: `behavior_${scenario.scenarioId}_evidence_incomplete`,
      kind: scenario.criticality === 'critical' ? 'blocking_evidence_gap' : 'informational_gap',
      message: `Behavior scenario "${scenario.name}" lacks required evidence.`,
      nextStep: 'Add real verification evidence for the behavior scenario, or mark it not applicable only if the contract truly does not apply.',
    })
  }

  return gaps
}

async function runQualityChecks(ctx: OpenFlowContext): Promise<VerifyEvidenceCheckResult[]> {
  const results: VerifyEvidenceCheckResult[] = []

  for (const checkName of ctx.config.verification.quality) {
    const commandSpec = getQualityCommandSpec(checkName)
    const commandResult = await runCommand(ctx.directory, commandSpec.command, commandSpec.args)

    results.push({
      name: checkName,
      passed: commandResult.passed,
      category: 'quality',
      detail: `${commandSpec.display} — ${commandResult.detail}`,
    })
  }

  return results
}

async function runSecurityChecks(
  ctx: OpenFlowContext,
  cache: AdapterCache,
): Promise<VerifyEvidenceCheckResult[]> {
  const results: VerifyEvidenceCheckResult[] = []

  for (const checkName of ctx.config.verification.security) {
    const resultsForCheck = await runSecurityAdapter(ctx, cache, checkName)
    results.push(...resultsForCheck)
  }

  return results
}

async function runSecurityAdapter(
  ctx: OpenFlowContext,
  cache: AdapterCache,
  checkName: string,
): Promise<VerifyEvidenceCheckResult[]> {
  const adaptersConfig = ctx.config.verification.adapters
  const adapterCfg: AdapterConfig = getSecurityAdapterConfig(checkName, adaptersConfig)
  const adapterCtx: AdapterContext = {
    projectDir: ctx.directory,
    feature: '',
    config: adapterCfg,
    cache,
  }

  try {
    switch (checkName) {
      case 'secret': {
        const { SecretScannerAdapter } = await import('../adapters/security/secret-scanner.js')
        return new SecretScannerAdapter().run(adapterCtx)
      }
      case 'vuln': {
        const { VulnerabilityScannerAdapter } = await import('../adapters/security/vuln-scanner.js')
        return new VulnerabilityScannerAdapter().run(adapterCtx)
      }
      case 'dependency': {
        const { DependencyCheckAdapter } = await import('../adapters/security/dependency-check.js')
        return new DependencyCheckAdapter().run(adapterCtx)
      }
      default:
        return [{
          name: checkName,
          passed: true,
          category: 'security',
          detail: `skipped: unknown security check type ${checkName}`,
        }]
    }
  } catch {
    return [{
      name: checkName,
      passed: true,
      category: 'security',
      detail: `skipped: adapter for ${checkName} unavailable`,
    }]
  }
}

function getSecurityAdapterConfig(
  checkName: string,
  adaptersConfig: import('../types.js').VerificationAdapterConfig | undefined,
): AdapterConfig {
  if (!adaptersConfig) return {}
  switch (checkName) {
    case 'secret': return adaptersConfig.secret ?? {}
    case 'vuln': return adaptersConfig.vuln ?? {}
    case 'dependency': return adaptersConfig.dependency ?? {}
    default: return {}
  }
}

async function runConsistencyChecks(
  ctx: OpenFlowContext,
  cache: AdapterCache,
  feature: string,
  contract?: import('../contracts/openflow-contract.js').OpenFlowContract | null,
  acceptanceState?: AcceptanceState | null,
): Promise<VerifyEvidenceCheckResult[]> {
  const adaptersConfig = ctx.config.verification.adapters
  if (!adaptersConfig?.consistency) {
    return [{
      name: 'workspace_consistency',
      passed: true,
      category: 'consistency',
      detail: `Consistency checks passed for ${feature}.`,
    }]
  }

  const results: VerifyEvidenceCheckResult[] = []
  const guardianEvidence = await loadGuardianEvidence(ctx.directory, feature, acceptanceState?.sessionID)
  const adapterCtx: AdapterContext = {
    projectDir: ctx.directory,
    feature,
    config: adaptersConfig.consistency as AdapterConfig,
    cache,
    // Pass contract to adapters via context extension
    ...(contract ? { contract } : {}),
    ...(guardianEvidence ? { guardianEvidence } : {}),
  } as AdapterContext & { contract?: import('../contracts/openflow-contract.js').OpenFlowContract | null }

  const adapterImports: Array<{ name: string; importModule: () => Promise<{ new(): EvidenceAdapter }> }> = [
    {
      name: 'design_drift',
      importModule: async () => {
        const { DesignDriftAdapter } = await import('../adapters/consistency/design-drift.js')
        return DesignDriftAdapter
      },
    },
    {
      name: 'current_constraints',
      importModule: async () => {
        const { CurrentConstraintsAdapter } = await import('../adapters/consistency/current-constraints.js')
        return CurrentConstraintsAdapter
      },
    },
    {
      name: 'decisions_constraints',
      importModule: async () => {
        const { DecisionsConstraintsAdapter } = await import('../adapters/consistency/decisions-constraints.js')
        return DecisionsConstraintsAdapter
      },
    },
  ]

  for (const { name, importModule } of adapterImports) {
    try {
      const AdapterClass = await importModule()
      const adapterResults = await new AdapterClass().run(adapterCtx)
      results.push(...adapterResults)
    } catch {
      results.push({
        name,
        passed: true,
        category: 'consistency',
        detail: `skipped: ${name} adapter unavailable`,
      })
    }
  }

  if (results.length === 0) {
    results.push({
      name: 'workspace_consistency',
      passed: true,
      category: 'consistency',
      detail: `No consistency issues detected for ${feature}.`,
    })
  }

  return results
}

async function loadGuardianEvidence(
  projectDir: string,
  feature: string,
  sessionId?: string,
): Promise<import('../types.js').GuardianEvidence | undefined> {
  const state = await readFeatureGuardianState(projectDir, feature)
  if (!state) return undefined

  const repairs = await readGuardianRepairs(projectDir)
  const featureRepairs = repairs.filter(r => r.feature === feature)

  let pendingItems: import('../types.js').GuardianPendingItem[] = []
  if (sessionId) {
    const allPending = await readSessionPending(projectDir, sessionId)
    pendingItems = allPending.filter(p => p.feature === feature)
  }

  return {
    autoRepairs: state.repairsCount,
    pendingAmbiguities: pendingItems.filter(p => p.disposition === 'ambiguous_needs_confirmation').length,
    unresolvedViolations: pendingItems.filter(p => p.disposition === 'violation_needs_fix').length,
    contractSource: `docs/changes/*-${feature}`,
    repairRecords: featureRepairs,
    pendingItems,
  }
}

export async function classifyReadiness(
  ctx: OpenFlowContext,
  feature: string,
  evidence: VerifyEvidencePacket,
  acceptanceStateOverride?: AcceptanceState | null,
  acceptFailures?: boolean,
  mode: IssueMode = 'feature',
): Promise<VerifyReadinessResult> {
  const acceptanceState = acceptanceStateOverride === undefined
    ? await loadAcceptanceState(ctx.directory)
    : acceptanceStateOverride
  const matchingAcceptanceState = acceptanceState?.feature === feature ? acceptanceState : null
  const pendingDocUpdates = matchingAcceptanceState?.pendingDocUpdates ?? []
  const decisionType = detectDecisionType(evidence.constraintConflictSummary)

  if (decisionType) {
    return {
      status: VerifyReadinessStatus.NeedsDecision,
      reasonCodes: [decisionType],
      reason: buildNeedsDecisionReason(decisionType, feature),
      nextStep: 'Resolve the blocking decision, then rerun /openflow-verify.',
      decisionType,
    }
  }

  const governanceStatus = matchingAcceptanceState?.governancePromotionStatus ?? 'none'
  const hasPendingDecisionPromotion = hasUnapprovedDecisionPromotion(matchingAcceptanceState)

  if (mode !== 'feature' && governanceStatus === 'needs_decision') {
    return {
      status: VerifyReadinessStatus.NeedsDecision,
      reasonCodes: ['governance_needs_decision'],
      reason: `Verification needs a governance decision for ${feature} before issue-mode readiness can be confirmed.`,
      nextStep: 'Resolve the governance promotion decision, then rerun /openflow-verify.',
    }
  }

  const reasonCodes: string[] = []
  if (!didNamedCheckPass(evidence, 'context_alignment')) {
    reasonCodes.push('context_alignment_missing')
  }
  if (!didNamedCheckPass(evidence, 'changes_workspace')) {
    reasonCodes.push('changes_workspace_missing')
  }
  if (mode !== 'feature') {
    if (!didNamedCheckPass(evidence, 'issue_clarification_exists')) {
      reasonCodes.push('issue_clarification_missing')
    }
    if (!didNamedCheckPass(evidence, 'root_cause_closure')) {
      reasonCodes.push('root_cause_not_closed')
    }
    if (!didNamedCheckPass(evidence, 'semantic_contract_integrity')) {
      reasonCodes.push('semantic_contract_at_risk')
    }
    if (!didNamedCheckPass(evidence, 'recommended_action_execution')) {
      reasonCodes.push('recommended_action_incomplete')
    }
    if (!didNamedCheckPass(evidence, 'unintended_behavior_change')) {
      reasonCodes.push('unintended_behavior_change_detected')
    }
    if (!didNamedCheckPass(evidence, 'governance_promotion_status')) {
      reasonCodes.push(governanceStatus === 'blocked_unapproved' ? 'governance_blocked_unapproved' : 'governance_promotion_incomplete')
    }
    if (hasPendingDecisionPromotion && governanceStatus !== 'confirmed') {
      reasonCodes.push('decision_promotion_unapproved')
    }
  }

  const failedCategories = new Set(
    evidence.checkResults
      .filter(result => !result.passed)
      .map(result => result.category),
  )

  if (failedCategories.has('quality')) {
    reasonCodes.push('quality_checks_failed')
  }
  if (failedCategories.has('security')) {
    reasonCodes.push('security_checks_failed')
  }
  if (failedCategories.has('consistency')) {
    reasonCodes.push('consistency_checks_failed')
  }

  const changeDir = await resolveChangeUnitDir(ctx.directory, feature)
  const changeBehaviorPath = createSafePath(ctx.directory, 'docs', 'changes', changeDir, 'behavior.md')
  const behaviorExists = await fileExists(changeBehaviorPath)
  if (behaviorExists && mode === 'feature') {
    const behaviorScenarios = await parseBehaviorScenarios(changeBehaviorPath)
    if (behaviorScenarios.length > 0 && evidence.behaviorScenarios && evidence.behaviorScenarios.some(isBlockingBehaviorScenarioGap)) {
      reasonCodes.push('behavior_evidence_incomplete')
    }
  }

  const acceptedFailures = matchingAcceptanceState?.acceptedFailures === true || acceptFailures === true
  const hardBlockerCodes = new Set(['issue_clarification_missing', 'governance_blocked_unapproved', 'decision_promotion_unapproved'])
  const hasHardBlocker = reasonCodes.some(code => hardBlockerCodes.has(code))

  if (reasonCodes.length > 0) {
    const result: VerifyReadinessResult = {
      status: acceptedFailures && !hasHardBlocker ? VerifyReadinessStatus.Ready : VerifyReadinessStatus.NotReady,
      reasonCodes,
      reason: `Verification is blocked for ${feature}: ${reasonCodes.join(', ')}.`,
      nextStep: acceptedFailures && !hasHardBlocker
        ? '已接受当前失败项；如需恢复严格验证，请修复失败检查后重新运行 /openflow-verify。'
        : hasHardBlocker
          ? 'Provide the missing issue intent artifact or secure the required governance approval, then rerun /openflow-verify.'
          : 'Fix the failing checks or missing evidence, then rerun /openflow-verify.',
    }
    const classifiedEvidenceGaps = evidence.classifiedEvidenceGaps ?? classifyReasonCodesAsEvidenceGaps(reasonCodes, mode)
    if (classifiedEvidenceGaps.length > 0) {
      result.classifiedEvidenceGaps = classifiedEvidenceGaps
    }
    return result
  }

  if (pendingDocUpdates.length > 0) {
    return {
      status: VerifyReadinessStatus.ReadyWithDocUpdates,
      reasonCodes: ['pending_doc_updates'],
      reason: `${pendingDocUpdates.length} pending document update(s) remain for ${feature}.`,
      nextStep: 'Sync the pending documentation updates before archiving or final promotion.',
    }
  }

  return {
    status: VerifyReadinessStatus.Ready,
    reasonCodes: ['all_checks_passed'],
    reason: `Verification evidence for ${feature} is complete and no blocking follow-up remains.`,
    nextStep: 'Continue the acceptance or archive workflow.',
  }
}

function classifyReasonCodesAsEvidenceGaps(reasonCodes: string[], mode: IssueMode): ClassifiedEvidenceGap[] {
  return reasonCodes
    .filter(code => code.endsWith('_missing') || code.includes('_failed') || code.includes('_incomplete'))
    .map((code): ClassifiedEvidenceGap => {
      if (code === 'context_alignment_missing') {
        return {
          code,
          kind: mode === 'feature' ? 'workflow_stage_missing' : 'blocking_evidence_gap',
          message: 'Context alignment evidence is missing.',
          nextStep: mode === 'feature'
            ? 'Enter the explicit workflow stage; do not create a minimal design artifact just to satisfy verify.'
            : 'Provide issue clarification before readiness.',
        }
      }
      if (code === 'changes_workspace_missing') {
        return {
          code,
          kind: mode === 'feature' ? 'workflow_stage_missing' : 'limited_context_gap',
          message: 'Change workspace evidence is missing.',
          nextStep: 'Use the explicit workflow stage if semantic readiness is required.',
        }
      }
      return {
        code,
        kind: 'blocking_evidence_gap',
        message: `Evidence gap detected: ${code}.`,
        nextStep: 'Resolve the evidence gap before claiming readiness.',
      }
    })
}

async function formatVerifyResult(
  ctx: OpenFlowContext,
  feature: string,
  evidence: VerifyEvidencePacket,
  readiness: VerifyReadinessResult,
): Promise<string> {
  const failureOptions = readiness.status === VerifyReadinessStatus.NotReady
    ? `
### 失败后的可选操作
- **Option 1**: 修复失败的检查，然后重新运行 /openflow-verify
- **Option 2**: 如果你确定这些失败是可接受的，运行 /openflow-verify --accept-failures 来标记成功
`
    : ''

  const behaviorSection = evidence.behaviorScenarios && evidence.behaviorScenarios.length > 0
    ? `
- behavior_scenarios:
${evidence.behaviorScenarios.map(s => `  - ${s.scenarioId}: ${s.name} ${s.status === 'verified' ? '✅' : s.status === 'not_applicable' ? 'ℹ️' : '⚠️'} (${s.status}${s.detail ? ` — ${escapeMarkdown(s.detail)}` : ''})`).join('\n')}
`
    : ''
  const classifiedEvidenceGapsSection = evidence.classifiedEvidenceGaps && evidence.classifiedEvidenceGaps.length > 0
    ? `
- classified_evidence_gaps:
${evidence.classifiedEvidenceGaps.map(gap => `  - ${gap.code}: ${gap.kind} — ${escapeMarkdown(gap.message)} Next: ${escapeMarkdown(gap.nextStep)}`).join('\n')}
`
    : ''

  const policy = await loadExecutionPolicy(ctx.directory, feature)
  const omoStatus = await detectOmoExecutionFlow(ctx)

  let policySection = ''
  if (policy) {
    const hardenResult = policy.harden_policy === 'none' ? 'skipped' : 'not_run'
    policySection = `

### Execution Quality Policy
| Field | Value |
|-------|-------|
| Executor | ${omoStatus} |
| Quality Mode | ${policy.quality_mode} |
| Harden Policy | ${policy.harden_policy} |
| Harden Result | ${hardenResult} |
| Verify Policy | ${policy.verify_policy} |
`
    evidence.checkResults.push({
      name: 'execution_quality_policy',
      passed: true,
      category: 'quality',
      detail: `Execution quality policy loaded: ${policy.quality_mode} mode, ${policy.harden_policy} harden`,
    })
  } else {
    const boulderPath = createSafePath(ctx.directory, '.sisyphus', 'boulder.json')
    const boulderExists = await fileExists(boulderPath)
    if (boulderExists) {
      policySection = `

### Execution Quality Policy
No execution quality policy recorded.
`
    } else {
      policySection = `

### Execution Quality Policy
Harden skipped: OMO execution flow not detected.
`
    }
    evidence.checkResults.push({
      name: 'execution_quality_policy',
      passed: true,
      category: 'quality',
      detail: policySection.trim(),
    })
  }

  return `## Verify

Feature: ${escapeMarkdown(feature)}

### Evidence
- checks_run:
${evidence.checksRun.map(check => `  - ${check}`).join('\n')}
- check_results:
${formatCheckResults(evidence.checkResults)}${behaviorSection}${classifiedEvidenceGapsSection}
- observed_behavior_summary: ${escapeMarkdown(evidence.observedBehaviorSummary)}
- intended_vs_actual_delta: ${escapeMarkdown(evidence.intendedVsActualDelta)}
- doc_alignment_summary: ${escapeMarkdown(evidence.docAlignmentSummary)}
- current_decisions_conflict_summary: ${escapeMarkdown(evidence.constraintConflictSummary)}
- known_risks_or_missing_evidence: ${escapeMarkdown(evidence.knownRisksOrMissingEvidence)}

### Readiness
- status: ${readiness.status}
- reason_codes: ${escapeMarkdown(readiness.reasonCodes.join(', '))}
- reason: ${escapeMarkdown(readiness.reason)}
${readiness.decisionType ? `- decision_type: ${readiness.decisionType}\n` : ''}- next_step: ${escapeMarkdown(readiness.nextStep)}
${failureOptions}${policySection}`
}

async function askVerifyFailureQuestion(toolContext: VerifyInteractiveToolContext): Promise<VerifyFailureOption | undefined> {
  const answers = await toolContext.askQuestion({
    questions: [
      {
        question: '验证发现未通过的检查。请选择下一步操作：',
        header: '验证失败',
        options: [
          { label: '修复问题', description: '修复失败的检查，然后重新运行验证' },
          { label: '标记成功', description: '接受当前失败，标记验证通过' },
        ],
        multiple: false,
        custom: false,
      },
    ],
  })

  return normalizeVerifyFailureOption(answers[0])
}

function normalizeVerifyFailureOption(answer: VerifyQuestionAnswer | undefined): VerifyFailureOption | undefined {
  const firstAnswer = answer?.[0]?.trim().toLowerCase()
  if (!firstAnswer) {
    return undefined
  }

  if (firstAnswer.includes('标记') || firstAnswer.includes('accept')) {
    return 'accept'
  }

  if (firstAnswer.includes('修复') || firstAnswer.includes('fix')) {
    return 'fix'
  }

  return undefined
}

function hasAskQuestion(value: unknown): value is VerifyInteractiveToolContext {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'askQuestion' in value && typeof value.askQuestion === 'function'
}

function getQualityCommandSpec(checkName: QualityCheckType): { command: string; args: string[]; display: string } {
  switch (checkName) {
    case 'test':
      return { command: 'bun', args: ['test'], display: 'bun test' }
    case 'typecheck':
      return { command: 'bun', args: ['run', 'typecheck'], display: 'bun run typecheck' }
    case 'lint':
      return { command: 'bun', args: ['run', 'lint'], display: 'bun run lint' }
    case 'format':
      return { command: 'bun', args: ['run', 'format'], display: 'bun run format' }
  }
}

async function runCommand(cwd: string, command: string, args: string[]): Promise<{ passed: boolean; detail: string }> {
  return await new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      if (settled) return
      settled = true
      resolve({ passed: false, detail: sanitizeCheckDetail(error.message) })
    })

    child.on('close', code => {
      if (settled) return
      settled = true
      const output = sanitizeCheckDetail([stdout, stderr].filter(Boolean).join(' '))
      resolve({
        passed: code === 0,
        detail: output || (code === 0 ? 'passed' : `exited with code ${code ?? 'unknown'}`),
      })
    })
  })
}

function sanitizeCheckDetail(detail: string): string {
  const flattened = detail.replace(/\s+/g, ' ').trim()
  return flattened.length > 240 ? `${flattened.slice(0, 237)}...` : flattened
}

function formatFailedCheckSummary(result: VerifyEvidenceCheckResult): string {
  return `${result.category}:${result.name}`
}

function formatCheckResults(checkResults: VerifyEvidenceCheckResult[]): string {
  if (checkResults.length === 0) {
    return '  - none'
  }

  return checkResults
    .map(result => {
      const base = `  - ${result.category}:${result.name} ${result.passed ? '✅' : '❌'}`
      return result.detail ? `${base} (${escapeMarkdown(result.detail)})` : base
    })
    .join('\n')
}

function didNamedCheckPass(evidence: VerifyEvidencePacket, checkName: string): boolean {
  return evidence.checksRun.some(check => check.startsWith(`${checkName} ✅`))
}

function detectDecisionType(summary: string): VerifyDecisionType | undefined {
  const normalizedSummary = summary.toLowerCase()

  if (normalizedSummary.includes('rule conflict') && !normalizedSummary.includes('no rule conflict')) {
    return VerifyDecisionType.RuleConflict
  }
  if (normalizedSummary.includes('current conflict') && !normalizedSummary.includes('no current conflict')) {
    return VerifyDecisionType.CurrentConflict
  }
  if (normalizedSummary.includes('business decision') && !normalizedSummary.includes('no business decision')) {
    return VerifyDecisionType.BusinessDecision
  }

  return undefined
}

function buildNeedsDecisionReason(decisionType: VerifyDecisionType, feature: string): string {
  switch (decisionType) {
    case VerifyDecisionType.RuleConflict:
      return `Verification found a rule conflict for ${feature}.`
    case VerifyDecisionType.CurrentConflict:
      return `Verification found a current conflict for ${feature}.`
    case VerifyDecisionType.BusinessDecision:
      return `Verification needs a business decision for ${feature}.`
  }
}

function collectConstraintNames(evidence: VerifyEvidencePacket): string[] {
  const coreChecks = evidence.checksRun
    .map(check => check.split(' ')[0])
    .filter((checkName): checkName is string => Boolean(checkName))
  const resultChecks = evidence.checkResults.map(result => `${result.category}:${result.name}`)

  return [...new Set([...coreChecks, ...resultChecks])]
}

function buildEvidenceSummary(evidence: VerifyEvidencePacket, readiness: VerifyReadinessResult): string {
  return `${readiness.reason} ${evidence.knownRisksOrMissingEvidence}`.trim()
}

function resolveVerifyMode(detectedMode: IssueMode, acceptanceState: AcceptanceState | null): IssueMode {
  if (detectedMode !== 'feature') {
    return detectedMode
  }

  return acceptanceState?.mode === 'issue' ? 'issue' : detectedMode
}

function evaluateIssueSignals(
  acceptanceState: AcceptanceState | null | undefined,
  issueClarificationExists: boolean,
): {
  rootCauseClosed: boolean
  rootCauseDetail: string
  semanticContractIntact: boolean
  semanticContractDetail: string
  recommendedActionExecuted: boolean
  recommendedActionDetail: string
  unintendedBehaviorChangeClear: boolean
  unintendedBehaviorDetail: string
  governanceReady: boolean
  governanceDetail: string
} {
  const classification = acceptanceState?.primaryClassification
  const governanceStatus = acceptanceState?.governancePromotionStatus ?? 'none'
  const hasPendingDecisionPromotion = hasUnapprovedDecisionPromotion(acceptanceState)

  const rootCauseClosed = classification !== undefined && classification !== 'cannot_determine'
  const rootCauseDetail = rootCauseClosed
    ? `classification ${classification} closes the root-cause hypothesis`
    : 'missing confirmed classification or root cause remains cannot_determine'

  const semanticContractIntact = issueClarificationExists && classification !== undefined && classification !== 'cannot_determine'
  const semanticContractDetail = semanticContractIntact
    ? `issue clarification and classification ${classification} provide semantic contract evidence`
    : 'semantic contract evidence is incomplete without issue clarification plus confirmed classification'

  const recommendedActionExecuted = evaluateRecommendedActionExecuted(acceptanceState, issueClarificationExists)
  const recommendedActionDetail = recommendedActionExecuted
    ? 'clarified next action was executed or governance follow-up is already recorded'
    : 'clarified next action is still missing required implementation or governance follow-up'

  const unintendedBehaviorChangeClear = classification !== 'behavior_change' || governanceStatus === 'confirmed'
  const unintendedBehaviorDetail = unintendedBehaviorChangeClear
    ? classification === 'behavior_change'
      ? 'behavior change is explicitly governed and confirmed'
      : 'no governed behavior change risk remains in issue mode'
    : 'behavior change is present but governance confirmation is still missing'

  const governanceReady = governanceStatus === 'confirmed'
    || (governanceStatus !== 'blocked_unapproved' && !hasPendingDecisionPromotion)
  const governanceDetail = governanceStatus === 'needs_decision'
    ? 'governance promotion requires a human decision'
    : governanceStatus === 'blocked_unapproved'
      ? 'governance promotion is blocked pending approval for docs/decisions updates'
      : hasPendingDecisionPromotion && governanceStatus !== 'confirmed'
        ? 'unapproved docs/decisions promotion is still pending explicit confirmation'
        : `governance promotion status is ${governanceStatus}`

  return {
    rootCauseClosed,
    rootCauseDetail,
    semanticContractIntact,
    semanticContractDetail,
    recommendedActionExecuted,
    recommendedActionDetail,
    unintendedBehaviorChangeClear,
    unintendedBehaviorDetail,
    governanceReady,
    governanceDetail,
  }
}

function evaluateRecommendedActionExecuted(
  acceptanceState: AcceptanceState | null | undefined,
  issueClarificationExists: boolean,
): boolean {
  if (!issueClarificationExists) {
    return false
  }

  const classification = acceptanceState?.primaryClassification
  if (!classification || classification === 'cannot_determine') {
    return false
  }

  if (classification === 'doc_ambiguity' || classification === 'behavior_change') {
    return (acceptanceState?.governancePromotionStatus ?? 'none') !== 'none' || hasUnapprovedDecisionPromotion(acceptanceState)
  }

  return true
}

function hasUnapprovedDecisionPromotion(acceptanceState: AcceptanceState | null | undefined): boolean {
  return acceptanceState?.promotionSuggestions?.some(suggestion => suggestion.targetPath.startsWith('docs/decisions/')) ?? false
}

function evaluateBehaviorScenarios(
  contract: import('../contracts/openflow-contract.js').OpenFlowContract | null,
  evidenceMappings: import('../types.js').BehaviorScenarioEvidence[],
): BehaviorScenarioCheckResult[] | undefined {
  if (!contract || contract.behaviorScenarios.length === 0) return undefined

  return contract.behaviorScenarios.map((scenario) => {
    const evidence = findBehaviorEvidence(evidenceMappings, scenario.name)
    if (evidence) {
      return {
        scenarioId: scenario.id,
        name: scenario.name,
        criticality: scenario.criticality,
        status: evidence.status,
        evidenceType: evidence.evidenceType,
        evidenceReference: evidence.evidenceReference,
        detail: evidence.reason,
      }
    }

    if (scenario.criticality === 'critical') {
      return {
        scenarioId: scenario.id,
        name: scenario.name,
        criticality: scenario.criticality,
        status: 'missing_evidence' as const,
        detail: `Critical scenario "${scenario.name}" requires explicit verification evidence.`,
      }
    }

    // Boundary/optional scenarios should be reported without blocking readiness.
    return {
      scenarioId: scenario.id,
      name: scenario.name,
      criticality: scenario.criticality,
      status: scenario.criticality === 'optional' ? 'not_applicable' as const : 'missing_evidence' as const,
      detail: scenario.criticality === 'optional'
        ? 'Boundary scenario recorded for review; explicit blocking evidence is not required.'
        : 'No implementation evidence mapped to this scenario.',
    }
  })
}

function findBehaviorEvidence(
  evidenceMappings: import('../types.js').BehaviorScenarioEvidence[],
  scenarioName: string,
): import('../types.js').BehaviorScenarioEvidence | undefined {
  const normalizedScenario = normalizeEvidenceKey(scenarioName)
  return evidenceMappings.find((evidence) => normalizeEvidenceKey(evidence.scenarioName) === normalizedScenario)
}

async function parseBehaviorEvidenceMappings(behaviorPath: string): Promise<import('../types.js').BehaviorScenarioEvidence[]> {
  try {
    const content = await fs.readFile(behaviorPath, 'utf-8')
    const lines = content.split('\n')
    const tableStart = lines.findIndex(line => /^\|\s*Behavior\s*\|\s*Evidence Type\s*\|\s*Expected Evidence\s*\|\s*Status\s*\|/i.test(line.trim()))
    if (tableStart < 0) return []

    const result: import('../types.js').BehaviorScenarioEvidence[] = []
    for (const line of lines.slice(tableStart + 1)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('|')) break
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue

      const cells = splitMarkdownTableRow(trimmed)
      if (cells.length < 4) continue
      const scenarioName = cells[0] ?? ''
      if (!scenarioName) continue

      const status = normalizeBehaviorEvidenceStatus(cells[3] ?? '')
      result.push({
        scenarioName,
        status,
        evidenceType: cells[1] || 'manual',
        evidenceReference: cells[2] || 'Not specified.',
        reason: status === 'verified'
          ? `Verification mapping marks "${scenarioName}" as verified.`
          : status === 'failed'
            ? `Verification mapping marks "${scenarioName}" as failed.`
            : status === 'not_applicable'
              ? `Verification mapping marks "${scenarioName}" as not applicable.`
              : `Verification mapping does not provide completed evidence for "${scenarioName}".`,
      })
    }

    return result
  } catch {
    return []
  }
}

function splitMarkdownTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map(cell => cell.trim())
}

function normalizeBehaviorEvidenceStatus(value: string): import('../types.js').BehaviorEvidenceStatus {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'verified' || normalized === 'passed' || normalized === 'pass') return 'verified'
  if (normalized === 'failed' || normalized === 'fail') return 'failed'
  if (normalized === 'not_applicable' || normalized === 'n/a' || normalized === 'na') return 'not_applicable'
  return 'missing_evidence'
}

function normalizeEvidenceKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isBlockingBehaviorScenarioGap(scenario: BehaviorScenarioCheckResult): boolean {
  return scenario.criticality !== 'optional'
    && (scenario.status === 'failed' || scenario.status === 'missing_evidence')
}

async function parseBehaviorScenarios(behaviorPath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(behaviorPath, 'utf-8')
    return [...content.matchAll(/### (?:Scenario|Boundary):\s*(.+)/g)].map(m => (m[1] ?? '').trim()).filter(Boolean)
  } catch {
    return []
  }
}
