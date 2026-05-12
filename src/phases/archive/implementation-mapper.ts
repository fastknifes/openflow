import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { AcceptanceState, FileChangeRecord, DriftItem, PhasedChanges, IssueClassification } from '../../types.js'
import { escapeMarkdown } from '../../utils/security.js'
import { logger } from '../../utils/logger.js'
import { generateCodeMappingTable } from './code-mapper.js'
import { collectTraceabilityItems, type TraceabilityResult } from './traceability.js'
import { fileExists } from '../../hooks/file-utils.js'

export interface ImplementationMapperOptions {
  feature: string
  projectDir: string
  archiveDir: string
  designPath?: string | null
  requirementsPath?: string | null
  designExists: boolean
  planExists: boolean
  changes: FileChangeRecord[]
  acceptanceState?: AcceptanceState | null
  phasedChanges?: PhasedChanges
  driftItems?: DriftItem[]
  issueClarificationPath?: string | null
  promotionCandidatePath?: string | null
  behaviorPath?: string | null
}

export async function generateImplementationMapper(options: ImplementationMapperOptions): Promise<string> {
  const {
    feature,
    projectDir,
    archiveDir,
    designPath,
    requirementsPath,
    changes,
    acceptanceState,
    phasedChanges,
    driftItems,
    issueClarificationPath,
    promotionCandidatePath,
  } = options

  const date = new Date().toISOString().split('T')[0]
  const safeFeature = escapeMarkdown(feature)

  const hasGlobalDeps = driftItems != null && driftItems.length > 0
  const sectionNum = (n: number) => hasGlobalDeps ? n + 1 : n

  const traceability = await collectTraceabilityItems(projectDir, requirementsPath, designPath)
  const codeMappingOptions = {
    projectDir,
    ...(acceptanceState !== undefined ? { acceptanceState } : {}),
    ...(phasedChanges !== undefined ? { phasedChanges } : {}),
  }
  const codeMappingSection = await generateImplementationMappingSection(feature, changes, traceability, codeMappingOptions)
  const behaviorMappingSection = options.behaviorPath
    ? await generateBehaviorMappingSection(options.behaviorPath)
    : null
  const globalDepsSection = formatGlobalDepsSection(driftItems)
  const verificationSection = formatVerificationSection(acceptanceState, phasedChanges, driftItems)

  let out = `# ${safeFeature} - Implementation Mapper

**Date**: ${date}
**Status**: Archived

## 1. 概述

本次变更解决了与 \`${safeFeature}\` 相关的实现追溯需求。

**归档时间**: ${date}
**追溯范围**: 本次变更覆盖需求到实现的完整追溯链。
`

  if (hasGlobalDeps) {
    out += `\n## 2. 全局依赖与例外证据\n\n${globalDepsSection}\n`
  }

  const mappingNum = sectionNum(2)
  out += `
## ${mappingNum}. 需求到实现映射

${codeMappingSection}
`

  if (behaviorMappingSection) {
    const behaviorNum = sectionNum(3)
    out += `
## ${behaviorNum}. 行为到实现映射

${behaviorMappingSection}
`
  }

  const verifyNum = sectionNum(behaviorMappingSection ? 4 : 3)
  out += `
## ${verifyNum}. 验证与结论

${verificationSection}
`

  // --- Issue-specific sections (only when mode is "issue" or "mixed") ---
  const isIssueMode = acceptanceState?.mode === 'issue' || Boolean(issueClarificationPath)
  if (isIssueMode && issueClarificationPath && await fileExists(issueClarificationPath)) {
    try {
      const clarificationContent = await fs.readFile(issueClarificationPath, 'utf-8')
      const clarificationSections = parseMarkdownSections(clarificationContent)

      const rootCauseNum = sectionNum(4)
      out += `
## ${rootCauseNum}. 根本原因

${formatIssueRootCauseSection(acceptanceState ?? {} as AcceptanceState, clarificationSections)}
`

      const semanticNum = sectionNum(5)
      out += `
## ${semanticNum}. 语义契约

${formatIssueSemanticContractSection(clarificationSections)}
`

      const classNum = sectionNum(6)
      out += `
## ${classNum}. 问题分类

${formatIssueClassificationSection(acceptanceState ?? {} as AcceptanceState)}
`

      const govNum = sectionNum(7)
      const govSection = await formatIssueGovernancePromotionSection(
        acceptanceState ?? {} as AcceptanceState,
        promotionCandidatePath,
        archiveDir,
      )
      out += `
## ${govNum}. 治理提升

${govSection}
`

      const chainNum = sectionNum(8)
      out += `
## ${chainNum}. 追溯链路

${formatIssueMappingRowChainSection(feature, acceptanceState ?? {} as AcceptanceState, changes)}
`
    } catch {
      // Best-effort: skip issue sections if clarification file cannot be read
    }
  }

  return out
}

