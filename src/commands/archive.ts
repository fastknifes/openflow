import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type AcceptanceState, type CurrentPromotionSuggestion, type OpenFlowContext, type PhasedChanges, VerifyReadinessStatus } from '../types.js'
import { sanitizeFeatureName, createSafePath, escapeMarkdown } from '../utils/security.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { fileExists } from '../hooks/file-utils.js'
import { getImplementationState, loadAcceptanceState, saveAcceptanceState, setWaitingForDocUpdateConfirm } from '../utils/acceptance-state.js'
import {
  applyPromotionSuggestions,
  buildPromotionSuggestions,
} from '../phases/archive/index.js'
import { getBuildChanges, listBuilds } from '../utils/file-tracker.js'
import { cleanBuild } from '../utils/build-cleaner.js'
import { getSessionFileChanges, getPhasedFileChanges } from '../utils/session.js'
import { detectDrift } from '../utils/drift-detector.js'
import { logger } from '../utils/logger.js'
import {
  detectMode,
  ISSUE_CLARIFICATION_FILENAME,
  ISSUE_RESOLUTION_FILENAME,
  PROMOTION_CANDIDATE_FILENAME,
  type IssueMode,
} from '../utils/issue-utils.js'
import {
  ensureArchivePath,
  getChangeWorkspacePath,
  getChangePlansPath,
  getDesignCandidatePaths,
  getRequirementsCandidatePaths,
} from '../config.js'
import { stripOpenFlowCommandTokens } from './verify.js'
import { findActiveFeature } from '../utils/feature-resolver.js'

const RECENT_BUILDS_WINDOW = 5

