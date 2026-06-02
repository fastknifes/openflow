import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type AcceptanceState, VerifyReadinessStatus } from '../../types.js'
import { createSafePath, escapeMarkdown } from '../../utils/security.js'
import { fileExists } from '../../hooks/file-utils.js'
import { buildIssueResolution, ISSUE_CLARIFICATION_FILENAME, ISSUE_RESOLUTION_FILENAME, PROMOTION_CANDIDATE_FILENAME, type IssueMode } from '../../utils/issue-utils.js'
import type { ArchiveFileChange } from './types.js'

export interface IssueResolutionOptions {
  projectDir: string
  archiveDir: string
  writeDir?: string
  feature: string
  mode: IssueMode
  issueClarificationPath: string
  promotionCandidatePath: string | null
  acceptanceState: AcceptanceState | null
  changes: ArchiveFileChange[]
}

export interface PostHocIssueOptions {
  writeDir: string
  feature: string
  acceptanceState: AcceptanceState | null
  changes: ArchiveFileChange[]
}

export interface AdHocIssueOptions {
  writeDir: string
  feature: string
  changes: ArchiveFileChange[]
}

export async function writeIssueResolution(options: IssueResolutionOptions): Promise<void> {
  const { projectDir, archiveDir, writeDir, feature, mode, issueClarificationPath, promotionCandidatePath, acceptanceState, changes } = options
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
    governanceLines.push(currentPromotions.map((u: { file: string; reason?: string }) => `- \`${escapeMarkdown(u.file)}\`${u.reason ? ` — ${escapeMarkdown(u.reason)}` : ''}`).join('\n'))
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
    governanceLines.push('', '### Proposed Decision Snapshot', proposedDecision)
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
  if (verifyResult?.verifiedAt) verificationLines.push(`- verified_at: ${escapeMarkdown(verifyResult.verifiedAt)}`)
  if (verifyResult?.constraintsChecked && verifyResult.constraintsChecked.length > 0) {
    verificationLines.push(`- checks: ${verifyResult.constraintsChecked.map((c: string) => `\`${escapeMarkdown(c)}\``).join(', ')}`)
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

export async function writePostHocIssueArtifacts(options: PostHocIssueOptions): Promise<void> {
  const { writeDir, feature, acceptanceState, changes } = options
  const symptom = acceptanceState?.rawIssue ?? feature
  const verificationEvidence = buildPostHocVerificationEvidence(acceptanceState)
  const classification = acceptanceState?.primaryClassification ?? 'bugfix'
  const filesInvolved = changes.map(change => change.filePath)
  const governanceStatus = acceptanceState?.governancePromotionStatus ?? 'none'
  const pendingDocUpdates = acceptanceState?.pendingDocUpdates ?? []
  const reasonCodes = acceptanceState?.verifyResult?.reasonCodes ?? []
  const rootCause = acceptanceState?.primaryClassification
    ? `Classified as ${acceptanceState.primaryClassification}; addressed through post-hoc technical verification.`
    : 'Addressed through post-hoc technical verification'
  const baseResolution = buildIssueResolution({ symptom, rootCause, fixSummary: 'Fixed through limited-context technical verification without pre-existing design or issue clarification.', filesInvolved, verificationEvidence, recurrenceSignature: `Monitor for similar symptoms matching ${feature}.`, futureAIGuidance: 'Check acceptance state and verify result before similar changes.' })
  const evidenceSection = `## Evidence\n\n${verificationEvidence}\n\n`
  const governanceSection = `## Governance Promotion\n\n- status: ${governanceStatus}\n${pendingDocUpdates.length > 0 ? pendingDocUpdates.map(u => `- pending doc update: \`${u.file}\`${u.reason ? ` — ${u.reason}` : ''}`).join('\n') : '- no governance promotion or current-doc update was recorded'}\n\n`
  const residualRiskSection = `## Residual Risk\n\n${reasonCodes.length > 0 ? reasonCodes.map(code => `- ${code}`).join('\n') : '- No additional residual risk was recorded in the post-hoc archive inputs.'}\n`
  const resolutionContent = baseResolution.replace(/^## Root Cause$/m, `${evidenceSection}## Root Cause`).replace(/^## Fix Summary$/m, '## Implementation Summary').replace(/^## Files Involved$/m, '## Changed Files').trimEnd() + `\n\n${governanceSection}${residualRiskSection}`
  await fs.writeFile(path.join(writeDir, ISSUE_RESOLUTION_FILENAME), resolutionContent, 'utf-8')

  const clarificationContent = `# Issue Clarification\n\n## Symptom\n${symptom}\n\n## Evidence\n${verificationEvidence}\n\n## Classification\n${classification}\n\n## Next Action\nResolved via post-hoc archive.\n`
  await fs.writeFile(path.join(writeDir, ISSUE_CLARIFICATION_FILENAME), clarificationContent, 'utf-8')

  if (shouldGeneratePostHocPromotionCandidate(acceptanceState)) {
    const promotionContent = `# Promotion Candidate\n\n## Source\nGenerated during post-hoc issue archive for \`${feature}\`.\n\n## Governance Status\n${governanceStatus}\n\n## Pending Document Updates\n${pendingDocUpdates.length > 0 ? pendingDocUpdates.map(u => `- \`${u.file}\`${u.reason ? ` — ${u.reason}` : ''}`).join('\n') : '- No pending document updates were recorded.'}\n`
    await fs.writeFile(path.join(writeDir, PROMOTION_CANDIDATE_FILENAME), promotionContent, 'utf-8')
  }
}

export async function generateAdHocIssueArtifacts(options: AdHocIssueOptions): Promise<void> {
  const { writeDir, feature, changes } = options
  const changedFiles = changes.length > 0
    ? changes.map(change => `- \`${escapeMarkdown(change.filePath)}\` (${change.tool})`).join('\n')
    : '- No tracked file changes were recorded.'
  const evidence = changes.length > 0
    ? `Files modified during ad-hoc fix:\n${changedFiles}`
    : 'No tracked file changes were recorded.'

  const clarificationContent = `# Issue Clarification\n\n## Symptom\n${escapeMarkdown(feature)}\n\n## Classification\nad-hoc\n\n## Next Action\nResolved via ad-hoc archive.\n`
  await fs.writeFile(path.join(writeDir, ISSUE_CLARIFICATION_FILENAME), clarificationContent, 'utf-8')

  const resolutionContent = `# Issue Resolution\n\n## Symptom\n${escapeMarkdown(feature)}\n\n## Evidence\n${evidence}\n\n## Root Cause\n- Archived via ad-hoc mode without pre-existing design or issue clarification.\n\n## Implementation Summary\n- archive mode: ad-hoc\n- changed files:\n${changedFiles}\n\n## Verification Evidence\n- Ad-hoc archive; verification performed by the user during the fix process.\n\n## Governance Promotion\n- status: none\n\n## Residual Risk\n- No additional residual risk was recorded.\n`
  await fs.writeFile(path.join(writeDir, ISSUE_RESOLUTION_FILENAME), resolutionContent, 'utf-8')
}

export function shouldGeneratePostHocPromotionCandidate(acceptanceState: AcceptanceState | null): boolean {
  return (acceptanceState?.pendingDocUpdates.length ?? 0) > 0
    || (acceptanceState?.governancePromotionStatus ?? 'none') !== 'none'
}

function buildPostHocVerificationEvidence(acceptanceState: AcceptanceState | null): string {
  const verifyResult = acceptanceState?.verifyResult
  if (verifyResult?.evidenceSummary) return verifyResult.evidenceSummary
  if (verifyResult?.constraintsChecked && verifyResult.constraintsChecked.length > 0) {
    return `Verified constraints: ${verifyResult.constraintsChecked.join(', ')}`
  }
  return 'Technical verification completed via quality gate.'
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
      ? matches[index + 1]!.index : markdown.length
    sections.set(heading, markdown.slice(start, end).trim())
  }
  return sections
}

function findSectionContent(sections: Map<string, string>, label: string): string | null {
  for (const [heading, content] of sections.entries()) {
    if (heading.includes(label)) return content || null
  }
  return null
}
