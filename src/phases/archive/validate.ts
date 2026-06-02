import type { OpenFlowContext } from '../../types.js'
import { VerifyReadinessStatus } from '../../types.js'
import { getImplementationState } from '../../utils/acceptance-state.js'
import { escapeMarkdown } from '../../utils/security.js'
import type { ArchiveBlocker, ArchiveContext, ValidationResult } from './types.js'

type PendingDocUpdate = Array<{ file: string; timestamp: string; reason?: string }>
type DriftItem = { item: string; reason: string; actualCode: string }

export async function validateArchive(ctx: OpenFlowContext, ac: ArchiveContext): Promise<ValidationResult> {
  const blockers: ArchiveBlocker[] = []

  validateImplementationRun(ctx, ac, blockers)

  if (ac.mode === 'planned' && !ac.skipQualityGateChecks) {
    await validatePlannedArchive(ctx, ac, blockers)
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings: [],
    skipQualityGateChecks: ac.skipQualityGateChecks,
    postHocIssueReady: ac.postHocIssueReady,
  }
}

function validateImplementationRun(
  ctx: OpenFlowContext,
  ac: ArchiveContext,
  blockers: ArchiveBlocker[],
): void {
  const implementationRun = ac.implementationRun
  if (!implementationRun) return

  if (hasArchiveExecutionRootMismatch(implementationRun, ctx.directory) && implementationRun.status === 'ready_for_archive') {
    blockers.push({
      type: 'root_mismatch',
      feature: ac.feature,
      message: formatArchiveRootMismatchBlock(ac.feature, implementationRun.worktree ?? '', ctx.directory),
    })
    return
  }

  if (implementationRun.status === 'ready_for_archive') {
    if (!isArchiveRunConfirmed(ac.acceptanceState)) {
      blockers.push({
        type: 'run_confirmation',
        feature: ac.feature,
        message: formatArchiveRunConfirmationRequired(ac.feature),
        action: 'set_awaiting_confirmation',
      })
    }
    return
  }

  if (implementationRun.status !== 'archived') {
    blockers.push({
      type: 'run_status',
      feature: ac.feature,
      message: formatImplementationRunArchiveBlock(ac.feature, implementationRun.status),
    })
  }
}

async function validatePlannedArchive(
  ctx: OpenFlowContext,
  ac: ArchiveContext,
  blockers: ArchiveBlocker[],
): Promise<void> {
  const state = ac.acceptanceState
  const readiness = ac.readiness

  if (ac.rawAcceptanceState !== null && state === null && !ac.postHocIssueReady) {
    blockers.push({
      type: 'missing_readiness',
      feature: ac.feature,
      message: formatMissingReadinessBlock(ac.feature, ac.rawAcceptanceState.feature),
    })
  }

  const gateApplicability = state?.qualityGateApplicability
  if (gateApplicability && !gateApplicability.archiveReadinessEligible && !ac.postHocIssueReady) {
    blockers.push({
      type: 'applicability',
      feature: ac.feature,
      message: formatQualityGateApplicabilityBlock(ac.feature, gateApplicability.status, gateApplicability.nextStep),
    })
  }

  if (readiness === VerifyReadinessStatus.NotReady || readiness === VerifyReadinessStatus.NeedsDecision) {
    blockers.push({
      type: 'readiness',
      feature: ac.feature,
      message: formatReadinessBlock(ac.feature, readiness),
    })
  }

  const hardenTerminalSummary = state?.hardenTerminalSummary
  if ((hardenTerminalSummary?.unresolvedMustFixCount ?? 0) > 0) {
    blockers.push({
      type: 'harden',
      feature: ac.feature,
      message: formatHardenSummaryBlock(ac.feature, 'unresolved harden must-fix findings'),
    })
  }

  if ((hardenTerminalSummary?.unresolvedNeedsDecisionCount ?? 0) > 0) {
    blockers.push({
      type: 'harden',
      feature: ac.feature,
      message: formatHardenSummaryBlock(ac.feature, 'harden summary requires decision'),
    })
  }

  validateDocUpdateConfirmation(ac, blockers)

  const implementationState = state ? await getImplementationState(ctx.directory) : null
  const implementationStateValue = implementationState?.state ?? 'clean'
  if (state && implementationStateValue !== 'clean' && implementationStateValue !== 'verified') {
    blockers.push({
      type: 'implementation_state',
      feature: ac.feature,
      message: formatImplementationStateBlock(ac.feature, implementationStateValue),
    })
  }

  const driftItems = getDriftItems(ac)
  if (ac.useLegacyReadinessFallback && driftItems.length > 0 && Boolean(ctx.config.archive.drift_check)) {
    blockers.push({
      type: 'drift',
      feature: ac.feature,
      message: formatDriftDecisionRequired(ac.feature, driftItems),
    })
  }

  if (ac.useLegacyReadinessFallback && state?.verificationFailureCategory === 'security') {
    blockers.push({
      type: 'security',
      feature: ac.feature,
      message: formatSecurityVerificationBlock(ac.feature),
    })
  }
}

