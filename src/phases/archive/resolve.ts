import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  VerifyReadinessStatus,
  type ImplementationRun,
  type OpenFlowContext,
} from '../../types.js'
import {
  ensureArchivePath,
  getBehaviorCandidatePaths,
  getChangePlansPath,
  getChangeWorkspacePath,
  getDesignCandidatePaths,
  getRequirementsCandidatePaths,
} from '../../config.js'
import { stripOpenFlowCommandTokens } from '../../commands/verify.js'
import { featureHasArtifacts, findActiveFeature } from '../../utils/feature-resolver.js'
import { createSafePath, sanitizeFeatureName } from '../../utils/security.js'
import { loadAcceptanceState } from '../../utils/acceptance-state.js'
import { implementationRunStore } from '../../utils/implementation-run.js'
import { fileExists } from '../../hooks/file-utils.js'
import { getBuildChanges, listBuilds } from '../../utils/file-tracker.js'
import {
  detectMode,
  detectPostHocIssueMode,
  ISSUE_CLARIFICATION_FILENAME,
  ISSUE_RESOLUTION_FILENAME,
  PROMOTION_CANDIDATE_FILENAME,
} from '../../utils/issue-utils.js'
import { ErrorCode, OpenFlowError } from '../../utils/errors.js'
import type { ArchiveContext, ArchiveFileChange, ArchiveMode } from './types.js'

const RECENT_BUILDS_WINDOW = 5