export async function handleArchive(ctx: OpenFlowContext, feature?: string): Promise<string> {
  if (!ctx.config.archive.enabled) {
    return 'Archive phase is disabled in configuration'
  }

  let candidateFeature = feature?.trim() ? stripOpenFlowCommandTokens(feature.trim()) : undefined
  if (candidateFeature === '') candidateFeature = undefined

  const resolvedFeature = candidateFeature || await findActiveFeature(ctx)
  if (!resolvedFeature) {
    throw new OpenFlowError(ErrorCode.INVALID_INPUT, 'Feature name is required. Usage: /openflow-archive <feature-name>')
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const archiveMode = await detectMode(ctx, sanitizedFeature)

  const planPath = createSafePath(ctx.directory, ctx.config.paths.plans, `${sanitizedFeature}.md`)
  const sourceChangePlanPath = await getChangePlansPath(ctx.directory, sanitizedFeature)
  const sourceDesignPath = await resolveDocumentArtifact(await getDesignCandidatePaths(ctx.directory, sanitizedFeature, ctx.config), /^(?:design|\d{8}-design)\.md$/i)
  const sourceRequirementsPath = await resolveDocumentArtifact(await getRequirementsCandidatePaths(ctx.directory, sanitizedFeature, ctx.config), /^(?:prd|\d{8}-prd)\.md$/i)
  const sourceChangeWorkspacePath = await getChangeWorkspacePath(ctx.directory, sanitizedFeature)
  const sourceArtifactRoot = sourceDesignPath ? path.dirname(sourceDesignPath) : sourceChangeWorkspacePath
  const finalArchiveDir = await ensureArchivePath(ctx.directory, sanitizedFeature, ctx.config)
  const archiveRoot = path.dirname(finalArchiveDir)
  const stagingDir = buildStagingArchiveDir(archiveRoot, sanitizedFeature)
  const archivedChangeWorkspaceSources = new Set<string>()

  const designExists = Boolean(sourceDesignPath)
  const changePlanExists = await fileExists(sourceChangePlanPath)
  const planExists = changePlanExists || !!(await fileExists(planPath))

  const requirementsExists = Boolean(sourceRequirementsPath)

  const acceptanceStateRaw = await loadAcceptanceState(ctx.directory)
  const matchingAcceptanceState = acceptanceStateRaw?.feature === sanitizedFeature ? acceptanceStateRaw : null
  const issueClarificationSourcePath = await resolvePreferredExistingPath(ctx.directory, [
    acceptanceStateRaw?.issueClarificationPath,
    path.join(sourceChangeWorkspacePath, ISSUE_CLARIFICATION_FILENAME),
  ])
  const promotionCandidateSourcePath = await resolvePreferredExistingPath(ctx.directory, [
    acceptanceStateRaw?.promotionCandidatePath,
    path.join(sourceChangeWorkspacePath, PROMOTION_CANDIDATE_FILENAME),
  ])
  const issueClarificationExists = issueClarificationSourcePath !== null
  const issueResolutionSourcePath = await resolvePreferredExistingPath(ctx.directory, [
    path.join(sourceChangeWorkspacePath, ISSUE_RESOLUTION_FILENAME),
  ])
  const promotionCandidateExists = promotionCandidateSourcePath !== null
  const hasAcceptanceChanges = matchingAcceptanceState !== null && matchingAcceptanceState.pendingDocUpdates.length > 0
  const readiness = matchingAcceptanceState?.readiness
  const useLegacyReadinessFallback = matchingAcceptanceState !== null && readiness === undefined
  const acceptedKnownIssues = matchingAcceptanceState?.acceptedKnownIssues ?? []
  const hardenTerminalSummary = matchingAcceptanceState?.hardenTerminalSummary
  const hasAcceptedKnownIssues = (hardenTerminalSummary?.acceptedKnownIssueCount ?? 0) > 0 || acceptedKnownIssues.length > 0
  const gateApplicability = matchingAcceptanceState?.qualityGateApplicability

  if (gateApplicability && !gateApplicability.archiveReadinessEligible) {
    return formatQualityGateApplicabilityBlock(sanitizedFeature, gateApplicability.status, gateApplicability.nextStep)
  }

  if (readiness === VerifyReadinessStatus.NotReady || readiness === VerifyReadinessStatus.NeedsDecision) {
    return formatReadinessBlock(sanitizedFeature, readiness)
  }

  // Guard: if an acceptance state exists but belongs to a different feature,
  // refuse to proceed. Stale readiness must neither block nor allow the
  // requested feature — only matching readiness counts.
  if (acceptanceStateRaw !== null && matchingAcceptanceState === null) {
    return formatMissingReadinessBlock(sanitizedFeature, acceptanceStateRaw.feature)
  }

  if ((hardenTerminalSummary?.unresolvedMustFixCount ?? 0) > 0) {
    return formatHardenSummaryBlock(sanitizedFeature, 'unresolved harden must-fix findings')
  }

  if ((hardenTerminalSummary?.unresolvedNeedsDecisionCount ?? 0) > 0) {
    return formatHardenSummaryBlock(sanitizedFeature, 'harden summary requires decision')
  }

  if (readiness === VerifyReadinessStatus.ReadyWithDocUpdates && matchingAcceptanceState && !hasAcceptedKnownIssues) {
    const confirmationState = getArchiveDocUpdateConfirmationState(matchingAcceptanceState)

    if (!confirmationState.confirmed) {
      if (!confirmationState.waiting) {
        if (confirmationState.declined) {
          return formatDocUpdateConfirmationDeclined(sanitizedFeature, matchingAcceptanceState.pendingDocUpdates)
        }

        matchingAcceptanceState.archiveUsedDocUpdateConfirmPath = true
        await saveAcceptanceState(ctx.directory, matchingAcceptanceState)
        await setWaitingForDocUpdateConfirm(ctx.directory, matchingAcceptanceState.pendingDocUpdates[0]?.file ?? `docs/changes/${sanitizedFeature}`)
        return formatDocUpdateConfirmationRequired(sanitizedFeature, matchingAcceptanceState.pendingDocUpdates, false)
      }

      return formatDocUpdateConfirmationRequired(sanitizedFeature, matchingAcceptanceState.pendingDocUpdates, true)
    }
  }

  const implementationState = matchingAcceptanceState ? await getImplementationState(ctx.directory) : null
  const implementationStateValue = implementationState?.state ?? 'clean'

  if (matchingAcceptanceState && implementationStateValue !== 'clean' && implementationStateValue !== 'verified') {
    return formatImplementationStateBlock(sanitizedFeature, implementationStateValue)
  }

  const buildChanges = await collectFileChanges(ctx.directory)
  const sessionChanges = await collectSessionFileChanges(ctx, matchingAcceptanceState?.sessionID)
  const changes = sessionChanges.length > 0 ? sessionChanges : buildChanges

  const phaseCutoff = matchingAcceptanceState?.implementationEndedAt ?? matchingAcceptanceState?.phaseStartedAt
  const phasedChanges = await collectPhasedSessionChanges(ctx, matchingAcceptanceState?.sessionID, phaseCutoff)
  const driftItems = await collectDriftItems(ctx, sourceDesignPath, phasedChanges)

  if (useLegacyReadinessFallback && driftItems.length > 0 && Boolean(ctx.config.archive.drift_check)) {
    return formatDriftDecisionRequired(sanitizedFeature, driftItems)
  }

  if (useLegacyReadinessFallback && matchingAcceptanceState?.verificationFailureCategory === 'security') {
    return formatSecurityVerificationBlock(sanitizedFeature)
  }

  let issueResolutionGenerated = false
  let governanceDecisionTargetPath: string | null = null

  try {
    await fs.mkdir(stagingDir, { recursive: true })

    if (sourceDesignPath && await fileExists(sourceDesignPath)) {
      await fs.copyFile(sourceDesignPath, path.join(stagingDir, 'design.md'))
      trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, sourceDesignPath)
    }

    if (changePlanExists) {
      await fs.copyFile(sourceChangePlanPath, path.join(stagingDir, 'plan.md'))
      trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, sourceChangePlanPath)
    } else if (planExists) {
      await fs.copyFile(planPath, path.join(stagingDir, 'plan.md'))
    }

    if (sourceRequirementsPath && await fileExists(sourceRequirementsPath)) {
      await fs.copyFile(sourceRequirementsPath, path.join(stagingDir, 'prd.md'))
      trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, sourceRequirementsPath)
    }

    const sourceBehaviorPath = path.join(sourceChangeWorkspacePath, 'behavior.md')
    if (await fileExists(sourceBehaviorPath)) {
      await fs.copyFile(sourceBehaviorPath, path.join(stagingDir, 'behavior.md'))
      trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, sourceBehaviorPath)
    }

    if ((archiveMode === 'issue' || archiveMode === 'mixed') && issueClarificationSourcePath) {
      await fs.copyFile(issueClarificationSourcePath, path.join(stagingDir, ISSUE_CLARIFICATION_FILENAME))
      trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, issueClarificationSourcePath)
    }

    if ((archiveMode === 'issue' || archiveMode === 'mixed') && promotionCandidateSourcePath) {
      await fs.copyFile(promotionCandidateSourcePath, path.join(stagingDir, PROMOTION_CANDIDATE_FILENAME))
      trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, promotionCandidateSourcePath)
    }

    if (await fileExists(sourceArtifactRoot)) {
      const entries = await fs.readdir(sourceArtifactRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!['proposal.md', 'decisions.md'].includes(entry.name)) continue
        if (entry.name === PROMOTION_CANDIDATE_FILENAME) continue
        const artifactSourcePath = path.join(sourceArtifactRoot, entry.name)
        await fs.copyFile(artifactSourcePath, path.join(stagingDir, entry.name))
        trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, artifactSourcePath)
      }
    }

    const sourceImplementationMapperPath = path.join(sourceChangeWorkspacePath, 'implementation-mapper.md')
    const hasImplementationMapper = await fileExists(sourceImplementationMapperPath)
    if (hasImplementationMapper) {
      await fs.copyFile(sourceImplementationMapperPath, path.join(stagingDir, 'implementation-mapper.md'))
    }

    if ((archiveMode === 'issue' || archiveMode === 'mixed') && issueClarificationSourcePath) {
      if (issueResolutionSourcePath) {
        await fs.copyFile(issueResolutionSourcePath, path.join(stagingDir, ISSUE_RESOLUTION_FILENAME))
        trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, issueResolutionSourcePath)
      } else {
        await writeIssueResolution({
          projectDir: ctx.directory,
          archiveDir: finalArchiveDir,
          writeDir: stagingDir,
          feature: sanitizedFeature,
          mode: archiveMode,
          issueClarificationPath: issueClarificationSourcePath,
          promotionCandidatePath: promotionCandidateSourcePath,
          acceptanceState: matchingAcceptanceState,
          changes,
        })
      }
      issueResolutionGenerated = true

      governanceDecisionTargetPath = await applyGovernancePromotionIfConfirmed(
        ctx.directory,
        sanitizedFeature,
        matchingAcceptanceState,
        promotionCandidateSourcePath,
      )
    }

    const promotionSuggestions = await buildPromotionSuggestions({
      projectDir: ctx.directory,
      archiveDir: stagingDir,
      feature: sanitizedFeature,
    })

    const autoPromoteCurrent = Boolean(ctx.config.archive.auto_promote_current)
    const promotionResult = autoPromoteCurrent
      ? await applyPromotionSuggestions({ projectDir: ctx.directory, suggestions: promotionSuggestions })
      : { applied: [] as CurrentPromotionSuggestion[], skipped: promotionSuggestions }

    // All staged operations succeeded — rename staging to final archive path
    await fs.mkdir(archiveRoot, { recursive: true })
    await fs.rename(stagingDir, finalArchiveDir)

    // Post-rename: commit state and cleanup source workspace
    await markArchivedIfNeeded(ctx, sanitizedFeature, promotionSuggestions, autoPromoteCurrent)
    await cleanupBuildData(ctx.directory)
    await cleanupArchivedChangeWorkspaceSources(sourceChangeWorkspacePath, archivedChangeWorkspaceSources)

    return formatArchiveResult(
      sanitizedFeature,
      finalArchiveDir,
      designExists,
      planExists,
      requirementsExists,
      hasAcceptanceChanges,
      changes.length,
      promotionSuggestions,
      promotionResult.applied.length,
      autoPromoteCurrent,
      matchingAcceptanceState?.phase === 'verification_pending' && !matchingAcceptanceState.verificationCompletedAt,
      useLegacyReadinessFallback,
      matchingAcceptanceState?.archiveUsedDocUpdateConfirmPath === true,
      hasAcceptedKnownIssues,
      archiveMode,
      issueClarificationExists,
      promotionCandidateExists,
      issueResolutionGenerated,
      governanceDecisionTargetPath,
      hasImplementationMapper,
    )
  } catch (error) {
    // Clean up staging on any failure — leave source workspace untouched
    try {
      await fs.rm(stagingDir, { recursive: true, force: true })
    } catch {
      // Best effort cleanup
    }
    throw error
  }
}

