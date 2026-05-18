import { execSync } from 'node:child_process'
import { statSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import type { CurrentWorkspaceState, HardenFinding, HardenResult, HardenStatus, OpenFlowContext, QualityGateContextKind } from '../types.js'
import { VerifyReadinessStatus } from '../types.js'
import type { EvidenceFreshnessResult, VerifyResult } from '../types.js'
import { handleHarden } from './harden.js'
import { handleVerify } from './verify.js'
import { getPlanPath } from '../config.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { loadAcceptanceState, saveAcceptanceState } from '../utils/acceptance-state.js'
import { decideQualityGateRisk, type QualityGateRiskInput } from '../utils/risk-assessment.js'
import { captureCurrentWorkspaceState, classifyEvidenceFreshness } from '../utils/evidence-freshness.js'
import { buildMinimalSummary } from '../utils/harden-ledger.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { detectMode } from '../utils/issue-utils.js'
import { collectFeatureScope, filterPathsToFeatureScope, scopeDiffToFeature } from '../utils/diff-scope.js'

export interface QualityGateArgs {
  /** Optional feature name override */
  feature?: string
  /** Optional session ID for feature resolution */
  sessionID?: string
}

/**
 * Internal dependency injection point for testing call order.
 * When undefined, the real handleHarden/handleVerify are used.
 */
interface InternalOptions {
  /** Inject harden for test assertions on call order */
  overrideHarden?: (
    ctx: OpenFlowContext,
    feature?: string,
    sessionID?: string,
  ) => Promise<string>
  /** Inject verify for test assertions on call order */
  overrideVerify?: (
    ctx: OpenFlowContext,
    feature?: string,
    acceptFailures?: boolean,
    sessionID?: string,
  ) => Promise<string>
}

interface HardenFindingSummary {
  id: string
  disposition: string
  status: string
  level: string
  files: string
  raw: string
  fields: Record<string, string>
}

interface AcceptedKnownIssueSummary {
  findingId: string
  disposition: 'accepted_known_issue' | 'design_divergence'
  rationale: string
  archiveEffect: 'non_blocking' | 'doc_update_required' | 'decision_required'
  evidenceRefs: string[]
  verifyStatus: string
}

interface HardenReadinessGateResult {
  readiness: string
  blocker: VerifyReadinessStatus | null
  knownIssues: HardenFindingSummary[]
  blockingFindings: string[]
  findings: HardenFindingSummary[]
}

/**
 * Quality gate orchestrator — invoked by AI after code implementation or bug fixes.
 *
 * Resolves context, assesses risk, runs harden only when required,
 * runs evidence-aware verify, and outputs a readiness report.
 *
 * When no feature, plan, or semantic context is available, the gate
 * downgrades to limited-context mode but still runs verify.
 */
export async function handleQualityGate(
  ctx: OpenFlowContext,
  args?: QualityGateArgs,
  internalOpts?: InternalOptions,
): Promise<string> {
  const featureArg = args?.feature?.trim()
  const sessionID = args?.sessionID

  // ── 1. Resolve feature ──────────────────────────────────────────────────
  let resolvedFeature = featureArg || await findActiveFeature(ctx)
  let sanitizedFeature = resolvedFeature ? sanitizeFeatureName(resolvedFeature) : undefined

  // Fallback: try acceptance state
  if (!sanitizedFeature) {
    const acceptanceState = await loadAcceptanceState(ctx.directory)
    if (acceptanceState?.feature) {
      sanitizedFeature = sanitizeFeatureName(acceptanceState.feature)
      resolvedFeature = acceptanceState.feature
    }
  }

  // ── 2. Determine context kind ───────────────────────────────────────────
  const contextKind = await resolveContextKind(ctx, sanitizedFeature)
  const limitedContext = contextKind === 'limited' || contextKind === 'none'

  // ── 3. Capture workspace state (tracked diff + untracked files) ─────────
  const fullDiffText = readGitDiff(ctx.directory)
  const allUntrackedFiles = readGitUntracked(ctx.directory)
  const scopedWorkspace = await scopeQualityGateWorkspace(
    ctx.directory,
    sanitizedFeature,
    contextKind,
    fullDiffText,
    allUntrackedFiles,
  )
  const diffText = scopedWorkspace.diffText
  const untrackedFiles = scopedWorkspace.untrackedFiles
  const diffFiles = extractDiffFiles(diffText)
  // Merge tracked and untracked — both affect risk
  const changedFiles = [...new Set([...diffFiles, ...untrackedFiles])].sort()
  const diffLines = countDiffLines(diffText) + untrackedFiles.length * 3 // rough estimate for untracked
  const hasNewExports = detectNewExports(diffText)

  // ── 4. Risk assessment ──────────────────────────────────────────────────
  const riskInput: QualityGateRiskInput = diffText
    ? { files: changedFiles, diffLines, hasNewExports, diffText }
    : { files: changedFiles, diffLines, hasNewExports }

  const riskResult = decideQualityGateRisk(riskInput)

  // ── 5. Evidence freshness check ─────────────────────────────────────────
  const acceptanceState = await loadAcceptanceState(ctx.directory)
  const workspaceState = buildScopedWorkspaceState(
    ctx.directory,
    captureCurrentWorkspaceState(ctx.directory),
    changedFiles,
    scopedWorkspace.scoped,
  )
  const freshnessResult = classifyEvidenceFreshness(acceptanceState, workspaceState)

  // ── 6. Harden decision ──────────────────────────────────────────────────
  let hardenOutput = ''
  let hardenStatus: string | undefined
  let hardenDecision: 'none' | 'risk-based' | 'final' = 'none'

  if (riskResult.shouldHarden && ctx.config.harden.enabled) {
    hardenDecision = 'risk-based'
    try {
      if (internalOpts?.overrideHarden) {
        hardenOutput = await internalOpts.overrideHarden(ctx, sanitizedFeature, sessionID)
      } else {
        hardenOutput = await handleHarden(ctx, sanitizedFeature, undefined, sessionID)
      }
      hardenStatus = extractHardenStatus(hardenOutput)
    } catch (err) {
      hardenStatus = 'error'
      hardenOutput = `Harden execution failed: ${err instanceof Error ? err.message : String(err)}`
    }
  } else if (!riskResult.shouldHarden) {
    hardenDecision = 'none'
    hardenStatus = 'skipped'
  } else {
    hardenDecision = 'none'
    hardenStatus = 'disabled'
  }

  // ── 7. Evidence-aware verify ────────────────────────────────────────────
  let verifyOutput = ''
  try {
    if (internalOpts?.overrideVerify) {
      // Preserve accepted failures for mock verify too; stale-evidence re-verify
      // should not silently clear a previous --accept-failures decision.
      const mockAcceptFailures = acceptanceState?.acceptedFailures === true ? true : undefined
      verifyOutput = await internalOpts.overrideVerify(ctx, sanitizedFeature, mockAcceptFailures, sessionID)
    } else if (freshnessResult.status === 'fresh' && acceptanceState?.verifyResult) {
      verifyOutput = buildVerifyOutputFromResult(acceptanceState.verifyResult, sanitizedFeature)
    } else {
      // Preserve accepted failures from a previous explicit --accept-failures
      // run so that stale-evidence re-verify does not silently clear them.
      const preserveAccepted = acceptanceState?.acceptedFailures === true ? true : undefined
      verifyOutput = await handleVerify(ctx, sanitizedFeature, preserveAccepted, undefined, sessionID)
    }
  } catch (err) {
    verifyOutput = `## Verify\n\nError: verify execution failed: ${err instanceof Error ? err.message : String(err)}`
  }

  // ── 8. Extract readiness from verify output ─────────────────────────────
  const hardenGate = applyHardenReadinessGate(extractReadinessFromOutput(verifyOutput), hardenStatus, hardenOutput)
  const readiness = hardenGate.readiness
  const verifyContent = stripOpenFlowHeader(verifyOutput)

  if (acceptanceState && hardenOutput.trim()) {
    acceptanceState.hardenSummary = buildHardenSummaryForAcceptanceState(hardenStatus, hardenOutput, hardenGate.findings, readiness)
    await saveAcceptanceState(ctx.directory, acceptanceState)
  }

  // ── 9. Build markdown report ────────────────────────────────────────────
  return buildQualityGateReport({
    feature: sanitizedFeature || '(unresolved)',
    contextKind,
    limitedContext,
    riskResult,
    hardenDecision,
    hardenStatus,
    hardenOutput,
    readiness,
    hardenReadinessBlocker: getHardenReadinessBlocker(hardenStatus, hardenOutput),
    knownIssues: hardenGate.knownIssues,
    blockingFindings: hardenGate.blockingFindings,
    verifyContent,
    freshnessResult,
    changedFiles,
    omittedFiles: scopedWorkspace.omittedFiles,
    diffLines,
  })
}

// ── Git helpers ────────────────────────────────────────────────────────────

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

/** Returns untracked, non-ignored files visible to git */
function readGitUntracked(cwd: string): string[] {
  try {
    return execSync('git ls-files --others --exclude-standard', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function extractDiffFiles(diffText: string): string[] {
  const files = new Set<string>()
  for (const line of diffText.split('\n')) {
    const match = line.match(/^\+\+\+ b\/(.+)$/u) ?? line.match(/^diff --git a\/.+ b\/(.+)$/u)
    if (match?.[1]) {
      files.add(match[1])
    }
  }
  return [...files].sort()
}

function countDiffLines(diffText: string): number {
  let count = 0
  for (const line of diffText.split('\n')) {
    if (/^[+-](?!\+\+|--)/u.test(line)) {
      count++
    }
  }
  return count
}

function detectNewExports(diffText: string): boolean {
  return /^\+\s*(export\s+(const|let|var|function|class|interface|type|enum|default)\s+)/um.test(diffText)
}

interface QualityGateScopedWorkspace {
  diffText: string
  untrackedFiles: string[]
  omittedFiles: string[]
  scoped: boolean
}

async function scopeQualityGateWorkspace(
  projectDir: string,
  feature: string | undefined,
  contextKind: QualityGateContextKind,
  fullDiffText: string,
  allUntrackedFiles: string[],
): Promise<QualityGateScopedWorkspace> {
  if (!feature || contextKind === 'limited' || contextKind === 'none') {
    return {
      diffText: fullDiffText,
      untrackedFiles: allUntrackedFiles,
      omittedFiles: [],
      scoped: false,
    }
  }

  const planPath = getPlanPath(projectDir, feature)
  const planContent = await readOptionalFile(planPath)
  const contextPaths = await findQualityGateContextPaths(projectDir, feature)
  const contextContent = await readExistingFiles(contextPaths)

  if (!planContent.trim() && !contextContent.trim()) {
    return {
      diffText: fullDiffText,
      untrackedFiles: allUntrackedFiles,
      omittedFiles: [],
      scoped: false,
    }
  }

  const diffScope = scopeDiffToFeature(projectDir, feature, fullDiffText, planPath, contextPaths, planContent, contextContent)
  const featureScope = collectFeatureScope(projectDir, feature, planPath, contextPaths, planContent, contextContent)
  const untrackedScope = filterPathsToFeatureScope(allUntrackedFiles, featureScope)
  const omittedFiles = [...new Set([...diffScope.omittedPaths, ...untrackedScope.omittedPaths])].sort()

  return {
    diffText: diffScope.diff,
    untrackedFiles: untrackedScope.scopedPaths,
    omittedFiles,
    scoped: diffScope.omittedPaths.length > 0 || untrackedScope.omittedPaths.length > 0,
  }
}

async function findQualityGateContextPaths(projectDir: string, feature: string): Promise<string[]> {
  const candidates = [
    join(projectDir, 'docs', 'changes', feature, 'design.md'),
    join(projectDir, 'docs', 'changes', feature, 'issue-clarification.md'),
    ...(await tryGetChangeDirPatterns(projectDir, feature)),
    ...(await tryGetChangeUnitContextPaths(projectDir, feature)),
  ]
  const existing: string[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue
    seen.add(candidate)
    try {
      await fs.access(candidate)
      existing.push(candidate)
    } catch { /* not found */ }
  }

  return existing
}

async function tryGetChangeUnitContextPaths(projectDir: string, feature: string): Promise<string[]> {
  try {
    const changesDir = join(projectDir, 'docs', 'changes')
    const dirs = await fs.readdir(changesDir)
    const fileNames = ['design.md', 'issue-clarification.md', 'requirements.md', 'behavior.md', 'plan.md']
    return dirs
      .filter(d => d.includes(feature))
      .flatMap(d => fileNames.map(fileName => join(projectDir, 'docs', 'changes', d, fileName)))
  } catch {
    return []
  }
}

async function readExistingFiles(filePaths: string[]): Promise<string> {
  const parts: string[] = []
  for (const filePath of filePaths) {
    const content = await readOptionalFile(filePath)
    if (content.trim()) parts.push(content)
  }
  return parts.join('\n\n')
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return ''
  }
}

function buildScopedWorkspaceState(
  projectDir: string,
  fullState: CurrentWorkspaceState,
  changedFiles: string[],
  scoped: boolean,
): CurrentWorkspaceState {
  if (!scoped) return fullState

  const result: CurrentWorkspaceState = {
    gitHead: fullState.gitHead,
    changedFiles: [...changedFiles].sort(),
  }
  const latestChangeTimestamp = findLatestChangeTimestamp(projectDir, changedFiles)
  if (latestChangeTimestamp !== undefined) {
    result.latestChangeTimestamp = latestChangeTimestamp
  }
  return result
}

function findLatestChangeTimestamp(projectDir: string, changedFiles: string[]): number | undefined {
  let latestChangeTimestamp: number | undefined
  for (const file of changedFiles) {
    try {
      const filePath = join(projectDir, file)
      const mtimeMs = statSync(filePath).mtimeMs
      if (latestChangeTimestamp === undefined || mtimeMs > latestChangeTimestamp) {
        latestChangeTimestamp = mtimeMs
      }
    } catch {
      // File may not exist (deleted in working tree) — skip
    }
  }
  return latestChangeTimestamp
}

// ── Context resolution ─────────────────────────────────────────────────────

async function resolveContextKind(
  ctx: OpenFlowContext,
  feature?: string,
): Promise<QualityGateContextKind> {
  if (!feature) return 'none'

  const projectDir = ctx.directory

  // Check for feature-mode design docs — all paths relative to project root
  const directDesignPath = join(projectDir, 'docs', 'changes', feature, 'design.md')
  const designCandidatePaths = [directDesignPath, ...(await tryGetChangeDirPatterns(projectDir, feature))]

  let designExists = false
  let issueExists = false

  for (const p of designCandidatePaths) {
    try {
      await fs.access(p)
      designExists = true
      break
    } catch { /* not found */ }
  }

  // Check for issue mode
  try {
    const mode = await detectMode(ctx, feature)
    if (mode === 'issue') {
      issueExists = true
    }
  } catch { /* ignore */ }

  if (designExists) return 'feature'
  if (issueExists) return 'issue'

  // Check for plan file — project-root safe
  try {
    await fs.access(join(projectDir, '.sisyphus', 'plans', `${feature}.md`))
    return 'plan'
  } catch { /* not found */ }

  return 'limited'
}

async function tryGetChangeDirPatterns(projectDir: string, feature: string): Promise<string[]> {
  try {
    const changesDir = join(projectDir, 'docs', 'changes')
    const dirs = await fs.readdir(changesDir)
    return dirs
      .filter(d => d.includes(feature))
      .map(d => join(projectDir, 'docs', 'changes', d, 'design.md'))
  } catch {
    return []
  }
}

// ── Output parsing ─────────────────────────────────────────────────────────

function extractHardenStatus(output: string): string {
  const match = output.match(/Status:\s*(\S+)/)
  return match?.[1] ?? 'unknown'
}

function extractReadinessFromOutput(verifyOutput: string): string {
  const match = verifyOutput.match(/- status:\s*(\S+)/)
  return match?.[1] ?? VerifyReadinessStatus.NotReady
}

function parseFindingsSummary(hardenOutput: string): HardenFindingSummary[] {
  if (!hardenOutput.includes('### Findings Summary')) {
    return []
  }

  const findings: HardenFindingSummary[] = []
  const lines = hardenOutput.split('\n')
  let inBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '### Findings Summary') {
      inBlock = true
      continue
    }

    if (!inBlock) {
      continue
    }

    if (trimmed.startsWith('### ')) {
      break
    }

    if (!trimmed) {
      continue
    }

    if (!trimmed.startsWith('-')) {
      break
    }

    const raw = trimmed.slice(1).trim()
    const parts = raw.split('|').map(part => part.trim()).filter(Boolean)
    const id = parts[0] ?? ''
    if (!id) {
      continue
    }

    const fields: Record<string, string> = {}
    for (const part of parts.slice(1)) {
      const separatorIndex = part.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }
      const key = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()
      if (key) {
        fields[key] = value
      }
    }

    findings.push({
      id,
      disposition: fields.disposition ?? '',
      status: fields.status ?? '',
      level: fields.level ?? '',
      files: fields.files ?? '',
      raw,
      fields,
    })
  }

  return findings
}

