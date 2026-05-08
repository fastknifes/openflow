import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type CurrentPromotionSuggestion, type OpenFlowContext, type PhasedChanges, VerifyReadinessStatus } from '../types.js'
import { sanitizeFeatureName, createSafePath, escapeMarkdown } from '../utils/security.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { fileExists } from '../hooks/file-utils.js'
import { loadAcceptanceState, saveAcceptanceState, setWaitingForDocUpdateConfirm } from '../utils/acceptance-state.js'
import {
  applyPromotionSuggestions,
  buildPromotionSuggestions,
  generateAndSaveImplementationMapper,
  type ImplementationMapperOptions,
} from '../phases/archive/index.js'
import { getBuildChanges, listBuilds } from '../utils/file-tracker.js'
import { cleanBuild } from '../utils/build-cleaner.js'
import { getSessionFileChanges, getPhasedFileChanges } from '../utils/session.js'
import { detectDrift } from '../utils/drift-detector.js'
import { logger } from '../utils/logger.js'
import {
  ensureArchivePath,
  getChangeWorkspacePath,
  getChangePlansPath,
  getDesignCandidatePaths,
  getRequirementsCandidatePaths,
} from '../config.js'

const RECENT_BUILDS_WINDOW = 5

export async function handleArchive(ctx: OpenFlowContext, feature?: string): Promise<string> {
  if (!ctx.config.archive.enabled) {
    return 'Archive phase is disabled in configuration'
  }

  if (!feature) {
    throw new OpenFlowError(ErrorCode.INVALID_INPUT, 'Feature name is required. Usage: /openflow-archive <feature-name>')
  }

  const sanitizedFeature = sanitizeFeatureName(feature)

  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${sanitizedFeature}.md`)
  const sourceChangePlanPath = await getChangePlansPath(ctx.directory, sanitizedFeature)
  const sourceDesignPath = await resolveDocumentArtifact(await getDesignCandidatePaths(ctx.directory, sanitizedFeature, ctx.config), /^(?:design|\d{8}-design)\.md$/i)
  const sourceRequirementsPath = await resolveDocumentArtifact(await getRequirementsCandidatePaths(ctx.directory, sanitizedFeature, ctx.config), /^(?:prd|\d{8}-prd)\.md$/i)
  const sourceChangeWorkspacePath = await getChangeWorkspacePath(ctx.directory, sanitizedFeature)
  const sourceArtifactRoot = sourceDesignPath ? path.dirname(sourceDesignPath) : sourceChangeWorkspacePath
  const archiveDir = await ensureArchivePath(ctx.directory, sanitizedFeature, ctx.config)
  const archivedChangeWorkspaceSources = new Set<string>()

  const designExists = Boolean(sourceDesignPath)
  const changePlanExists = await fileExists(sourceChangePlanPath)
  const planExists = changePlanExists || !!(await fileExists(planPath))

  const requirementsExists = Boolean(sourceRequirementsPath)

  const acceptanceState = await loadAcceptanceState(ctx.directory)
  const hasAcceptanceChanges = acceptanceState !== null && acceptanceState.pendingDocUpdates.length > 0
  const readiness = acceptanceState?.readiness
  const useLegacyReadinessFallback = acceptanceState !== null && readiness === undefined

  if (readiness === VerifyReadinessStatus.NotReady || readiness === VerifyReadinessStatus.NeedsDecision) {
    return formatReadinessBlock(sanitizedFeature, readiness)
  }

  if (readiness === VerifyReadinessStatus.ReadyWithDocUpdates && acceptanceState) {
    const confirmationState = getArchiveDocUpdateConfirmationState(acceptanceState)

    if (!confirmationState.confirmed) {
      if (!confirmationState.waiting) {
        if (confirmationState.declined) {
          return formatDocUpdateConfirmationDeclined(sanitizedFeature, acceptanceState.pendingDocUpdates)
        }

        acceptanceState.archiveUsedDocUpdateConfirmPath = true
        await saveAcceptanceState(ctx.directory, acceptanceState)
        await setWaitingForDocUpdateConfirm(ctx.directory, acceptanceState.pendingDocUpdates[0]?.file ?? `docs/changes/${sanitizedFeature}`)
        return formatDocUpdateConfirmationRequired(sanitizedFeature, acceptanceState.pendingDocUpdates, false)
      }

      return formatDocUpdateConfirmationRequired(sanitizedFeature, acceptanceState.pendingDocUpdates, true)
    }
  }

  const buildChanges = await collectFileChanges(ctx.directory)
  const sessionChanges = await collectSessionFileChanges(ctx, acceptanceState?.sessionID)
  const changes = sessionChanges.length > 0 ? sessionChanges : buildChanges

  const phaseCutoff = acceptanceState?.implementationEndedAt ?? acceptanceState?.phaseStartedAt
  const phasedChanges = await collectPhasedSessionChanges(ctx, acceptanceState?.sessionID, phaseCutoff)
  const driftItems = await collectDriftItems(ctx, sourceDesignPath, phasedChanges)

  if (useLegacyReadinessFallback && driftItems.length > 0 && Boolean(ctx.config.archive.drift_check)) {
    return formatDriftDecisionRequired(sanitizedFeature, driftItems)
  }

  if (useLegacyReadinessFallback && acceptanceState?.verificationFailureCategory === 'security') {
    return formatSecurityVerificationBlock(sanitizedFeature)
  }

  await fs.mkdir(archiveDir, { recursive: true })

  if (sourceDesignPath && await fileExists(sourceDesignPath)) {
    await fs.copyFile(sourceDesignPath, path.join(archiveDir, 'design.md'))
    trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, sourceDesignPath)
  }

  if (changePlanExists) {
    await fs.copyFile(sourceChangePlanPath, path.join(archiveDir, 'plan.md'))
    trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, sourceChangePlanPath)
  } else if (planExists) {
    await fs.copyFile(planPath, path.join(archiveDir, 'plan.md'))
  }

  if (sourceRequirementsPath && await fileExists(sourceRequirementsPath)) {
    await fs.copyFile(sourceRequirementsPath, path.join(archiveDir, 'prd.md'))
    trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, sourceRequirementsPath)
  }

  if (await fileExists(sourceArtifactRoot)) {
    const entries = await fs.readdir(sourceArtifactRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!['proposal.md', 'decisions.md'].includes(entry.name)) continue
      const artifactSourcePath = path.join(sourceArtifactRoot, entry.name)
      await fs.copyFile(artifactSourcePath, path.join(archiveDir, entry.name))
      trackArchivedChangeWorkspaceSource(archivedChangeWorkspaceSources, sourceChangeWorkspacePath, artifactSourcePath)
    }
  }
  
  const implementationMapperOptions: ImplementationMapperOptions = {
    feature: sanitizedFeature,
    projectDir: ctx.directory,
    archiveDir,
    designPath: sourceDesignPath,
    requirementsPath: sourceRequirementsPath,
    designExists,
    planExists,
    changes,
    acceptanceState,
    ...(phasedChanges ? { phasedChanges } : {}),
    ...(driftItems.length > 0 ? { driftItems } : {}),
  }
  
  await generateAndSaveImplementationMapper(implementationMapperOptions)

  const promotionSuggestions = await buildPromotionSuggestions({
    projectDir: ctx.directory,
    archiveDir,
    feature: sanitizedFeature,
  })

  const autoPromoteCurrent = Boolean(ctx.config.archive.auto_promote_current)
  const promotionResult = autoPromoteCurrent
    ? await applyPromotionSuggestions({ projectDir: ctx.directory, suggestions: promotionSuggestions })
    : { applied: [] as CurrentPromotionSuggestion[], skipped: promotionSuggestions }

  await markArchivedIfNeeded(ctx, sanitizedFeature, promotionSuggestions, autoPromoteCurrent)

  await cleanupBuildData(ctx.directory)
  await cleanupArchivedChangeWorkspaceSources(sourceChangeWorkspacePath, archivedChangeWorkspaceSources)

  return formatArchiveResult(
    sanitizedFeature,
    archiveDir,
    designExists,
    planExists,
    requirementsExists,
    hasAcceptanceChanges,
    changes.length,
    promotionSuggestions,
    promotionResult.applied.length,
    autoPromoteCurrent,
    acceptanceState?.phase === 'verification_pending' && !acceptanceState.verificationCompletedAt,
    useLegacyReadinessFallback,
    acceptanceState?.archiveUsedDocUpdateConfirmPath === true
  )
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
  docUpdateConfirmUsed: boolean
): string {
  const safePath = escapeMarkdown(archiveDir)
  const readinessWarningBlock = legacyReadinessWarning
    ? `\n### Readiness\n- ⚠️ acceptance readiness is missing; proceeding with legacy drift/security fallback checks\n`
    : ''
  const docUpdateConfirmBlock = docUpdateConfirmUsed
    ? `\n### Doc Update Confirmation\n- ✅ archive completed through the confirmed doc-update reconciliation path\n`
    : ''
  

  return `## Archive Complete

**Feature**: ${escapeMarkdown(feature)}
**Archived**: ${new Date().toISOString()}
**Files Changed**: ${changeCount}

### Contents
- Design documents: ${designExists ? '✅' : '❌'}
- Requirements documents: ${requirementsExists ? '✅' : '❌'}
- Plan: ${planExists ? '✅' : '❌'}
- Implementation mapper: ✅
- Acceptance changes: ${hasAcceptanceChanges ? '✅' : '❌'}

### Location
${safePath}

### Generated Files
- \`${safePath}/implementation-mapper.md\` - Archived implementation traceability document
- \`${safePath}/design.md\` - Design document (if exists)
- \`${safePath}/prd.md\` - Requirements / PRD document (if exists)
- \`${safePath}/plan.md\` - Execution plan snapshot (if exists)

### Verification
- completion verification pending: ${verificationPending ? '⚠️ yes (non-blocking)' : '✅ no'}
${readinessWarningBlock}
${docUpdateConfirmBlock}

### Current Promotion
- suggestions: ${promotionSuggestions.length}
- auto apply: ${autoPromoteCurrent ? 'enabled' : 'disabled'}
- applied: ${promotionAppliedCount}
${formatPromotionSuggestions(promotionSuggestions)}
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
