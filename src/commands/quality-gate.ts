import { execSync } from 'node:child_process'
import { statSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { CurrentWorkspaceState, HardenFinding, HardenResult, HardenStatus, ImplementationRun, ImplementationRunStatus, OpenFlowConfig, OpenFlowContext, QualityGateApplicabilityResult, QualityGateContextKind, QualityGateTaskKind, VerifyEvidencePacket } from '../types.js'
import { VerifyReadinessStatus } from '../types.js'
import type { EvidenceFreshnessResult, VerifyResult } from '../types.js'
import { handleFinalVerify } from './final-verify.js'
import { getPlanPath, getChangeBehaviorPath, getChangeWorkspacePath } from '../config.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { implementationRunStore, isTerminalStatus } from '../utils/implementation-run.js'
import { generateBehaviorCodeMapper, saveImplementationMapperDocument } from '../phases/archive/index.js'
import type { BehaviorCodeMapperResult } from '../phases/archive/index.js'
import { loadAcceptanceState, markImplementationBlocked, markImplementationVerified, saveAcceptanceState } from '../utils/acceptance-state.js'
import { decideQualityGateRisk, type QualityGateRiskInput } from '../utils/risk-assessment.js'
import { captureCurrentWorkspaceState, classifyEvidenceFreshness } from '../utils/evidence-freshness.js'
import { buildMinimalSummary } from '../utils/harden-ledger.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { detectMode } from '../utils/issue-utils.js'
import { collectFeatureScope, filterPathsToExactScope, filterPathsToFeatureScope, scopeDiffToFeature, scopeDiffToFiles } from '../utils/diff-scope.js'
import { logger } from '../utils/logger.js'

export interface QualityGateArgs {
  /** Optional feature name override */
  feature?: string
  /** Optional session ID for feature resolution */
  sessionID?: string
  /**
   * C10: Structured ImplementationRun from the current call chain.
   * When provided, quality-gate uses this directly without scanning the run store.
   * Priority: structured run → runID lookup → active run store → no-run degradation.
   */
  run?: ImplementationRun
  /**
   * C10: Run ID to look up from the run store.
   * Used when a full ImplementationRun is not available in-memory but the run ID is known.
   */
  runID?: string
  /** Retry count for this quality gate invocation (0 = first attempt). */
  retryCount?: number
}

/**
 * Node executor interface for quality-gate orchestration.
 *
 * C1: quality-gate does NOT import or dynamically import handleHarden/handleVerify.
 * Instead, it receives node executors through this interface.
 * The caller (e.g., the quality-gate command handler) is responsible for
 * binding the real handleHarden/handleVerify or test mocks.
 */
export interface NodeExecutor {
  /** Execute harden node. Returns harden markdown output. */
  executeHarden?: (
    ctx: OpenFlowContext,
    feature?: string,
    sessionID?: string,
  ) => Promise<string>
  /** Execute verify node. Returns verify markdown output. */
  executeVerify?: (
    ctx: OpenFlowContext,
    feature?: string,
    acceptFailures?: boolean,
    sessionID?: string,
  ) => Promise<string>
}

interface QualityGateVisibleSession {
  id?: string
  title: string
  created: boolean
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
 * Setup phase result — carries all state resolved before the state machine begins.
 */
interface QualityGateSetup {
  originalCtx: OpenFlowContext
  nodeExecutor: NodeExecutor | undefined
  executionCtx: OpenFlowContext
  sanitizedFeature: string | undefined
  sessionID: string | undefined
  activeRun: ImplementationRun | null
  qualityGateSession: QualityGateVisibleSession
  runCompletionRecorded: boolean
  contextKind: QualityGateContextKind
  scopedWorkspace: QualityGateScopedWorkspace
  changedFiles: string[]
  diffLines: number
  hasNewExports: boolean
  implementationScopeFiles: string[] | undefined
  acceptanceState: Awaited<ReturnType<typeof loadAcceptanceState>> | null
  retryCount: number
}

/**
 * Detect phase result — classification and assessment from workspace analysis.
 */
interface QualityGateDetect {
  limitedContext: boolean
  applicability: QualityGateApplicabilityResult
  riskResult?: ReturnType<typeof decideQualityGateRisk>
  freshnessResult?: EvidenceFreshnessResult
  earlyExitReport: string | null
}

/**
 * Quality gate orchestrator — invoked by AI after code implementation or bug fixes.
 *
 * State machine flow: Setup → Detect → (terminal check) → Harden → Verify → Assess.
 *
 * When no feature, plan, or semantic context is available, the gate
 * downgrades to limited-context mode but still runs verify.
 */
export async function handleQualityGate(
  ctx: OpenFlowContext,
  args?: QualityGateArgs,
  nodeExecutor?: NodeExecutor,
): Promise<string> {
  // ── State Machine: Setup Phase ───────────────────────────────────────────
  const setup = await runSetupPhase(ctx, args, nodeExecutor)

  try {
    // ── State Machine: Detect Phase ────────────────────────────────────────
    const detect = await runDetectPhase(setup)
    if (detect.earlyExitReport) {
      return detect.earlyExitReport
    }

    // ── State Machine: Harden Phase ────────────────────────────────────────
    const harden = await runHardenPhase({
      executionCtx: setup.executionCtx,
      applicability: detect.applicability,
      riskResult: detect.riskResult!,
      nodeExecutor: setup.nodeExecutor,
      sanitizedFeature: setup.sanitizedFeature,
      qualityGateSession: setup.qualityGateSession,
      sessionID: setup.sessionID,
    })

    // ── State Machine: Verify Phase ────────────────────────────────────────
    const verifyOutput = await runVerifyPhase({
      executionCtx: setup.executionCtx,
      nodeExecutor: setup.nodeExecutor,
      sanitizedFeature: setup.sanitizedFeature,
      qualityGateSession: setup.qualityGateSession,
      sessionID: setup.sessionID,
      acceptanceState: setup.acceptanceState,
      freshnessResult: detect.freshnessResult!,
    })

    // ── State Machine: Assess Phase ────────────────────────────────────────
    return await runAssessPhase({
      originalCtx: ctx,
      setup,
      detect,
      harden,
      verifyOutput,
    })
  } catch (error) {
    logger.error('quality_gate', 'quality gate uncaught error', error instanceof Error ? error : new Error(String(error)))
    if (setup.activeRun && !setup.runCompletionRecorded) {
      await recordQualityGateRunCompletion(ctx, setup.activeRun, 'error', 'blocked')
    }
    throw error
  }
}

/**
 * Build a minimal VerifyEvidencePacket from verify output and stored result.
 * This is used to pass structured evidence to handleFinalVerify.
 */
function buildEvidencePacketForFinalVerify(
  verifyOutput: string,
  verifyReadiness: string,
  storedResult: VerifyResult | undefined,
): VerifyEvidencePacket {
  // Parse check results from verify output
  const checkResults = parseCheckResultsFromOutput(verifyOutput)

  // Use stored verify result for structured data when available
  const knownRisks = storedResult?.evidenceSummary ?? extractKnownRisksFromOutput(verifyOutput)
  const docAlignment = extractDocAlignmentFromOutput(verifyOutput)

  // Build classified evidence gaps based on verify readiness
  const classifiedEvidenceGaps = verifyReadiness !== 'ready' && verifyReadiness !== 'ready_with_doc_updates'
    ? [{ code: 'verify_readiness_blocked', kind: 'blocking_evidence_gap' as const, message: `Verify readiness is ${verifyReadiness}`, nextStep: 'Resolve verify blockers' }]
    : []

  return {
    checksRun: storedResult?.constraintsChecked ?? [],
    checkResults,
    observedBehaviorSummary: knownRisks,
    intendedVsActualDelta: verifyReadiness === 'ready' ? 'No delta detected.' : `Verify readiness: ${verifyReadiness}`,
    docAlignmentSummary: docAlignment,
    constraintConflictSummary: 'No constraint conflicts detected.',
    knownRisksOrMissingEvidence: verifyReadiness !== 'ready' && verifyReadiness !== 'ready_with_doc_updates'
      ? `Verify blocked: ${verifyReadiness}`
      : 'No blocking evidence gaps detected.',
    classifiedEvidenceGaps,
  }
}

/**
 * Parse check results from verify markdown output.
 */
function parseCheckResultsFromOutput(output: string): VerifyEvidencePacket['checkResults'] {
  const results: VerifyEvidencePacket['checkResults'] = []
  const lines = output.split('\n')
  for (const line of lines) {
    const match = line.match(/^\s+-\s+(?:\w+:)?(\S+)\s+(✅|❌|⚠️)/u)
    if (match) {
      results.push({
        name: match[1]!,
        passed: match[2] === '✅',
        category: 'quality',
        detail: line.trim(),
      })
    }
  }
  return results
}

function extractKnownRisksFromOutput(output: string): string {
  const match = output.match(/known_risks_or_missing_evidence:\s*(.+)/)
  return match?.[1]?.trim() ?? ''
}

function extractDocAlignmentFromOutput(output: string): string {
  const match = output.match(/doc_alignment_summary:\s*(.+)/)
  return match?.[1]?.trim() ?? ''
}

type QualityGateRunEvent = {
  type: 'quality_gate_started' | 'quality_gate_completed'
  runID: string
  sessionID: string
  timestamp: string
  result?: string
}

async function findActiveImplementationRun(
  ctx: OpenFlowContext,
  feature: string | undefined,
  sessionID: string | undefined,
): Promise<ImplementationRun | null> {
  logger.debug('quality_gate', 'finding active implementation run', { feature, sessionID })
  if (feature) {
    const featureRun = await implementationRunStore.getActiveRun(ctx, feature, sessionID)
    if (featureRun) {
      return featureRun
    }
  }

  if (sessionID) {
    const runs = await implementationRunStore.listRuns(ctx, { sessionID })
    return runs.find(run => !isTerminalStatus(run.status)) ?? null
  }

  return null
}

function resolveImplementationRunExecutionRoot(ctx: OpenFlowContext, run: ImplementationRun): string {
  if (run.worktree && run.directory === ctx.directory) {
    return run.worktree
  }
  return run.directory || ctx.directory
}

async function appendQualityGateRunEvent(
  ctx: OpenFlowContext,
  run: ImplementationRun,
  event: Omit<QualityGateRunEvent, 'runID' | 'sessionID' | 'timestamp'>,
): Promise<void> {
  const eventsPath = resolveRunLogPath(ctx, run.eventsPath)
  const nextEvent: QualityGateRunEvent = {
    ...event,
    runID: run.runID,
    sessionID: run.sessionID,
    timestamp: new Date().toISOString(),
  }

  await fs.mkdir(dirname(eventsPath), { recursive: true })
  await fs.appendFile(eventsPath, `${JSON.stringify(nextEvent)}\n`, 'utf8')
}

async function recordQualityGateRunCompletion(
  ctx: OpenFlowContext,
  run: ImplementationRun,
  result: string,
  status: ImplementationRunStatus,
): Promise<ImplementationRun> {
  const updated = await implementationRunStore.updateRun(ctx, run.runID, { status })
  await appendQualityGateRunEvent(ctx, updated, { type: 'quality_gate_completed', result })
  return updated
}

function resolveRunLogPath(ctx: OpenFlowContext, filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(ctx.directory, filePath)
}

async function resolveQualityGateVisibleSession(
  _ctx: OpenFlowContext,
  feature: string | undefined,
  parentSessionID: string | undefined,
): Promise<QualityGateVisibleSession> {
  const title = `Quality Gate: ${feature ? sanitizeFeatureName(feature) : 'unresolved'}`
  // Quality gate no longer creates its own session.
  // Harden/Verify use the main session ID directly as their parent.
  return buildQualityGateVisibleSession(title, false, parentSessionID)
}

function buildQualityGateVisibleSession(title: string, created: boolean, id?: string): QualityGateVisibleSession {
  return id ? { id, title, created } : { title, created }
}

async function recordQualityGateSessionProgress(
  _ctx: OpenFlowContext,
  session: QualityGateVisibleSession,
  stage: string,
  lines: string[],
): Promise<void> {
  // 不再向 visible session 发送 client.session.prompt，避免触发子会话 AI 回复。
  // 进度仅通过日志记录，visible session 保留为 UI 容器。
  logger.info('quality_gate', 'session progress', {
    sessionID: session.id ?? '(none)',
    title: session.title,
    stage,
    lines,
  })
}


function getImplementationRunStatusForReadiness(readiness: string, applicabilityStatus?: string): ImplementationRunStatus {
  if (applicabilityStatus === 'limited_context') {
    return 'blocked'
  }
  if (readiness === 'ready' || readiness === 'ready_with_doc_updates') {
    return 'ready_for_archive'
  }
  return 'blocked'
}

interface ApplicabilityInput {
  feature: string | undefined
  contextKind: QualityGateContextKind
  changedFiles: string[]
  acceptancePhase: string | undefined
}

function getMatchingImplementationScopeFiles(
  acceptanceState: Awaited<ReturnType<typeof loadAcceptanceState>>,
  feature: string | undefined,
  sessionID: string | undefined,
): string[] | undefined {
  if (!acceptanceState || !feature || acceptanceState.feature !== feature) {
    return undefined
  }
  if (acceptanceState.sessionID && sessionID && acceptanceState.sessionID !== sessionID) {
    return undefined
  }
  return acceptanceState.implementationState?.changedFiles
}

function classifyQualityGateApplicability(input: ApplicabilityInput): QualityGateApplicabilityResult {
  const taskKind = inferQualityGateTaskKind(input.changedFiles, input.acceptancePhase)
  const hasCodeChange = taskKind === 'implementation_done' || taskKind === 'bugfix_done'

  if (!hasCodeChange && taskKind !== 'archive_ready' && taskKind !== 'unknown') {
    return {
      status: 'not_applicable',
      reasonCode: `${taskKind}_no_implementation_change`,
      reason: 'Current changes are not implementation completion or archive readiness work.',
      taskKind,
      shouldRunVerify: false,
      shouldRunHarden: false,
      archiveReadinessEligible: false,
      nextStep: 'No quality gate is required. Do not create workflow artifacts merely to satisfy readiness.',
    }
  }

  if (input.contextKind === 'limited' || input.contextKind === 'none') {
    return {
      status: 'limited_context',
      reasonCode: input.contextKind === 'none' ? 'semantic_context_unresolved' : 'semantic_context_limited',
      reason: 'Semantic workflow context is unavailable or incomplete; only technical verification can run.',
      taskKind,
      shouldRunVerify: true,
      shouldRunHarden: false,
      archiveReadinessEligible: false,
      nextStep: 'Run technical checks if useful, but do not claim full semantic readiness or archive readiness from this result.',
    }
  }

  return {
    status: 'applicable',
    reasonCode: hasCodeChange ? 'implementation_change_detected' : 'workflow_context_ready_for_gate',
    reason: 'The current context is implementation, bugfix, or archive-readiness work and requires the quality gate.',
    taskKind: hasCodeChange ? taskKind : 'archive_ready',
    shouldRunVerify: true,
    shouldRunHarden: true,
    archiveReadinessEligible: true,
    nextStep: 'Continue with risk assessment, harden if needed, and evidence-aware verify.',
  }
}

function inferQualityGateTaskKind(changedFiles: string[], acceptancePhase?: string): QualityGateTaskKind {
  if (acceptancePhase === 'verification_pending' || acceptancePhase === 'acceptance') {
    if (changedFiles.length === 0) return 'archive_ready'
  }
  if (changedFiles.length === 0) return 'unknown'

  const normalized = changedFiles.map(file => file.replace(/\\/g, '/'))
  const runtimeFiles = normalized.filter(isRuntimeCodeFile)
  if (runtimeFiles.length > 0) return 'implementation_done'
  if (normalized.some(isTestFile)) return 'implementation_done'
  if (normalized.every(isDesignOnlyFile)) return 'design_only'
  if (normalized.every(isPlanningOnlyFile)) return 'planning_only'
  if (normalized.every(isMetadataOnlyFile)) return 'metadata_only'
  if (normalized.every(isDocsOnlyFile)) return 'docs_only'
  return 'unknown'
}

function isRuntimeCodeFile(file: string): boolean {
  return file.startsWith('src/') && /\.(ts|tsx|js|jsx|mjs|cjs)$/u.test(file) && !isTestFile(file)
}

function isTestFile(file: string): boolean {
  return /(^|\/)(tests?|__tests__)\//u.test(file) || /\.(test|spec)\.(ts|tsx|js|jsx)$/u.test(file)
}

function isDesignOnlyFile(file: string): boolean {
  return /^docs\/changes\/.*\/(design|behavior|prd|requirements|proposal|decisions)\.md$/u.test(file)
}

function isPlanningOnlyFile(file: string): boolean {
  return /^\.sisyphus\/plans\/[^/]+\.md$/u.test(file) || /^docs\/changes\/.*\/plan\.md$/u.test(file)
}

function isMetadataOnlyFile(file: string): boolean {
  return /^\.sisyphus\//u.test(file) || /^(package-lock|bun\.lockb|pnpm-lock|yarn\.lock)$/u.test(file) || /^\.gitnexus\//u.test(file)
}

function isDocsOnlyFile(file: string): boolean {
  return file.endsWith('.md') && (file.startsWith('docs/') || /^README(?:_[A-Z]+)?\.md$/u.test(file))
}

// ── Phase functions ────────────────────────────────────────────────────────

/**
 * Count prior quality gate invocations from run events.
 */
async function countQualityGateRetries(ctx: OpenFlowContext, run: ImplementationRun): Promise<number> {
  try {
    const eventsPath = resolveRunLogPath(ctx, run.eventsPath)
    const content = await fs.readFile(eventsPath, 'utf-8')
    const events = content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as QualityGateRunEvent)
    return events.filter(e => e.type === 'quality_gate_started').length
  } catch {
    return 0
  }
}

/**
 * Setup phase: resolve feature, run, session, workspace, and compute changed files.
 */
async function runSetupPhase(
  ctx: OpenFlowContext,
  args: QualityGateArgs | undefined,
  nodeExecutor: NodeExecutor | undefined,
): Promise<QualityGateSetup> {
  const featureArg = args?.feature?.trim()
  const requestedSessionID = args?.sessionID
  logger.info('quality_gate', 'quality gate started', { feature: featureArg, sessionID: requestedSessionID })

  // C10: Run resolution priority: structured run → runID lookup → active run store → no-run
  let activeRun: ImplementationRun | null = null
  if (args?.run) {
    activeRun = args.run
    logger.info('quality_gate', 'using structured ImplementationRun from args', { runID: activeRun.runID })
  } else if (args?.runID) {
    const lookedUpRun = await implementationRunStore.getRun(ctx, args.runID)
    if (lookedUpRun && !isTerminalStatus(lookedUpRun.status)) {
      activeRun = lookedUpRun
      logger.info('quality_gate', 'resolved ImplementationRun by runID', { runID: activeRun.runID })
    }
  }
  if (!activeRun) {
    activeRun = await findActiveImplementationRun(ctx, featureArg ? sanitizeFeatureName(featureArg) : undefined, requestedSessionID)
  }
  if (activeRun) {
    logger.info('quality_gate', 'active implementation run found', { runID: activeRun.runID, status: activeRun.status })
  }

  const sessionID = requestedSessionID ?? activeRun?.sessionID

  // Calculate retry count BEFORE appending new started event
  let retryCount = args?.retryCount ?? 0
  if (activeRun && args?.retryCount === undefined) {
    retryCount = await countQualityGateRetries(ctx, activeRun)
  }

  const qualityGateSession = await resolveQualityGateVisibleSession(ctx, activeRun?.feature ?? featureArg, sessionID)
  await recordQualityGateSessionProgress(ctx, qualityGateSession, 'started', [
    `feature=${activeRun?.feature ?? featureArg ?? '(unresolved)'}`,
    `sourceSession=${sessionID ?? '(none)'}`,
  ])

  const executionRoot = activeRun ? resolveImplementationRunExecutionRoot(ctx, activeRun) : ctx.directory
  const executionCtx: OpenFlowContext = activeRun
    ? { ...ctx, directory: executionRoot, worktree: activeRun.worktree || executionRoot }
    : ctx

  if (activeRun) {
    await implementationRunStore.updateRun(ctx, activeRun.runID, { status: 'quality_gate_running' })
    await appendQualityGateRunEvent(ctx, activeRun, { type: 'quality_gate_started' })
  }

  // Resolve feature
  let sanitizedFeature: string | undefined = undefined
  const candidate = activeRun?.feature || featureArg || undefined
  if (candidate) {
    sanitizedFeature = sanitizeFeatureName(candidate)
  } else {
    const found = await findActiveFeature(executionCtx)
    if (found) {
      sanitizedFeature = sanitizeFeatureName(found)
    }
  }
  if (!sanitizedFeature) {
    const fallbackState = await loadAcceptanceState(executionCtx.directory)
    if (fallbackState?.feature) {
      sanitizedFeature = sanitizeFeatureName(fallbackState.feature)
    }
  }
  logger.info('quality_gate', 'feature resolved', { feature: sanitizedFeature })
  await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'context/scope', [
    `feature=${sanitizedFeature ?? '(unresolved)'}`,
    `executionRoot=${executionCtx.directory}`,
  ])

  // Resolve context kind (needed for scoping)
  const contextKind = await resolveContextKind(executionCtx, sanitizedFeature)

  // Load acceptance state and scope workspace
  const acceptanceState = await loadAcceptanceState(executionCtx.directory)
  const implementationScopeFiles = getMatchingImplementationScopeFiles(acceptanceState, sanitizedFeature, sessionID)
  const fullDiffText = readGitDiff(executionCtx.directory)
  const allUntrackedFiles = readGitUntracked(executionCtx.directory)
  const scopedWorkspace = await scopeQualityGateWorkspace(
    executionCtx.directory,
    sanitizedFeature,
    contextKind,
    fullDiffText,
    allUntrackedFiles,
    implementationScopeFiles,
    executionCtx.config,
  )

  // Compute changed files
  const diffText = scopedWorkspace.diffText
  const untrackedFiles = scopedWorkspace.untrackedFiles
  const diffFiles = extractDiffFiles(diffText)
  const changedFiles = [...new Set([...diffFiles, ...untrackedFiles])].sort()
  const diffLines = countDiffLines(diffText) + untrackedFiles.length * 3
  const hasNewExports = detectNewExports(diffText)

  return {
    originalCtx: ctx,
    nodeExecutor,
    executionCtx,
    sanitizedFeature,
    sessionID,
    activeRun,
    qualityGateSession,
    runCompletionRecorded: false,
    contextKind,
    scopedWorkspace,
    changedFiles,
    diffLines,
    hasNewExports,
    implementationScopeFiles,
    acceptanceState,
    retryCount,
  }
}