async function cleanupArchivedChangeWorkspaceSources(changeWorkspacePath: string, archivedSources: ReadonlySet<string>): Promise<void> {
  const normalizedWorkspacePath = path.resolve(changeWorkspacePath)
  const sortedSources = [...archivedSources]
    .map(sourcePath => path.resolve(sourcePath))
    .filter(sourcePath => isDescendantPath(normalizedWorkspacePath, sourcePath))
    .sort((left, right) => right.length - left.length)

  for (const sourcePath of sortedSources) {
    try {
      await fs.rm(sourcePath, { force: true })
    } catch (error) {
      logger.debug('Failed to remove archived change workspace source', {
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const directoriesToPrune = new Set<string>()
  for (const sourcePath of sortedSources) {
    let currentDirectory = path.dirname(sourcePath)
    while (isDescendantPath(normalizedWorkspacePath, currentDirectory)) {
      directoriesToPrune.add(currentDirectory)
      if (currentDirectory === normalizedWorkspacePath) break
      currentDirectory = path.dirname(currentDirectory)
    }
  }

  const sortedDirectories = [...directoriesToPrune].sort((left, right) => right.length - left.length)
  for (const directoryPath of sortedDirectories) {
    try {
      const entries = await fs.readdir(directoryPath)
      if (entries.length === 0) {
        await fs.rmdir(directoryPath)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }

      logger.debug('Failed to prune archived change workspace directory', {
        directoryPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Force-remove the entire change workspace directory, including any
  // untracked files (e.g. behavior.md, leftover artifacts) that were not
  // explicitly tracked for individual cleanup above.
  try {
    await fs.rm(normalizedWorkspacePath, { recursive: true, force: true })
  } catch (error) {
    logger.debug('Failed to force-remove change workspace directory', {
      workspacePath: normalizedWorkspacePath,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function trackArchivedChangeWorkspaceSource(archivedSources: Set<string>, changeWorkspacePath: string, sourcePath: string): void {
  const normalizedSourcePath = path.resolve(sourcePath)
  if (!isDescendantPath(path.resolve(changeWorkspacePath), normalizedSourcePath)) {
    return
  }

  archivedSources.add(normalizedSourcePath)
}

function isDescendantPath(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

async function markArchivedIfNeeded(
  ctx: OpenFlowContext,
  feature: string,
  promotionSuggestions: CurrentPromotionSuggestion[],
  promotionApplied: boolean
): Promise<void> {
  const state = await loadAcceptanceState(ctx.directory)
  if (!state) return
  if (state.feature !== feature) return

  state.phase = promotionApplied ? 'promoted' : 'promotion_pending'
  state.waitingForDocUpdateConfirm = false
  state.promotionSuggestions = promotionSuggestions
  state.promotionApplied = promotionApplied
  state.promotionDecidedAt = new Date().toISOString()
  if (promotionApplied) {
    state.promotionAppliedAt = state.promotionDecidedAt
  }
  delete state.lastChangedFile
  await saveAcceptanceState(ctx.directory, state)
}

function formatSecurityVerificationBlock(feature: string): string {
  return `## Archive Blocked

Feature: ${escapeMarkdown(feature)}

Archive stopped because verification state reports **security failure**.

Please fix security issues first, then rerun archive.`
}

function formatHardenSummaryBlock(feature: string, reason: 'unresolved harden must-fix findings' | 'harden summary requires decision'): string {
  return `## Archive Blocked

Feature: ${escapeMarkdown(feature)}

Archive stopped because ${escapeMarkdown(reason)}.

Please resolve the remaining harden findings, then rerun archive.`
}

function formatReadinessBlock(
  feature: string,
  readiness: VerifyReadinessStatus.NotReady | VerifyReadinessStatus.NeedsDecision
): string {
  const statusLabel = readiness === VerifyReadinessStatus.NotReady ? 'not ready' : 'needs decision'
  const nextAction = readiness === VerifyReadinessStatus.NotReady
    ? 'Please finish the remaining acceptance work, rerun verification, then archive again.'
    : 'Please resolve the outstanding decision, rerun verification if needed, then archive again.'

  return `## Archive Blocked

Feature: ${escapeMarkdown(feature)}

Archive stopped because verification readiness is **${escapeMarkdown(statusLabel)}**.

${nextAction}`
}

function formatQualityGateApplicabilityBlock(
  feature: string,
  status: string,
  nextStep: string,
): string {
  return `## Archive Blocked

Feature: ${escapeMarkdown(feature)}

Archive stopped because the latest quality-gate applicability state is **${escapeMarkdown(status)}**, which is not archive readiness.

${escapeMarkdown(nextStep)}`
}

function formatMissingReadinessBlock(
  feature: string,
  staleFeature: string,
): string {
  return `## Archive Blocked

Feature: ${escapeMarkdown(feature)}

Archive stopped because no verification readiness was found for **${escapeMarkdown(feature)}**.

The current acceptance state (\`.sisyphus/acceptance.local.md\`) belongs to **${escapeMarkdown(staleFeature)}**, not **${escapeMarkdown(feature)}**.

Run \`/openflow-verify ${feature}\` to generate fresh readiness for this feature before archiving.`
}

function formatImplementationStateBlock(
  feature: string,
  state: string,
): string {
  return `## Archive Blocked

Feature: ${escapeMarkdown(feature)}

Archive stopped because implementation state is **${escapeMarkdown(state)}**.

Archive only accepts fresh matching verified state. Please rerun \`openflow-quality-gate\` for **${escapeMarkdown(feature)}** before archiving again.`
}

function getArchiveDocUpdateConfirmationState(state: {
  waitingForDocUpdateConfirm?: boolean
  archiveDocUpdateConfirmationStatus?: 'confirmed' | 'declined'
  archiveDocUpdateConfirmedAt?: string
}): { waiting: boolean; confirmed: boolean; declined: boolean } {
  return {
    waiting: state.waitingForDocUpdateConfirm === true,
    confirmed: state.archiveDocUpdateConfirmationStatus === 'confirmed' && Boolean(state.archiveDocUpdateConfirmedAt),
    declined: state.archiveDocUpdateConfirmationStatus === 'declined',
  }
}

function formatDocUpdateConfirmationRequired(
  feature: string,
  pendingDocUpdates: Array<{ file: string; timestamp: string; reason?: string }>,
  alreadyWaiting: boolean,
): string {
  const updates = pendingDocUpdates.length > 0
    ? pendingDocUpdates.map(update => `- ${escapeMarkdown(update.file)}${update.reason ? ` — ${escapeMarkdown(update.reason)}` : ''}`).join('\n')
    : '- No pending doc updates were recorded, but verification still requires confirmation.'

  const nextStep = alreadyWaiting
    ? 'Awaiting explicit confirmation through the existing acceptance reply flow before archive can continue.'
    : 'Review the pending document updates, confirm them through the existing acceptance reply flow, then rerun archive.'

  return `## Archive Confirmation Required

Feature: ${escapeMarkdown(feature)}

Archive is paused because verification readiness is **ready_with_doc_updates**.

### Pending Document Updates
${updates}

${nextStep}`
}

function formatDocUpdateConfirmationDeclined(
  feature: string,
  pendingDocUpdates: Array<{ file: string; timestamp: string; reason?: string }>,
): string {
  const updates = pendingDocUpdates.length > 0
    ? pendingDocUpdates.map(update => `- ${escapeMarkdown(update.file)}${update.reason ? ` — ${escapeMarkdown(update.reason)}` : ''}`).join('\n')
    : '- No pending doc updates were recorded.'

  return `## Archive Blocked

Feature: ${escapeMarkdown(feature)}

Archive cannot continue because the required document-update confirmation was explicitly declined.

### Pending Document Updates
${updates}

Please update the documents or reconfirm the doc-update path before rerunning archive.`
}

function hasSessionMessagesClient(client: unknown): client is {
  session: { messages: (args: { sessionID: string }) => Promise<{ data?: unknown[]; messages?: unknown[] }> }
} {
  if (!client || typeof client !== 'object') return false
  const candidate = client as { session?: { messages?: unknown } }
  return !!candidate.session && typeof candidate.session.messages === 'function'
}

async function collectSessionFileChanges(ctx: OpenFlowContext, sessionID?: string): Promise<Array<{ filePath: string; tool: 'write' | 'edit'; timestamp?: number }>> {
  if (!sessionID) return []
  if (!hasSessionMessagesClient(ctx.client)) return []

  try {
    return await getSessionFileChanges(ctx.client, sessionID)
  } catch {
    return []
  }
}

async function collectPhasedSessionChanges(
  ctx: OpenFlowContext,
  sessionID?: string,
  implementationEndTime?: string
): Promise<PhasedChanges | undefined> {
  const driftEnabled = Boolean(ctx.config.acceptance.drift_detection && ctx.config.archive.drift_check)

  if (!sessionID) {
    if (driftEnabled) {
      logger.warn('Cannot collect phased session changes: missing sessionID, drift detection skipped')
    }
    return undefined
  }
  if (!hasSessionMessagesClient(ctx.client)) {
    if (driftEnabled) {
      logger.warn('Cannot collect phased session changes: client session API unavailable, drift detection skipped', { sessionID })
    }
    return undefined
  }

  try {
    return await getPhasedFileChanges(ctx.client, sessionID, implementationEndTime)
  } catch {
    return undefined
  }
}

async function collectDriftItems(
  ctx: OpenFlowContext,
  designPath: string | null,
  phasedChanges?: PhasedChanges
) {
  const driftEnabled = Boolean(ctx.config.acceptance.drift_detection && ctx.config.archive.drift_check)
  if (!driftEnabled) return []
  if (!phasedChanges) return []
  if (!designPath) return []

  try {
    return await detectDrift(ctx.directory, path.dirname(designPath), phasedChanges)
  } catch {
    return []
  }
}

function formatDriftDecisionRequired(feature: string, driftItems: Array<{ item: string; reason: string; actualCode: string }>): string {
  const preview = driftItems.slice(0, 5).map(item => `- ${escapeMarkdown(item.item)}: ${escapeMarkdown(item.actualCode)}`).join('\n')
  return `## Drift Detected

Feature: ${escapeMarkdown(feature)}

Archive was paused because design drift was detected.

### Drift Items
${preview || '- (none)'}

### Next Actions
1. Update design docs, then run archive again.
2. Set \`openflow.archive.drift_check\` to \`false\` to record as known drift and continue archive.
3. Cancel archive and revisit implementation/design alignment.
`
}

async function collectFileChanges(projectDir: string) {
  const builds = await listBuilds(projectDir)
  const allChanges: Array<{ filePath: string; tool: 'write' | 'edit'; timestamp?: number }> = []
  const seenFilePaths = new Set<string>()
  
  for (const buildId of builds.slice(0, RECENT_BUILDS_WINDOW)) {
    const changes = await getBuildChanges(projectDir, buildId)
    for (const change of changes) {
      if (!seenFilePaths.has(change.filePath)) {
        seenFilePaths.add(change.filePath)
        allChanges.push(change)
      }
    }
  }
  
  return allChanges
}

async function cleanupBuildData(projectDir: string) {
  const builds = await listBuilds(projectDir)
  
  for (const buildId of builds.slice(RECENT_BUILDS_WINDOW)) {
    try {
      await cleanBuild({ projectDir, buildId })
    } catch (error) {
      logger.debug('Failed to clean archived build data', {
        buildId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

async function resolvePreferredExistingPath(projectDir: string, candidatePaths: Array<string | undefined | null>): Promise<string | null> {
  for (const candidatePath of candidatePaths) {
    if (!candidatePath) continue

    const normalizedPath = path.isAbsolute(candidatePath)
      ? candidatePath
      : createSafePath(projectDir, ...candidatePath.split(/[\\/]+/).filter(Boolean))

    if (await fileExists(normalizedPath)) {
      return normalizedPath
    }
  }

  return null
}

async function applyGovernancePromotionIfConfirmed(
  projectDir: string,
  feature: string,
  acceptanceState: AcceptanceState | null,
  promotionCandidatePath: string | null,
): Promise<string | null> {
  if (!promotionCandidatePath) return null
  if (acceptanceState?.governancePromotionStatus !== 'confirmed') return null

  const decisionsDir = createSafePath(projectDir, 'docs', 'decisions')
  const targetPath = createSafePath(projectDir, 'docs', 'decisions', `${feature}.md`)
  await fs.mkdir(decisionsDir, { recursive: true })
  await fs.copyFile(promotionCandidatePath, targetPath)
  return targetPath
}

async function writeIssueResolution(options: {
  projectDir: string
  archiveDir: string
  writeDir?: string
  feature: string
  mode: IssueMode
  issueClarificationPath: string
  promotionCandidatePath: string | null
  acceptanceState: AcceptanceState | null
  changes: Array<{ filePath: string; tool: 'write' | 'edit'; timestamp?: number }>
}): Promise<void> {
  const {
    projectDir,
    archiveDir,
    writeDir,
    feature,
    mode,
    issueClarificationPath,
    promotionCandidatePath,
    acceptanceState,
    changes,
  } = options
  const effectiveWriteDir = writeDir ?? archiveDir

  const issueClarification = await fs.readFile(issueClarificationPath, 'utf-8')
  const clarificationSections = parseMarkdownSections(issueClarification)
  const promotionCandidate = promotionCandidatePath && await fileExists(promotionCandidatePath)
    ? await fs.readFile(promotionCandidatePath, 'utf-8')
    : null
  const promotionSections = promotionCandidate ? parseMarkdownSections(promotionCandidate) : new Map<string, string>()
  const verifyResult = acceptanceState?.verifyResult
  const currentPromotions = acceptanceState?.pendingDocUpdates ?? []
  const changedFiles = changes.length > 0
    ? changes.map(change => `- \`${escapeMarkdown(change.filePath)}\` (${change.tool})`).join('\n')
    : '- No tracked file changes were recorded.'
  const semanticContractParts = [
    findSectionContent(clarificationSections, 'Requirement Clarification'),
    findSectionContent(clarificationSections, 'Constraint Clarification'),
    findSectionContent(clarificationSections, 'Semantic Alignment'),
  ].filter(Boolean)

  const governanceLines: string[] = []
  if (currentPromotions.length > 0) {
    governanceLines.push('### Confirmed Current Facts')
    governanceLines.push(currentPromotions.map((update: { file: string; reason?: string }) => `- \`${escapeMarkdown(update.file)}\`${update.reason ? ` — ${escapeMarkdown(update.reason)}` : ''}`).join('\n'))
    governanceLines.push('')
  }

  governanceLines.push('### Global Rule Promotion')
  governanceLines.push(`- status: ${escapeMarkdown(acceptanceState?.governancePromotionStatus ?? 'none')}`)
  if (promotionCandidatePath) {
    governanceLines.push(`- candidate archived at: \`${escapeMarkdown(path.join(archiveDir, PROMOTION_CANDIDATE_FILENAME))}\``)
  }
  if (acceptanceState?.governancePromotionStatus === 'confirmed' && promotionCandidatePath) {
    governanceLines.push(`- promoted decision path: \`${escapeMarkdown(path.relative(projectDir, createSafePath(projectDir, 'docs', 'decisions', `${feature}.md`)) || `docs/decisions/${feature}.md`)}\``)
  } else if (promotionCandidatePath) {
    governanceLines.push('- candidate remains pending and was not written to `docs/decisions/*`')
  } else {
    governanceLines.push('- no governance candidate was recorded for this issue')
  }
  const proposedDecision = findSectionContent(promotionSections, 'Proposed Decision')
  if (proposedDecision) {
    governanceLines.push('')
    governanceLines.push('### Proposed Decision Snapshot')
    governanceLines.push(proposedDecision)
  }

  const residualRiskLines: string[] = []
  if (verifyResult?.reasonCodes && verifyResult.reasonCodes.length > 0) {
    residualRiskLines.push(verifyResult.reasonCodes.map((code: string) => `- ${escapeMarkdown(code)}`).join('\n'))
  }
  if (acceptanceState?.readiness === VerifyReadinessStatus.ReadyWithDocUpdates && currentPromotions.length > 0) {
    residualRiskLines.push('- Archive completed through the doc-update confirmation path; ensure promoted current docs stay aligned.')
  }
  if (residualRiskLines.length === 0) {
    residualRiskLines.push('- No additional residual risk was recorded in the archive inputs.')
  }

  const rootCauseLines: string[] = []
  if (acceptanceState?.primaryClassification) {
    rootCauseLines.push(`- primary classification: ${escapeMarkdown(acceptanceState.primaryClassification)}`)
  }
  if (acceptanceState?.classifications && acceptanceState.classifications.length > 0) {
    rootCauseLines.push(`- classifications considered: ${escapeMarkdown(acceptanceState.classifications.join(', '))}`)
  }
  rootCauseLines.push(changes.length > 0
    ? '- Root cause was addressed in the tracked implementation changes listed below.'
    : '- Root cause was resolved without tracked code changes or the change tracker did not capture file edits.')

  const verificationLines: string[] = []
  verificationLines.push(`- readiness: ${escapeMarkdown(acceptanceState?.readiness ?? 'unknown')}`)
  if (verifyResult?.verifiedAt) {
    verificationLines.push(`- verified_at: ${escapeMarkdown(verifyResult.verifiedAt)}`)
  }
  if (verifyResult?.constraintsChecked && verifyResult.constraintsChecked.length > 0) {
    verificationLines.push(`- checks: ${verifyResult.constraintsChecked.map((check: string) => `\`${escapeMarkdown(check)}\``).join(', ')}`)
  }
  verificationLines.push(verifyResult?.evidenceSummary
    ? `- summary: ${escapeMarkdown(verifyResult.evidenceSummary)}`
    : '- summary: No persisted verify evidence summary was found in acceptance state.')

  const out = `# Issue Resolution

## Symptom
${findSectionContent(clarificationSections, 'Issue Intake') ?? `- Archived issue: \`${escapeMarkdown(feature)}\``}

## Evidence
${findSectionContent(clarificationSections, 'Evidence Investigation') ?? (verifyResult?.evidenceSummary ? escapeMarkdown(verifyResult.evidenceSummary) : '- No evidence notes were captured in issue clarification.')}

## Semantic Contract
${semanticContractParts.length > 0 ? semanticContractParts.join('\n\n') : '- No explicit semantic contract section was found in issue clarification.'}

## Root Cause
${rootCauseLines.join('\n')}

## Fix Decision
${findSectionContent(clarificationSections, 'Next Action Gate') ?? '- No explicit fix decision was captured in the issue clarification output.'}

## Implementation Summary
- archive mode: ${escapeMarkdown(mode)}
- changed files:
${changedFiles}

## Verification Evidence
${verificationLines.join('\n')}

## Governance Promotion
${governanceLines.join('\n')}

## Residual Risk
${residualRiskLines.join('\n')}
`

  await fs.writeFile(path.join(effectiveWriteDir, ISSUE_RESOLUTION_FILENAME), out, 'utf-8')
}

function parseMarkdownSections(markdown: string): Map<string, string> {
  const sectionRegex = /^(#{2,3})\s+(.+)$/gm
  const matches = [...markdown.matchAll(sectionRegex)]
  const sections = new Map<string, string>()

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    if (!match || match.index === undefined) continue

    const heading = match[2]?.trim()
    if (!heading) continue

    const start = match.index + match[0].length
    const end = index + 1 < matches.length && matches[index + 1]?.index !== undefined
      ? matches[index + 1]!.index
      : markdown.length
    const content = markdown.slice(start, end).trim()
    sections.set(heading, content)
  }

  return sections
}

function findSectionContent(sections: Map<string, string>, label: string): string | null {
  for (const [heading, content] of sections.entries()) {
    if (heading.includes(label)) {
      return content || null
    }
  }

  return null
}

function formatArchiveResult(
  feature: string,
  archiveDir: string,
  designExists: boolean,
  planExists: boolean,
  requirementsExists: boolean,
  hasAcceptanceChanges: boolean,
  changeCount: number,
  promotionSuggestions: CurrentPromotionSuggestion[],
  promotionAppliedCount: number,
  autoPromoteCurrent: boolean,
  verificationPending: boolean,
  legacyReadinessWarning: boolean,
  docUpdateConfirmUsed: boolean,
  hasAcceptedKnownIssues: boolean,
  archiveMode: IssueMode,
  issueClarificationExists: boolean,
  promotionCandidateExists: boolean,
  issueResolutionGenerated: boolean,
  governanceDecisionTargetPath: string | null,
  hasImplementationMapper: boolean,
): string {
  const safePath = escapeMarkdown(archiveDir)
  const readinessWarningBlock = legacyReadinessWarning
    ? `\n### Readiness\n- ⚠️ acceptance readiness is missing; proceeding with legacy drift/security fallback checks\n`
    : ''
  const docUpdateConfirmBlock = docUpdateConfirmUsed
    ? `\n### Doc Update Confirmation\n- ✅ archive completed through the confirmed doc-update reconciliation path\n`
    : ''
  const issueArtifactsBlock = archiveMode === 'issue' || archiveMode === 'mixed'
    ? `- \`${safePath}/${ISSUE_CLARIFICATION_FILENAME}\` - Issue clarification snapshot${issueClarificationExists ? '' : ' (not found)'}\n- \`${safePath}/${ISSUE_RESOLUTION_FILENAME}\` - Issue resolution archive${issueResolutionGenerated ? '' : ' (not generated)'}\n${promotionCandidateExists ? `- \`${safePath}/${PROMOTION_CANDIDATE_FILENAME}\` - Governance promotion candidate snapshot\n` : ''}`
    : ''
  const governanceBlock = archiveMode === 'issue' || archiveMode === 'mixed'
    ? `\n### Governance Promotion\n- decision applied: ${governanceDecisionTargetPath ? `✅ ${escapeMarkdown(governanceDecisionTargetPath)}` : '❌ none'}\n`
    : ''
  

  return `## Archive Complete

**Feature**: ${escapeMarkdown(feature)}
**Archived**: ${new Date().toISOString()}
**Files Changed**: ${changeCount}

### Contents
- Design documents: ${designExists ? '✅' : '❌'}
- Requirements documents: ${requirementsExists ? '✅' : '❌'}
- Plan: ${planExists ? '✅' : '❌'}
- Implementation mapper: ${hasImplementationMapper ? '✅' : '❌'}
- Behavior document: ✅
- Acceptance changes: ${hasAcceptanceChanges ? '✅' : '❌'}
- Known issues accepted: ${hasAcceptedKnownIssues ? '✅' : '❌'}
- Archive mode: ${escapeMarkdown(archiveMode)}

### Location
${safePath}

### Archived Files
${hasImplementationMapper ? `- \`${safePath}/implementation-mapper.md\` - Copied from changes workspace` : ''}
- \`${safePath}/design.md\` - Design document (if exists)
- \`${safePath}/design.md\` - Design document (if exists)
- \`${safePath}/prd.md\` - Requirements / PRD document (if exists)
- \`${safePath}/plan.md\` - Execution plan snapshot (if exists)
${issueArtifactsBlock}

### Verification
- completion verification pending: ${verificationPending ? '⚠️ yes (non-blocking)' : '✅ no'}
${readinessWarningBlock}
${docUpdateConfirmBlock}
${governanceBlock}

### Current Promotion
- suggestions: ${promotionSuggestions.length}
- auto apply: ${autoPromoteCurrent ? 'enabled' : 'disabled'}
- applied: ${promotionAppliedCount}
${formatPromotionSuggestions(promotionSuggestions)}

### Next Step

This feature workflow is complete. To start a new change cycle, run:

\`\`\`
/openflow-feature <new-feature-name>
\`\`\`

Or investigate a new issue:

\`\`\`
/openflow-issue "<problem description>"
\`\`\`
`
}

function formatPromotionSuggestions(suggestions: CurrentPromotionSuggestion[]): string {
  if (suggestions.length === 0) {
    return '- no ADD/UPDATE/REMOVE actions suggested'
  }

  return suggestions
    .map(s => `- [${s.type}] ${s.targetArea}: ${escapeMarkdown(s.targetPath)} (${escapeMarkdown(s.reason)})`)
    .join('\n')
}


async function resolveDocumentArtifact(paths: string[], pattern: RegExp): Promise<string | null> {
  for (const candidate of paths) {
    if (!(await fileExists(candidate))) continue

    try {
      const stats = await fs.stat(candidate)
      if (stats.isFile()) {
        return candidate
      }

      if (stats.isDirectory()) {
        const entries = await fs.readdir(candidate, { withFileTypes: true })
        const match = entries
          .filter(entry => entry.isFile() && pattern.test(entry.name))
          .map(entry => entry.name)
          .sort()
          .at(-1)
        if (match) {
          return path.join(candidate, match)
        }
      }
    } catch {
      continue
    }
  }

  return null
}

function buildStagingArchiveDir(archiveRoot: string, feature: string): string {
  return path.join(archiveRoot, `.staging-${feature}-${Date.now()}-${process.pid}`)
}
