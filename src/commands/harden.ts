import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { getDesignCandidatePaths, getPlanPath } from '../config.js'
import { fileExists } from '../hooks/file-utils.js'
import type {
  HardenFinding,
  HardenExecutorVerdict,
  HardenFindingStatus,
  HardenResult,
  HardenRoundResult,
  HardenTraceEntry,
  OpenFlowContext,
} from '../types.js'
import { classifyFindings, compressInput, gradeComplexity } from '../utils/harden-utils.js'
import { normalizeFinding } from '../utils/harden-ledger.js'
import { computeChangedFilesSet, computeDiffHash, hasMaterialChange } from '../utils/harden-diff.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { appendOmittedDiffManifest, extractDiffBlockPaths, scopeDiffToFeature } from '../utils/diff-scope.js'
import { logger } from '../utils/logger.js'

interface HardenArgs {
  full?: boolean
  mode?: string
  maxRounds?: number
  reviewerModel?: string
  executorModel?: string
}

interface SessionClientLike {
  session?: {
    create: (options: unknown) => Promise<unknown>
    prompt: (options: unknown) => Promise<unknown>
  }
}

interface AgentRunResult {
  text: string
  tokens: number
}

interface FormattedHardenTraceEntry extends HardenTraceEntry {
  stopReasonCandidate?: string
}

interface FormattedHardenResult extends HardenResult {
  sessionID?: string
  trace?: FormattedHardenTraceEntry[]
}

interface DiffScopeContext {
  directory: string
  sanitizedFeature: string
  planPath: string
  designPaths: string[]
  planContent: string
  designContent: string
  full: boolean
  archiveDir: string
}

interface ParsedExecutorDisposition {
  verdict: HardenExecutorVerdict
  rationale: string
  fixSummary?: string
}

interface HardenFindingFinalState extends HardenFinding {
  executorVerdict?: HardenExecutorVerdict
  executorRationale?: string
  executorFixSummary?: string
  finalStateGroup?: FindingsFinalStateGroup
  rebuttalChallenge?: string
  rebuttalFinalResponse?: string
}

type FindingsFinalStateGroup = 'resolved_findings' | 'rejected_findings' | 'unresolved_must_fix' | 'unresolved_needs_decision' | 'accepted_known_issues'

let activeModels: { reviewerModel?: string; executorModel?: string } = {}

const REVIEWER_SYSTEM_PROMPT = `## System Role
You are the OpenFlow Harden Reviewer.
Judge implementation against the approved contract, not preference.
Contract source priority is: decisions > current > behavior > design > plan > request > diff > implementation.
DO NOT propose new features. ONLY evaluate whether implementation matches the highest-priority applicable contract source.
If contract intent is inferable from higher-priority context, mark intent_gap and include confidence/alignment evidence.
If contract intent is not inferable, mark missing_evidence or intent_gap with needs_decision.
Never approve implementation-driven contract divergence or ask the Executor to silently update docs.`

const EXECUTOR_SYSTEM_PROMPT = `## System Role
You are the OpenFlow Harden Executor.
For each finding, give verdict: accept | reject | partial.
If accept/partial, provide minimal fix.
If reject, explain why with design doc or code logic evidence.
Fix only implementation findings explicitly allowed for executor repair.
Do NOT refactor, do NOT add new features, do NOT modify files outside scope.
Do NOT modify docs to resolve intent gaps, and do NOT approve or normalize contract divergence.`