/**
 * Detect phase: classify applicability, assess risk, check evidence freshness.
 * Uses the pre-resolved contextKind from setup — does NOT re-resolve.
 */
async function runDetectPhase(setup: QualityGateSetup): Promise<QualityGateDetect> {
  const { executionCtx, sanitizedFeature, contextKind, scopedWorkspace, changedFiles, acceptanceState, qualityGateSession, diffLines, hasNewExports } = setup

  const limitedContext = contextKind === 'limited' || contextKind === 'none'

  const applicability = classifyQualityGateApplicability({
    feature: sanitizedFeature,
    contextKind,
    changedFiles,
    acceptancePhase: acceptanceState?.phase,
  })
  logger.info('quality_gate', 'applicability classified', {
    status: applicability.status,
    reasonCode: applicability.reasonCode,
    shouldRunHarden: applicability.shouldRunHarden,
    shouldRunVerify: applicability.shouldRunVerify,
  })
  await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'applicability', [
    `status=${applicability.status}`,
    `reasonCode=${applicability.reasonCode}`,
    `contextKind=${contextKind}`,
    `changedFiles=${changedFiles.length}`,
    `shouldRunHarden=${String(applicability.shouldRunHarden)}`,
    `shouldRunVerify=${String(applicability.shouldRunVerify)}`,
  ])

  if (acceptanceState && acceptanceState.feature === sanitizedFeature) {
    acceptanceState.qualityGateApplicability = applicability
    await saveAcceptanceState(executionCtx.directory, acceptanceState)
  }

  if (applicability.status === 'not_applicable' || applicability.status === 'needs_workflow_stage') {
    logger.info('quality_gate', 'quality gate not applicable, returning early', { status: applicability.status })
    const report = buildApplicabilityOnlyReport({
      feature: sanitizedFeature || '(unresolved)',
      qualityGateSession,
      contextKind,
      limitedContext,
      applicability,
      changedFiles,
      omittedFiles: scopedWorkspace.omittedFiles,
      diffLines,
    })
    if (setup.activeRun) {
      await recordQualityGateRunCompletion(setup.originalCtx, setup.activeRun, VerifyReadinessStatus.NotReady, 'blocked')
    }
    await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'readiness', [
      `readiness=${VerifyReadinessStatus.NotReady}`,
      `applicability=${applicability.status}`,
      'harden=skipped',
      'verify=skipped',
    ])
    return { limitedContext, applicability, earlyExitReport: report }
  }

  const diffText = scopedWorkspace.diffText
  const riskInput: QualityGateRiskInput = diffText
    ? { files: changedFiles, diffLines, hasNewExports, diffText }
    : { files: changedFiles, diffLines, hasNewExports }

  const riskResult = decideQualityGateRisk(riskInput)
  logger.info('quality_gate', 'risk assessment completed', { riskLevel: riskResult.risk, shouldHarden: riskResult.shouldHarden, reasons: riskResult.reasons })
  await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'risk', [
    `risk=${riskResult.risk}`,
    `shouldHarden=${String(riskResult.shouldHarden)}`,
    `reasons=${riskResult.reasons.join(', ') || 'none'}`,
  ])

  const workspaceState = buildScopedWorkspaceState(
    executionCtx.directory,
    captureCurrentWorkspaceState(executionCtx.directory),
    changedFiles,
    scopedWorkspace.scoped,
  )
  const freshnessResult = classifyEvidenceFreshness(acceptanceState, workspaceState)
  logger.info('quality_gate', 'evidence freshness checked', { status: freshnessResult.status, reason: freshnessResult.reason })

  return { limitedContext, applicability, riskResult, freshnessResult, earlyExitReport: null }
}