function isResolvedFindingStatus(status: string): boolean {
  return status === 'fixed' || status === 'verified' || status === 'dismissed'
}

function isUnresolvedMustFix(finding: HardenFindingSummary): boolean {
  return finding.disposition === 'must_fix' && !isResolvedFindingStatus(finding.status)
}

function isUnresolvedNeedsDecision(finding: HardenFindingSummary): boolean {
  return !isResolvedFindingStatus(finding.status)
    && (finding.disposition === 'design_divergence'
      || finding.disposition === 'needs_decision'
      || finding.status === 'needs_decision')
}

function formatNeedsDecisionFindingMessage(finding: HardenFindingSummary): string {
  if (finding.disposition === 'design_divergence') {
    return `Resolve design-divergence finding \`${finding.id}\` before archive`
  }
  return `Resolve harden finding \`${finding.id}\` before archive`
}

function evaluateHardenReadiness(
  hardenStatus: string | undefined,
  hardenOutput: string,
): Omit<HardenReadinessGateResult, 'readiness'> {
  const findings = parseFindingsSummary(hardenOutput)
  const unresolvedMustFix = findings.filter(isUnresolvedMustFix)
  const unresolvedNeedsDecision = findings.filter(isUnresolvedNeedsDecision)
  const knownIssues = findings.filter(finding => finding.disposition === 'accepted_known_issue')
  const blockingFindings: string[] = []

  if (unresolvedMustFix.length > 0) {
    blockingFindings.push(...unresolvedMustFix.map(
      finding => `unresolved harden finding \`${finding.id}\` requires fix before archive`,
    ))
  }

  if (unresolvedMustFix.length === 0 && unresolvedNeedsDecision.length > 0) {
    blockingFindings.push(...unresolvedNeedsDecision.map(formatNeedsDecisionFindingMessage))
  }

  let blocker: VerifyReadinessStatus | null = null

  if (unresolvedMustFix.length > 0) {
    blocker = VerifyReadinessStatus.NotReady
  } else if (hardenStatus === 'executor_blocked') {
    blocker = VerifyReadinessStatus.NeedsDecision
  } else if (unresolvedNeedsDecision.length > 0) {
    blocker = VerifyReadinessStatus.NeedsDecision
  } else if (hardenStatus === 'review_inconclusive') {
    blocker = VerifyReadinessStatus.NeedsDecision
  } else {
    switch (hardenStatus) {
      case undefined:
      case 'pass':
      case 'pass_with_risks':
      case 'skipped':
      case 'disabled':
      case 'budget_exhausted':
      case 'max_rounds_reached':
      case 'known_issues_accepted':
        blocker = null
        break
      case 'needs_human':
        blocker = VerifyReadinessStatus.NeedsDecision
        break
      case 'error':
      case 'rejected':
      case 'unknown':
      default:
        blocker = VerifyReadinessStatus.NotReady
        break
    }
  }

  return {
    blocker,
    knownIssues,
    blockingFindings,
    findings,
  }
}

