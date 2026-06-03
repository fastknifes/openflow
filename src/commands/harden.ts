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
import { compressInput, gradeComplexity } from '../utils/harden-utils.js'
import { normalizeFinding } from '../utils/harden-ledger.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { appendOmittedDiffManifest, extractDiffBlockPaths, scopeDiffToFeature } from '../utils/diff-scope.js'
import { logger } from '../utils/logger.js'
import { HardenDagManager } from '../orchestrator/harden-dag-manager.js'
import { getSchedulerLoop } from '../index.js'

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

interface ReviewerTurnResult {
  sessionID: string
  text: string
  tokens: number
  findings: HardenFinding[]
  converged: boolean
  reason: string
  rejectedCounts: Record<string, number>
}

interface ExecutorTurnResult {
  sessionID: string
  text: string
  tokens: number
  dispositions: Array<{ findingId: string; verdict: string; rationale: string }>
  fixReport: string
  codeChanges: string
}

interface HardenFindingFinalState extends HardenFinding {
  executorVerdict?: HardenExecutorVerdict
  executorRationale?: string
  executorFixSummary?: string
  finalStateGroup?: FindingsFinalStateGroup
  rebuttalChallenge?: string
  rebuttalFinalResponse?: string
}

type FindingsFinalStateGroup = 'resolved_findings' | 'rejected_findings' | 'unresolved_must_fix' | 'unresolved_needs_decision'

let activeModels: { reviewerModel?: string; executorModel?: string } = {}

const REVIEWER_SYSTEM_PROMPT = `## System Role
You are the OpenFlow Harden Reviewer.
Judge the implementation ONLY against the design document.
DO NOT propose new features. ONLY evaluate whether implementation matches design.
If design doc is silent, mark as design_ambiguity, not bug.`

const EXECUTOR_SYSTEM_PROMPT = `## System Role
You are the OpenFlow Harden Executor.
For each finding, give verdict: accept | reject | partial.
If accept/partial, provide minimal fix.
If reject, explain why with design doc or code logic evidence.
Do NOT refactor, do NOT add new features, do NOT modify files outside scope.`

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

  // === All complexity modes (simple + standard) now use DRG async loop ===
  logger.info('harden', 'entering DRG adversarial mode', { feature: sanitizedFeature, maxRounds: args?.maxRounds ?? ctx.config.harden.maxRounds })
  const coordinatorSessionID = await createHardenSession(ctx, sanitizedFeature, `Harden: ${sanitizedFeature}`, currentSessionID)
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

  const result = await runDrgAdversarialLoop(
    ctx,
    planSummary,
    diffScopeContext,
    {
      maxRounds: args?.maxRounds ?? ctx.config.harden.maxRounds,
      mode: args?.mode ?? 'standard',
    },
    coordinatorSessionID,
    sanitizedFeature,
  )

  return formatHardenResult(result)
}