/**
 * Harden phase: decide whether to run harden, execute it if applicable.
 * Delegates to nodeExecutor.executeHarden() which runs in an independent sub-session.
 */
async function runHardenPhase(params: {
  executionCtx: OpenFlowContext
  applicability: QualityGateApplicabilityResult
  riskResult: ReturnType<typeof decideQualityGateRisk>
  nodeExecutor: NodeExecutor | undefined
  sanitizedFeature: string | undefined
  qualityGateSession: QualityGateVisibleSession
  sessionID: string | undefined
}): Promise<{ hardenDecision: 'none' | 'risk-based' | 'final'; hardenStatus: string | undefined; hardenOutput: string }> {
  const { executionCtx, applicability, riskResult, nodeExecutor, sanitizedFeature, qualityGateSession, sessionID } = params

  let hardenOutput = ''
  let hardenStatus: string | undefined
  let hardenDecision: 'none' | 'risk-based' | 'final' = 'none'

  if (applicability.shouldRunHarden && riskResult.shouldHarden && executionCtx.config.harden.enabled) {
    hardenDecision = 'risk-based'
    logger.info('quality_gate', 'harden decision made', { decision: hardenDecision, shouldRunHarden: applicability.shouldRunHarden, shouldHarden: riskResult.shouldHarden, hardenEnabled: executionCtx.config.harden.enabled })
    await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'harden decision', [
      `decision=${hardenDecision}`,
      'status=running',
    ])
    logger.info('quality_gate', 'starting harden', { feature: sanitizedFeature })
    try {
      if (nodeExecutor?.executeHarden) {
        hardenOutput = await nodeExecutor.executeHarden(executionCtx, sanitizedFeature, sessionID)
        hardenStatus = extractHardenStatus(hardenOutput)
      } else {
        hardenStatus = 'skipped'
        hardenOutput = ''
        logger.warn('quality_gate', 'no harden executor provided, skipping harden', { feature: sanitizedFeature })
      }
      logger.info('quality_gate', 'harden completed', { status: hardenStatus })
    } catch (err) {
      const hardenError = err instanceof Error ? err : new Error(String(err))
      hardenStatus = 'error'
      hardenOutput = `Harden execution failed: ${hardenError.message}`
      logger.error('quality_gate', 'harden execution failed', hardenError, { feature: sanitizedFeature })
    }
    await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'harden round summary', [
      `status=${hardenStatus ?? 'unknown'}`,
      `rounds=${extractHardenRounds(hardenOutput)}`,
      `summary=${extractHardenSummaryText(hardenOutput) || '(none)'}`,
    ])
  } else if (!applicability.shouldRunHarden || !riskResult.shouldHarden) {
    hardenDecision = 'none'
    hardenStatus = 'skipped'
    logger.info('quality_gate', 'harden decision made', { decision: hardenDecision, shouldRunHarden: applicability.shouldRunHarden, shouldHarden: riskResult.shouldHarden, hardenEnabled: executionCtx.config.harden.enabled })
    await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'harden decision', [
      `decision=${hardenDecision}`,
      `status=${hardenStatus}`,
      'reason=below harden threshold or not applicable',
    ])
  } else {
    hardenDecision = 'none'
    hardenStatus = 'disabled'
    logger.info('quality_gate', 'harden decision made', { decision: hardenDecision, shouldRunHarden: applicability.shouldRunHarden, shouldHarden: riskResult.shouldHarden, hardenEnabled: executionCtx.config.harden.enabled })
    await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'harden decision', [
      `decision=${hardenDecision}`,
      `status=${hardenStatus}`,
      'reason=harden disabled',
    ])
  }

  return { hardenDecision, hardenStatus, hardenOutput }
}