function formatGlobalDepsSection(driftItems?: DriftItem[]): string {
  if (!driftItems || driftItems.length === 0) return ''

  const rows = driftItems.map(item =>
    `- **${escapeMarkdown(item.item)}**: ${escapeMarkdown(item.reason)} (${escapeMarkdown(item.actualCode)})`
  )

  return ['检测到以下设计偏差：', '', ...rows].join('\n') + '\n'
}

function formatVerificationSection(
  acceptanceState?: AcceptanceState | null,
  phasedChanges?: PhasedChanges,
  driftItems?: DriftItem[]
): string {
  const evidence = formatVerificationEvidence(acceptanceState, phasedChanges)

  let out = `**验证证据**: ${evidence}\n`

  if (driftItems && driftItems.length > 0) {
    const rows = driftItems.map(item =>
      `- **${escapeMarkdown(item.item)}**: ${escapeMarkdown(item.reason)} (${escapeMarkdown(item.actualCode)})`
    )
    out += `\n### 已知偏差\n\n${rows.join('\n')}\n`
  }

  return out
}

function formatVerificationEvidence(
  acceptanceState?: AcceptanceState | null,
  phasedChanges?: PhasedChanges
): string {
  if (acceptanceState?.verificationCompletedAt) {
    return `verification completed at ${acceptanceState.verificationCompletedAt}`
  }

  if (acceptanceState?.verificationFailureCategory) {
    return `verification failed: ${acceptanceState.verificationFailureCategory}`
  }

  if (phasedChanges?.acceptance.length) {
    return `acceptance-phase file evidence recorded (${phasedChanges.acceptance.length} files)`
  }

  if (acceptanceState?.pendingDocUpdates.length) {
    return `pending acceptance/doc updates recorded (${acceptanceState.pendingDocUpdates.length})`
  }

  return 'no verification evidence recorded'
}