export async function handleHarden(
  ctx: OpenFlowContext,
  feature?: string,
  args?: { full?: boolean; mode?: string; maxRounds?: number; reviewerModel?: string; executorModel?: string },
  sessionID?: string,
): Promise<string> {
  if (!ctx.config.harden.enabled) {
    logger.info('harden', 'harden disabled by config')
    return `## Harden Result

Status: rejected
Rounds: 0
Total tokens consumed: 0
Summary: harden is disabled in OpenFlow configuration.`
  }

  const featureFromArgs = extractFeatureArg(args)
  const resolvedFeature = feature?.trim() || featureFromArgs || await findActiveFeature(ctx)
  logger.info('harden', 'feature resolved', { feature: resolvedFeature })

  if (!resolvedFeature) {
    logger.warn('harden', 'no feature resolved, skipping harden')
    return `## Harden Result

Status: rejected
Rounds: 0
Total tokens consumed: 0
Summary: no feature was provided and no active plan was found under .sisyphus/plans/.`
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const planPath = getPlanPath(ctx.directory, sanitizedFeature)
  const planExists = await fileExists(planPath)
  logger.info('harden', 'plan file check', { planPath, exists: planExists })

  if (!planExists) {
    logger.warn('harden', 'plan file missing', { planPath })
    return `## Harden Result

Status: rejected
Rounds: 0
Total tokens consumed: 0
Summary: missing plan file \

\`${escapeMarkdown(toProjectRelativePath(ctx.directory, planPath))}\`.`
  }

  const planContent = await fs.readFile(planPath, 'utf-8')
  const designLookup = await readDesignDocument(ctx, sanitizedFeature)
  const fullDiffStr = readGitDiff(ctx.directory)
  const diffScope = args?.full
    ? { diff: fullDiffStr, omittedPaths: [] }
    : scopeDiffToFeature(ctx.directory, sanitizedFeature, fullDiffStr, planPath, designLookup.paths, planContent, designLookup.content, ctx.config.paths.changes, ctx.config.paths.plans, ctx.config.paths.archive)
  const diffStr = diffScope.diff
  const reviewerDiffStr = diffScope.omittedPaths.length > 0
    ? appendOmittedDiffManifest(diffStr, diffScope.omittedPaths)
    : diffStr
  const complexity = gradeComplexity(planContent, reviewerDiffStr)
  logger.info('harden', 'complexity graded', { complexity, feature: sanitizedFeature })
  const planSummary = compressInput(buildPlanSummary(planContent, designLookup.content), 12000)

  const currentSessionID = sessionID
  const nextModels: { reviewerModel?: string; executorModel?: string } = {}
  const reviewerModel = args?.reviewerModel ?? ctx.config.harden.reviewerModel
  const executorModel = args?.executorModel ?? ctx.config.harden.executorModel
  if (reviewerModel) nextModels.reviewerModel = reviewerModel
  if (executorModel) nextModels.executorModel = executorModel
  activeModels = nextModels

  if (complexity === 'trivial' && !args?.full) {
    logger.info('harden', 'harden skipped due to trivial complexity', { complexity, feature: sanitizedFeature })
    return `## Harden Result

Status: rejected
Rounds: 0
Total tokens consumed: 0
Summary: feature too simple for harden (${escapeMarkdown(sanitizedFeature)}); complexity graded as trivial.`
  }

  if (complexity === 'simple' && !args?.full) {
    logger.info('harden', 'entering simple mode', { feature: sanitizedFeature })
    const coordinatorSessionID = currentSessionID ?? await createHardenSession(ctx, sanitizedFeature, `Harden: ${sanitizedFeature}`)
    const reviewerSessionID = await createHardenSession(ctx, sanitizedFeature, 'Harden Round 1/1 - Reviewer', coordinatorSessionID)
    const reviewerPrompt = buildReviewerPrompt(planSummary, reviewerDiffStr)
    const trace: FormattedHardenTraceEntry[] = []
    const review = await runAgentTask(
      ctx,
      reviewerSessionID,
      'oracle',
      REVIEWER_SYSTEM_PROMPT,
      reviewerPrompt,
      activeModels.reviewerModel,
    )
    const grouped = classifyFindings(review.text, designLookup.paths)
    const findings = [...grouped.actionable, ...grouped.ambiguous, ...grouped.nonBlocking]
    trace.push(buildTraceEntry(1, 'oracle', review, inferReviewerStopReasonCandidate(grouped)))
    const executorFindings = filterExecutorFindings(findings)
    const executorSessionID = await createHardenSession(ctx, sanitizedFeature, 'Harden Round 1/1 - Executor', coordinatorSessionID)
    const execution = await runAgentTask(
      ctx,
      executorSessionID,
      'deep',
      EXECUTOR_SYSTEM_PROMPT,
      buildExecutorPrompt(executorFindings, planSummary, collectScopedFilePaths(executorFindings, diffStr)),
      activeModels.executorModel,
    )
    const dispositions = parseExecutorDisposition(execution.text, executorFindings)
    applyExecutorDispositions(executorFindings, dispositions)
    trace.push(buildTraceEntry(1, 'deep', execution, containsExecutorFailureSignal(execution.text) ? 'executor_failure_signal' : 'disposition_reported'))

    // Simple mode: one-time rebuttal for rejected findings (no multi-round repair loop)
    const rebuttalResult = await runRejectedFindingRebuttals(
      ctx,
      sanitizedFeature,
      coordinatorSessionID,
      1,
      1,
      ctx.config.harden.maxArgumentRoundsPerFinding,
      executorFindings,
      dispositions,
      planSummary,
      trace,
    )
    const combinedFixReport = [execution.text, rebuttalResult.report].filter(part => part.trim()).join('\n\n')
    const hasUnresolvedRebuttal = rebuttalResult.needsHuman

    const status = grouped.ambiguous.length > 0
      ? 'needs_human'
      : hasUnresolvedRebuttal
        ? 'needs_human'
        : grouped.actionable.length > 0
          ? 'needs_human'
          : findings.length > 0
            ? 'pass_with_risks'
            : 'pass'

    return formatHardenResult({
      status,
      rounds: [{ round: 1, findings, fixReport: combinedFixReport || execution.text }],
      budgetConsumed: review.tokens + execution.tokens + rebuttalResult.tokens,
      totalTokensConsumed: review.tokens + execution.tokens + rebuttalResult.tokens,
      summary: summarizeReviewOutcome(findings, grouped.actionable.length, grouped.ambiguous.length, grouped.nonBlocking.length),
      stopReason: grouped.ambiguous.length > 0
        ? 'review_inconclusive'
        : hasUnresolvedRebuttal
          ? 'rebuttal_unresolved'
          : grouped.actionable.length > 0
            ? 'actionable_findings'
            : findings.length > 0
              ? 'non_blocking_only'
              : 'no_findings',
      sessionID: coordinatorSessionID,
      coordinatorSessionId: coordinatorSessionID,
      trace,
    })
  }

  logger.info('harden', 'entering standard adversarial mode', { feature: sanitizedFeature, maxRounds: args?.maxRounds ?? ctx.config.harden.maxRounds })
  const coordinatorSessionID = currentSessionID ?? await createHardenSession(ctx, sanitizedFeature, `Harden: ${sanitizedFeature}`)
  const diffScopeContext: DiffScopeContext = {
    directory: ctx.directory,
    sanitizedFeature,
    planPath,
    designPaths: designLookup.paths,
    planContent,
    designContent: designLookup.content,
    full: Boolean(args?.full),
    archiveDir: ctx.config.paths.archive,
  }

  const result = await runAdversarialLoop(
    ctx,
    planSummary,
    diffScopeContext,
    {
      maxRounds: args?.maxRounds ?? ctx.config.harden.maxRounds,
      maxArgumentRoundsPerFinding: ctx.config.harden.maxArgumentRoundsPerFinding,
      mode: args?.mode ?? 'standard',
    },
    coordinatorSessionID,
    sanitizedFeature,
  )

  return formatHardenResult(result)
}

async function runAdversarialLoop(
  ctx: OpenFlowContext,
  planSummary: string,
  diffScopeContext: DiffScopeContext,
  args: { maxRounds: number; maxArgumentRoundsPerFinding: number; mode: string },
  coordinatorSessionID: string,
  sanitizedFeature: string,
): Promise<FormattedHardenResult> {
  const rounds: HardenRoundResult[] = []
  const trace: FormattedHardenTraceEntry[] = []
  const findingCounts = new Map<string, number>()
  let totalTokensConsumed = 0
  let priorFindings: HardenFinding[] = []
  let fixReport = ''
  let nonBlockingRounds = 0
  const reviewContext = compressInput(planSummary, 16000)

  for (let round = 1; round <= args.maxRounds; round++) {
    logger.info('harden', 'starting harden round', { round, maxRounds: args.maxRounds })
    const freshScopedDiff = readScopedReviewerDiff(diffScopeContext)
    const rollingDiff = compressInput(freshScopedDiff.reviewerDiff, 24000)
    const reviewerPrompt = buildReviewerPrompt(reviewContext, rollingDiff, priorFindings, fixReport)
    const reviewerSessionID = await createHardenSession(
      ctx,
      sanitizedFeature,
      `Harden Round ${round}/${args.maxRounds} - Reviewer`,
      coordinatorSessionID,
    )
    const review = await runAgentTask(
      ctx,
      reviewerSessionID,
      'oracle',
      REVIEWER_SYSTEM_PROMPT,
      reviewerPrompt,
      activeModels.reviewerModel,
    )
    totalTokensConsumed += review.tokens

    const grouped = classifyFindings(review.text, [])
    logger.info('harden', 'reviewer completed', {
      round,
      actionableCount: grouped.actionable.length,
      ambiguousCount: grouped.ambiguous.length,
      nonBlockingCount: grouped.nonBlocking.length,
    })
    const findings = [...grouped.actionable, ...grouped.ambiguous, ...grouped.nonBlocking]
    trace.push(buildTraceEntry(round, 'oracle', review, inferReviewerStopReasonCandidate(grouped)))

    if (grouped.ambiguous.length > 0 && grouped.actionable.length === 0 && !containsExecutorReviewableLevel(review.text)) {
      rounds.push({ round, findings })
      logger.info('harden', 'harden loop terminated', { round, status: 'needs_human', stopReason: 'review_inconclusive', totalTokensConsumed })
      return {
        status: 'needs_human',
        rounds,
        budgetConsumed: totalTokensConsumed,
        totalTokensConsumed,
        summary: `reviewer reported ${grouped.ambiguous.length} design ambiguity finding(s) in round ${round}.`,
        stopReason: 'review_inconclusive',
        sessionID: coordinatorSessionID,
        coordinatorSessionId: coordinatorSessionID,
        trace,
      }
    }

    if (grouped.actionable.length === 0 && grouped.ambiguous.length === 0 && grouped.nonBlocking.length === 0) {
      rounds.push({ round, findings: [] })
      const finalStateGroups = groupFinalFindingStates(rounds)
      const hasUnresolvedFindings = finalStateGroups.unresolved_must_fix.length > 0 || finalStateGroups.unresolved_needs_decision.length > 0
      logger.info('harden', 'harden loop terminated', {
        round,
        status: hasUnresolvedFindings ? 'needs_human' : 'pass',
        stopReason: hasUnresolvedFindings ? 'review_inconclusive' : 'no_findings',
        totalTokensConsumed,
      })
      return {
        status: hasUnresolvedFindings ? 'needs_human' : 'pass',
        rounds,
        budgetConsumed: totalTokensConsumed,
        totalTokensConsumed,
        summary: hasUnresolvedFindings
          ? `reviewer found no new issues after ${round} round(s), but prior executor dispositions remain unresolved.`
          : `reviewer found no actionable issues after ${round} round(s).`,
        stopReason: hasUnresolvedFindings ? 'review_inconclusive' : 'no_findings',
        sessionID: coordinatorSessionID,
        coordinatorSessionId: coordinatorSessionID,
        trace,
      }
    }

    if (grouped.actionable.length === 0 && !containsExecutorReviewableLevel(review.text)) {
      nonBlockingRounds += 1
      rounds.push({ round, findings })

      if (nonBlockingRounds >= 2) {
        logger.info('harden', 'harden loop terminated', { round, status: 'pass_with_risks', stopReason: 'non_blocking_only', totalTokensConsumed })
        return {
          status: 'pass_with_risks',
          rounds,
          budgetConsumed: totalTokensConsumed,
          totalTokensConsumed,
          summary: 'two consecutive rounds reported only non-blocking or design-ambiguity findings.',
          stopReason: 'non_blocking_only',
          sessionID: coordinatorSessionID,
          coordinatorSessionId: coordinatorSessionID,
          trace,
        }
      }

      priorFindings = findings
      fixReport = 'No blocking fixes applied; reviewer reported only non-blocking issues.'
      continue
    }

    nonBlockingRounds = 0
    const executorFindings = filterExecutorFindings(findings)
    const currentFindingKeys = [...new Set(grouped.actionable.map(finding => normalizeFinding(finding)))]
    for (const existingKey of [...findingCounts.keys()]) {
      if (!currentFindingKeys.includes(existingKey)) {
        findingCounts.delete(existingKey)
      }
    }

    const repeatedKeys: string[] = []
    for (const key of currentFindingKeys) {
      findingCounts.set(key, (findingCounts.get(key) ?? 0) + 1)
      if ((findingCounts.get(key) ?? 0) >= 2) {
        repeatedKeys.push(key)
      }
    }

    const filePaths = collectScopedFilePaths(executorFindings, freshScopedDiff.diff)
    const beforeDiffSnapshot = readGitDiff(ctx.directory)
    const beforeHash = computeDiffHash(beforeDiffSnapshot)
    const beforeFiles = computeChangedFilesSet(beforeDiffSnapshot)
    const executorPrompt = buildExecutorPrompt(executorFindings, reviewContext, filePaths)
    const executorSessionID = await createHardenSession(
      ctx,
      sanitizedFeature,
      `Harden Round ${round}/${args.maxRounds} - Executor`,
      coordinatorSessionID,
    )
    const execution = await runAgentTask(
      ctx,
      executorSessionID,
      'deep',
      EXECUTOR_SYSTEM_PROMPT,
      executorPrompt,
      activeModels.executorModel,
    )
    totalTokensConsumed += execution.tokens
    trace.push(buildTraceEntry(round, 'deep', execution, containsExecutorFailureSignal(execution.text) ? 'executor_failure_signal' : 'fix_applied'))
    const dispositions = parseExecutorDisposition(execution.text, executorFindings)
    applyExecutorDispositions(executorFindings, dispositions)
    const rebuttalResult = await runRejectedFindingRebuttals(
      ctx,
      sanitizedFeature,
      coordinatorSessionID,
      round,
      args.maxRounds,
      args.maxArgumentRoundsPerFinding,
      executorFindings,
      dispositions,
      reviewContext,
      trace,
    )
    totalTokensConsumed += rebuttalResult.tokens
    const combinedFixReport = [execution.text, rebuttalResult.report].filter(part => part.trim()).join('\n\n')
    const afterDiffSnapshot = readGitDiff(ctx.directory)
    const afterHash = computeDiffHash(afterDiffSnapshot)
    const afterFiles = computeChangedFilesSet(afterDiffSnapshot)
    const materialChange = hasMaterialChange(beforeHash, afterHash, beforeFiles, afterFiles)

    if (containsExecutorFailureSignal(execution.text)) {
      rounds.push({ round, findings, fixReport: combinedFixReport || execution.text })
      if (!materialChange) {
        logger.info('harden', 'harden loop terminated', { round, status: 'executor_blocked', stopReason: 'executor_blocked', totalTokensConsumed })
        return {
          status: 'executor_blocked',
          rounds,
          budgetConsumed: totalTokensConsumed,
          totalTokensConsumed,
          summary: `executor reported a blocking failure in round ${round} without producing a material change.`,
          stopReason: 'executor_blocked',
          sessionID: coordinatorSessionID,
          coordinatorSessionId: coordinatorSessionID,
          trace,
        }
      }

      logger.info('harden', 'harden loop terminated', { round, status: 'needs_human', stopReason: 'executor_failure_signal', totalTokensConsumed })
      return {
        status: 'needs_human',
        rounds,
        budgetConsumed: totalTokensConsumed,
        totalTokensConsumed,
        summary: `executor reported a blocking failure in round ${round}.`,
        stopReason: 'executor_failure_signal',
        sessionID: coordinatorSessionID,
        coordinatorSessionId: coordinatorSessionID,
        trace,
      }
    }

    if (repeatedKeys.length > 0 && !materialChange) {
      rounds.push({ round, findings, fixReport: combinedFixReport || execution.text })
      logger.info('harden', 'harden loop terminated', { round, status: 'review_inconclusive', stopReason: 'repeated_finding_no_material_fix', totalTokensConsumed })
      return {
        status: 'review_inconclusive',
        rounds,
        budgetConsumed: totalTokensConsumed,
        totalTokensConsumed,
        summary: `same finding repeated at least twice by round ${round} and executor produced no material change.`,
        stopReason: 'repeated_finding_no_material_fix',
        sessionID: coordinatorSessionID,
        coordinatorSessionId: coordinatorSessionID,
        trace,
      }
    }

    rounds.push({ round, findings, fixReport: combinedFixReport || execution.text })

    if (rebuttalResult.needsHuman) {
      logger.info('harden', 'harden loop terminated', { round, status: 'needs_human', stopReason: 'review_inconclusive', totalTokensConsumed })
      return {
        status: 'needs_human',
        rounds,
        budgetConsumed: totalTokensConsumed,
        totalTokensConsumed,
        summary: `executor rejection remained unresolved after rebuttal in round ${round}.`,
        stopReason: 'review_inconclusive',
        sessionID: coordinatorSessionID,
        coordinatorSessionId: coordinatorSessionID,
        trace,
      }
    }
    priorFindings = findings
    fixReport = combinedFixReport || execution.text
  }

  logger.info('harden', 'harden loop terminated', { round: args.maxRounds, status: 'max_rounds_reached', stopReason: 'max_rounds_reached', totalTokensConsumed })
  return {
    status: 'max_rounds_reached',
    rounds,
    budgetConsumed: totalTokensConsumed,
    totalTokensConsumed,
    summary: `maximum rounds reached (${args.maxRounds}) without convergence.`,
    stopReason: 'max_rounds_reached',
    sessionID: coordinatorSessionID,
    coordinatorSessionId: coordinatorSessionID,
    trace,
  }
}

function buildReviewerPrompt(
  planSummary: string,
  diffStr: string,
  priorFindings?: HardenFinding[],
  fixReport?: string,
): string {
  const priorFindingsBlock = priorFindings && priorFindings.length > 0
    ? priorFindings.map((finding, index) => (
      `${index + 1}. [${finding.level}] ${finding.description}${finding.files.length > 0 ? ` | Files: ${finding.files.join(', ')}` : ''}`
    )).join('\n')
    : 'None'

  const fixReportBlock = fixReport?.trim() ? compressInput(fixReport, 6000) : 'None'
  const diffBlock = compressInput(diffStr || '(no git diff)', 18000)

  return [
    'You are the OpenFlow harden reviewer.',
    '',
    'Judge the implementation against the approved contract summary below.',
    'Use contract source priority: decisions > current > behavior > design > plan > request > diff > implementation.',
    'DO NOT propose new features or requirements. ONLY evaluate whether implementation matches the highest-priority applicable contract source.',
    'If approved behavior is contradicted by implementation, mark behavior_violation.',
    'If contract intent is missing but inferable, mark intent_gap and include confidence plus implementation alignment in Evidence.',
    'If implementation changes the approved contract instead of implementing it, mark contract_divergence and do not route it as executor-fixable.',
    'If evidence is insufficient, mark missing_evidence instead of guessing.',
    '',
    '## Design Document Summary',
    planSummary,
    '',
    '## Git Diff',
    '```diff',
    diffBlock,
    '```',
    '',
    '## Prior Findings',
    priorFindingsBlock,
    '',
    '## Fix Report',
    fixReportBlock,
    '',
    '## Finding Levels',
    '- behavior_violation: implementation contradicts approved behavior or the highest-priority contract source; executor-fixable.',
    '- intent_gap: contract coverage is missing but intent may be inferred; high/medium aligned means doc update, high/medium misaligned means implementation fix, low/unknown/conflicting needs decision.',
    '- contract_divergence: implementation or proposed fix changes the approved contract; needs human decision, not executor docs edit.',
    '- regression_risk: likely to break documented behavior or compatibility.',
    '- missing_evidence: reviewer cannot cite enough contract or implementation evidence; needs decision/evidence.',
    '- blocking_bug: legacy synonym for implementation-blocking behavior_violation; keep accepted for backward compatibility.',
    '- spec_violation: legacy synonym; classify as behavior_violation when implementation fix is clear, otherwise contract_divergence or missing_evidence.',
    '- test_gap: legacy non-blocking missing validation for documented behavior but not proven broken.',
    '- design_ambiguity: legacy ambiguity; prefer intent_gap or missing_evidence for new findings.',
    '- style_or_preference: purely stylistic or optional preference.',
    '',
    '## Required Output Format',
    'Repeat the following block once per finding:',
    'Level: <one of the finding levels above>',
    'Description: <concise finding>',
    'Evidence: <must include file paths and exact supporting detail>',
    'Files: <comma-separated file paths>',
    '',
    'If there are no findings, output exactly: NO_FINDINGS',
  ].join('\n')
}

function buildExecutorPrompt(
  actionableFindings: HardenFinding[],
  planSummary: string,
  filePaths: string[],
): string {
  if (actionableFindings.length === 0) {
    return [
      'You are the OpenFlow harden executor.',
      '',
      'No executor-fixable implementation findings were provided.',
      'Do not modify files. Report verdict: reject with rationale: no implementation fix is allowed for doc updates, missing evidence, or contract divergence.',
    ].join('\n')
  }

  const findingsBlock = actionableFindings.map((finding, index) => [
    `${index + 1}. Level: ${finding.level}`,
    `Description: ${finding.description}`,
    `Evidence: ${finding.evidence || 'No additional evidence provided.'}`,
    `Files: ${finding.files.join(', ') || 'Unspecified'}`,
  ].join('\n')).join('\n\n')

  const allowedFiles = filePaths.length > 0 ? filePaths.join('\n') : 'Use only files already implicated by the findings.'

  return [
    'You are the OpenFlow harden executor.',
    '',
    'Fix ONLY the implementation issues listed above. Do NOT refactor, do NOT add new features, do NOT modify files outside the listed scope.',
    'Do NOT edit documentation, approve contract divergence, or convert needs-decision findings into implementation changes.',
    '',
    '## Actionable Findings',
    findingsBlock,
    '',
    '## Relevant Plan Summary',
    compressInput(planSummary, 8000),
    '',
    '## Files Allowed To Modify',
    allowedFiles,
    '',
    '## Required Output',
    '1. Root cause explanation for each finding',
    '2. The fix diff',
    '3. How to verify the fix',
  ].join('\n')
}

export function filterExecutorFindings(findings: HardenFinding[]): HardenFinding[] {
  return findings.filter(finding => {
    const metadata = finding as HardenFinding & { executorAllowed?: boolean; taxonomy?: string; decision?: string }
    if (metadata.executorAllowed === false) return false
    if (metadata.decision && metadata.decision !== 'fix_implementation') return false
    if (metadata.taxonomy === 'contract_divergence' || metadata.taxonomy === 'missing_evidence') return false
    return finding.disposition === 'must_fix'
  })
}

function parseExecutorDisposition(
  executionText: string,
  findings: HardenFinding[],
): Map<string, ParsedExecutorDisposition> {
  const result = new Map<string, ParsedExecutorDisposition>()
  if (findings.length === 0) return result

  const text = executionText.trim()
  const explicitVerdicts = [...text.matchAll(/\bverdict\s*:\s*(accept|reject|partial)\b/giu)]
  if (explicitVerdicts.length === 0) {
    const verdict: HardenExecutorVerdict = /\bverdict\s*:\s*reject\b|\breject(?:ed|s)?\b/iu.test(text) ? 'reject' : 'accept'
    for (const finding of findings) {
      result.set(findingKey(finding), {
        verdict,
        rationale: text || (verdict === 'accept' ? 'Executor accepted the finding.' : 'Executor rejected the finding.'),
      })
    }
    return result
  }

  const records = splitExecutorDispositionRecords(text)
  for (const record of records) {
    const verdict = extractExecutorVerdict(record)
    if (!verdict) continue

    const findingDescription = extractDispositionField(record, 'finding')
    const disposition: ParsedExecutorDisposition = {
      verdict,
      rationale: extractDispositionField(record, 'rationale') || record.trim(),
      ...(extractDispositionField(record, 'fix') ? { fixSummary: extractDispositionField(record, 'fix') } : {}),
    }

    const matchedFinding = findingDescription
      ? findMatchingFinding(findingDescription, findings)
      : records.length === 1 && findings.length === 1
        ? findings[0]
        : undefined

    if (matchedFinding) {
      result.set(findingKey(matchedFinding), disposition)
    }
  }

  if (result.size === 0 && explicitVerdicts[0]?.[1]) {
    const verdict = normalizeExecutorVerdict(explicitVerdicts[0][1])
    const disposition: ParsedExecutorDisposition = {
      verdict,
      rationale: extractDispositionField(text, 'rationale') || text,
      ...(extractDispositionField(text, 'fix') ? { fixSummary: extractDispositionField(text, 'fix') } : {}),
    }
    for (const finding of findings) result.set(findingKey(finding), disposition)
  }

  return result
}

function splitExecutorDispositionRecords(text: string): string[] {
  const pipeRecords = text.split('\n').flatMap(line => line.split(/(?=\bverdict\s*:\s*(?:accept|reject|partial)\b)/giu))
  const records = pipeRecords.map(record => record.trim()).filter(record => /\bverdict\s*:/iu.test(record))
  return records.length > 0 ? records : [text]
}

function extractExecutorVerdict(text: string): HardenExecutorVerdict | undefined {
  const match = text.match(/\bverdict\s*:\s*(accept|reject|partial)\b/iu)
  return match?.[1] ? normalizeExecutorVerdict(match[1]) : undefined
}

function normalizeExecutorVerdict(value: string): HardenExecutorVerdict {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'reject') return 'reject'
  if (normalized === 'partial') return 'partial'
  return 'accept'
}

