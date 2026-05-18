import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { getDesignCandidatePaths, getPlanPath } from '../config.js'
import { fileExists } from '../hooks/file-utils.js'
import type {
  HardenFinding,
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
}

let activeModels: { reviewerModel?: string; executorModel?: string } = {}

export async function handleHarden(
  ctx: OpenFlowContext,
  feature?: string,
  args?: { full?: boolean; mode?: string; maxRounds?: number; reviewerModel?: string; executorModel?: string },
  sessionID?: string,
): Promise<string> {
  if (!ctx.config.harden.enabled) {
    return `## Harden Result

Status: rejected
Rounds: 0
Budget consumed: 0
Summary: harden is disabled in OpenFlow configuration.`
  }

  const featureFromArgs = extractFeatureArg(args)
  const resolvedFeature = feature?.trim() || featureFromArgs || await findActiveFeature(ctx)

  if (!resolvedFeature) {
    return `## Harden Result

Status: rejected
Rounds: 0
Budget consumed: 0
Summary: no feature was provided and no active plan was found under .sisyphus/plans/.`
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const planPath = getPlanPath(ctx.directory, sanitizedFeature)
  const planExists = await fileExists(planPath)

  if (!planExists) {
    return `## Harden Result

Status: rejected
Rounds: 0
Budget consumed: 0
Summary: missing plan file \

\`${escapeMarkdown(toProjectRelativePath(ctx.directory, planPath))}\`.`
  }

  const planContent = await fs.readFile(planPath, 'utf-8')
  const designLookup = await readDesignDocument(ctx, sanitizedFeature)
  const fullDiffStr = readGitDiff(ctx.directory)
  const diffScope = args?.full
    ? { diff: fullDiffStr, omittedPaths: [] }
    : scopeDiffToFeature(ctx.directory, sanitizedFeature, fullDiffStr, planPath, designLookup.paths, planContent, designLookup.content)
  const diffStr = diffScope.diff
  const reviewerDiffStr = diffScope.omittedPaths.length > 0
    ? appendOmittedDiffManifest(diffStr, diffScope.omittedPaths)
    : diffStr
  const complexity = gradeComplexity(planContent, reviewerDiffStr)
  const planSummary = compressInput(buildPlanSummary(planContent, designLookup.content), 12000)

  const currentSessionID = sessionID
  const nextModels: { reviewerModel?: string; executorModel?: string } = {}
  const reviewerModel = args?.reviewerModel ?? ctx.config.harden.reviewerModel
  const executorModel = args?.executorModel ?? ctx.config.harden.executorModel
  if (reviewerModel) nextModels.reviewerModel = reviewerModel
  if (executorModel) nextModels.executorModel = executorModel
  activeModels = nextModels

  if (complexity === 'trivial' && !args?.full) {
    return `## Harden Result

Status: rejected
Rounds: 0
Budget consumed: 0
Summary: feature too simple for harden (${escapeMarkdown(sanitizedFeature)}); complexity graded as trivial.`
  }

  if (complexity === 'simple' && !args?.full) {
    const hardenSessionID = await createHardenSession(ctx, sanitizedFeature, currentSessionID)
    const reviewerPrompt = buildReviewerPrompt(planSummary, reviewerDiffStr)
    const trace: FormattedHardenTraceEntry[] = []
    const review = await runAgentTask(
      ctx,
      hardenSessionID,
      'oracle',
      reviewerPrompt,
      activeModels.reviewerModel,
    )
    const grouped = classifyFindings(review.text, designLookup.paths)
    const findings = [...grouped.actionable, ...grouped.ambiguous, ...grouped.nonBlocking]
    trace.push(buildTraceEntry(1, 'oracle', review, inferReviewerStopReasonCandidate(grouped)))
    const status = grouped.ambiguous.length > 0
      ? 'needs_human'
      : grouped.actionable.length > 0
        ? 'needs_human'
        : findings.length > 0
          ? 'pass_with_risks'
          : 'pass'

    return formatHardenResult({
      status,
      rounds: [{ round: 1, findings }],
      budgetConsumed: review.tokens,
      summary: summarizeReviewOutcome(findings, grouped.actionable.length, grouped.ambiguous.length, grouped.nonBlocking.length),
      stopReason: grouped.ambiguous.length > 0
        ? 'review_inconclusive'
        : grouped.actionable.length > 0
          ? 'actionable_findings'
          : findings.length > 0
            ? 'non_blocking_only'
            : 'no_findings',
      sessionID: hardenSessionID,
      trace,
    })
  }

  const hardenSessionID = await createHardenSession(ctx, sanitizedFeature, currentSessionID)
  const diffScopeContext: DiffScopeContext = {
    directory: ctx.directory,
    sanitizedFeature,
    planPath,
    designPaths: designLookup.paths,
    planContent,
    designContent: designLookup.content,
    full: Boolean(args?.full),
  }

  const result = await runAdversarialLoop(
    ctx,
    planSummary,
    diffScopeContext,
    {
      maxRounds: args?.maxRounds ?? ctx.config.harden.maxRounds,
      tokenBudget: ctx.config.harden.tokenBudgetTotal,
      tokenBudgetPerRound: ctx.config.harden.tokenBudgetPerRound,
      mode: args?.mode ?? 'standard',
    },
    hardenSessionID,
  )

  return formatHardenResult(result)
}

async function runAdversarialLoop(
  ctx: OpenFlowContext,
  planSummary: string,
  diffScopeContext: DiffScopeContext,
  args: { maxRounds: number; tokenBudget: number; tokenBudgetPerRound: number; mode: string },
  sessionID: string,
): Promise<FormattedHardenResult> {
  const rounds: HardenRoundResult[] = []
  const trace: FormattedHardenTraceEntry[] = []
  const findingCounts = new Map<string, number>()
  let budgetConsumed = 0
  let priorFindings: HardenFinding[] = []
  let fixReport = ''
  let nonBlockingRounds = 0
  const reviewContext = compressInput(planSummary, 16000)

  for (let round = 1; round <= args.maxRounds; round++) {
    if (budgetConsumed >= args.tokenBudget) {
      return {
        status: 'budget_exhausted',
        rounds,
        budgetConsumed,
        summary: `token budget exhausted after ${rounds.length} round(s) in ${args.mode} mode.`,
        stopReason: 'budget_exhausted',
        sessionID,
        trace,
      }
    }

    const freshScopedDiff = readScopedReviewerDiff(diffScopeContext)
    const rollingDiff = compressInput(freshScopedDiff.reviewerDiff, 24000)
    const reviewerPrompt = buildReviewerPrompt(reviewContext, rollingDiff, priorFindings, fixReport)
    const review = await runAgentTask(
      ctx,
      sessionID,
      'oracle',
      reviewerPrompt,
      activeModels.reviewerModel,
    )
    budgetConsumed += review.tokens

    const grouped = classifyFindings(review.text, [])
    const findings = [...grouped.actionable, ...grouped.ambiguous, ...grouped.nonBlocking]
    trace.push(buildTraceEntry(round, 'oracle', review, inferReviewerStopReasonCandidate(grouped)))

    if (review.tokens > args.tokenBudgetPerRound) {
      rounds.push({ round, findings })
      return {
        status: 'budget_exhausted',
        rounds,
        budgetConsumed,
        summary: `reviewer consumed ${review.tokens} tokens in round ${round}, exceeding per-round budget of ${args.tokenBudgetPerRound}.`,
        stopReason: 'budget_exhausted',
        sessionID,
        trace,
      }
    }

    if (grouped.ambiguous.length > 0) {
      rounds.push({ round, findings })
      return {
        status: 'needs_human',
        rounds,
        budgetConsumed,
        summary: `reviewer reported ${grouped.ambiguous.length} design ambiguity finding(s) in round ${round}.`,
        stopReason: 'review_inconclusive',
        sessionID,
        trace,
      }
    }

    if (grouped.actionable.length === 0 && grouped.ambiguous.length === 0 && grouped.nonBlocking.length === 0) {
      rounds.push({ round, findings: [] })
      return {
        status: 'pass',
        rounds,
        budgetConsumed,
        summary: `reviewer found no actionable issues after ${round} round(s).`,
        stopReason: 'no_findings',
        sessionID,
        trace,
      }
    }

    if (grouped.actionable.length === 0) {
      nonBlockingRounds += 1
      rounds.push({ round, findings })

      if (nonBlockingRounds >= 2) {
        return {
          status: 'pass_with_risks',
          rounds,
          budgetConsumed,
          summary: 'two consecutive rounds reported only non-blocking or design-ambiguity findings.',
          stopReason: 'non_blocking_only',
          sessionID,
          trace,
        }
      }

      priorFindings = findings
      fixReport = 'No blocking fixes applied; reviewer reported only non-blocking issues.'
      continue
    }

    nonBlockingRounds = 0
    const actionableFindings = grouped.actionable
    const currentFindingKeys = [...new Set(actionableFindings.map(finding => normalizeFinding(finding)))]
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

    const filePaths = collectScopedFilePaths(actionableFindings, freshScopedDiff.diff)
    const beforeDiffSnapshot = readGitDiff(ctx.directory)
    const beforeHash = computeDiffHash(beforeDiffSnapshot)
    const beforeFiles = computeChangedFilesSet(beforeDiffSnapshot)
    const executorPrompt = buildExecutorPrompt(actionableFindings, reviewContext, filePaths)
    const execution = await runAgentTask(
      ctx,
      sessionID,
      'deep',
      executorPrompt,
      activeModels.executorModel,
    )
    budgetConsumed += execution.tokens
    trace.push(buildTraceEntry(round, 'deep', execution, containsExecutorFailureSignal(execution.text) ? 'executor_failure_signal' : 'fix_applied'))
    const afterDiffSnapshot = readGitDiff(ctx.directory)
    const afterHash = computeDiffHash(afterDiffSnapshot)
    const afterFiles = computeChangedFilesSet(afterDiffSnapshot)
    const materialChange = hasMaterialChange(beforeHash, afterHash, beforeFiles, afterFiles)

    if (execution.tokens > args.tokenBudgetPerRound) {
      rounds.push({ round, findings, fixReport: execution.text })
      return {
        status: 'budget_exhausted',
        rounds,
        budgetConsumed,
        summary: `executor consumed ${execution.tokens} tokens in round ${round}, exceeding per-round budget of ${args.tokenBudgetPerRound}.`,
        stopReason: 'budget_exhausted',
        sessionID,
        trace,
      }
    }

    if (containsExecutorFailureSignal(execution.text)) {
      rounds.push({ round, findings, fixReport: execution.text })
      if (!materialChange) {
        return {
          status: 'executor_blocked',
          rounds,
          budgetConsumed,
          summary: `executor reported a blocking failure in round ${round} without producing a material change.`,
          stopReason: 'executor_blocked',
          sessionID,
          trace,
        }
      }

      return {
        status: 'needs_human',
        rounds,
        budgetConsumed,
        summary: `executor reported a blocking failure in round ${round}.`,
        stopReason: 'executor_failure_signal',
        sessionID,
        trace,
      }
    }

    if (repeatedKeys.length > 0 && !materialChange) {
      rounds.push({ round, findings, fixReport: execution.text })
      return {
        status: 'review_inconclusive',
        rounds,
        budgetConsumed,
        summary: `same finding repeated at least twice by round ${round} and executor produced no material change.`,
        stopReason: 'repeated_finding_no_material_fix',
        sessionID,
        trace,
      }
    }

    rounds.push({ round, findings, fixReport: execution.text })
    priorFindings = findings
    fixReport = execution.text
  }

  return {
    status: 'max_rounds_reached',
    rounds,
    budgetConsumed,
    summary: `maximum rounds reached (${args.maxRounds}) without convergence.`,
    stopReason: 'max_rounds_reached',
    sessionID,
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
  feature: string,
  parentSessionID?: string,
): Promise<string> {
  const client = getSessionClient(ctx)
  const createBody: Record<string, unknown> = { title: `Harden: ${feature}` }
  if (parentSessionID) {
    createBody.parentID = parentSessionID
  }
  const created = await client.session.create({
    query: { directory: ctx.directory },
    body: createBody,
  })
  return extractSessionID(created)
}

async function runAgentTask(
  ctx: OpenFlowContext,
  sessionID: string,
  agent: 'oracle' | 'deep',
  prompt: string,
  model?: string,
): Promise<AgentRunResult> {
  const client = getSessionClient(ctx)
  const promptPayload = buildPromptPayload(sessionID, prompt, agent, model, ctx.directory)
  const response = await client.session.prompt(promptPayload)

  return {
    text: extractText(response),
    tokens: extractTokens(response),
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
  prompt: string,
  agent: 'oracle' | 'deep',
  model: string | undefined,
  directory: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    agent,
    parts: [{ type: 'text', text: prompt }],
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

  return `## Harden Result

Status: ${result.status}
Stop reason: ${escapeMarkdown(result.stopReason ?? 'unknown')}
Rounds: ${result.rounds.length}
Budget consumed: ${result.budgetConsumed}
Summary: ${escapeMarkdown(result.summary)}${sessionBlock}${traceBlock}${roundBlocks}`
}

function toProjectRelativePath(projectDir: string, filePath: string): string {
  const relativePath = path.relative(projectDir, filePath)
  return (relativePath || filePath).replace(/\\/g, '/')
}