async function generateBehaviorMappingSection(behaviorPath: string): Promise<string> {
  const lines: string[] = []
  try {
    const content = await fs.readFile(behaviorPath, 'utf-8')
    const scenarioMatches = content.matchAll(/### Scenario:\s*(.+)/g)
    for (const match of scenarioMatches) {
      const name = match[1]?.trim()
      if (name) {
        lines.push(`| ${escapeMarkdown(name)} | — | — | — | — |`)
      }
    }
  } catch {
    return 'Unable to parse behavior document.\n'
  }

  if (lines.length === 0) {
    return 'No behavior scenarios found.\n'
  }

  const header = '| Behavior Scenario | Evidence | Code Files | Key Symbols | Notes |'
  const sep = '|------------------|----------|------------|-------------|-------|'
  return [header, sep, ...lines].join('\n') + '\n'
}

async function generateImplementationMappingSection(
  feature: string,
  changes: FileChangeRecord[],
  traceability: TraceabilityResult,
  options: {
    projectDir: string
    acceptanceState?: AcceptanceState | null
    phasedChanges?: PhasedChanges
  }
): Promise<string> {
  if (changes.length === 0 && traceability.items.length === 0) {
    return '未记录到需求/提案/设计追溯项，也没有检测到代码变更。\n'
  }

  const generateOptions = {
    projectDir: options.projectDir,
    traceabilityItems: traceability.items,
    ...(options.acceptanceState !== undefined ? { acceptanceState: options.acceptanceState } : {}),
    ...(options.phasedChanges !== undefined ? { phasedChanges: options.phasedChanges } : {}),
  }
  const mappings = await generateCodeMappingTable(feature, changes, generateOptions)

  if (mappings.length === 0) {
    return '未生成可用的追溯映射。\n'
  }

  const header = '| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |'
  const sep = '|----------|-----------|----------|----------|----------|----------|'
  const rows = mappings.map(mapping => (
    `| ${escapeMarkdown(mapping.source)} | ${escapeMarkdown(mapping.step)} | ${escapeMarkdown(mapping.filePath)} | ${escapeMarkdown(mapping.symbol || 'file-level fallback')} | ${escapeMarkdown(mapping.description || '')} | ${escapeMarkdown(mapping.verificationEvidence || '')} |`
  ))

  const note = traceability.usedDesignFallback
    ? '> 未发现 requirements / proposal 追溯项，已回退使用 design 文档生成追溯关系。\n'
    : ''

  return [note, header, sep, ...rows].filter(Boolean).join('\n') + '\n'
}

export async function saveImplementationMapperDocument(
  archiveDir: string,
  content: string
): Promise<void> {
  await fs.mkdir(archiveDir, { recursive: true })

  const mapperPath = path.join(archiveDir, 'implementation-mapper.md')
  await fs.writeFile(mapperPath, content, 'utf-8')

  logger.info('Saved implementation mapper', { path: mapperPath })
}

export async function generateAndSaveImplementationMapper(options: ImplementationMapperOptions): Promise<void> {
  const content = await generateImplementationMapper(options)
  await saveImplementationMapperDocument(options.archiveDir, content)
}

// --- Markdown parsing helpers ---

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
      ? matches[index + 1]!.index
      : markdown.length
    const content = markdown.slice(start, end).trim()
    sections.set(heading, content)
  }

  return sections
}

function findSectionContent(sections: Map<string, string>, label: string): string | null {
  for (const [heading, content] of sections.entries()) {
    if (heading.includes(label)) {
      return content || null
    }
  }

  return null
}

// --- Issue-specific formatting functions ---

function formatIssueRootCauseSection(
  acceptanceState: AcceptanceState,
  clarificationSections: Map<string, string>,
): string {
  const lines: string[] = []

  if (acceptanceState.primaryClassification) {
    lines.push(`- **Primary classification**: \`${escapeMarkdown(acceptanceState.primaryClassification)}\``)
  }
  if (acceptanceState.classifications && acceptanceState.classifications.length > 0) {
    lines.push(`- **Classifications considered**: ${acceptanceState.classifications.map(c => `\`${escapeMarkdown(c)}\``).join(', ')}`)
  }

  const evidenceInvestigation = findSectionContent(clarificationSections, 'Evidence Investigation')
  if (evidenceInvestigation) {
    lines.push('')
    lines.push('### Evidence Investigation')
    lines.push(evidenceInvestigation)
  }

  const nextActionGate = findSectionContent(clarificationSections, 'Next Action Gate')
  if (nextActionGate) {
    lines.push('')
    lines.push('### Fix Decision')
    lines.push(nextActionGate)
  }

  if (lines.length === 0) {
    lines.push('- No root cause data was recorded in acceptance state or issue clarification.')
  }

  return lines.join('\n') + '\n'
}

function formatIssueSemanticContractSection(
  clarificationSections: Map<string, string>,
): string {
  const parts = [
    { label: 'Current Semantics', content: findSectionContent(clarificationSections, 'Requirement Clarification') },
    { label: 'Violated Semantics', content: findSectionContent(clarificationSections, 'Constraint Clarification') },
    { label: 'Undefined Semantics', content: findSectionContent(clarificationSections, 'Semantic Alignment') },
  ].filter(p => p.content)

  if (parts.length === 0) {
    return '- No explicit semantic contract section was found in issue clarification.\n'
  }

  const lines: string[] = []
  for (const part of parts) {
    lines.push(`### ${part.label}`)
    lines.push(part.content!)
    lines.push('')
  }

  return lines.join('\n')
}

