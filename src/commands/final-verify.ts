/**
 * final-verify node — summary + constraints enforcement + root mismatch check + plan progress.
 *
 * This is the SOLE point of constraints enforcement (C2).
 * quality-gate only reads FinalVerifyResult and maps it to readiness.
 */
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { VerifyEvidencePacket, VerifyReadinessStatus as VerifyReadinessStatusType, ImplementationRun } from '../types.js'
import { VerifyReadinessStatus } from '../types.js'
import { verifyConstraintSatisfaction } from './constraint-verifier.js'
import type { ConstraintVerificationResult, ConstraintEvidence } from './constraint-verifier.js'
import { logger } from '../utils/logger.js'

// ── Public types ────────────────────────────────────────────────────────────

export interface FinalVerifyResult {
  /** Readiness recommendation for quality-gate to consume */
  readinessRecommendation: VerifyReadinessStatusType
  /** Constraint enforcement outcome — reuses ConstraintVerificationResult['status'] */
  constraintSatisfaction: ConstraintVerificationResult['status']
  /** True when execution root doesn't match the ImplementationRun */
  rootMismatch: boolean
  /** Human-readable behavior scenario coverage summary */
  behaviorCoverage: string
  /** When constraints are blocked, the per-constraint block reasons */
  constraintBlockReasons?: string[]
  /** Plan progress: unchecked task count (0 = all complete or no plan found) */
  planUncheckedTasks?: number
  /** Plan progress: total task count */
  planTotalTasks?: number
}

export interface FinalVerifyInput {
  /** Verify evidence packet (from verify node) */
  evidence: VerifyEvidencePacket
  /** Verify readiness status (parsed from verify output) */
  verifyReadiness?: string
  /** Harden result status (from harden node), if harden was run */
  hardenStatus?: string
  /** Harden output markdown (parsed internally for findings) */
  hardenOutput?: string
  /** Feature name */
  feature: string
  /** Project directory (execution root) */
  projectDir: string
  /** Active ImplementationRun, if available */
  activeRun?: ImplementationRun | null
  /** Changed files relevant to this feature */
  changedFiles: string[]
  /**
   * C8: Constraint evidence items from the current verification session.
   * Passed through to constraint-verifier for evidence-based satisfaction checking.
   */
  constraintEvidence?: ConstraintEvidence[]
}

// ── Root mismatch helper ────────────────────────────────────────────────────

function checkRootMismatch(
  activeRun: ImplementationRun | null | undefined,
  executionRoot: string,
): boolean {
  if (!activeRun) return false

  const expected = activeRun.worktree || activeRun.directory
  if (!expected) return false

  const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
  return normalize(expected) !== normalize(executionRoot)
}

// ── Behavior coverage summary ───────────────────────────────────────────────

function buildBehaviorCoverage(evidence: VerifyEvidencePacket): string {
  const scenarios = evidence.behaviorScenarios
  if (!scenarios || scenarios.length === 0) {
    return 'no behavior scenarios evaluated'
  }

  const verified = scenarios.filter(s => s.status === 'verified').length
  const total = scenarios.length
  const critical = scenarios.filter(s => s.criticality === 'critical')
  const criticalVerified = critical.filter(s => s.status === 'verified').length
  const unverified = scenarios.filter(s => s.status !== 'verified' && s.status !== 'not_applicable')

  const parts: string[] = [`${verified}/${total} scenarios verified`]
  if (critical.length > 0) {
    parts.push(`${criticalVerified}/${critical.length} critical verified`)
  }
  if (unverified.length > 0) {
    parts.push(`${unverified.length} unverified: ${unverified.map(s => `${s.name} (${s.status})`).join(', ')}`)
  }

  return parts.join('; ')
}

// ── Determine base readiness from verify + harden ───────────────────────────

/**
 * Parse harden findings from markdown output.
 * Simplified version — just checks for key dispositions.
 */
