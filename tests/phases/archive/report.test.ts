import { describe, expect, test } from 'bun:test'
import { formatArchiveReport, formatBlockerMessage, type ReportOptions } from '../../../src/phases/archive/report.js'
import type { ArchiveBlocker } from '../../../src/phases/archive/types.js'

function createReportOptions(overrides: Partial<ReportOptions> = {}): ReportOptions {
  return {
    feature: 'archive-report-feature',
    archiveDir: 'docs/archive/2026-01-01-archive-report-feature',
    designExists: true,
    planExists: true,
    requirementsExists: true,
    hasAcceptanceChanges: false,
    changeCount: 3,
    promotionSuggestions: [],
    promotionAppliedCount: 0,
    autoPromoteCurrent: false,
    verificationPending: false,
    legacyReadinessWarning: false,
    docUpdateConfirmUsed: false,
    hasAcceptedKnownIssues: false,
    archiveMode: 'feature',
    issueClarificationExists: false,
    promotionCandidateExists: false,
    issueResolutionGenerated: false,
    governanceDecisionTargetPath: null,
    hasImplementationMapper: false,
    postHocIssueReady: false,
    worktreeCleanedUp: false,
    sourceCleanupSkipped: false,
    isAdHoc: false,
    ...overrides,
  }
}

describe('formatArchiveReport', () => {
  test('planned success report contains completion header, feature name, and feature mode', () => {
    const report = formatArchiveReport(createReportOptions())

    expect(report).toContain('Archive Complete')
    expect(report).toContain('archive-report-feature')
    expect(report).toContain('Archive mode: feature')
  })

  test('ad-hoc report contains completion header, ad-hoc mode, and ad-hoc issue clarification artifact', () => {
    const report = formatArchiveReport(createReportOptions({ isAdHoc: true }))

    expect(report).toContain('Archive Complete')
    expect(report).toContain('Archive mode: ad-hoc')
    expect(report).toContain('ad-hoc issue clarification')
  })

  test('blocked report via formatBlockerMessage returns blocker message', () => {
    const blocker: ArchiveBlocker = {
      type: 'readiness',
      feature: 'archive-report-feature',
      message: 'Archive is blocked by readiness.',
    }

    expect(formatBlockerMessage(blocker)).toBe('Archive is blocked by readiness.')
  })
})