function getHardenReadinessBlocker(
  hardenStatus: string | undefined,
  hardenOutput: string,
): VerifyReadinessStatus | null {
  return evaluateHardenReadiness(hardenStatus, hardenOutput).blocker
}

function applyHardenReadinessGate(
  readiness: string,
  hardenStatus: string | undefined,
  hardenOutput: string,
): HardenReadinessGateResult {
  const assessment = evaluateHardenReadiness(hardenStatus, hardenOutput)
  const nextReadiness = assessment.blocker
    ?? (assessment.knownIssues.length > 0 && readiness === VerifyReadinessStatus.Ready
      ? VerifyReadinessStatus.ReadyWithDocUpdates
      : readiness)

  return {
    readiness: nextReadiness,
    ...assessment,
  }
}

function extractBudgetConsumed(hardenOutput: string): number {
  const match = hardenOutput.match(/Budget consumed:\s*(\d+)/u)
  return Number(match?.[1] ?? '0')
}

function extractHardenSummaryText(hardenOutput: string): string {
  const match = hardenOutput.match(/Summary:\s*([^\n]+)/u)
  return match?.[1]?.trim() ?? ''
}

function normalizeHardenFindingLevel(level: string): HardenFinding['level'] {
  const allowedLevels: HardenFinding['level'][] = [
    'blocking_bug',
    'spec_violation',
    'regression_risk',
    'test_gap',
    'design_ambiguity',
    'style_or_preference',
  ]
  return allowedLevels.includes(level as HardenFinding['level'])
    ? level as HardenFinding['level']
    : 'design_ambiguity'
}