function validateDocUpdateConfirmation(ac: ArchiveContext, blockers: ArchiveBlocker[]): void {
  const state = ac.acceptanceState
  if (ac.readiness !== VerifyReadinessStatus.ReadyWithDocUpdates || !state || ac.hasAcceptedKnownIssues) return

  const confirmationState = getArchiveDocUpdateConfirmationState(state)
  if (confirmationState.confirmed) return

  if (!confirmationState.waiting && confirmationState.declined) {
    blockers.push({
      type: 'doc_update_declined',
      feature: ac.feature,
      message: formatDocUpdateConfirmationDeclined(ac.feature, state.pendingDocUpdates),
    })
    return
  }

  const blocker: ArchiveBlocker = {
    type: 'doc_update',
    feature: ac.feature,
    message: formatDocUpdateConfirmationRequired(ac.feature, state.pendingDocUpdates, confirmationState.waiting),
    actionData: { pendingDocUpdates: state.pendingDocUpdates },
  }

  if (!confirmationState.waiting) {
    blocker.action = 'set_doc_update_waiting'
  }

  blockers.push(blocker)
}

function hasArchiveExecutionRootMismatch(run: NonNullable<ArchiveContext['implementationRun']>, archiveRoot: string): boolean {
  if (run.worktreeKind !== 'derived' || !run.worktree) return false

  const normalize = (filePath: string) => filePath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
  return normalize(run.worktree) !== normalize(archiveRoot)
}

