import { execSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import type { OpenFlowContext, QualityGateContextKind } from '../types.js'
import { VerifyReadinessStatus } from '../types.js'
import type { EvidenceFreshnessResult } from '../types.js'
import { handleHarden } from './harden.js'
import { handleVerify } from './verify.js'
import { findActiveFeature } from '../utils/feature-resolver.js'
import { loadAcceptanceState } from '../utils/acceptance-state.js'
import { decideQualityGateRisk, type QualityGateRiskInput } from '../utils/risk-assessment.js'
import { captureCurrentWorkspaceState, classifyEvidenceFreshness } from '../utils/evidence-freshness.js'
import { escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { detectMode } from '../utils/issue-utils.js'

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
    sessionID?: string,
  ) => Promise<string>
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
  const diffText = readGitDiff(ctx.directory)
  const untrackedFiles = readGitUntracked(ctx.directory)
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
  const workspaceState = captureCurrentWorkspaceState(ctx.directory)
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
      verifyOutput = await internalOpts.overrideVerify(ctx, sanitizedFeature, sessionID)
    } else {
      verifyOutput = await handleVerify(ctx, sanitizedFeature, undefined, undefined, sessionID)
    }
  } catch (err) {
    verifyOutput = `## Verify\n\nError: verify execution failed: ${err instanceof Error ? err.message : String(err)}`
  }

  // ── 8. Extract readiness from verify output ─────────────────────────────
  const readiness = extractReadinessFromOutput(verifyOutput)
  const verifyContent = stripOpenFlowHeader(verifyOutput)

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
    verifyContent,
    freshnessResult,
    changedFiles,
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
  verifyContent: string
  freshnessResult: EvidenceFreshnessResult
  changedFiles: string[]
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
    verifyContent,
    freshnessResult,
    changedFiles,
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
    hardenStatus && hardenStatus !== 'skipped' && hardenStatus !== 'disabled'
      ? [
          '',
          '<details>',
          '<summary>Harden Output</summary>',
          '',
          hardenOutput,
          '',
          '</details>',
        ].join('\n')
      : '',
    '',
  ].filter(Boolean).join('\n')

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
    limitedContext ? '- **Limited Context**: ⚠️ readiness reflects technical verification only — semantic alignment was not possible' : '',
    '',
  ].join('\n')

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
    verifySection,
    readinessSection,
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