/**
 * Verify phase: evidence-aware verify execution.
 * Delegates to nodeExecutor.executeVerify() which runs in an independent sub-session.
 */
async function runVerifyPhase(params: {
  executionCtx: OpenFlowContext
  nodeExecutor: NodeExecutor | undefined
  sanitizedFeature: string | undefined
  qualityGateSession: QualityGateVisibleSession
  sessionID: string | undefined
  acceptanceState: Awaited<ReturnType<typeof loadAcceptanceState>> | null
  freshnessResult: EvidenceFreshnessResult
}): Promise<string> {
  const { executionCtx, nodeExecutor, sanitizedFeature, qualityGateSession, sessionID, acceptanceState, freshnessResult } = params

  let verifyOutput = ''
  try {
    logger.info('quality_gate', 'starting verify', { feature: sanitizedFeature })
    if (nodeExecutor?.executeVerify) {
      const mockAcceptFailures = acceptanceState?.acceptedFailures === true ? true : undefined
      verifyOutput = await nodeExecutor.executeVerify(executionCtx, sanitizedFeature, mockAcceptFailures, sessionID)
    } else if (freshnessResult.status === 'fresh' && acceptanceState?.verifyResult) {
      verifyOutput = buildVerifyOutputFromResult(acceptanceState.verifyResult, sanitizedFeature)
    } else {
      verifyOutput = `## Verify\n\nNo verify executor available. Provide a NodeExecutor with executeVerify.`
      logger.warn('quality_gate', 'no verify executor provided and no fresh evidence', { feature: sanitizedFeature })
    }
  } catch (err) {
    const verifyError = err instanceof Error ? err : new Error(String(err))
    verifyOutput = `## Verify\n\nError: verify execution failed: ${verifyError.message}`
    logger.error('quality_gate', 'verify execution failed', verifyError, { feature: sanitizedFeature })
  }
  await recordQualityGateSessionProgress(executionCtx, qualityGateSession, 'verify summary', [
    `status=${extractReadinessFromOutput(verifyOutput)}`,
    `freshness=${freshnessResult.status}`,
    `reused=${String(freshnessResult.status === 'fresh' && Boolean(acceptanceState?.verifyResult))}`,
  ])

  return verifyOutput
}