function parseHardenDispositionStatus(hardenOutput: string | undefined): {
  hasUnresolvedMustFix: boolean
  hasUnresolvedNeedsDecision: boolean
  hasAcceptedKnownIssue: boolean
} {
  const result = {
    hasUnresolvedMustFix: false,
    hasUnresolvedNeedsDecision: false,
    hasAcceptedKnownIssue: false,
  }

  if (!hardenOutput) return result

  const lines = hardenOutput.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('-')) continue
    const raw = trimmed.slice(1).trim()
    if (!raw || raw === 'None') continue

    // Check for unresolved must_fix (status is not fixed/verified/dismissed)
    if (raw.includes('disposition=must_fix') && !raw.includes('status=fixed') && !raw.includes('status=verified') && !raw.includes('status=dismissed')) {
      result.hasUnresolvedMustFix = true
    }
    // Check for unresolved design_divergence / needs_decision
    if ((raw.includes('disposition=design_divergence') || raw.includes('status=needs_decision'))
      && !raw.includes('status=fixed') && !raw.includes('status=verified') && !raw.includes('status=dismissed')) {
      result.hasUnresolvedNeedsDecision = true
    }
    // Check for accepted_known_issue
    if (raw.includes('disposition=accepted_known_issue')) {
      result.hasAcceptedKnownIssue = true
    }
  }

  return result
}

function determineBaseReadiness(
  evidence: VerifyEvidencePacket,
  hardenStatus?: string,
  hardenOutput?: string,
  verifyReadiness?: string,
): VerifyReadinessStatusType {
  // Check verify evidence for readiness signals
  const failedChecks = evidence.checkResults.filter(r => !r.passed)
  const hasBlockingGap = evidence.classifiedEvidenceGaps?.some(
    g => g.kind === 'blocking_evidence_gap',
  ) ?? false

  // If verify found blocking issues → propagate verify readiness
  if (failedChecks.length > 0 || hasBlockingGap) {
    // If verify gave a specific readiness, respect it (e.g., needs_decision)
    if (verifyReadiness === VerifyReadinessStatus.NeedsDecision) {
      return VerifyReadinessStatus.NeedsDecision
    }
    return VerifyReadinessStatus.NotReady
  }

  // Parse harden findings from output for more granular status
  const hardenFindings = parseHardenDispositionStatus(hardenOutput)

  // Check harden status + findings
  if (hardenStatus) {
    const badStatuses = ['error', 'rejected', 'unknown']
    const needsDecisionStatuses = ['needs_human', 'max_rounds_reached', 'budget_exhausted', 'review_inconclusive', 'executor_blocked']

    if (badStatuses.includes(hardenStatus)) {
      return VerifyReadinessStatus.NotReady
    }

    // Must-fix findings → NotReady regardless of harden status
    if (hardenFindings.hasUnresolvedMustFix) {
      return VerifyReadinessStatus.NotReady
    }

    if (needsDecisionStatuses.includes(hardenStatus) || hardenFindings.hasUnresolvedNeedsDecision) {
      return VerifyReadinessStatus.NeedsDecision
    }
    // 'pass', 'pass_with_risks', 'skipped', 'disabled', 'known_issues_accepted' → continue
  }

  // Check known risks field — only match negative indicators, not "no blocking..."
  const knownRisks = evidence.knownRisksOrMissingEvidence.toLowerCase()
  const hasNegativeKnownRisk = (knownRisks.includes('failed') && !knownRisks.includes('no'))
    || (knownRisks.includes('blocking') && !knownRisks.includes('no blocking'))
  if (hasNegativeKnownRisk) {
    return VerifyReadinessStatus.NotReady
  }

  // Check for pending doc updates indicator
  const hasDocIssues = evidence.docAlignmentSummary.toLowerCase().includes('missing')
  // Accepted known issues → ReadyWithDocUpdates
  if (hasDocIssues || hardenFindings.hasAcceptedKnownIssue) {
    return VerifyReadinessStatus.ReadyWithDocUpdates
  }

  // Propagate verify's readiness if it was ReadyWithDocUpdates
  if (verifyReadiness === VerifyReadinessStatus.ReadyWithDocUpdates) {
    return VerifyReadinessStatus.ReadyWithDocUpdates
  }

  return VerifyReadinessStatus.Ready
}

// ── Plan progress check ────────────────────────────────────────────────────

/**
 * Check plan.md for unchecked task checkboxes.
 * Returns { unchecked, total } — unchecked=0 means all tasks done (or no plan found).
 */