function extractDispositionField(text: string, field: string): string {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|\\||\\n)\\s*${escapedField}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:\\||\\n)\\s*(?:verdict|finding|fix|rationale|evidence|final_verdict)\\s*:|$)`, 'iu')
  return pattern.exec(text)?.[1]?.trim() ?? ''
}

function findMatchingFinding(description: string, findings: HardenFinding[]): HardenFinding | undefined {
  const normalizedDescription = normalizeMatchText(description)
  return findings.find(finding => normalizeMatchText(finding.description) === normalizedDescription)
    ?? findings.find(finding => normalizeMatchText(finding.description).includes(normalizedDescription) || normalizedDescription.includes(normalizeMatchText(finding.description)))
}

function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()
}

function applyExecutorDispositions(
  findings: HardenFinding[],
  dispositions: Map<string, ParsedExecutorDisposition>,
): void {
  for (const finding of findings) {
    const disposition = dispositions.get(findingKey(finding))
    if (!disposition) continue

    const finalFinding = finding as HardenFindingFinalState
    finalFinding.executorVerdict = disposition.verdict
    finalFinding.executorRationale = disposition.rationale
    if (disposition.fixSummary) finalFinding.executorFixSummary = disposition.fixSummary

    if (disposition.verdict === 'reject') {
      finalFinding.status = 'dismissed'
      finalFinding.disposition = 'false_positive'
      finalFinding.finalStateGroup = 'rejected_findings'
      continue
    }

    if (disposition.verdict === 'partial') {
      finalFinding.status = 'needs_decision'
      finalFinding.finalStateGroup = finding.disposition === 'must_fix'
        ? 'unresolved_must_fix'
        : 'unresolved_needs_decision'
      continue
    }

    finalFinding.status = 'fixed'
    finalFinding.finalStateGroup = 'resolved_findings'
  }
}

async function runRejectedFindingRebuttals(
  ctx: OpenFlowContext,
  sanitizedFeature: string,
  coordinatorSessionID: string,
  round: number,
  maxRounds: number,
  maxArgumentRoundsPerFinding: number,
  findings: HardenFinding[],
  dispositions: Map<string, ParsedExecutorDisposition>,
  planSummary: string,
  trace: FormattedHardenTraceEntry[],
): Promise<{ tokens: number; report: string; needsHuman: boolean }> {
  let tokens = 0
  let needsHuman = false
  const reportParts: string[] = []
  const rejectedFindings = findings.filter(finding => dispositions.get(findingKey(finding))?.verdict === 'reject')
  logger.debug('harden', 'starting rejected finding rebuttals', { round, rejectedCount: rejectedFindings.length })

  for (const finding of rejectedFindings) {
    const disposition = dispositions.get(findingKey(finding))
    if (!disposition) continue

    const reviewerRebuttalSessionID = await createHardenSession(
      ctx,
      sanitizedFeature,
      `Harden Round ${round}/${maxRounds} - Reviewer Rebuttal`,
      coordinatorSessionID,
    )
    const reviewerRebuttal = await runAgentTask(
      ctx,
      reviewerRebuttalSessionID,
      'oracle',
      REVIEWER_SYSTEM_PROMPT,
      buildReviewerRebuttalPrompt(finding, disposition, planSummary),
      activeModels.reviewerModel,
    )
    tokens += reviewerRebuttal.tokens
    trace.push(buildTraceEntry(round, 'oracle', reviewerRebuttal, 'reviewer_rebuttal'))
    reportParts.push(`Reviewer rebuttal (${reviewerRebuttalSessionID}): ${reviewerRebuttal.text}`)

    const finalFinding = finding as HardenFindingFinalState
    const reviewerDecision = parseReviewerRebuttalDecision(reviewerRebuttal.text)
    if (reviewerDecision === 'accept') {
      finalFinding.status = 'dismissed'
      finalFinding.disposition = 'false_positive'
      finalFinding.finalStateGroup = 'rejected_findings'
      continue
    }

    if (reviewerDecision !== 'challenge' || maxArgumentRoundsPerFinding <= 1) {
      markFindingNeedsDecision(finalFinding, reviewerRebuttal.text, '')
      needsHuman = true
      continue
    }

    const executorRebuttalSessionID = await createHardenSession(
      ctx,
      sanitizedFeature,
      `Harden Round ${round}/${maxRounds} - Executor Rebuttal`,
      coordinatorSessionID,
    )
    const executorRebuttal = await runAgentTask(
      ctx,
      executorRebuttalSessionID,
      'deep',
      EXECUTOR_SYSTEM_PROMPT,
      buildExecutorRebuttalPrompt(finding, disposition, reviewerRebuttal.text, planSummary),
      activeModels.executorModel,
    )
    tokens += executorRebuttal.tokens
    trace.push(buildTraceEntry(round, 'deep', executorRebuttal, 'executor_rebuttal'))
    reportParts.push(`Executor rebuttal (${executorRebuttalSessionID}): ${executorRebuttal.text}`)

    const finalVerdict = parseExecutorFinalRebuttalVerdict(executorRebuttal.text)
    if (finalVerdict === 'accept') {
      finalFinding.status = 'fixed'
      finalFinding.executorVerdict = 'accept'
      finalFinding.executorRationale = executorRebuttal.text
      finalFinding.finalStateGroup = 'resolved_findings'
      continue
    }

    markFindingNeedsDecision(finalFinding, reviewerRebuttal.text, executorRebuttal.text)
    needsHuman = true
  }

  return { tokens, report: reportParts.join('\n\n'), needsHuman }
}

function buildReviewerRebuttalPrompt(
  finding: HardenFinding,
  disposition: ParsedExecutorDisposition,
  planSummary: string,
): string {
  return [
    'The Executor rejected this finding. Decide whether the rejection is valid against the design.',
    '',
    '## Finding',
    formatFindingForPrompt(finding),
    '',
    '## Executor Rejection Rationale',
    disposition.rationale,
    '',
    '## Design Document Summary',
    compressInput(planSummary, 8000),
    '',
    'Respond with exactly one of:',
    '- accept — if the Executor rejection is valid.',
    '- challenge: <new design/code evidence> — if the finding still stands.',
  ].join('\n')
}

function buildExecutorRebuttalPrompt(
  finding: HardenFinding,
  disposition: ParsedExecutorDisposition,
  reviewerChallenge: string,
  planSummary: string,
): string {
  return [
    'The Reviewer challenged your rejection. Provide a final verdict for this finding.',
    '',
    '## Finding',
    formatFindingForPrompt(finding),
    '',
    '## Original Rejection Rationale',
    disposition.rationale,
    '',
    '## Reviewer Challenge',
    reviewerChallenge,
    '',
    '## Design Document Summary',
    compressInput(planSummary, 8000),
    '',
    'Required output: final_verdict: accept | reject',
    'Then include rationale: <reason>.',
  ].join('\n')
}

function formatFindingForPrompt(finding: HardenFinding): string {
  return [
    `Level: ${finding.level}`,
    `Description: ${finding.description}`,
    `Evidence: ${finding.evidence || 'No additional evidence provided.'}`,
    `Files: ${finding.files.join(', ') || 'Unspecified'}`,
  ].join('\n')
}

function parseReviewerRebuttalDecision(text: string): 'accept' | 'challenge' | 'unclear' {
  const trimmed = text.trim()
  if (/^NO_FINDINGS$/iu.test(trimmed)) return 'accept'
  if (/^accept\b/iu.test(trimmed)) return 'accept'
  if (/^challenge\b/iu.test(trimmed) || /\bchallenge\s*:/iu.test(trimmed)) return 'challenge'
  return 'unclear'
}

function parseExecutorFinalRebuttalVerdict(text: string): HardenExecutorVerdict {
  const match = text.match(/\b(?:final_verdict|verdict)\s*:\s*(accept|reject|partial)\b/iu)
  return match?.[1] ? normalizeExecutorVerdict(match[1]) : 'reject'
}

function markFindingNeedsDecision(
  finding: HardenFindingFinalState,
  challenge: string,
  finalResponse: string,
): void {
  finding.level = 'design_ambiguity'
  finding.status = 'needs_decision'
  finding.disposition = 'needs_decision'
  finding.finalStateGroup = 'unresolved_needs_decision'
  finding.rebuttalChallenge = challenge
  finding.rebuttalFinalResponse = finalResponse
}

function containsExecutorReviewableLevel(reviewText: string): boolean {
  return /(?:^|\n)\s*Level\s*:\s*(?:behavior_violation|blocking_bug|spec_violation|regression_risk)\b/iu.test(reviewText)
}

function groupFinalFindingStates(rounds: HardenRoundResult[]): Record<FindingsFinalStateGroup, HardenFindingFinalState[]> {
  const groups: Record<FindingsFinalStateGroup, HardenFindingFinalState[]> = {
    resolved_findings: [],
    rejected_findings: [],
    unresolved_must_fix: [],
    unresolved_needs_decision: [],
    accepted_known_issues: [],
  }
  const seen = new Set<string>()

  for (const round of rounds) {
    for (const finding of round.findings) {
      const finalFinding = finding as HardenFindingFinalState
      if (!finalFinding.executorVerdict || !finalFinding.finalStateGroup) {
        if (finalFinding.disposition === 'accepted_known_issue') {
          finalFinding.finalStateGroup = 'accepted_known_issues'
        } else if (isDecisionRequiredFinding(finalFinding)) {
          finalFinding.finalStateGroup = 'unresolved_needs_decision'
        } else {
          continue
        }
      }

      const key = findingKey(finalFinding)
      if (seen.has(key)) continue
      seen.add(key)
      groups[finalFinding.finalStateGroup].push(finalFinding)
    }
  }

  return groups
}

function isDecisionRequiredFinding(finding: HardenFindingFinalState): boolean {
  return finding.status === 'needs_decision'
    || finding.disposition === 'needs_decision'
    || finding.disposition === 'design_divergence'
}

function hasFinalFindingStates(groups: Record<FindingsFinalStateGroup, HardenFindingFinalState[]>): boolean {
  return Object.values(groups).some(group => group.length > 0)
}

function formatFindingsFinalState(rounds: HardenRoundResult[]): string {
  const groups = groupFinalFindingStates(rounds)
  if (!hasFinalFindingStates(groups)) return ''

  const orderedGroups: FindingsFinalStateGroup[] = [
    'resolved_findings',
    'rejected_findings',
    'accepted_known_issues',
    'unresolved_must_fix',
    'unresolved_needs_decision',
  ]

  const groupBlocks = orderedGroups
    .filter(group => groups[group].length > 0)
    .map(group => [
      `#### ${group}`,
      groups[group].map((finding, index) => formatFinalFindingLine(group, finding, index)).join('\n'),
    ].join('\n'))

  return `\n\n### Findings Final State\n${groupBlocks.join('\n')}`
}

