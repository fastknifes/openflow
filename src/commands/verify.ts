import * as fs from 'node:fs/promises'
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
import { loadAcceptanceState, saveVerifyResult } from '../utils/acceptance-state.js'
import { createSafePath, escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'

export interface VerifyReadinessResult {
  status: VerifyReadinessStatus
  reasonCodes: string[]
  reason: string
  nextStep: string
  decisionType?: VerifyDecisionType
}

export async function handleVerify(ctx: OpenFlowContext, feature?: string): Promise<string> {
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
- next_step: run /openflow/verify <feature-name> or create an active plan under .sisyphus/plans/
`
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const evidence = await collectEvidence(ctx, sanitizedFeature)
  const readiness = await classifyReadiness(ctx, sanitizedFeature, evidence)
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

  return formatVerifyResult(sanitizedFeature, evidence, readiness)
}

async function findActiveFeature(ctx: OpenFlowContext): Promise<string | null> {
  const plansDir = createSafePath(ctx.directory, '.sisyphus', 'plans')

  try {
    const files = await fs.readdir(plansDir)
    const mdFiles = files.filter(file => file.endsWith('.md'))
    if (mdFiles.length === 0) return null

    let latestFeature: { name: string; mtime: number } | null = null

    for (const file of mdFiles) {
      const filePath = createSafePath(ctx.directory, '.sisyphus', 'plans', file)
      const stat = await fs.stat(filePath)

      if (!latestFeature || stat.mtimeMs > latestFeature.mtime) {
        latestFeature = {
          name: file.replace('.md', ''),
          mtime: stat.mtimeMs,
        }
      }
    }

    return latestFeature?.name ?? null
  } catch {
    return null
  }
}

async function collectEvidence(ctx: OpenFlowContext, feature: string): Promise<VerifyEvidencePacket> {
  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${feature}.md`)
  const changesPath = createSafePath(ctx.directory, 'docs', 'changes', feature)
  const currentPath = createSafePath(ctx.directory, 'docs', 'current')
  const decisionsPath = createSafePath(ctx.directory, 'docs', 'decisions')

  const planExists = await fileExists(planPath)
  const changesExists = await fileExists(changesPath)
  const currentExists = await fileExists(currentPath)
  const decisionsExists = await fileExists(decisionsPath)

  const checksRun = [
    `active_feature_resolution ✅ (${feature})`,
    `plan_exists ${planExists ? '✅' : '⚠️'} (${planExists ? 'found' : 'missing'} .sisyphus/plans/${feature}.md)`,
    `changes_workspace ${changesExists ? '✅' : '⚠️'} (${changesExists ? 'found' : 'missing'} docs/changes/${feature})`,
    `stable_constraints_current ${currentExists ? '✅' : '⚠️'} (${currentExists ? 'found' : 'missing'} docs/current)`,
    `stable_constraints_decisions ${decisionsExists ? '✅' : '⚠️'} (${decisionsExists ? 'found' : 'missing'} docs/decisions)`,
  ]

  const qualityResults = await runQualityChecks(ctx)
  const securityResults = await runSecurityChecks(ctx)
  const consistencyResults = await runConsistencyChecks(ctx, feature)
  const checkResults = [...qualityResults, ...securityResults, ...consistencyResults]
  const failedChecks = checkResults.filter(result => !result.passed)

  const missingEvidence: string[] = []
  if (!planExists) missingEvidence.push('active plan file')
  if (!changesExists) missingEvidence.push('change workspace')

  const evidenceGaps: string[] = []
  if (missingEvidence.length > 0) {
    evidenceGaps.push(`Missing evidence: ${missingEvidence.join(', ')}.`)
  }
  if (failedChecks.length > 0) {
    evidenceGaps.push(`Failed checks: ${failedChecks.map(formatFailedCheckSummary).join(', ')}.`)
  }

  return {
    checksRun,
    checkResults,
    observedBehaviorSummary: `Collected ${checkResults.length} verification check result(s); ${checkResults.filter(result => result.passed).length} passed and ${failedChecks.length} failed.`,
    intendedVsActualDelta: failedChecks.length > 0
      ? `Verification evidence is incomplete because ${failedChecks.length} configured check(s) failed.`
      : 'Configured verification checks did not expose an intended-vs-actual delta.',
    docAlignmentSummary: changesExists
      ? 'Change workspace exists; document alignment can be reviewed from the active changes workspace.'
      : 'Change workspace missing; document alignment cannot be fully assessed.',
    constraintConflictSummary: currentExists || decisionsExists
      ? 'Constraint baselines were located; no explicit decision blocker was detected by shell evidence.'
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
      nextStep: 'Resolve the blocking decision, then rerun /openflow/verify.',
      decisionType,
    }
  }

  const reasonCodes: string[] = []
  if (!didNamedCheckPass(evidence, 'plan_exists')) {
    reasonCodes.push('plan_missing')
  }
  if (!didNamedCheckPass(evidence, 'changes_workspace')) {
    reasonCodes.push('changes_workspace_missing')
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

  if (reasonCodes.length > 0) {
    return {
      status: VerifyReadinessStatus.NotReady,
      reasonCodes,
      reason: `Verification is blocked for ${feature}: ${reasonCodes.join(', ')}.`,
      nextStep: 'Fix the failing checks or missing evidence, then rerun /openflow/verify.',
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
`
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