/**
 * Assess phase: aggregate harden/verify results, determine readiness, build report.
 */
async function runAssessPhase(params: {
  originalCtx: OpenFlowContext
  setup: QualityGateSetup
  detect: QualityGateDetect
  harden: { hardenDecision: 'none' | 'risk-based' | 'final'; hardenStatus: string | undefined; hardenOutput: string }
  verifyOutput: string
}): Promise<string> {
  const { originalCtx, setup, detect, harden, verifyOutput } = params

  const hardenGate = applyHardenReadinessGate(extractReadinessFromOutput(verifyOutput), harden.hardenStatus, harden.hardenOutput)

  // Build evidence packet from verify output + acceptance state for final-verify
  const verifyReadinessStatus = extractReadinessFromOutput(verifyOutput)
  const latestAcceptanceStateBeforeFinalVerify = await loadAcceptanceState(setup.executionCtx.directory)
  const evidencePacket = buildEvidencePacketForFinalVerify(
    verifyOutput,
    verifyReadinessStatus,
    latestAcceptanceStateBeforeFinalVerify?.verifyResult,
  )

  const finalVerifyResult = await handleFinalVerify({
    evidence: evidencePacket,
    verifyReadiness: verifyReadinessStatus,
    ...(harden.hardenStatus !== undefined ? { hardenStatus: harden.hardenStatus } : {}),
    ...(harden.hardenOutput ? { hardenOutput: harden.hardenOutput } : {}),
    feature: setup.sanitizedFeature || '',
    projectDir: setup.executionCtx.directory,
    activeRun: setup.activeRun,
    changedFiles: setup.changedFiles,
  })

  // C1+C4: quality-gate reads finalVerifyResult.readinessRecommendation as the primary source.
  let readiness = finalVerifyResult.readinessRecommendation
  const hardenUnavailableReason = parseHardenUnavailableReason(harden.hardenOutput)
  // C9: limited_context must not upgrade to full archive readiness
  if (detect.applicability.status === 'limited_context' && (readiness === 'ready' || readiness === 'ready_with_doc_updates')) {
    logger.info('quality_gate', 'limited_context readiness noted but not upgraded to archive readiness', { readiness })
  }
  const rootMismatch = finalVerifyResult.rootMismatch
    ? { mismatched: true, expected: setup.activeRun?.worktree || setup.activeRun?.directory || '', actual: setup.executionCtx.directory }
    : null

  logger.info('quality_gate', 'readiness determined from harden gate + final-verify', {
    readiness,
    hardenStatus: harden.hardenStatus,
    hardenGateReadiness: hardenGate.readiness,
    hardenReadinessBlocker: hardenGate.blocker,
    constraintSatisfaction: finalVerifyResult.constraintSatisfaction,
    rootMismatch: finalVerifyResult.rootMismatch,
  })
  await recordQualityGateSessionProgress(setup.executionCtx, setup.qualityGateSession, 'readiness', [
    `readiness=${readiness}`,
    `hardenStatus=${harden.hardenStatus ?? 'unknown'}`,
    `verifyStatus=${verifyReadinessStatus}`,
    `blockers=${hardenGate.blockingFindings.length}`,
    `docUpdates=${hardenGate.knownIssues.length}`,
    `constraintSatisfaction=${finalVerifyResult.constraintSatisfaction}`,
    rootMismatch ? `rootMismatch=expected ${rootMismatch.expected}, actual ${rootMismatch.actual}` : '',
    finalVerifyResult.planUncheckedTasks && finalVerifyResult.planUncheckedTasks > 0
      ? `planProgress=${(finalVerifyResult.planTotalTasks ?? 0) - finalVerifyResult.planUncheckedTasks}/${finalVerifyResult.planTotalTasks} tasks (unchecked blocks readiness)`
      : '',
  ])
  const verifyContent = stripOpenFlowHeader(verifyOutput)

  if (detect.applicability.status === 'applicable') {
    const stateChangedFiles = setup.implementationScopeFiles ?? setup.changedFiles
    if (readiness === 'ready' || readiness === 'ready_with_doc_updates') {
      await markImplementationVerified(setup.executionCtx.directory, { changedFiles: stateChangedFiles })
    } else if (readiness === 'not_ready' || readiness === 'needs_decision') {
      await markImplementationBlocked(setup.executionCtx.directory, { changedFiles: stateChangedFiles, fromVerify: true, qualityGateInvocationCount: setup.retryCount + 1 })
    }
  }

  const latestAcceptanceState = await loadAcceptanceState(setup.executionCtx.directory)
  if (latestAcceptanceState && latestAcceptanceState.feature === setup.sanitizedFeature) {
    latestAcceptanceState.qualityGateApplicability = detect.applicability
    if (detect.applicability.status === 'limited_context' && (readiness === 'ready' || readiness === 'ready_with_doc_updates')) {
      latestAcceptanceState.postHocIssue = true
    }
    if (harden.hardenOutput.trim()) {
      latestAcceptanceState.hardenSummary = buildHardenSummaryForAcceptanceState(harden.hardenStatus, harden.hardenOutput, hardenGate.findings, readiness)
    }
    await saveAcceptanceState(setup.executionCtx.directory, latestAcceptanceState)
  }

  // Generate implementation mapper if behavior doc exists
  if (setup.sanitizedFeature && (readiness === 'ready' || readiness === 'ready_with_doc_updates')) {
    try {
      const behaviorPath = await getChangeBehaviorPath(setup.executionCtx.directory, setup.sanitizedFeature, setup.executionCtx.config)
      await fs.access(behaviorPath)
      const changeWorkspacePath = await getChangeWorkspacePath(setup.executionCtx.directory, setup.sanitizedFeature, setup.executionCtx.config)
      const fileChanges: Array<{ filePath: string; tool: 'write' | 'edit' }> = setup.changedFiles.map(filePath => ({
        filePath,
        tool: 'edit' as const,
      }))
      const mapperResult: BehaviorCodeMapperResult = await generateBehaviorCodeMapper({
        feature: setup.sanitizedFeature,
        projectDir: setup.executionCtx.directory,
        behaviorPath,
        changes: fileChanges,
        readiness,
      })
      await saveImplementationMapperDocument(changeWorkspacePath, mapperResult.content)
      if (mapperResult.warning) {
        logger.warn('quality_gate', 'code-mapper generated with warning', { warning: mapperResult.warning, feature: setup.sanitizedFeature })
      }
    } catch {
      // Behavior doc or change workspace not available; skip mapper generation — C3
    }
  }

  // Build markdown report
  if (setup.activeRun) {
    await recordQualityGateRunCompletion(originalCtx, setup.activeRun, readiness, getImplementationRunStatusForReadiness(readiness, detect.applicability.status))
  }

  let report = buildQualityGateReport({
    feature: setup.sanitizedFeature || '(unresolved)',
    qualityGateSession: setup.qualityGateSession,
    contextKind: setup.contextKind,
    limitedContext: detect.limitedContext,
    applicability: detect.applicability,
    riskResult: detect.riskResult!,
    hardenDecision: harden.hardenDecision,
    ...(harden.hardenStatus !== undefined ? { hardenStatus: harden.hardenStatus } : {}),
    hardenOutput: harden.hardenOutput,
    readiness,
    hardenReadinessBlocker: getHardenReadinessBlocker(harden.hardenStatus, harden.hardenOutput),
    hardenUnavailableReason,
    knownIssues: hardenGate.knownIssues,
    blockingFindings: hardenGate.blockingFindings,
    blockerCount: hardenGate.blockingFindings.length + (hardenGate.blocker ? 1 : 0),
    docUpdateCount: hardenGate.knownIssues.length,
    verifyStatus: extractReadinessFromOutput(verifyOutput),
    verifyContent,
    freshnessResult: detect.freshnessResult!,
    changedFiles: setup.changedFiles,
    omittedFiles: setup.scopedWorkspace.omittedFiles,
    diffLines: setup.diffLines,
    rootMismatch: rootMismatch?.mismatched ? rootMismatch : null,
  })

  // Retry counter: if max retries reached and still not ready, escalate to user
  if (setup.retryCount >= 2 && (readiness === 'not_ready' || readiness === 'needs_decision')) {
    report += '\n\n---\n\n⚠️ **Maximum retry limit reached**: This quality gate has been invoked 3 times without achieving readiness. Please review the blockers above and provide guidance on how to proceed.'
  }

  logger.info('quality_gate', 'quality gate completed', { feature: setup.sanitizedFeature, readiness })
  return report
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
  implementationChangedFiles: string[] | undefined,
  config: OpenFlowConfig,
): Promise<QualityGateScopedWorkspace> {
  if (!feature || contextKind === 'limited' || contextKind === 'none') {
    return {
      diffText: fullDiffText,
      untrackedFiles: allUntrackedFiles,
      omittedFiles: [],
      scoped: false,
    }
  }

  const primaryScopeFiles = (implementationChangedFiles ?? []).map(file => file.replace(/\\/g, '/'))
  if (primaryScopeFiles.length > 0) {
    const diffScope = scopeDiffToFiles(fullDiffText, primaryScopeFiles, config.paths.archive)
    const untrackedScope = filterPathsToExactScope(allUntrackedFiles, primaryScopeFiles, config.paths.archive)
    const omittedFiles = [...new Set([...diffScope.omittedPaths, ...untrackedScope.omittedPaths])].sort()

    return {
      diffText: diffScope.diff,
      untrackedFiles: untrackedScope.scopedPaths,
      omittedFiles,
      scoped: true,
    }
  }

  const planPath = getPlanPath(projectDir, feature, config)
  const planContent = await readOptionalFile(planPath)
  const contextPaths = await findQualityGateContextPaths(projectDir, feature, config)
  const contextContent = await readExistingFiles(contextPaths)

  if (!planContent.trim() && !contextContent.trim()) {
    return {
      diffText: fullDiffText,
      untrackedFiles: allUntrackedFiles,
      omittedFiles: [],
      scoped: false,
    }
  }

  const diffScope = scopeDiffToFeature(projectDir, feature, fullDiffText, planPath, contextPaths, planContent, contextContent, config.paths.changes, config.paths.plans, config.paths.archive)
  const featureScope = collectFeatureScope(projectDir, feature, planPath, contextPaths, planContent, contextContent, config.paths.changes, config.paths.plans)
  const untrackedScope = filterPathsToFeatureScope(allUntrackedFiles, featureScope, config.paths.archive)
  const omittedFiles = [...new Set([...diffScope.omittedPaths, ...untrackedScope.omittedPaths])].sort()

  return {
    diffText: diffScope.diff,
    untrackedFiles: untrackedScope.scopedPaths,
    omittedFiles,
    scoped: diffScope.omittedPaths.length > 0 || untrackedScope.omittedPaths.length > 0,
  }
}