function formatFinalFindingLine(
  group: FindingsFinalStateGroup,
  finding: HardenFindingFinalState,
  index: number,
): string {
  const id = finding.id || `F${index + 1}`
  const files = finding.files.length > 0 ? finding.files.join(', ') : 'Unspecified'
  const evidence = finding.evidence || 'No evidence provided.'
  const verdict = finding.executorVerdict ?? 'accept'
  const disposition = verdict === 'partial' ? 'partial' : finding.disposition ?? defaultDispositionForGroup(group)
  const status = finding.status ?? defaultStatusForGroup(group)
  const rationale = finding.executorRationale ? ` | rationale: ${escapeMarkdown(finding.executorRationale.slice(0, 300))}` : ''
  const fix = finding.executorFixSummary ? ` | fix: ${escapeMarkdown(finding.executorFixSummary.slice(0, 200))}` : ''
  const challenge = finding.rebuttalChallenge ? ` | challenge: ${escapeMarkdown(finding.rebuttalChallenge.slice(0, 200))}` : ''
  const finalResponse = finding.rebuttalFinalResponse ? ` | final_verdict: ${escapeMarkdown(finding.rebuttalFinalResponse.slice(0, 200))}` : ''

  return `- ${id} | group=${group} | disposition=${disposition} | status=${status} | level=${finding.level} | verdict=${verdict} | files=${escapeMarkdown(files)} | evidence=${escapeMarkdown(evidence.slice(0, 300))}${rationale}${fix}${challenge}${finalResponse}`
}