export async function resolveArchiveContext(ctx: OpenFlowContext, feature?: string): Promise<ArchiveContext> {
  // Raw-first feature resolution: prefer raw argument if it names an existing artifact,
  // otherwise fall back to the stripped version (see verify.ts for rationale).
  const rawFeature = feature?.trim() ? feature.trim().replace(/^`+|`+$/g, '') : undefined
  const strippedFeature = rawFeature ? stripOpenFlowCommandTokens(rawFeature) : undefined

  let candidateFeature: string | undefined
  if (rawFeature && rawFeature !== '') {
    if (await featureHasArtifacts(ctx, rawFeature)) {
      candidateFeature = rawFeature
    } else if (strippedFeature && strippedFeature !== '') {
      candidateFeature = strippedFeature
    } else {
      candidateFeature = rawFeature
    }
  } else if (strippedFeature && strippedFeature !== '') {
    candidateFeature = strippedFeature
  }

  const activeFeature = candidateFeature || await findActiveFeature(ctx)
  const acceptanceStateRaw = await loadAcceptanceState(ctx.directory)
  const isLimitedContext = acceptanceStateRaw?.feature?.startsWith('limited-context-') ?? false
  const fileChanges = await collectFileChanges(ctx.directory)
  const hasCodeChanges = fileChanges.length > 0
  const resolvedFeature = activeFeature || (isLimitedContext ? acceptanceStateRaw?.feature : undefined) || (hasCodeChanges ? acceptanceStateRaw?.feature ?? 'ad-hoc' : undefined)

  if (!resolvedFeature) {
    throw new OpenFlowError(ErrorCode.INVALID_INPUT, 'Feature name is required. Usage: /openflow-archive <feature-name>')
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  const matchingAcceptanceState = acceptanceStateRaw?.feature === sanitizedFeature ? acceptanceStateRaw : null
  const implementationRun = await resolveArchiveImplementationRun(ctx, sanitizedFeature)
  const issueMode = await detectMode(ctx, sanitizedFeature)

  const planPath = createSafePath(ctx.directory, ctx.config.paths.plans, `${sanitizedFeature}.md`)
  const sourceChangePlanPath = await getChangePlansPath(ctx.directory, sanitizedFeature)
  const sourceDesignPath = await resolveDocumentArtifact(
    await getDesignCandidatePaths(ctx.directory, sanitizedFeature, ctx.config),
    /^(?:design|\d{8}-design)\.md$/i,
  )
  const sourceRequirementsPath = await resolveDocumentArtifact(
    await getRequirementsCandidatePaths(ctx.directory, sanitizedFeature, ctx.config),
    /^(?:prd|\d{8}-prd)\.md$/i,
  )
  const sourceBehaviorPath = await resolveDocumentArtifact(
    await getBehaviorCandidatePaths(ctx.directory, sanitizedFeature, ctx.config),
    /^(?:behavior|\d{8}-behavior)\.md$/i,
  )
  const sourceChangeWorkspacePath = await getChangeWorkspacePath(ctx.directory, sanitizedFeature)
  const sourceArtifactRoot = sourceDesignPath ? path.dirname(sourceDesignPath) : sourceChangeWorkspacePath
  const finalArchiveDir = await ensureArchivePath(ctx.directory, sanitizedFeature, ctx.config)
  const archiveRoot = path.dirname(finalArchiveDir)
  const stagingDir = buildStagingArchiveDir(archiveRoot, sanitizedFeature)

  const designExists = Boolean(sourceDesignPath)
  const changePlanExists = await fileExists(sourceChangePlanPath)
  const fallbackPlanExists = await fileExists(planPath)
  const planExists = changePlanExists || fallbackPlanExists
  const requirementsExists = Boolean(sourceRequirementsPath)

  const issueClarificationSourcePath = await resolvePreferredExistingPath(ctx.directory, [
    acceptanceStateRaw?.issueClarificationPath,
    path.join(sourceChangeWorkspacePath, ISSUE_CLARIFICATION_FILENAME),
  ])
  const promotionCandidateSourcePath = await resolvePreferredExistingPath(ctx.directory, [
    acceptanceStateRaw?.promotionCandidatePath,
    path.join(sourceChangeWorkspacePath, PROMOTION_CANDIDATE_FILENAME),
  ])
  const issueResolutionSourcePath = await resolvePreferredExistingPath(ctx.directory, [
    path.join(sourceChangeWorkspacePath, ISSUE_RESOLUTION_FILENAME),
  ])
  const sourceImplementationMapperPath = path.join(sourceChangeWorkspacePath, 'implementation-mapper.md')
  const hasImplementationMapper = await fileExists(sourceImplementationMapperPath)

  const hasAcceptanceChanges = matchingAcceptanceState !== null && matchingAcceptanceState.pendingDocUpdates.length > 0
  const readiness = matchingAcceptanceState?.readiness
  const useLegacyReadinessFallback = matchingAcceptanceState !== null && readiness === undefined
  const acceptedKnownIssues = matchingAcceptanceState?.acceptedKnownIssues ?? []
  const hardenTerminalSummary = matchingAcceptanceState?.hardenTerminalSummary
  const hasAcceptedKnownIssues = (hardenTerminalSummary?.acceptedKnownIssueCount ?? 0) > 0 || acceptedKnownIssues.length > 0
  const isPostHocIssue = await detectPostHocIssueMode(ctx, sanitizedFeature, matchingAcceptanceState)
  let postHocIssueReady = isPostHocIssue && (
    readiness === VerifyReadinessStatus.Ready ||
    readiness === VerifyReadinessStatus.ReadyWithDocUpdates
  )

  if (acceptanceStateRaw !== null && matchingAcceptanceState === null && fallbackPlanExists && !designExists && hasCodeChanges) {
    postHocIssueReady = true
  }

  const mode: ArchiveMode = matchingAcceptanceState !== null && readiness !== undefined ? 'planned' : 'ad-hoc'
  const skipQualityGateChecks = implementationRun?.status === 'ready_for_archive'

  return {
    feature: sanitizedFeature,
    mode,
    acceptanceState: matchingAcceptanceState,
    rawAcceptanceState: acceptanceStateRaw,
    implementationRun,
    issueMode,
    sourcePaths: {
      design: sourceDesignPath,
      plan: changePlanExists ? sourceChangePlanPath : fallbackPlanExists ? planPath : null,
      prd: sourceRequirementsPath,
      behavior: sourceBehaviorPath,
      changeWorkspace: sourceChangeWorkspacePath,
      implementationMapper: hasImplementationMapper ? sourceImplementationMapperPath : null,
      issueClarification: issueClarificationSourcePath,
      promotionCandidate: promotionCandidateSourcePath,
      issueResolution: issueResolutionSourcePath,
      artifactRoot: sourceArtifactRoot,
    },
    planPath,
    archiveDir: finalArchiveDir,
    archiveRoot,
    stagingDir,
    designExists,
    planExists,
    requirementsExists,
    hasImplementationMapper,
    issueClarificationExists: issueClarificationSourcePath !== null,
    promotionCandidateExists: promotionCandidateSourcePath !== null,
    hasAcceptanceChanges,
    hasAcceptedKnownIssues,
    readiness,
    useLegacyReadinessFallback,
    isPostHocIssue,
    postHocIssueReady,
    skipQualityGateChecks,
  }
}

async function resolveArchiveImplementationRun(ctx: OpenFlowContext, feature: string): Promise<ImplementationRun | null> {
  const activeRun = await implementationRunStore.getActiveRun(ctx, feature)
  if (activeRun) {
    return activeRun
  }

  const runs = await implementationRunStore.listRuns(ctx, { feature })
  return runs[0] ?? null
}

async function collectFileChanges(projectDir: string): Promise<ArchiveFileChange[]> {
  const builds = await listBuilds(projectDir)
  const allChanges: ArchiveFileChange[] = []
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
