import { type CurrentPromotionSuggestion } from '../../types.js'
import { escapeMarkdown } from '../../utils/security.js'
import { ISSUE_CLARIFICATION_FILENAME, ISSUE_RESOLUTION_FILENAME, PROMOTION_CANDIDATE_FILENAME } from '../../utils/issue-utils.js'
import type { ArchiveBlocker } from './types.js'

export interface ReportOptions {
  feature: string
  archiveDir: string
  designExists: boolean
  planExists: boolean
  requirementsExists: boolean
  hasAcceptanceChanges: boolean
  changeCount: number
  promotionSuggestions: CurrentPromotionSuggestion[]
  promotionAppliedCount: number
  autoPromoteCurrent: boolean
  verificationPending: boolean
  legacyReadinessWarning: boolean
  docUpdateConfirmUsed: boolean
  hasAcceptedKnownIssues: boolean
  archiveMode: string
  issueClarificationExists: boolean
  promotionCandidateExists: boolean
  issueResolutionGenerated: boolean
  governanceDecisionTargetPath: string | null
  hasImplementationMapper: boolean
  postHocIssueReady: boolean
  worktreeCleanedUp: boolean
  sourceCleanupSkipped: boolean
  isAdHoc: boolean
}

export function formatBlockerMessage(blocker: ArchiveBlocker): string {
  return blocker.message
}

export function formatArchiveReport(opts: ReportOptions): string {
  const safePath = escapeMarkdown(opts.archiveDir)
  const reportedArchiveMode = opts.isAdHoc ? 'ad-hoc' : opts.postHocIssueReady ? 'post_hoc_issue' : opts.archiveMode
  const readinessWarningBlock = opts.legacyReadinessWarning
    ? '\n### Readiness\n- ⚠️ acceptance readiness is missing; proceeding with legacy drift/security fallback checks\n'
    : ''
  const docUpdateConfirmBlock = opts.docUpdateConfirmUsed
    ? '\n### Doc Update Confirmation\n- ✅ archive completed through the confirmed doc-update reconciliation path\n'
    : ''

  let issueArtifactsBlock = ''
  if (opts.archiveMode === 'issue' || opts.archiveMode === 'mixed') {
    issueArtifactsBlock = `- \`${safePath}/${ISSUE_CLARIFICATION_FILENAME}\` - Issue clarification snapshot${opts.issueClarificationExists ? '' : ' (not found)'}\n- \`${safePath}/${ISSUE_RESOLUTION_FILENAME}\` - Issue resolution archive${opts.issueResolutionGenerated ? '' : ' (not generated)'}\n${opts.promotionCandidateExists ? `- \`${safePath}/${PROMOTION_CANDIDATE_FILENAME}\` - Governance promotion candidate snapshot\n` : ''}`
  } else if (opts.postHocIssueReady) {
    issueArtifactsBlock = `- \`${safePath}/${ISSUE_CLARIFICATION_FILENAME}\` - Generated post-hoc issue clarification snapshot\n- \`${safePath}/${ISSUE_RESOLUTION_FILENAME}\` - Generated post-hoc issue resolution archive\n${opts.promotionCandidateExists ? `- \`${safePath}/${PROMOTION_CANDIDATE_FILENAME}\` - Generated post-hoc governance promotion candidate snapshot\n` : ''}`
  } else if (opts.isAdHoc) {
    issueArtifactsBlock = `- \`${safePath}/${ISSUE_CLARIFICATION_FILENAME}\` - Generated ad-hoc issue clarification\n- \`${safePath}/${ISSUE_RESOLUTION_FILENAME}\` - Generated ad-hoc issue resolution\n`
  }

  const governanceBlock = opts.archiveMode === 'issue' || opts.archiveMode === 'mixed' || opts.postHocIssueReady
    ? `\n### Governance Promotion\n- decision applied: ${opts.governanceDecisionTargetPath ? `✅ ${escapeMarkdown(opts.governanceDecisionTargetPath)}` : '❌ none'}\n`
    : ''
  const worktreeBlock = opts.worktreeCleanedUp
    ? '\n### Worktree\n- ✅ worktree merged and cleaned up\n'
    : ''
  const sourceCleanupBlock = opts.sourceCleanupSkipped
    ? '\n### ⚠️ Source Cleanup Skipped\nSource workspace files were **not** deleted because the archive safety gate failed (archive files not verified on disk, or worktree commit/merge failed). The `docs/changes/` directory is preserved. You can safely re-run archive or clean up manually.\n'
    : ''

  return `## Archive Complete

**Feature**: ${escapeMarkdown(opts.feature)}
**Archived**: ${new Date().toISOString()}
**Files Changed**: ${opts.changeCount}

### Contents
- Design documents: ${opts.designExists ? '✅' : '❌'}
- Requirements documents: ${opts.requirementsExists ? '✅' : '❌'}
- Plan: ${opts.planExists ? '✅' : '❌'}
- Implementation mapper: ${opts.hasImplementationMapper ? '✅' : '❌'}
- Behavior document: ✅
- Acceptance changes: ${opts.hasAcceptanceChanges ? '✅' : '❌'}
- Known issues accepted: ${opts.hasAcceptedKnownIssues ? '✅' : '❌'}
- Archive mode: ${escapeMarkdown(reportedArchiveMode)}

### Location
${safePath}

### Archived Files
${opts.hasImplementationMapper ? `- \`${safePath}/implementation-mapper.md\` - Copied from changes workspace` : ''}
- \`${safePath}/design.md\` - Design document (if exists)
- \`${safePath}/prd.md\` - Requirements / PRD document (if exists)
- \`${safePath}/plan.md\` - Execution plan snapshot (if exists)
${issueArtifactsBlock}

### Verification
- completion verification pending: ${opts.verificationPending ? '⚠️ yes (non-blocking)' : '✅ no'}
${readinessWarningBlock}
${docUpdateConfirmBlock}
${governanceBlock}
${worktreeBlock}
${sourceCleanupBlock}

### Current Promotion
- suggestions: ${opts.promotionSuggestions.length}
- auto apply: ${opts.autoPromoteCurrent ? 'enabled' : 'disabled'}
- applied: ${opts.promotionAppliedCount}
${formatPromotionSuggestions(opts.promotionSuggestions)}

### Next Step

This feature workflow is complete. To start a new change cycle, run:

\`\`\`
/openflow-feature <new-feature-name>
\`\`\`

Or describe a problem in natural conversation to investigate an issue.
`
}

function formatPromotionSuggestions(suggestions: CurrentPromotionSuggestion[]): string {
  if (suggestions.length === 0) return '- no ADD/UPDATE/REMOVE actions suggested'
  return suggestions.map(s => `- [${s.type}] ${s.targetArea}: ${escapeMarkdown(s.targetPath)} (${escapeMarkdown(s.reason)})`).join('\n')
}