function defaultDispositionForGroup(group: FindingsFinalStateGroup): string {
  if (group === 'rejected_findings') return 'false_positive'
  if (group === 'accepted_known_issues') return 'accepted_known_issue'
  if (group === 'unresolved_needs_decision') return 'needs_decision'
  return 'must_fix'
}

function defaultStatusForGroup(group: FindingsFinalStateGroup): HardenFindingStatus {
  if (group === 'resolved_findings') return 'fixed'
  if (group === 'rejected_findings') return 'dismissed'
  if (group === 'accepted_known_issues') return 'confirmed'
  return 'needs_decision'
}

function findingKey(finding: HardenFinding): string {
  return finding.id || finding.normalizedKey || normalizeFinding(finding)
}

async function readDesignDocument(
  ctx: OpenFlowContext,
  feature: string,
): Promise<{ content: string; paths: string[] }> {
  const candidates = await getDesignCandidatePaths(ctx.directory, feature, ctx.config)
  const existingPaths: string[] = []

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) {
        existingPaths.push(candidate)
        continue
      }

      if (stat.isDirectory()) {
        const designPath = path.join(candidate, 'design.md')
        if (await fileExists(designPath)) {
          existingPaths.push(designPath)
        }
      }
    } catch {
      // Missing compatibility path; skip.
    }
  }

  const uniquePaths = [...new Set(existingPaths)]
  if (uniquePaths.length === 0) {
    return { content: '', paths: [] }
  }

  const contentParts: string[] = []
  for (const filePath of uniquePaths) {
    const content = await fs.readFile(filePath, 'utf-8')
    contentParts.push(`## ${toProjectRelativePath(ctx.directory, filePath)}\n${content}`)
  }

  return {
    content: compressInput(contentParts.join('\n\n'), 16000),
    paths: uniquePaths,
  }
}

