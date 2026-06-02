import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { AcceptanceState, OpenFlowContext } from '../../types.js'
import { createSafePath } from '../../utils/security.js'
import { fileExists } from '../../hooks/file-utils.js'
import { getSessionFileChanges } from '../../utils/session.js'
import { getBuildChanges, listBuilds } from '../../utils/file-tracker.js'
import { ISSUE_CLARIFICATION_FILENAME, ISSUE_RESOLUTION_FILENAME, PROMOTION_CANDIDATE_FILENAME } from '../../utils/issue-utils.js'
import type { ArchiveContext, ValidationResult, ArchiveFileChange } from './types.js'
import { writeIssueResolution, writePostHocIssueArtifacts, generateAdHocIssueArtifacts } from './issue.js'

const RECENT_BUILDS_WINDOW = 5

export interface CollectResult {
  archivedSources: Set<string>
  changes: ArchiveFileChange[]
  issueResolutionGenerated: boolean
  governanceDecisionTargetPath: string | null
}

export async function collectArchiveArtifacts(
  ctx: OpenFlowContext,
  ac: ArchiveContext,
  _validationResult: ValidationResult,
): Promise<CollectResult> {
  const archivedSources = new Set<string>()
  const stagingDir = ac.stagingDir
  const sourcePaths = ac.sourcePaths
  const changeWorkspace = sourcePaths.changeWorkspace

  await fs.mkdir(stagingDir, { recursive: true })

  // Collect file changes
  const buildChanges = await collectFileChanges(ctx.directory)
  const sessionChanges = await collectSessionFileChanges(ctx, ac.acceptanceState?.sessionID)
  const changes = sessionChanges.length > 0 ? sessionChanges : buildChanges

  // Copy feature artifacts (skip for post-hoc and ad-hoc)
  if (!ac.postHocIssueReady && ac.mode !== 'ad-hoc') {
    if (sourcePaths.design && await fileExists(sourcePaths.design)) {
      await fs.copyFile(sourcePaths.design, path.join(stagingDir, 'design.md'))
      trackArchivedSource(archivedSources, changeWorkspace, sourcePaths.design)
    }

    if (sourcePaths.plan && await fileExists(sourcePaths.plan)) {
      await fs.copyFile(sourcePaths.plan, path.join(stagingDir, 'plan.md'))
      trackArchivedSource(archivedSources, changeWorkspace, sourcePaths.plan)
    }

    if (sourcePaths.prd && await fileExists(sourcePaths.prd)) {
      await fs.copyFile(sourcePaths.prd, path.join(stagingDir, 'prd.md'))
      trackArchivedSource(archivedSources, changeWorkspace, sourcePaths.prd)
    }

    if (sourcePaths.behavior && await fileExists(sourcePaths.behavior)) {
      await fs.copyFile(sourcePaths.behavior, path.join(stagingDir, 'behavior.md'))
      trackArchivedSource(archivedSources, changeWorkspace, sourcePaths.behavior)
    }

    // proposal.md / decisions.md from artifact root
    const artifactRoot = sourcePaths.artifactRoot
    if (artifactRoot && await fileExists(artifactRoot)) {
      const entries = await fs.readdir(artifactRoot, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!['proposal.md', 'decisions.md'].includes(entry.name)) continue
        if (entry.name === PROMOTION_CANDIDATE_FILENAME) continue
        const srcPath = path.join(artifactRoot, entry.name)
        await fs.copyFile(srcPath, path.join(stagingDir, entry.name))
        trackArchivedSource(archivedSources, changeWorkspace, srcPath)
      }
    }
  }

  // Implementation mapper
  if (sourcePaths.implementationMapper) {
    await fs.copyFile(sourcePaths.implementationMapper, path.join(stagingDir, 'implementation-mapper.md'))
  }

  let issueResolutionGenerated = false
  let governanceDecisionTargetPath: string | null = null

  // Issue/mixed mode artifacts
  if ((ac.issueMode === 'issue' || ac.issueMode === 'mixed') && sourcePaths.issueClarification) {
    await fs.copyFile(sourcePaths.issueClarification, path.join(stagingDir, ISSUE_CLARIFICATION_FILENAME))
    trackArchivedSource(archivedSources, changeWorkspace, sourcePaths.issueClarification)

    if (sourcePaths.promotionCandidate) {
      await fs.copyFile(sourcePaths.promotionCandidate, path.join(stagingDir, PROMOTION_CANDIDATE_FILENAME))
      trackArchivedSource(archivedSources, changeWorkspace, sourcePaths.promotionCandidate)
    }

    if (sourcePaths.issueResolution) {
      await fs.copyFile(sourcePaths.issueResolution, path.join(stagingDir, ISSUE_RESOLUTION_FILENAME))
      trackArchivedSource(archivedSources, changeWorkspace, sourcePaths.issueResolution)
    } else {
      await writeIssueResolution({
        projectDir: ctx.directory,
        archiveDir: ac.archiveDir,
        writeDir: stagingDir,
        feature: ac.feature,
        mode: ac.issueMode,
        issueClarificationPath: sourcePaths.issueClarification,
        promotionCandidatePath: sourcePaths.promotionCandidate,
        acceptanceState: ac.acceptanceState,
        changes,
      })
    }
    issueResolutionGenerated = true

    governanceDecisionTargetPath = await applyGovernancePromotionIfConfirmed(
      ctx.directory, ac.feature, ac.acceptanceState, sourcePaths.promotionCandidate,
    )
  }

  // Post-hoc issue artifacts
  if (ac.postHocIssueReady) {
    await writePostHocIssueArtifacts({
      writeDir: stagingDir,
      feature: ac.feature,
      acceptanceState: ac.acceptanceState,
      changes,
    })
    issueResolutionGenerated = true
  }

  // Ad-hoc mode artifacts
  if (ac.mode === 'ad-hoc' && !ac.postHocIssueReady) {
    await generateAdHocIssueArtifacts({
      writeDir: stagingDir,
      feature: ac.feature,
      changes,
    })
    issueResolutionGenerated = true
  }

  return { archivedSources, changes, issueResolutionGenerated, governanceDecisionTargetPath }
}

function trackArchivedSource(archivedSources: Set<string>, changeWorkspace: string, sourcePath: string): void {
  const normalized = path.resolve(sourcePath)
  if (isDescendantPath(path.resolve(changeWorkspace), normalized)) {
    archivedSources.add(normalized)
  }
}

function isDescendantPath(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function hasSessionMessagesClient(client: unknown): client is {
  session: { messages: (args: { sessionID: string }) => Promise<{ data?: unknown[]; messages?: unknown[] }> }
} {
  if (!client || typeof client !== 'object') return false
  const candidate = client as { session?: { messages?: unknown } }
  return !!candidate.session && typeof candidate.session.messages === 'function'
}

async function collectSessionFileChanges(ctx: OpenFlowContext, sessionID?: string): Promise<ArchiveFileChange[]> {
  if (!sessionID || !hasSessionMessagesClient(ctx.client)) return []
  try {
    return await getSessionFileChanges(ctx.client, sessionID)
  } catch {
    return []
  }
}

async function collectFileChanges(projectDir: string): Promise<ArchiveFileChange[]> {
  const builds = await listBuilds(projectDir)
  const allChanges: ArchiveFileChange[] = []
  const seen = new Set<string>()
  for (const buildId of builds.slice(0, RECENT_BUILDS_WINDOW)) {
    const changes = await getBuildChanges(projectDir, buildId)
    for (const change of changes) {
      if (!seen.has(change.filePath)) {
        seen.add(change.filePath)
        allChanges.push(change)
      }
    }
  }
  return allChanges
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