function normalizeHardenStopReason(
  hardenStatus: string | undefined,
  findings: HardenFindingSummary[],
): string {
  if (findings.some(isUnresolvedMustFix)) {
    return 'must_fix_remaining'
  }
  if (findings.some(isUnresolvedNeedsDecision)) {
    return 'needs_decision_remaining'
  }
  if (findings.some(finding => finding.disposition === 'accepted_known_issue')) {
    return 'known_issues_accepted'
  }
  return hardenStatus ?? 'unknown'
}

function toHardenResult(hardenStatus: string | undefined, hardenOutput: string, findings: HardenFindingSummary[]): HardenResult {
  const roundFindings: HardenFinding[] = findings.map((finding) => {
    const normalizedFinding: HardenFinding = {
      id: finding.id,
      level: normalizeHardenFindingLevel(finding.level),
      description: finding.raw,
      evidence: finding.fields.evidence ?? '',
      files: finding.files ? finding.files.split(',').map(file => file.trim()).filter(Boolean) : [],
    }

    if (finding.disposition) {
      normalizedFinding.disposition = finding.disposition as NonNullable<HardenFinding['disposition']>
    }
    if (finding.status) {
      normalizedFinding.status = finding.status as NonNullable<HardenFinding['status']>
    }

    return normalizedFinding
  })

  return {
    status: (hardenStatus ?? 'unknown') as HardenStatus,
    rounds: roundFindings.length > 0 ? [{ round: 1, findings: roundFindings }] : [],
    budgetConsumed: extractBudgetConsumed(hardenOutput),
    summary: extractHardenSummaryText(hardenOutput),
    stopReason: normalizeHardenStopReason(hardenStatus, findings),
    acceptedFindingsSummary: findings
      .filter(finding => finding.disposition === 'accepted_known_issue')
      .map(finding => finding.raw)
      .join('\n'),
  }
}

