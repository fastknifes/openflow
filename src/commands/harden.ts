import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execSync } from 'node:child_process'
import { getDesignCandidatePaths, getPlanPath } from '../config.js'
import { fileExists } from '../hooks/file-utils.js'
import type {
  HardenFinding,
  HardenResult,
  HardenRoundResult,
  OpenFlowContext,
} from '../types.js'
import { classifyFindings, compressInput, gradeComplexity } from '../utils/harden-utils.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { findActiveFeature } from '../utils/feature-resolver.js'

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
  const diffStr = readGitDiff(ctx.directory)
  const complexity = gradeComplexity(planContent, diffStr)
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
    const reviewerPrompt = buildReviewerPrompt(planSummary, diffStr)
    const review = await runAgentTask(
      ctx,
      'oracle',
      'Harden reviewer round 1',
      reviewerPrompt,
      activeModels.reviewerModel,
      currentSessionID,
    )
    const grouped = classifyFindings(review.text, designLookup.paths)
    const findings = [...grouped.actionable, ...grouped.ambiguous, ...grouped.nonBlocking]
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
    })
  }

  const result = await runAdversarialLoop(
    ctx,
    planSummary,
    designLookup.content,
    diffStr,
    {
      maxRounds: args?.maxRounds ?? ctx.config.harden.maxRounds,
      tokenBudget: ctx.config.harden.tokenBudgetTotal,
      mode: args?.mode ?? 'standard',
    },
    currentSessionID,
  )

  return formatHardenResult(result)
}