function formatIssueClassificationSection(
  acceptanceState: AcceptanceState,
): string {
  const lines: string[] = []

  const primary = acceptanceState.primaryClassification
  lines.push(`- **Primary**: ${primary ? `\`${escapeMarkdown(primary)}\`` : 'not recorded'}`)

  const all = acceptanceState.classifications
  if (all && all.length > 0) {
    lines.push(`- **All classifications**: ${all.map(c => `\`${escapeMarkdown(c)}\``).join(', ')}`)
  } else {
    lines.push('- **All classifications**: none recorded')
  }

  const classificationLabels: Record<IssueClassification, string> = {
    bugfix: 'Code defect requiring a fix',
    data_issue: 'Data inconsistency or corruption',
    config_issue: 'Configuration misalignment',
    environment_issue: 'Environment or infrastructure problem',
    doc_ambiguity: 'Documentation ambiguity or gap',
    behavior_change: 'Intentional behavior change',
    cannot_determine: 'Unable to determine classification',
  }

  if (primary && classificationLabels[primary]) {
    lines.push(`- **Description**: ${classificationLabels[primary]}`)
  }

  return lines.join('\n') + '\n'
}

async function formatIssueGovernancePromotionSection(
  acceptanceState: AcceptanceState,
  promotionCandidatePath: string | null | undefined,
  archiveDir: string,
): Promise<string> {
  const lines: string[] = []
  const status = acceptanceState.governancePromotionStatus ?? 'none'
  lines.push(`- **Status**: \`${escapeMarkdown(status)}\``)

  if (promotionCandidatePath && await fileExists(promotionCandidatePath)) {
    lines.push(`- **Candidate archived at**: \`${escapeMarkdown(path.join(archiveDir, 'promotion-candidate.md'))}\``)

    try {
      const candidateContent = await fs.readFile(promotionCandidatePath, 'utf-8')
      const candidateSections = parseMarkdownSections(candidateContent)
      const proposedDecision = findSectionContent(candidateSections, 'Proposed Decision')
      if (proposedDecision) {
        lines.push('')
        lines.push('### Proposed Decision')
        lines.push(proposedDecision)
      }
    } catch {
      // best-effort read
    }
  } else if (status === 'confirmed') {
    lines.push('- Governance decision was confirmed and promoted to `docs/decisions/*`.')
  } else if (status === 'candidate_created') {
    lines.push('- Governance candidate is pending confirmation.')
  } else if (status === 'needs_decision') {
    lines.push('- Governance promotion requires a decision before proceeding.')
  } else if (status === 'blocked_unapproved') {
    lines.push('- Governance promotion is blocked pending explicit approval.')
  }

  return lines.join('\n') + '\n'
}

function formatIssueMappingRowChainSection(
  feature: string,
  acceptanceState: AcceptanceState,
  changes: FileChangeRecord[],
): string {
  const primaryLabel = acceptanceState.primaryClassification ?? 'unclassified'
  const changedFiles = changes.length > 0
    ? changes.map(c => `\`${escapeMarkdown(c.filePath)}\``).join(', ')
    : 'no tracked file changes'
  const verificationLabel = acceptanceState.verificationCompletedAt
    ? 'verification completed'
    : acceptanceState.verificationFailureCategory
      ? `verification failed: ${acceptanceState.verificationFailureCategory}`
      : 'no verification evidence'

  const promotionLabel = acceptanceState.governancePromotionStatus === 'confirmed'
    ? 'promoted to docs/decisions'
    : acceptanceState.governancePromotionStatus && acceptanceState.governancePromotionStatus !== 'none'
      ? `governance ${acceptanceState.governancePromotionStatus}`
      : 'no governance promotion'

  const promotedDocs = acceptanceState.pendingDocUpdates.length > 0
    ? acceptanceState.pendingDocUpdates.map(u => `\`${escapeMarkdown(u.file)}\``).join(', ')
    : 'none'

  const lines: string[] = [
    `| Step | Detail |`,
    `|------|--------|`,
    `| Issue | \`${escapeMarkdown(feature)}\` |`,
    `| Root cause | \`${escapeMarkdown(primaryLabel)}\` |`,
    `| Changed symbols / files | ${changedFiles} |`,
    `| Tests / verification | ${verificationLabel} |`,
    `| Promoted current / decision entries | ${promotedDocs} (governance: \`${escapeMarkdown(promotionLabel)}\`) |`,
  ]

  return lines.join('\n') + '\n'
}