function buildAcceptedKnownIssuesSummary(findings: HardenFindingSummary[], verifyStatus: string): AcceptedKnownIssueSummary[] {
  return findings
    .filter(finding => finding.disposition === 'accepted_known_issue')
    .map(finding => ({
      findingId: finding.id,
      disposition: 'accepted_known_issue',
      rationale: finding.fields.rationale ?? finding.raw,
      archiveEffect: finding.fields.archive_effect === 'non_blocking'
        ? 'non_blocking'
        : finding.fields.archive_effect === 'decision_required'
          ? 'decision_required'
          : 'doc_update_required',
      evidenceRefs: (finding.fields.evidence ?? '').split(',').map(ref => ref.trim()).filter(Boolean),
      verifyStatus,
    }))
}

function buildHardenSummaryForAcceptanceState(
  hardenStatus: string | undefined,
  hardenOutput: string,
  findings: HardenFindingSummary[],
  verifyStatus: string,
): string {
  const minimalSummary = buildMinimalSummary(toHardenResult(hardenStatus, hardenOutput, findings))
  const base = JSON.parse(minimalSummary) as Record<string, unknown>
  const acceptedKnownIssues = buildAcceptedKnownIssuesSummary(findings, verifyStatus)
  if (acceptedKnownIssues.length > 0) {
    base.acceptedKnownIssues = acceptedKnownIssues
  }
  return JSON.stringify(base)
}

