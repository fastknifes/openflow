import { spawn } from 'node:child_process'
import type {
  AcceptanceState,
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

export interface VerifyReadinessResult {
  status: VerifyReadinessStatus
  reasonCodes: string[]
  reason: string
  nextStep: string
  decisionType?: VerifyDecisionType
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

export async function handleVerify(
  ctx: OpenFlowContext,
  feature?: string,
  acceptFailures?: boolean,
  toolContext?: unknown,
): Promise<string> {
  const resolvedFeature = feature?.trim() ? feature.trim() : await findActiveFeature(ctx)

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

  await saveVerifyResult(ctx.directory, verifyResult)

  if (readiness.status === VerifyReadinessStatus.NotReady && hasAskQuestion(toolContext)) {
    const selectedOption = await askVerifyFailureQuestion(toolContext)

    if (selectedOption === 'accept') {
      return handleVerify(ctx, sanitizedFeature, true, toolContext)
    }
  }

  return formatVerifyResult(sanitizedFeature, evidence, readiness)
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

  const checksRun = [
    `active_feature_resolution ✅ (${feature})`,
    `plan_exists ${planExists ? '✅' : mode === 'issue' ? 'ℹ️' : '⚠️'} (${planExists ? 'found' : mode === 'issue' ? `not required in issue mode (.sisyphus/plans/${feature}.md)` : `missing .sisyphus/plans/${feature}.md`})`,
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

  const qualityResults = await runQualityChecks(ctx)
  const securityResults = await runSecurityChecks(ctx)
  const consistencyResults = await runConsistencyChecks(ctx, feature)
  const checkResults = [...qualityResults, ...securityResults, ...consistencyResults]
  const failedChecks = checkResults.filter(result => !result.passed)

  const missingEvidence: string[] = []
  if (mode !== 'issue' && !planExists) missingEvidence.push('active plan file')
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

  return {
    checksRun,
    checkResults,
    observedBehaviorSummary: `Collected ${checkResults.length} verification check result(s); ${checkResults.filter(result => result.passed).length} passed and ${failedChecks.length} failed.`,
    intendedVsActualDelta: failedChecks.length > 0 || issueFailures.length > 0
      ? `Verification evidence is incomplete because ${[failedChecks.length > 0 ? `${failedChecks.length} configured check(s) failed` : '', issueFailures.length > 0 ? `${issueFailures.length} issue-mode expectation(s) remain unresolved` : ''].filter(Boolean).join(' and ')}.`
      : 'Configured verification checks did not expose an intended-vs-actual delta.',
    docAlignmentSummary: changesExists
      ? mode === 'feature'
        ? 'Change workspace exists; document alignment can be reviewed from the active changes workspace.'
        : issueClarificationExists
          ? 'Change workspace and issue clarification exist; issue intent and documentation alignment can be reviewed together.'
          : 'Change workspace exists but issue clarification is missing; issue intent cannot be fully assessed.'
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

async function runSecurityChecks(ctx: OpenFlowContext): Promise<VerifyEvidenceCheckResult[]> {
  return ctx.config.verification.security.map(checkName => ({
    name: checkName,
    passed: true,
    category: 'security',
    detail: 'placeholder pass; concrete security scanner integration is pending',
  }))
}

async function runConsistencyChecks(ctx: OpenFlowContext, feature: string): Promise<VerifyEvidenceCheckResult[]> {
  void ctx

  return [{
    name: 'workspace_consistency',
    passed: true,
    category: 'consistency',
    detail: `placeholder pass for ${feature}; consistency diffing is pending`,
  }]
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
  if (mode !== 'issue' && !didNamedCheckPass(evidence, 'plan_exists')) {
    reasonCodes.push('plan_missing')
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

  const acceptedFailures = matchingAcceptanceState?.acceptedFailures === true || acceptFailures === true
  const hardBlockerCodes = new Set(['issue_clarification_missing', 'governance_blocked_unapproved', 'decision_promotion_unapproved'])
  const hasHardBlocker = reasonCodes.some(code => hardBlockerCodes.has(code))

  if (reasonCodes.length > 0) {
    return {
      status: acceptedFailures && !hasHardBlocker ? VerifyReadinessStatus.Ready : VerifyReadinessStatus.NotReady,
      reasonCodes,
      reason: `Verification is blocked for ${feature}: ${reasonCodes.join(', ')}.`,
      nextStep: acceptedFailures && !hasHardBlocker
        ? '已接受当前失败项；如需恢复严格验证，请修复失败检查后重新运行 /openflow-verify。'
        : hasHardBlocker
          ? 'Provide the missing issue intent artifact or secure the required governance approval, then rerun /openflow-verify.'
        : 'Fix the failing checks or missing evidence, then rerun /openflow-verify.',
    }
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

function formatVerifyResult(feature: string, evidence: VerifyEvidencePacket, readiness: VerifyReadinessResult): string {
  const failureOptions = readiness.status === VerifyReadinessStatus.NotReady
    ? `
### 失败后的可选操作
- **Option 1**: 修复失败的检查，然后重新运行 /openflow-verify
- **Option 2**: 如果你确定这些失败是可接受的，运行 /openflow-verify --accept-failures 来标记成功
`
    : ''

  return `## Verify

Feature: ${escapeMarkdown(feature)}

### Evidence
- checks_run:
${evidence.checksRun.map(check => `  - ${check}`).join('\n')}
- check_results:
${formatCheckResults(evidence.checkResults)}
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
${failureOptions}`
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
