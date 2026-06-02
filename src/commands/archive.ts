import type { OpenFlowContext } from '../types.js'
import { resolveArchiveContext, validateArchive, collectArchiveArtifacts, finalizeArchive, cleanupStaging, formatArchiveReport } from '../phases/archive/index.js'
import type { ArchiveBlocker } from '../phases/archive/types.js'
import { setArchiveRunAwaitingConfirmation, setWaitingForDocUpdateConfirm, saveAcceptanceState } from '../utils/acceptance-state.js'

export async function handleArchive(ctx: OpenFlowContext, feature?: string): Promise<string> {
  if (!ctx.config.archive.enabled) {
    return 'Archive phase is disabled in configuration'
  }

  // Stage 1: Resolve
  const ac = await resolveArchiveContext(ctx, feature)

  // Stage 2: Validate
  const validation = await validateArchive(ctx, ac)
  if (!validation.allowed) {
    await applyBlockerActions(ctx, ac, validation.blockers)
    return validation.blockers[0]!.message
  }

  // Stage 3: Collect
  let collectResult
  try {
    collectResult = await collectArchiveArtifacts(ctx, ac, validation)
  } catch (error) {
    await cleanupStaging(ac.stagingDir)
    throw error
  }

  // Stage 4: Finalize
  let finalizeResult
  try {
    finalizeResult = await finalizeArchive(ctx, ac, collectResult.archivedSources)
  } catch (error) {
    await cleanupStaging(ac.stagingDir)
    throw error
  }

  // Stage 5: Report
  return formatArchiveReport({
    feature: ac.feature,
    archiveDir: finalizeResult.archiveDir,
    designExists: ac.designExists,
    planExists: ac.planExists,
    requirementsExists: ac.requirementsExists,
    hasAcceptanceChanges: ac.hasAcceptanceChanges,
    changeCount: collectResult.changes.length,
    promotionSuggestions: finalizeResult.promotionSuggestions,
    promotionAppliedCount: finalizeResult.promotionAppliedCount,
    autoPromoteCurrent: finalizeResult.autoPromoteCurrent,
    verificationPending: ac.acceptanceState?.phase === 'verification_pending' && !ac.acceptanceState.verificationCompletedAt,
    legacyReadinessWarning: ac.useLegacyReadinessFallback,
    docUpdateConfirmUsed: ac.acceptanceState?.archiveUsedDocUpdateConfirmPath === true,
    hasAcceptedKnownIssues: ac.hasAcceptedKnownIssues,
    archiveMode: ac.issueMode,
    issueClarificationExists: ac.issueClarificationExists,
    promotionCandidateExists: ac.promotionCandidateExists,
    issueResolutionGenerated: collectResult.issueResolutionGenerated,
    governanceDecisionTargetPath: collectResult.governanceDecisionTargetPath,
    hasImplementationMapper: ac.hasImplementationMapper,
    postHocIssueReady: ac.postHocIssueReady,
    worktreeCleanedUp: finalizeResult.worktreeCleanedUp,
    sourceCleanupSkipped: finalizeResult.sourceCleanupSkipped,
    isAdHoc: ac.mode === 'ad-hoc',
  })
}

async function applyBlockerActions(ctx: OpenFlowContext, ac: { feature: string; acceptanceState: unknown }, blockers: ArchiveBlocker[]): Promise<void> {
  for (const blocker of blockers) {
    if (blocker.action === 'set_awaiting_confirmation') {
      await setArchiveRunAwaitingConfirmation(ctx.directory)
    } else if (blocker.action === 'set_doc_update_waiting' && blocker.actionData?.pendingDocUpdates) {
      const state = ac.acceptanceState as { archiveUsedDocUpdateConfirmPath?: boolean } | null
      if (state && typeof state === 'object') {
        state.archiveUsedDocUpdateConfirmPath = true
        await saveAcceptanceState(ctx.directory, state as never)
      }
      await setWaitingForDocUpdateConfirm(ctx.directory, blocker.actionData.pendingDocUpdates[0]?.file ?? `docs/changes/${ac.feature}`)
    }
  }
}
