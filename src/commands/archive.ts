import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CurrentPromotionSuggestion, OpenFlowContext, PhasedChanges } from '../types.js'
import { sanitizeFeatureName, createSafePath, safeCopyDirectory, escapeMarkdown } from '../utils/security.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { fileExists } from '../hooks/file-utils.js'
import { loadAcceptanceState, saveAcceptanceState } from '../utils/acceptance-state.js'
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
    throw new OpenFlowError(ErrorCode.INVALID_INPUT, 'Feature name is required. Usage: /openflow/archive <feature-name>')
  }

  const sanitizedFeature = sanitizeFeatureName(feature)

  const archiveDir = createSafePath(ctx.directory, ctx.config.archive.output_dir, sanitizedFeature)
  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${sanitizedFeature}.md`)
  const changePlansDir = getChangePlansPath(ctx.directory, sanitizedFeature)
  const designDir = await resolveFirstExistingPath(getDesignCandidatePaths(ctx.directory, sanitizedFeature, ctx.config))
  const requirementsDir = await resolveFirstExistingPath(getRequirementsCandidatePaths(ctx.directory, sanitizedFeature, ctx.config))

  await fs.mkdir(archiveDir, { recursive: true })

  const designExists = Boolean(designDir)
  if (designDir) {
    const designArchiveDir = path.join(archiveDir, 'design')
    await safeCopyDirectory(designDir, designArchiveDir, ctx.directory)
  }

  const changePlansExists = await fileExists(changePlansDir)
  const planExists = changePlansExists || !!(await fileExists(planPath))
  if (changePlansExists) {
    const planArchiveDir = path.join(archiveDir, 'plans')
    await safeCopyDirectory(changePlansDir, planArchiveDir, ctx.directory)
  } else if (planExists) {
    const planArchiveDir = path.join(archiveDir, 'plans')
    await fs.mkdir(planArchiveDir, { recursive: true })
    await fs.copyFile(planPath, path.join(planArchiveDir, 'tasks.md'))
  }

  const requirementsExists = Boolean(requirementsDir)
  if (requirementsDir) {
    const requirementsArchiveDir = path.join(archiveDir, 'requirements')
    await safeCopyDirectory(requirementsDir, requirementsArchiveDir, ctx.directory)
  }

  const acceptanceState = await loadAcceptanceState(ctx.directory)
  const hasAcceptanceChanges = acceptanceState !== null && acceptanceState.pendingDocUpdates.length > 0

  const buildChanges = await collectFileChanges(ctx.directory)
  const sessionChanges = await collectSessionFileChanges(ctx, acceptanceState?.sessionID)
  const changes = sessionChanges.length > 0 ? sessionChanges : buildChanges

  const phaseCutoff = acceptanceState?.implementationEndedAt ?? acceptanceState?.phaseStartedAt
  const phasedChanges = await collectPhasedSessionChanges(ctx, acceptanceState?.sessionID, phaseCutoff)
  const driftItems = await collectDriftItems(ctx, designDir, phasedChanges)

  if (driftItems.length > 0 && Boolean(ctx.config.archive.drift_check)) {
    return formatDriftDecisionRequired(sanitizedFeature, driftItems)
  }

  if (acceptanceState?.verificationFailureCategory === 'security') {
    return formatSecurityVerificationBlock(sanitizedFeature)
  }
  
  const implementationMapperOptions: ImplementationMapperOptions = {
    feature: sanitizedFeature,
    archiveDir,
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
    acceptanceState?.phase === 'verification_pending' && !acceptanceState.verificationCompletedAt
  )
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
  designDir: string | null,
  phasedChanges?: PhasedChanges
) {
  const driftEnabled = Boolean(ctx.config.acceptance.drift_detection && ctx.config.archive.drift_check)
  if (!driftEnabled) return []
  if (!phasedChanges) return []
  if (!designDir) return []

  try {
    return await detectDrift(ctx.directory, designDir, phasedChanges)
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
  verificationPending: boolean
): string {
  const safePath = escapeMarkdown(archiveDir)

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
- \`${safePath}/design/\` - Design documents (if exists)
- \`${safePath}/requirements/\` - Requirements documents (if exists)
- \`${safePath}/plans/\` - Execution plans (if exists)

### Verification
- completion verification pending: ${verificationPending ? '⚠️ yes (non-blocking)' : '✅ no'}

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

async function resolveFirstExistingPath(paths: string[]): Promise<string | null> {
  for (const candidate of paths) {
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  return null
}