async function findQualityGateContextPaths(projectDir: string, feature: string, config: OpenFlowConfig): Promise<string[]> {
  const changesPath = config.paths.changes
  const candidates = [
    join(projectDir, changesPath, feature, 'design.md'),
    join(projectDir, changesPath, feature, 'issue-clarification.md'),
    ...(await tryGetChangeDirPatterns(projectDir, feature)),
    ...(await tryGetChangeUnitContextPaths(projectDir, feature, changesPath)),
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

async function tryGetChangeUnitContextPaths(projectDir: string, feature: string, changesPath = 'docs/changes'): Promise<string[]> {
  try {
    const changesDir = join(projectDir, changesPath)
    const dirs = await fs.readdir(changesDir)
    const fileNames = ['design.md', 'issue-clarification.md', 'requirements.md', 'behavior.md', 'plan.md']
    return dirs
      .filter(d => d.includes(feature))
      .flatMap(d => fileNames.map(fileName => join(projectDir, changesPath, d, fileName)))
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
    await fs.access(join(projectDir, ctx.config.paths.plans, `${feature}.md`))
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

function parseHardenUnavailableReason(output: string): string | undefined {
  const normalized = output.toLowerCase()
  if (normalized.includes('status: rejected') && normalized.includes('missing plan file')) {
    return 'harden_unavailable_missing_plan'
  }
  if (normalized.includes('status: rejected') && normalized.includes('no active plan')) {
    return 'harden_unavailable_missing_plan'
  }
  return undefined
}

function extractReadinessFromOutput(verifyOutput: string): string {
  const match = verifyOutput.match(/- status:\s*(\S+)/)
  return match?.[1] ?? VerifyReadinessStatus.NotReady
}

function parseFindingsSummary(hardenOutput: string): HardenFindingSummary[] {
  if (!hardenOutput.includes('### Findings Summary') && !hardenOutput.includes('### Findings Final State')) {
    return []
  }

  const findings: HardenFindingSummary[] = []
  const lines = hardenOutput.split('\n')
  let inBlock = false
  let currentGroup = ''

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '### Findings Summary' || trimmed === '### Findings Final State') {
      inBlock = true
      continue
    }

    if (!inBlock) {
      continue
    }

    if (trimmed.startsWith('### ')) {
      break
    }

    if (trimmed.startsWith('#### ')) {
      currentGroup = trimmed.slice(5).trim()
      continue
    }

    if (!trimmed) {
      continue
    }

    if (!trimmed.startsWith('-')) {
      continue
    }

    const raw = trimmed.slice(1).trim()
    if (!raw || raw === 'None') {
      continue
    }
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

    if (currentGroup && !fields.group) {
      fields.group = currentGroup
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
  } else if (parseHardenUnavailableReason(hardenOutput) === 'harden_unavailable_missing_plan') {
    blocker = null
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
      case 'known_issues_accepted':
        blocker = null
        break
      case 'budget_exhausted':
      case 'max_rounds_reached':
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
  const match = hardenOutput.match(/(?:Budget consumed|Total tokens consumed):\s*(\d+)/u)
  return Number(match?.[1] ?? '0')
}

function extractHardenRounds(hardenOutput: string): string {
  const match = hardenOutput.match(/Rounds:\s*(\d+)/u)
  return match?.[1] ?? '0'
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
  qualityGateSession: QualityGateVisibleSession
  contextKind: QualityGateContextKind
  limitedContext: boolean
  applicability: QualityGateApplicabilityResult
  riskResult: ReturnType<typeof decideQualityGateRisk>
  hardenDecision: string
  hardenStatus?: string
  hardenOutput: string
  readiness: string
  hardenReadinessBlocker: VerifyReadinessStatus | null
  hardenUnavailableReason: string | undefined
  knownIssues: HardenFindingSummary[]
  blockingFindings: string[]
  blockerCount: number
  docUpdateCount: number
  verifyStatus: string
  verifyContent: string
  freshnessResult: EvidenceFreshnessResult
  changedFiles: string[]
  omittedFiles: string[]
  diffLines: number
  rootMismatch: { expected: string; actual: string } | null
}

function buildQualityGateReport(input: QualityGateReportInput): string {
  const {
    feature,
    qualityGateSession,
    contextKind,
    limitedContext,
    applicability,
    riskResult,
    hardenDecision,
    hardenStatus,
    hardenOutput,
    readiness,
    hardenReadinessBlocker,
    hardenUnavailableReason,
    knownIssues,
    blockingFindings,
    blockerCount,
    docUpdateCount,
    verifyStatus,
    verifyContent,
    freshnessResult,
    changedFiles,
    omittedFiles,
    diffLines,
    rootMismatch,
  } = input

  const effectiveReadiness = hardenUnavailableReason === 'harden_unavailable_missing_plan' && applicability.archiveReadinessEligible
    ? 'needs_workflow_stage'
    : readiness

  const summarySection = [
    '### Quality Gate Result Summary',
    '',
    `- **Feature**: ${escapeMarkdown(feature)}`,
    `- **Session**: ${qualityGateSession.id ? escapeMarkdown(qualityGateSession.id) : 'unavailable (session reference)'}`,
    `- **Harden**: ${escapeMarkdown(hardenStatus ?? 'unknown')}`,
    `- Harden: ${escapeMarkdown(hardenStatus ?? 'unknown')}`,
    `- **Verify**: ${escapeMarkdown(verifyStatus)}`,
    `- Verify: ${escapeMarkdown(verifyStatus)}`,
    `- **Readiness**: ${escapeMarkdown(effectiveReadiness)}`,
    `- Readiness: ${escapeMarkdown(effectiveReadiness)}`,
    `- **Blockers**: ${blockerCount}`,
    `- Blockers: ${blockerCount}`,
    `- **Doc updates**: ${docUpdateCount}`,
    `- Doc updates: ${docUpdateCount}`,
    '- **Archive confirmation required**: yes',
    effectiveReadiness === VerifyReadinessStatus.Ready || effectiveReadiness === VerifyReadinessStatus.ReadyWithDocUpdates
      ? '- **Awaiting Archive Confirmation**: Archive will not run until the user explicitly confirms archive.'
      : '',
    '',
    '### Quality Gate Session Progress',
    '',
    `- Harden progress: ${escapeMarkdown(hardenStatus ?? 'unknown')}`,
    `- Verify summary: ${escapeMarkdown(verifyStatus)}`,
    `- Readiness: ${escapeMarkdown(effectiveReadiness)}`,
    `- Reviewer Session: parent: ${qualityGateSession.id ? escapeMarkdown(qualityGateSession.id) : 'unavailable'}`,
    `- Executor Session: parent: ${qualityGateSession.id ? escapeMarkdown(qualityGateSession.id) : 'unavailable'}`,
    '- round summary: see Harden Trace when harden ran',
    '',
  ].filter(Boolean).join('\n')

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
      ? `- **Workspace Contamination**: ${omittedFiles.length} non-primary file(s) detected; omitted from readiness risk and freshness checks`
      : '',
    omittedFiles.length > 0
      ? omittedFiles.map(f => `  - \`${escapeMarkdown(f)}\``).join('\n')
      : '',
    '',
  ].filter(Boolean).join('\n')

  // ── Risk Assessment section ───────────────────────────────────────────
  const riskSection = [
    buildApplicabilitySection(applicability),
    '',
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
  const readinessLabel = effectiveReadiness === VerifyReadinessStatus.Ready
    ? '✅ Ready'
    : effectiveReadiness === VerifyReadinessStatus.ReadyWithDocUpdates
      ? '📝 Ready (with doc updates)'
      : effectiveReadiness === VerifyReadinessStatus.NeedsDecision
        ? '⚠️ Needs Decision'
        : effectiveReadiness === 'needs_workflow_stage'
          ? '🚧 Needs Workflow Stage'
          : '❌ Not Ready'

  const readinessSection = [
    '### Readiness',
    '',
    `- **Status**: ${readinessLabel} (\`${effectiveReadiness}\`)`,
    hardenUnavailableReason ? `- **Harden Unavailable**: \`${hardenUnavailableReason}\`` : '',
    hardenReadinessBlocker
      ? `- **Harden Gate**: ❌ harden status \`${hardenStatus ?? 'unknown'}\` blocks archive readiness despite verify output.`
      : '',
    rootMismatch
      ? `- **Root Mismatch**: ❌ execution root does not match the active ImplementationRun. Expected \`${escapeMarkdown(rootMismatch.expected)}\`; actual \`${escapeMarkdown(rootMismatch.actual)}\`.`
      : '',
    ...blockingFindings.map(finding => `- ${finding}`),
    applicability.status === 'limited_context' ? '- **Limited Context**: ⚠️ technical verification only; this is not archive readiness.' : '',
    applicability.status === 'limited_context' ? `- Technical verification: ${verifyStatus}` : '',
    applicability.status === 'limited_context' ? '- Semantic archive readiness: unavailable' : '',
    applicability.status === 'limited_context' ? '- Full behavior/design context unavailable' : '',
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
  let nextCommand = ''
  if (applicability.status === 'limited_context') {
    nextStep = 'Technical verification completed, but semantic archive readiness is unavailable until full behavior/design context exists.'
    nextCommand = `/openflow-feature ${escapeMarkdown(feature)}`
  } else if (effectiveReadiness === VerifyReadinessStatus.Ready || effectiveReadiness === VerifyReadinessStatus.ReadyWithDocUpdates) {
    nextStep = `Quality gate passed for \`${escapeMarkdown(feature)}\`. Archive requires explicit user confirmation before proceeding.`
    nextCommand = `/openflow-archive ${escapeMarkdown(feature)}`
  } else if (effectiveReadiness === VerifyReadinessStatus.NeedsDecision) {
    nextStep = 'Blocking decision required. Review the findings above and decide how to proceed.'
    nextCommand = ''
  } else if (effectiveReadiness === 'needs_workflow_stage') {
    nextStep = 'Enter the explicit feature/planning workflow before archive readiness. Do not create a minimal plan or design merely to satisfy the gate.'
    nextCommand = `/openflow-feature ${escapeMarkdown(feature)}`
  } else {
    nextStep = 'Readiness issues identified. Review the findings above and address them.'
    nextCommand = ''
  }

  const nextStepSection = [
    '### Next Step',
    '',
    nextStep,
    ...(nextCommand ? ['', '```', nextCommand, '```'] : []),
    '',
  ].join('\n')

  return [
    '## Quality Gate',
    '',
    summarySection,
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

function buildApplicabilitySection(applicability: QualityGateApplicabilityResult): string {
  return [
    '### Applicability',
    '',
    `- **Status**: ${formatApplicabilityStatus(applicability.status)} (\`${applicability.status}\`)`,
    `- **Reason Code**: \`${applicability.reasonCode}\``,
    `- **Reason**: ${escapeMarkdown(applicability.reason)}`,
    `- **Task Kind**: \`${applicability.taskKind}\``,
    `- **Archive Readiness Eligible**: ${applicability.archiveReadinessEligible ? '✅ yes' : '❌ no'}`,
    '',
  ].join('\n')
}

function formatApplicabilityStatus(status: QualityGateApplicabilityResult['status']): string {
  switch (status) {
    case 'applicable': return 'Applicable'
    case 'not_applicable': return 'NotApplicable'
    case 'needs_workflow_stage': return 'NeedsWorkflowStage'
    case 'limited_context': return 'LimitedContext'
  }
}

function buildApplicabilityOnlyReport(input: {
  feature: string
  qualityGateSession: QualityGateVisibleSession
  contextKind: QualityGateContextKind
  limitedContext: boolean
  applicability: QualityGateApplicabilityResult
  changedFiles: string[]
  omittedFiles: string[]
  diffLines: number
}): string {
  const summarySection = [
    '### Summary',
    '',
    `- **Session**: ${input.qualityGateSession.id ? `\`${escapeMarkdown(input.qualityGateSession.id)}\`` : '`unavailable`'}`,
    `- **Harden Status**: \`skipped\``,
    `- **Verify Status**: \`skipped\``,
    `- **Readiness**: \`${VerifyReadinessStatus.NotReady}\``,
    '- **Blocker Count**: 1',
    '- **Doc Update Count**: 0',
    '- **Archive Confirmation**: explicit user confirmation is required before running archive',
    '',
  ].join('\n')

  const contextSection = [
    '### Context',
    '',
    `- **Feature**: ${escapeMarkdown(input.feature)}`,
    `- **Context Kind**: \`${input.contextKind}\``,
    input.limitedContext ? '- **Limited Context**: ⚠️ semantic context is limited or unavailable' : '',
    input.changedFiles.length > 0
      ? `- **Changed Files**: ${input.changedFiles.length} file(s) (${input.diffLines} diff lines)`
      : '- **Changed Files**: none detected',
    input.changedFiles.length > 0
      ? input.changedFiles.map(f => `  - \`${escapeMarkdown(f)}\``).join('\n')
      : '',
    input.omittedFiles.length > 0
      ? `- **Workspace Contamination**: ${input.omittedFiles.length} non-primary file(s) detected; omitted from applicability checks`
      : '',
    '',
  ].filter(Boolean).join('\n')

  return [
    '## Quality Gate',
    '',
    summarySection,
    contextSection,
    buildApplicabilitySection(input.applicability),
    '### Next Step',
    '',
    escapeMarkdown(input.applicability.nextStep),
    '',
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