async function runAdversarialLoop(
  ctx: OpenFlowContext,
  planSummary: string,
  designContent: string,
  diffStr: string,
  args: { maxRounds: number; tokenBudget: number; mode: string },
  parentSessionID?: string,
): Promise<HardenResult> {
  const rounds: HardenRoundResult[] = []
  const findingCounts = new Map<string, number>()
  let budgetConsumed = 0
  let priorFindings: HardenFinding[] = []
  let fixReport = ''
  let nonBlockingRounds = 0
  let rollingDiff = compressInput(diffStr, 24000)
  const reviewContext = compressInput(buildPlanSummary(planSummary, designContent), 16000)

  for (let round = 1; round <= args.maxRounds; round++) {
    if (budgetConsumed >= args.tokenBudget) {
      return {
        status: 'budget_exhausted',
        rounds,
        budgetConsumed,
        summary: `token budget exhausted after ${rounds.length} round(s) in ${args.mode} mode.`,
      }
    }

    const reviewerPrompt = buildReviewerPrompt(reviewContext, rollingDiff, priorFindings, fixReport)
    const review = await runAgentTask(
      ctx,
      'oracle',
      `Harden reviewer round ${round}`,
      reviewerPrompt,
      activeModels.reviewerModel,
      parentSessionID,
    )
    budgetConsumed += review.tokens

    const grouped = classifyFindings(review.text, [])
    const findings = [...grouped.actionable, ...grouped.ambiguous, ...grouped.nonBlocking]

    if (grouped.ambiguous.length > 0) {
      rounds.push({ round, findings })
      return {
        status: 'needs_human',
        rounds,
        budgetConsumed,
        summary: `reviewer reported ${grouped.ambiguous.length} design ambiguity finding(s) in round ${round}.`,
      }
    }

    if (grouped.actionable.length === 0 && grouped.ambiguous.length === 0 && grouped.nonBlocking.length === 0) {
      rounds.push({ round, findings: [] })
      return {
        status: 'pass',
        rounds,
        budgetConsumed,
        summary: `reviewer found no actionable issues after ${round} round(s).`,
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
        }
      }

      priorFindings = findings
      fixReport = 'No blocking fixes applied; reviewer reported only non-blocking issues.'
      rollingDiff = compressInput(`${rollingDiff}\n\n${review.text}`, 24000)
      continue
    }

    nonBlockingRounds = 0
    const actionableFindings = grouped.actionable
    for (const finding of actionableFindings) {
      const key = normalizeFinding(finding)
      findingCounts.set(key, (findingCounts.get(key) ?? 0) + 1)
      if ((findingCounts.get(key) ?? 0) >= 2) {
        rounds.push({ round, findings })
        return {
          status: 'needs_human',
          rounds,
          budgetConsumed,
          summary: `same finding repeated at least twice by round ${round}; human intervention required.`,
        }
      }
    }

    const filePaths = collectScopedFilePaths(actionableFindings, rollingDiff)
    const executorPrompt = buildExecutorPrompt(actionableFindings, reviewContext, filePaths)
    const execution = await runAgentTask(
      ctx,
      'deep',
      `Harden executor round ${round}`,
      executorPrompt,
      activeModels.executorModel,
      parentSessionID,
    )
    budgetConsumed += execution.tokens

    if (containsExecutorFailureSignal(execution.text)) {
      rounds.push({ round, findings, fixReport: execution.text })
      return {
        status: 'needs_human',
        rounds,
        budgetConsumed,
        summary: `executor reported a blocking failure in round ${round}.`,
      }
    }

    rounds.push({ round, findings, fixReport: execution.text })
    priorFindings = findings
    fixReport = execution.text
    rollingDiff = compressInput(`${rollingDiff}\n\nLatest fix report:\n${execution.text}`, 24000)
  }

  return {
    status: 'max_rounds_reached',
    rounds,
    budgetConsumed,
    summary: `maximum rounds reached (${args.maxRounds}) without convergence.`,
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

async function runAgentTask(
  ctx: OpenFlowContext,
  agent: 'oracle' | 'deep',
  description: string,
  prompt: string,
  model?: string,
  parentSessionID?: string,
): Promise<AgentRunResult> {
  const client = getSessionClient(ctx)
  const createBody: Record<string, unknown> = { title: description }
  if (parentSessionID) {
    createBody.parentID = parentSessionID
  }
  const created = await client.session.create({
    query: { directory: ctx.directory },
    body: createBody,
  })
  const sessionID = extractSessionID(created)
  const promptPayload = buildPromptPayload(sessionID, description, prompt, agent, model, ctx.directory)
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
  description: string,
  prompt: string,
  agent: 'oracle' | 'deep',
  model: string | undefined,
  directory: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    agent,
    parts: [{ type: 'text', text: `${buildTaskInvocation(agent, description, prompt)}\n\n${prompt}` }],
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

function buildTaskInvocation(agent: 'oracle' | 'deep', description: string, prompt: string): string {
  if (agent === 'oracle') {
    return `task(subagent_type="oracle", load_skills=[], description=${JSON.stringify(description)}, prompt=${JSON.stringify(prompt)}, run_in_background=false)`
  }

  return `task(category="deep", load_skills=[], description=${JSON.stringify(description)}, prompt=${JSON.stringify(prompt)}, run_in_background=false)`
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

function normalizeFinding(finding: HardenFinding): string {
  return [
    finding.level,
    finding.description.trim().toLowerCase(),
    [...finding.files].sort().join(','),
  ].join('|')
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
  const paths = new Set<string>()
  for (const line of diffStr.split('\n')) {
    const match = line.match(/^\+\+\+ b\/(.+)$/u) ?? line.match(/^diff --git a\/.+ b\/(.+)$/u)
    if (match?.[1]) {
      paths.add(match[1])
    }
  }
  return [...paths]
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

function formatHardenResult(result: HardenResult): string {
  return `## Harden Result

Status: ${result.status}
Rounds: ${result.rounds.length}
Budget consumed: ${result.budgetConsumed}
Summary: ${escapeMarkdown(result.summary)}`
}

function toProjectRelativePath(projectDir: string, filePath: string): string {
  const relativePath = path.relative(projectDir, filePath)
  return (relativePath || filePath).replace(/\\/g, '/')
}