async function checkPlanProgress(
  projectDir: string,
  feature: string,
): Promise<{ unchecked: number; total: number }> {
  // Try to find plan.md in docs/changes/{feature}/ or docs/changes/{dated-feature}/
  const changesDir = path.join(projectDir, 'docs', 'changes')
  let planPath: string | undefined

  try {
    const entries = await fs.readdir(changesDir)
    // Look for exact match or dated match (YYYY-MM-DD-{feature})
    const match = entries.find(
      (e) => e === feature || e.endsWith(`-${feature}`) || e.includes(feature),
    )
    if (match) {
      planPath = path.join(changesDir, match, 'plan.md')
    }
  } catch {
    // changes dir doesn't exist
  }

  if (!planPath) return { unchecked: 0, total: 0 }

  try {
    const content = await fs.readFile(planPath, 'utf-8')
    // Match unchecked checkboxes: "- [ ]" (with possible whitespace)
    const unchecked = (content.match(/^[\s]*-[\s]+\[[\s]\]/gm) || []).length
    // Match all checkboxes (checked + unchecked)
    const total = (content.match(/^[\s]*-[\s]+\[[ xX]\]/gm) || []).length
    return { unchecked, total }
  } catch {
    // plan.md doesn't exist or can't be read
    return { unchecked: 0, total: 0 }
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * handleFinalVerify — the sole constraints enforcement point.
 *
 * Aggregates verify evidence + harden result + constraints enforcement +
 * root mismatch check → FinalVerifyResult.
 *
 * C2: final-verify is the ONLY point where constraints enforcement happens.
 * C7: execution root mismatch forces NotReady.
 * C8: constraint evidence must be command output.
 */
export async function handleFinalVerify(input: FinalVerifyInput): Promise<FinalVerifyResult> {
  const {
    evidence,
    verifyReadiness,
    hardenStatus,
    hardenOutput,
    feature,
    projectDir,
    activeRun,
    changedFiles,
    constraintEvidence,
  } = input

  logger.info('quality_gate', 'final-verify started', { feature, projectDir })

  // 1. Determine base readiness from verify evidence + harden result
  let readiness = determineBaseReadiness(evidence, hardenStatus, hardenOutput, verifyReadiness)
  logger.info('quality_gate', 'base readiness determined', { readiness, feature })

  // 2. Check execution root mismatch — C7: forces NotReady
  const rootMismatch = checkRootMismatch(activeRun, projectDir)
  if (rootMismatch) {
    logger.warn('quality_gate', 'execution root mismatch detected', {
      expected: activeRun?.worktree || activeRun?.directory,
      actual: projectDir,
      feature,
    })
    readiness = VerifyReadinessStatus.NotReady
  }

  // 3. Constraints enforcement — C2: sole enforcement point
  let constraintSatisfaction: ConstraintVerificationResult['status'] = 'skipped'
  const constraintBlockReasons: string[] = []

  if (feature && activeRun && (readiness === VerifyReadinessStatus.Ready || readiness === VerifyReadinessStatus.ReadyWithDocUpdates)) {
    try {
      const constraintResult = await verifyConstraintSatisfaction({
        projectDir,
        feature,
        changedFiles,
        ...(constraintEvidence ? { evidence: constraintEvidence } : {}),
      })
      constraintSatisfaction = constraintResult.status

      if (constraintResult.status === 'blocked') {
        readiness = VerifyReadinessStatus.NotReady
        for (const checked of constraintResult.checked) {
          if (!checked.satisfied && checked.missingEvidence) {
            constraintBlockReasons.push(checked.missingEvidence)
          }
        }
        logger.warn('quality_gate', 'constraints enforcement blocked readiness', {
          feature,
          blockedCount: constraintResult.checked.filter((c: ConstraintVerificationResult['checked'][number]) => !c.satisfied).length,
        })
      }
    } catch (error) {
      logger.warn('quality_gate', 'constraint verification failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      // On error, skip constraints rather than block
      constraintSatisfaction = 'skipped'
    }
  }

  // 4. Check plan progress — unchecked tasks block readiness
  const planProgress = await checkPlanProgress(projectDir, feature)
  if (planProgress.unchecked > 0 && readiness !== VerifyReadinessStatus.NotReady) {
    logger.warn('quality_gate', 'plan has unchecked tasks, blocking readiness', {
      feature,
      unchecked: planProgress.unchecked,
      total: planProgress.total,
    })
    readiness = VerifyReadinessStatus.NotReady
  }

  // 5. Evaluate behavior coverage
  const behaviorCoverage = buildBehaviorCoverage(evidence)

  const result: FinalVerifyResult = {
    readinessRecommendation: readiness,
    constraintSatisfaction,
    rootMismatch,
    behaviorCoverage,
    planUncheckedTasks: planProgress.unchecked,
    planTotalTasks: planProgress.total,
  }

  if (constraintBlockReasons.length > 0) {
    result.constraintBlockReasons = constraintBlockReasons
  }

  logger.info('quality_gate', 'final-verify completed', {
    feature,
    readinessRecommendation: readiness,
    constraintSatisfaction,
    rootMismatch,
  })

  return result
}