function stripOpenFlowHeader(output: string): string {
  const lines = output.split('\n')
  let startIdx = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line && (line.startsWith('### Evidence') || line.startsWith('- checks_run'))) {
      startIdx = i
      break
    }
  }
  return lines.slice(startIdx).join('\n')
}

// ── Report formatting ──────────────────────────────────────────────────────

interface QualityGateReportInput {
  feature: string
  contextKind: QualityGateContextKind
  limitedContext: boolean
  riskResult: ReturnType<typeof decideQualityGateRisk>
  hardenDecision: string
  hardenStatus?: string
  hardenOutput: string
  readiness: string
  hardenReadinessBlocker: VerifyReadinessStatus | null
  knownIssues: HardenFindingSummary[]
  blockingFindings: string[]
  verifyContent: string
  freshnessResult: EvidenceFreshnessResult
  changedFiles: string[]
  omittedFiles: string[]
  diffLines: number
}

function buildQualityGateReport(input: QualityGateReportInput): string {
  const {
    feature,
    contextKind,
    limitedContext,
    riskResult,
    hardenDecision,
    hardenStatus,
    hardenOutput,
    readiness,
    hardenReadinessBlocker,
    knownIssues,
    blockingFindings,
    verifyContent,
    freshnessResult,
    changedFiles,
    omittedFiles,
    diffLines,
  } = input

  // ── Context section ───────────────────────────────────────────────────
  const contextSection = [
    '### Context',
    '',
    `- **Feature**: ${escapeMarkdown(feature)}`,
    `- **Context Kind**: \`${contextKind}\``,
    limitedContext ? '- **Limited Context**: ⚠️ semantic context is limited or unavailable — technical verification only' : '',
    changedFiles.length > 0
      ? `- **Changed Files**: ${changedFiles.length} file(s) (${diffLines} diff lines)`
      : '- **Changed Files**: none detected',
    changedFiles.length > 0
      ? changedFiles.map(f => `  - \`${escapeMarkdown(f)}\``).join('\n')
      : '',
    omittedFiles.length > 0
      ? `- **Scoped Out Files**: ${omittedFiles.length} unrelated file(s) omitted from risk and freshness checks`
      : '',
    omittedFiles.length > 0
      ? omittedFiles.map(f => `  - \`${escapeMarkdown(f)}\``).join('\n')
      : '',
    '',
  ].filter(Boolean).join('\n')

  // ── Risk Assessment section ───────────────────────────────────────────
  const riskSection = [
    '### Risk Assessment',
    '',
    `- **Risk Level**: \`${riskResult.risk}\``,
    `- **Harden Recommended**: ${riskResult.shouldHarden ? '✅ yes' : '⏭️ no'}`,
    '- **Reasons**:',
    ...riskResult.reasons.map(r => `  - \`${r}\``),
    '',
  ].join('\n')

  // ── Harden Decision section ───────────────────────────────────────────
  const hardenSection = [
    '### Harden Decision',
    '',
    `- **Decision**: \`${hardenDecision}\``,
    `- **Status**: \`${hardenStatus ?? 'unknown'}\``,
    hardenStatus === 'skipped' ? '- **Rationale**: change risk is below harden threshold' : '',
    hardenStatus === 'disabled' ? '- **Rationale**: harden is disabled in OpenFlow configuration' : '',
    '',
  ].filter(Boolean).join('\n')

  const hardenTraceSection = hardenStatus && hardenStatus !== 'skipped' && hardenStatus !== 'disabled'
    ? [
        '### Harden Trace',
        '',
        '<details>',
        '<summary>Harden Trace</summary>',
        '',
        hardenOutput,
        '',
        '</details>',
        '',
      ].join('\n')
    : ''

  // ── Evidence-Aware Verify section ─────────────────────────────────────
  const freshnessBlock = buildFreshnessBlock(freshnessResult)
  const verifySection = [
    '### Evidence-Aware Verify',
    '',
    freshnessBlock,
    '',
    verifyContent,
    '',
  ].join('\n')

  // ── Readiness section ─────────────────────────────────────────────────
  const readinessLabel = readiness === VerifyReadinessStatus.Ready
    ? '✅ Ready'
    : readiness === VerifyReadinessStatus.ReadyWithDocUpdates
      ? '📝 Ready (with doc updates)'
      : readiness === VerifyReadinessStatus.NeedsDecision
        ? '⚠️ Needs Decision'
        : '❌ Not Ready'

  const readinessSection = [
    '### Readiness',
    '',
    `- **Status**: ${readinessLabel} (\`${readiness}\`)`,
    hardenReadinessBlocker
      ? `- **Harden Gate**: ❌ harden status \`${hardenStatus ?? 'unknown'}\` blocks archive readiness despite verify output.`
      : '',
    ...blockingFindings.map(finding => `- ${finding}`),
    limitedContext ? '- **Limited Context**: ⚠️ readiness reflects technical verification only — semantic alignment was not possible' : '',
    '',
  ].filter(Boolean).join('\n')

  const knownIssuesSection = knownIssues.length > 0
    ? [
        '### Known Issues',
        '',
        ...knownIssues.map(finding => `- ${finding.raw}`),
        '',
      ].join('\n')
    : ''

  // ── Next Step section ─────────────────────────────────────────────────
  let nextStep = ''
  if (readiness === VerifyReadinessStatus.Ready || readiness === VerifyReadinessStatus.ReadyWithDocUpdates) {
    nextStep = `Feature \`${escapeMarkdown(feature)}\` is ready for archive. Run \`/openflow-archive ${escapeMarkdown(feature)}\` to finalize.`
  } else if (readiness === VerifyReadinessStatus.NeedsDecision) {
    nextStep = 'Resolve the blocking decision, then rerun the quality gate or verify.'
  } else {
    nextStep = 'Address the readiness issues identified above, then rerun the quality gate.'
  }

  const nextStepSection = [
    '### Next Step',
    '',
    nextStep,
    '',
  ].join('\n')

  return [
    '## Quality Gate',
    '',
    contextSection,
    riskSection,
    hardenSection,
    hardenTraceSection,
    verifySection,
    readinessSection,
    knownIssuesSection,
    nextStepSection,
    '---',
    '',
    `*Quality gate completed at ${new Date().toISOString()}*`,
  ].join('\n')
}

