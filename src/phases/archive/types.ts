import type { AcceptanceState, ImplementationRun, PhasedChanges, VerifyReadinessStatus } from '../../types.js'
import type { IssueMode } from '../../utils/issue-utils.js'

export type ArchiveMode = 'planned' | 'ad-hoc'

export interface ArchiveSourcePaths {
  design: string | null
  plan: string | null
  prd: string | null
  behavior: string | null
  changeWorkspace: string
  implementationMapper: string | null
  issueClarification: string | null
  promotionCandidate: string | null
  issueResolution: string | null
  artifactRoot: string
}

export interface ArchiveContext {
  feature: string
  mode: ArchiveMode
  acceptanceState: AcceptanceState | null
  rawAcceptanceState: AcceptanceState | null
  implementationRun: ImplementationRun | null
  issueMode: IssueMode
  sourcePaths: ArchiveSourcePaths
  planPath: string
  archiveDir: string
  archiveRoot: string
  stagingDir: string
  designExists: boolean
  planExists: boolean
  requirementsExists: boolean
  hasImplementationMapper: boolean
  issueClarificationExists: boolean
  promotionCandidateExists: boolean
  hasAcceptanceChanges: boolean
  hasAcceptedKnownIssues: boolean
  readiness: VerifyReadinessStatus | undefined
  useLegacyReadinessFallback: boolean
  isPostHocIssue: boolean
  postHocIssueReady: boolean
  skipQualityGateChecks: boolean
}

export type ArchiveBlockerType =
  | 'readiness'
  | 'harden'
  | 'doc_update'
  | 'implementation_state'
  | 'drift'
  | 'root_mismatch'
  | 'run_status'
  | 'applicability'
  | 'security'
  | 'missing_readiness'
  | 'quality_gate_first'
  | 'run_confirmation'
  | 'doc_update_declined'

export interface ArchiveBlocker {
  type: ArchiveBlockerType
  message: string
  feature: string
  /** For blockers that need state mutation (e.g. set awaiting confirmation) */
  action?: 'set_awaiting_confirmation' | 'set_doc_update_waiting' | 'save_acceptance_state'
  /** Extra data needed by the action */
  actionData?: {
    pendingDocUpdates?: Array<{ file: string; timestamp: string; reason?: string }>
  }
}

export interface ValidationResult {
  allowed: boolean
  blockers: ArchiveBlocker[]
  warnings: string[]
  skipQualityGateChecks: boolean
  postHocIssueReady: boolean
}

export interface ArchiveFileChange {
  filePath: string
  tool: 'write' | 'edit'
  timestamp?: number
}

export interface FinalizeResult {
  archiveDir: string
  archiveCommitHash: string | undefined
  worktreeCleanedUp: boolean
  sourceCleanupSkipped: boolean
  promotionApplied: boolean
  promotionSuggestions: import('../../types.js').CurrentPromotionSuggestion[]
  promotionAppliedCount: number
  autoPromoteCurrent: boolean
}

export interface ArchiveReportOptions {
  feature: string
  archiveDir: string
  designExists: boolean
  planExists: boolean
  requirementsExists: boolean
  hasAcceptanceChanges: boolean
  changeCount: number
  promotionSuggestions: import('../../types.js').CurrentPromotionSuggestion[]
  promotionAppliedCount: number
  autoPromoteCurrent: boolean
  verificationPending: boolean
  legacyReadinessWarning: boolean
  docUpdateConfirmUsed: boolean
  hasAcceptedKnownIssues: boolean
  archiveMode: IssueMode
  issueClarificationExists: boolean
  promotionCandidateExists: boolean
  issueResolutionGenerated: boolean
  governanceDecisionTargetPath: string | null
  hasImplementationMapper: boolean
  postHocIssueReady: boolean
  worktreeCleanedUp: boolean
  sourceCleanupSkipped: boolean
}

export type { PhasedChanges }