function readGitDiff(cwd: string): string {
  try {
    return execSync('git diff HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    return ''
  }
}

function readScopedReviewerDiff(context: DiffScopeContext): { diff: string; reviewerDiff: string } {
  const freshDiffStr = readGitDiff(context.directory)
  const freshScope = context.full
    ? { diff: freshDiffStr, omittedPaths: [] }
    : scopeDiffToFeature(
        context.directory,
        context.sanitizedFeature,
        freshDiffStr,
        context.planPath,
        context.designPaths,
        context.planContent,
        context.designContent,
        undefined,
        undefined,
        context.archiveDir,
      )

  const reviewerDiff = freshScope.omittedPaths.length > 0
    ? appendOmittedDiffManifest(freshScope.diff, freshScope.omittedPaths)
    : freshScope.diff

  return {
    diff: freshScope.diff,
    reviewerDiff,
  }
}

async function createHardenSession(
  ctx: OpenFlowContext,
  _feature: string,
  title: string,
  parentSessionID?: string,
): Promise<string> {
  const client = getSessionClient(ctx)
  const createBody: Record<string, unknown> = { title }
  if (parentSessionID) {
    createBody.parentID = parentSessionID
  }
  logger.debug('session', 'creating harden sub-session', { title, parentSessionID })
  try {
    const created = await client.session.create({
      query: { directory: ctx.directory },
      body: createBody,
    })
    const extractedID = extractSessionID(created)
    logger.debug('session', 'harden sub-session created', { sessionID: extractedID, title, parentSessionID })
    return extractedID
  } catch (error) {
    logger.error('session', 'failed to create harden sub-session', error instanceof Error ? error : new Error(String(error)), { title, parentSessionID })
    throw error
  }
}

async function runAgentTask(
  ctx: OpenFlowContext,
  sessionID: string,
  agent: 'oracle' | 'deep',
  systemPrompt: string,
  userPrompt: string,
  model?: string,
): Promise<AgentRunResult> {
  const client = getSessionClient(ctx)
  const promptPayload = buildPromptPayload(sessionID, systemPrompt, userPrompt, agent, model, ctx.directory)
  logger.debug('harden', 'running agent task', { sessionID, agent, model })
  try {
    const response = await client.session.prompt(promptPayload)
    const result = {
      text: extractText(response),
      tokens: extractTokens(response),
    }
    logger.debug('harden', 'agent task completed', { sessionID, agent, textLength: result.text.length, tokens: result.tokens })
    if (!result.text) {
      logger.warn('harden', 'agent task returned empty text', { sessionID, agent })
    }
    return result
  } catch (error) {
    logger.error('harden', 'agent task failed', error instanceof Error ? error : new Error(String(error)), { sessionID, agent })
    throw error
  }
}

function getSessionClient(ctx: OpenFlowContext): Required<SessionClientLike> {
  const client = ctx.client as SessionClientLike
  if (!client.session?.create || !client.session.prompt) {
    throw new Error('OpenFlow harden requires ctx.client.session.create() and ctx.client.session.prompt().')
  }
  return { session: client.session }
}

function buildPromptPayload(
  sessionID: string,
  systemPrompt: string,
  userPrompt: string,
  agent: 'oracle' | 'deep',
  model: string | undefined,
  directory: string,
): Record<string, unknown> {
  const fullPrompt = `${systemPrompt}\n\n## Task\n${userPrompt}`
  const body: Record<string, unknown> = {
    agent,
    parts: [{ type: 'text', text: fullPrompt }],
  }

  const parsedModel = parseModel(model)
  if (parsedModel) {
    body.model = parsedModel
  }

  return {
    path: { id: sessionID },
    query: { directory },
    body,
  }
}

function parseModel(model: string | undefined): { providerID: string; modelID: string } | null {
  if (!model) return null
  const trimmed = model.trim()
  if (!trimmed) return null

  const separatorIndex = trimmed.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null
  }

  return {
    providerID: trimmed.slice(0, separatorIndex),
    modelID: trimmed.slice(separatorIndex + 1),
  }
}