export async function runDrgAdversarialLoop(
  ctx: OpenFlowContext,
  planSummary: string,
  diffScopeContext: DiffScopeContext,
  args: { maxRounds: number; maxCyclesPerRound?: number; mode: string },
  coordinatorSessionID: string,
  sanitizedFeature: string,
): Promise<FormattedHardenResult> {
  void ctx
  const scheduler = getSchedulerLoop()
  if (scheduler === undefined) {
    throw new Error('OpenFlow harden DRG loop requires an active scheduler.')
  }

  const manager = new HardenDagManager(scheduler)
  manager.createHardenDag(sanitizedFeature)

  const normalizedRounds = normalizeMaxRounds(args.maxRounds)
  const normalizedCycles = normalizeMaxCyclesPerRound(args.maxCyclesPerRound)
  const maxRounds = normalizedRounds.rounds
  const maxCyclesPerRound = normalizedCycles.cycles
  const warnings = [normalizedRounds.warning, normalizedCycles.warning].filter((warning): warning is string => Boolean(warning))

  let reviewerSessionID: string | undefined
  let executorSessionID: string | undefined
  const allRounds: HardenRoundResult[] = []
  const trace: FormattedHardenTraceEntry[] = []
  let totalTokens = 0

  try {
    for (let round = 1; round <= maxRounds; round++) {
      logger.info('harden', 'starting DRG harden round', { round, maxRounds, maxCyclesPerRound, mode: args.mode })
      const freshScopedDiff = readScopedReviewerDiff(diffScopeContext)
      let rollingDiff = compressInput(freshScopedDiff.reviewerDiff, 24000)
      const reviewerPrompt = buildReviewerPrompt(planSummary, rollingDiff)
      const reviewerTaskId = manager.submitReviewerTask(round, {
        agent: 'harden-reviewer',
        sessionID: reviewerSessionID,
        title: `Harden Round ${round}/${maxRounds} - Reviewer`,
        systemPrompt: REVIEWER_SYSTEM_PROMPT,
        userPrompt: reviewerPrompt,
        round,
        maxRounds,
        parentSessionID: coordinatorSessionID,
        feature: sanitizedFeature,
        model: activeModels.reviewerModel,
        mode: args.mode,
      })
      const reviewerTask = await manager.awaitTask(reviewerTaskId)
      if (reviewerTask.status !== 'succeeded') {
        throw new Error(`Harden reviewer task ${reviewerTaskId} ended with status ${reviewerTask.status}`)
      }
      let reviewerResult = reviewerTask.result as unknown as ReviewerTurnResult
      reviewerSessionID = reviewerResult.sessionID
      totalTokens += reviewerResult.tokens
      trace.push(buildTraceEntry(round, 'oracle', reviewerResult, reviewerResult.reason))

      if (reviewerResult.converged) {
        allRounds.push({ round, findings: reviewerResult.findings })
        const status = reviewerResult.reason === 'non_blocking_only'
          ? 'pass_with_risks'
          : reviewerResult.reason === 'review_inconclusive'
            ? 'needs_human'
            : 'pass'
        return {
          status,
          rounds: allRounds,
          budgetConsumed: totalTokens,
          totalTokensConsumed: totalTokens,
          summary: warnings.concat(`reviewer converged in round ${round}: ${reviewerResult.reason}.`).join(' '),
          stopReason: reviewerResult.reason,
          sessionID: coordinatorSessionID,
          coordinatorSessionId: coordinatorSessionID,
          trace,
        }
      }

      let roundFindings = reviewerResult.findings
      let roundFixReport = ''
      let roundStopReason = reviewerResult.reason

      for (let cycle = 1; cycle <= maxCyclesPerRound; cycle++) {
        logger.info('harden', 'starting DRG harden cycle', { round, cycle, maxCyclesPerRound })
        const executorPrompt = buildExecutorPrompt(roundFindings, planSummary, collectScopedFilePaths(roundFindings, freshScopedDiff.diff))
        const executorTaskId = manager.submitExecutorTask(round, {
          agent: 'harden-executor',
          sessionID: executorSessionID,
          title: `Harden Round ${round}/${maxRounds} - Executor Cycle ${cycle}/${maxCyclesPerRound}`,
          systemPrompt: EXECUTOR_SYSTEM_PROMPT,
          userPrompt: executorPrompt,
          round,
          cycle,
          maxRounds,
          maxCyclesPerRound,
          parentSessionID: coordinatorSessionID,
          feature: sanitizedFeature,
          model: activeModels.executorModel,
          mode: args.mode,
          findings: roundFindings,
          reviewerSessionID,
          priorReviewerText: reviewerResult.text,
        })
        const executorTask = await manager.awaitTask(executorTaskId)
        if (executorTask.status !== 'succeeded') {
          throw new Error(`Harden executor task ${executorTaskId} ended with status ${executorTask.status}`)
        }
        const executorResult = executorTask.result as unknown as ExecutorTurnResult
        executorSessionID = executorResult.sessionID
        totalTokens += executorResult.tokens
        roundFixReport = executorResult.fixReport || executorResult.text
        trace.push(buildTraceEntry(round, 'deep', executorResult, containsExecutorFailureSignal(executorResult.text) ? 'executor_failure_signal' : 'fix_applied'))

        const verificationDiff = readScopedReviewerDiff(diffScopeContext)
        rollingDiff = compressInput(verificationDiff.reviewerDiff, 24000)
        const verificationPrompt = buildReviewerPrompt(planSummary, rollingDiff, roundFindings, executorResult.text)
        const verificationTaskId = manager.submitReviewerTask(round, {
          agent: 'harden-reviewer',
          sessionID: reviewerSessionID,
          title: `Harden Round ${round}/${maxRounds} - Reviewer Verification Cycle ${cycle}/${maxCyclesPerRound}`,
          systemPrompt: REVIEWER_SYSTEM_PROMPT,
          userPrompt: verificationPrompt,
          round,
          cycle,
          maxRounds,
          maxCyclesPerRound,
          parentSessionID: coordinatorSessionID,
          feature: sanitizedFeature,
          model: activeModels.reviewerModel,
          mode: args.mode,
          priorExecutorText: executorResult.text,
          executorSessionID,
        })
        const verificationTask = await manager.awaitTask(verificationTaskId)
        if (verificationTask.status !== 'succeeded') {
          throw new Error(`Harden reviewer verification task ${verificationTaskId} ended with status ${verificationTask.status}`)
        }
        reviewerResult = verificationTask.result as unknown as ReviewerTurnResult
        reviewerSessionID = reviewerResult.sessionID
        totalTokens += reviewerResult.tokens
        roundFindings = reviewerResult.findings
        roundStopReason = reviewerResult.reason
        trace.push(buildTraceEntry(round, 'oracle', reviewerResult, reviewerResult.reason))

        if (reviewerResult.converged) break
      }

      allRounds.push({ round, findings: roundFindings, fixReport: roundFixReport })

      if (reviewerResult.converged) {
        const status = roundStopReason === 'non_blocking_only'
          ? 'pass_with_risks'
          : roundStopReason === 'review_inconclusive'
            ? 'needs_human'
            : 'pass'
        return {
          status,
          rounds: allRounds,
          budgetConsumed: totalTokens,
          totalTokensConsumed: totalTokens,
          summary: warnings.concat(`reviewer converged in round ${round}: ${roundStopReason}.`).join(' '),
          stopReason: roundStopReason,
          sessionID: coordinatorSessionID,
          coordinatorSessionId: coordinatorSessionID,
          trace,
        }
      }
    }

    return {
      status: 'max_rounds_reached',
      rounds: allRounds,
      budgetConsumed: totalTokens,
      totalTokensConsumed: totalTokens,
      summary: warnings.concat(`maximum rounds reached (${maxRounds}) without convergence.`).join(' '),
      stopReason: 'max_rounds_reached',
      sessionID: coordinatorSessionID,
      coordinatorSessionId: coordinatorSessionID,
      trace,
    }
  } finally {
    manager.archiveAndDestroy()
  }
}