function isArchiveRunConfirmed(state: ArchiveContext['acceptanceState']): boolean {
  return state?.archiveRunConfirmationStatus === 'confirmed' && Boolean(state.archiveRunConfirmedAt)
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

function getDriftItems(ac: ArchiveContext): DriftItem[] {
  const candidate = (ac as ArchiveContext & { driftItems?: DriftItem[] }).driftItems
  return Array.isArray(candidate) ? candidate : []
}

function formatArchiveRootMismatchBlock(feature: string, expectedRoot: string, actualRoot: string): string {
  return [
    '## Archive Blocked — Root Mismatch',
    '',
    `- **Feature**: ${escapeMarkdown(feature)}`,
    `- **Expected Root**: \`${escapeMarkdown(expectedRoot)}\``,
    `- **Actual Root**: \`${escapeMarkdown(actualRoot)}\``,
    '',
    'Archive cannot proceed because the execution root does not match the implementation run\'s worktree.',
    '',
    'This implementation was executed in an isolated worktree. Archive must be run from that worktree context.',
  ].join('\n')
}

function formatImplementationRunArchiveBlock(feature: string, status: string): string {
  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', `Archive stopped because the implementation run status is **${escapeMarkdown(status)}**.`, '', `Archive requires a completed and verified implementation run. Please run \`openflow-quality-gate\` for **${escapeMarkdown(feature)}** and archive again after it reports ready.`].join('\n')
}

function formatSecurityVerificationBlock(feature: string): string {
  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', 'Archive stopped because verification state reports **security failure**.', '', 'Please fix security issues first, then rerun archive.'].join('\n')
}

function formatHardenSummaryBlock(feature: string, reason: 'unresolved harden must-fix findings' | 'harden summary requires decision'): string {
  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', `Archive stopped because ${escapeMarkdown(reason)}.`, '', 'Please resolve the remaining harden findings, then rerun archive.'].join('\n')
}

function formatReadinessBlock(feature: string, readiness: VerifyReadinessStatus.NotReady | VerifyReadinessStatus.NeedsDecision): string {
  const statusLabel = readiness === VerifyReadinessStatus.NotReady ? 'not ready' : 'needs decision'
  const nextAction = readiness === VerifyReadinessStatus.NotReady
    ? 'Please finish the remaining acceptance work, rerun verification, then archive again.'
    : 'Please resolve the outstanding decision, rerun verification if needed, then archive again.'
  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', `Archive stopped because verification readiness is **${escapeMarkdown(statusLabel)}**.`, '', nextAction].join('\n')
}

function formatQualityGateApplicabilityBlock(feature: string, status: string, nextStep: string): string {
  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', `Archive stopped because the latest quality-gate applicability state is **${escapeMarkdown(status)}**, which is not archive readiness.`, '', escapeMarkdown(nextStep)].join('\n')
}

function formatMissingReadinessBlock(feature: string, staleFeature: string): string {
  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', `Archive stopped because no verification readiness was found for **${escapeMarkdown(feature)}**.`, '', `The current acceptance state (\`.openflow/acceptance.local.md\`) belongs to **${escapeMarkdown(staleFeature)}**, not **${escapeMarkdown(feature)}**.`, '', '  Run `openflow-quality-gate` to generate fresh readiness for this feature before archiving.'].join('\n')
}

function formatImplementationStateBlock(feature: string, state: string): string {
  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', `Archive stopped because implementation state is **${escapeMarkdown(state)}**.`, '', `Archive only accepts fresh matching verified state. Please rerun \`openflow-quality-gate\` for **${escapeMarkdown(feature)}** before archiving again.`].join('\n')
}

function formatDocUpdateConfirmationRequired(feature: string, pendingDocUpdates: PendingDocUpdate, alreadyWaiting: boolean): string {
  const updates = pendingDocUpdates.length > 0
    ? pendingDocUpdates.map(update => `- ${escapeMarkdown(update.file)}${update.reason ? ` — ${escapeMarkdown(update.reason)}` : ''}`).join('\n')
    : '- No pending doc updates were recorded, but verification still requires confirmation.'
  const nextStep = alreadyWaiting
    ? 'Awaiting explicit confirmation through the existing acceptance reply flow before archive can continue.'
    : 'Review the pending document updates, confirm them through the existing acceptance reply flow, then rerun archive.'

  return ['## Archive Confirmation Required', '', `Feature: ${escapeMarkdown(feature)}`, '', 'Archive is paused because verification readiness is **ready_with_doc_updates**.', '', '### Pending Document Updates', updates, '', nextStep].join('\n')
}

function formatDocUpdateConfirmationDeclined(feature: string, pendingDocUpdates: PendingDocUpdate): string {
  const updates = pendingDocUpdates.length > 0
    ? pendingDocUpdates.map(update => `- ${escapeMarkdown(update.file)}${update.reason ? ` — ${escapeMarkdown(update.reason)}` : ''}`).join('\n')
    : '- No pending doc updates were recorded.'

  return ['## Archive Blocked', '', `Feature: ${escapeMarkdown(feature)}`, '', 'Archive cannot continue because the required document-update confirmation was explicitly declined.', '', '### Pending Document Updates', updates, '', 'Please update the documents or reconfirm the doc-update path before rerunning archive.'].join('\n')
}

function formatArchiveRunConfirmationRequired(feature: string): string {
  return ['## Archive Confirmation Required', '', `Feature: ${escapeMarkdown(feature)}`, '', 'Archive is paused because the implementation run is **Awaiting Archive Confirmation**.', '', `Archive requires explicit user confirmation before proceeding. Please confirm archive readiness, then rerun \`/openflow-archive ${escapeMarkdown(feature)}\`.`].join('\n')
}

function formatDriftDecisionRequired(feature: string, driftItems: DriftItem[]): string {
  const preview = driftItems.slice(0, 5).map(item => `- ${escapeMarkdown(item.item)}: ${escapeMarkdown(item.actualCode)}`).join('\n')
  return ['## Drift Detected', '', `Feature: ${escapeMarkdown(feature)}`, '', 'Archive was paused because design drift was detected.', '', '### Drift Items', preview || '- (none)', '', '### Next Actions', '1. Update design docs, then run archive again.', '2. Set `openflow.archive.drift_check` to `false` to record as known drift and continue archive.', '3. Cancel archive and revisit implementation/design alignment.', ''].join('\n')
}