function extractFeatureArg(args: HardenArgs | undefined): string | undefined {
  const raw = args as Record<string, unknown> | undefined
  return typeof raw?.feature === 'string' ? raw.feature : undefined
}

function extractSessionID(response: unknown): string {
  const object = asRecord(response)
  const directID = typeof object.id === 'string' ? object.id : undefined
  if (directID) return directID

  const data = asRecord(object.data)
  if (typeof data.id === 'string') return data.id

  throw new Error('Failed to create harden subtask session.')
}

function extractText(response: unknown): string {
  const body = extractResponseBody(response)
  const parts = Array.isArray(body.parts) ? body.parts : []
  const text = parts
    .map((part) => {
      const record = asRecord(part)
      return typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()

  if (text) return text
  return typeof body.output === 'string' ? body.output : ''
}

function extractTokens(response: unknown): number {
  const body = extractResponseBody(response)
  const info = asRecord(body.info)
  const tokens = asRecord(info.tokens)
  const input = toNumber(tokens.input)
  const output = toNumber(tokens.output)
  const reasoning = toNumber(tokens.reasoning)
  const cache = asRecord(tokens.cache)

  return input + output + reasoning + toNumber(cache.read) + toNumber(cache.write)
}

function extractResponseBody(response: unknown): Record<string, unknown> {
  const object = asRecord(response)
  return object.data ? asRecord(object.data) : object
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function collectScopedFilePaths(findings: HardenFinding[], diffStr: string): string[] {
  const paths = new Set<string>()

  for (const finding of findings) {
    for (const filePath of finding.files) {
      paths.add(filePath)
    }
  }

  for (const filePath of extractDiffPaths(diffStr)) {
    paths.add(filePath)
  }

  return [...paths]
}

function extractDiffPaths(diffStr: string): string[] {
  return extractDiffBlockPaths(diffStr)
}

function containsExecutorFailureSignal(output: string): boolean {
  return /\b(error|failed|exception|unable|cannot|did not|blocked)\b/i.test(output)
}

function buildPlanSummary(planContent: string, designContent: string): string {
  const sections = [
    '### Plan Summary',
    compressInput(planContent, 8000),
  ]

  if (designContent.trim()) {
    sections.push('### Design Summary', compressInput(designContent, 8000))
  } else {
    sections.push('### Design Summary', 'No design document found.')
  }

  return sections.join('\n\n')
}

function summarizeReviewOutcome(
  findings: HardenFinding[],
  actionableCount: number,
  ambiguousCount: number,
  nonBlockingCount: number,
): string {
  if (findings.length === 0) {
    return 'reviewer found no issues.'
  }

  return `${actionableCount} actionable, ${ambiguousCount} design ambiguity, ${nonBlockingCount} non-blocking finding(s) reported.`
}

function inferReviewerStopReasonCandidate(grouped: ReturnType<typeof classifyFindings>): string {
  if (grouped.ambiguous.length > 0) return 'design_ambiguity'
  if (grouped.actionable.length === 0 && grouped.nonBlocking.length === 0) return 'no_findings'
  if (grouped.actionable.length === 0) return 'non_blocking_only'
  return 'actionable_findings'
}

function buildTraceEntry(
  round: number,
  agent: 'oracle' | 'deep',
  result: AgentRunResult,
  stopReasonCandidate: string,
): FormattedHardenTraceEntry {
  return {
    round,
    agent,
    tokens: result.tokens,
    result: result.text,
    stopReasonCandidate,
    timestamp: new Date().toISOString(),
  }
}

function formatHardenResult(result: FormattedHardenResult): string {
  const roundBlocks = result.rounds.length > 0
    ? '\n\n' + result.rounds.map((round) => {
        const findingsBlock = round.findings.length > 0
          ? round.findings.map((f) => {
              const files = f.files.length > 0 ? `\n  Files: ${f.files.join(', ')}` : ''
              const evidence = f.evidence ? `\n  Evidence: ${escapeMarkdown(f.evidence.slice(0, 300))}` : ''
              return `- [${f.level}] ${escapeMarkdown(f.description)}${files}${evidence}`
            }).join('\n')
          : 'No findings.'
        const fixBlock = round.fixReport
          ? `\n\nFix: ${escapeMarkdown(round.fixReport.slice(0, 500))}`
          : ''
        return `### Round ${round.round}\n${findingsBlock}${fixBlock}`
      }).join('\n\n')
    : ''
  const sessionBlock = result.sessionID
    ? `\nSession: ${escapeMarkdown(result.sessionID)}`
    : ''
  const traceBlock = result.trace && result.trace.length > 0
    ? '\nTrace:\n' + result.trace.map((entry) => {
        const text = escapeMarkdown(entry.result.slice(0, 200) || '(empty result)')
        return `- Round: ${entry.round} | Agent: ${entry.agent} | Tokens: ${entry.tokens} | Stop reason candidate: ${entry.stopReasonCandidate ?? 'unknown'} | Result: ${text}`
      }).join('\n')
    : ''
  const finalStateBlock = formatFindingsFinalState(result.rounds)

  return `## Harden Result

Status: ${result.status}
Stop reason: ${escapeMarkdown(result.stopReason ?? 'unknown')}
Rounds: ${result.rounds.length}
Total tokens consumed: ${result.totalTokensConsumed ?? result.budgetConsumed}
Summary: ${escapeMarkdown(result.summary)}${sessionBlock}${traceBlock}${roundBlocks}${finalStateBlock}`
}

function toProjectRelativePath(projectDir: string, filePath: string): string {
  const relativePath = path.relative(projectDir, filePath)
  return (relativePath || filePath).replace(/\\/g, '/')
}