function normalizeMaxRounds(requested: number): { rounds: number; warning?: string } {
  const DEFAULT = 1, MAX_CEILING = 10
  if (requested < 1) return { rounds: DEFAULT, warning: `maxRounds=${requested} < 1, reset to ${DEFAULT}` }
  if (requested > MAX_CEILING) return { rounds: MAX_CEILING, warning: `maxRounds=${requested} > ${MAX_CEILING}, clamped to ${MAX_CEILING}` }
  return { rounds: requested }
}

function normalizeMaxCyclesPerRound(requested: number | undefined): { cycles: number; warning?: string } {
  const DEFAULT = 5, MAX_CEILING = 5
  if (requested === undefined) return { cycles: DEFAULT }
  if (requested < 1) return { cycles: DEFAULT, warning: `maxCyclesPerRound=${requested} < 1, reset to ${DEFAULT}` }
  if (requested > MAX_CEILING) return { cycles: MAX_CEILING, warning: `maxCyclesPerRound=${requested} > ${MAX_CEILING}, clamped to ${MAX_CEILING}` }
  return { cycles: requested }
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
    'Judge the implementation ONLY against the design document summary below.',
    'DO NOT propose new features or requirements. ONLY evaluate whether the implementation matches the design document.',
    'If the design doc is silent on an issue, mark it as design_ambiguity, not as a bug.',
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
    '- blocking_bug: implementation is clearly broken or unsafe relative to the design.',
    '- spec_violation: implementation contradicts an explicit design statement.',
    '- regression_risk: likely to break documented behavior or compatibility.',
    '- test_gap: missing validation for documented behavior but not proven broken.',
    '- design_ambiguity: design doc is unclear or incomplete for the observed case.',
    '- style_or_preference: purely stylistic or optional preference.',
    '',
    '## Required Output Format',
    'Repeat the following block once per finding:',
    'Level: <one of the six levels>',
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
    'Fix ONLY the issues listed above. Do NOT refactor, do NOT add new features, do NOT modify files outside the listed scope.',
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

function groupFinalFindingStates(rounds: HardenRoundResult[]): Record<FindingsFinalStateGroup, HardenFindingFinalState[]> {
  const groups: Record<FindingsFinalStateGroup, HardenFindingFinalState[]> = {
    resolved_findings: [],
    rejected_findings: [],
    unresolved_must_fix: [],
    unresolved_needs_decision: [],
  }
  const seen = new Set<string>()

  for (const round of rounds) {
    for (const finding of round.findings) {
      const finalFinding = finding as HardenFindingFinalState
      if (!finalFinding.executorVerdict || !finalFinding.finalStateGroup) continue

      const key = findingKey(finalFinding)
      if (seen.has(key)) continue
      seen.add(key)
      groups[finalFinding.finalStateGroup].push(finalFinding)
    }
  }

  return groups
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
  if (group === 'unresolved_needs_decision') return 'needs_decision'
  return 'must_fix'
}

function defaultStatusForGroup(group: FindingsFinalStateGroup): HardenFindingStatus {
  if (group === 'resolved_findings') return 'fixed'
  if (group === 'rejected_findings') return 'dismissed'
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

export async function runAgentTask(
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
  const coordinatorSessionBlock = result.coordinatorSessionId
    ? `\nCoordinator session: ${escapeMarkdown(result.coordinatorSessionId)}`
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
Summary: ${escapeMarkdown(result.summary)}${sessionBlock}${coordinatorSessionBlock}${traceBlock}${roundBlocks}${finalStateBlock}`
}

function toProjectRelativePath(projectDir: string, filePath: string): string {
  const relativePath = path.relative(projectDir, filePath)
  return (relativePath || filePath).replace(/\\/g, '/')
}