/** Build evidence freshness status block for the verify section */
function buildFreshnessBlock(freshness: EvidenceFreshnessResult): string {
  const statusLabel = freshness.status === 'fresh'
    ? '✅ Fresh'
    : freshness.status === 'stale'
      ? '⚠️ Stale'
      : '❌ Missing'

  return [
    `- **Evidence Freshness**: ${statusLabel}`,
    `- **Freshness Reason**: ${freshness.reason}`,
    freshness.staleDetails && freshness.staleDetails.length > 0
      ? freshness.staleDetails.map(d => `  - ${d}`).join('\n')
      : '',
  ].filter(Boolean).join('\n')
}

/**
 * Build verify-like markdown output from a stored VerifyResult.
 * Used when evidence is fresh — the quality gate reuses the
 * stored result instead of rerunning handleVerify.
 *
 * Produces output compatible with extractReadinessFromOutput
 * (matches `- status:\s*(\S+)`) and stripOpenFlowHeader
 * (starts with `### Evidence` or `- checks_run`).
 */
function buildVerifyOutputFromResult(
  result: VerifyResult,
  feature?: string,
): string {
  const constraintsList = result.constraintsChecked.length > 0
    ? result.constraintsChecked.map(c => `  - ${c} ✅ (reused)`).join('\n')
    : '  - (none recorded)'

  return [
    '## Verify (reused from fresh acceptance state)',
    `Feature: ${feature || 'unknown'}`,
    '',
    '### Evidence',
    '- checks_run:',
    constraintsList,
    `- observed_behavior_summary: ${result.evidenceSummary}`,
    '- intended_vs_actual_delta: no delta (reused from fresh evidence)',
    '- doc_alignment_summary: reused from fresh acceptance state',
    '- current_decisions_conflict_summary: no conflicts (reused)',
    '- known_risks_or_missing_evidence: none (reused)',
    '',
    '### Readiness',
    `- status: ${result.readiness}`,
    `- reason_codes: ${result.reasonCodes.join(', ')}`,
    '- reason: reused from fresh acceptance state evidence',
    '- next_step: proceed (reused from fresh evidence)',
    '',
  ].join('\n')
}
