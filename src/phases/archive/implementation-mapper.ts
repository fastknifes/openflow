import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { AcceptanceState, FileChangeRecord, DriftItem, GuardianEvidence, PhasedChanges, IssueClassification } from '../../types.js'
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
  guardianEvidence?: GuardianEvidence
  evidenceDir?: string
}

export interface BehaviorCodeMapperOptions {
  feature: string
  projectDir: string
  behaviorPath: string
  changes: FileChangeRecord[]
  readiness?: string
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
  const evidenceDir = options.evidenceDir ?? '.sisyphus/evidence'
  const behaviorMappingSection = options.behaviorPath
    ? await generateBehaviorMappingSection(options.behaviorPath, changes, evidenceDir)
    : null
  const globalDepsSection = formatGlobalDepsSection(driftItems)
  const verificationSection = formatVerificationSection(acceptanceState, phasedChanges, driftItems)
  const guardianSection = formatGuardianEvidenceSection(options.guardianEvidence)

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
${guardianSection}
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

function formatGuardianEvidenceSection(evidence?: GuardianEvidence): string {
  if (!evidence) return ''
  return [
    '### Drift Guardian Evidence',
    '',
    `- Auto-repairs: ${evidence.autoRepairs}`,
    `- Pending ambiguities: ${evidence.pendingAmbiguities}`,
    `- Unresolved violations: ${evidence.unresolvedViolations}`,
    `- Contract source: ${evidence.contractSource}`,
    '',
  ].join('\n')
}

async function generateBehaviorMappingSection(
  behaviorPath: string,
  changes: FileChangeRecord[],
  evidenceDir: string,
): Promise<string> {
  const rows: BehaviorMappingRow[] = []
  let evidenceMappings: BehaviorEvidenceMapping[] = []
  try {
    const content = await fs.readFile(behaviorPath, 'utf-8')
    rows.push(...parseBehaviorMappingRows(content))
    evidenceMappings = parseEvidenceMappingTable(content)
  } catch {
    return 'Unable to parse behavior document.\n'
  }

  if (rows.length === 0) {
    return 'No behavior scenarios found.\n'
  }

  const evidenceByKey = buildEvidenceMappingIndex(evidenceMappings)
  const codeFiles = formatChangedCodeFiles(changes)
  const enrichedRows = rows.map(row => enrichBehaviorMappingRow(row, evidenceByKey, codeFiles))

  const header = '| Behavior Scenario | Type | Expected Behavior | Evidence | Coverage Level | Freshness | Status | Code Files | Notes |'
  const sep = '|------------------|------|-------------------|----------|----------------|-----------|--------|------------|-------|'
  const lines = enrichedRows.map(row => (
    `| ${escapeMarkdown(row.name)} | ${escapeMarkdown(row.type)} | ${escapeMarkdown(row.expectedBehavior)} | ${escapeMarkdown(row.evidenceRef)} | ${escapeMarkdown(row.coverageLevel)} | ${escapeMarkdown(row.freshness)} | ${escapeMarkdown(row.status)} | ${escapeMarkdown(row.codeFiles)} | ${escapeMarkdown(row.notes)} |`
  ))
  const evidenceFiles = await listEvidenceFiles(evidenceDir)
  const evidenceFilesSection = evidenceFiles.length > 0
    ? ['### Evidence Files', '', ...evidenceFiles.map(file => `- ${escapeMarkdown(file)}`)].join('\n') + '\n'
    : ''

  return [header, sep, ...lines].join('\n') + '\n' + (evidenceFilesSection ? `\n${evidenceFilesSection}` : '')
}

interface BehaviorMappingRow {
  scenarioId?: string
  name: string
  type: 'scenario' | 'boundary'
  expectedBehavior: string
  evidenceRef: string
  coverageLevel: string
  freshness: string
  status: string
  codeFiles: string
  notes: string
}

interface BehaviorEvidenceMapping {
  scenarioId: string
  criticality: string
  evidenceRef: string
  evidenceType: string
  coverageLevel: string
  equivalenceRationale: string
  freshness: string
  status: string
}

function parseBehaviorMappingRows(content: string): BehaviorMappingRow[] {
  const rows: BehaviorMappingRow[] = []
  const lines = content.split('\n')
  let current: {
    name: string
    type: 'scenario' | 'boundary'
    given: string[]
    when: string[]
    then: string[]
  } | null = null
  let currentStep: 'given' | 'when' | 'then' | null = null

  const pushCurrent = () => {
    if (!current) return
    const scenarioIdentity = parseScenarioIdentity(current.name)
    rows.push({
      ...(scenarioIdentity.scenarioId ? { scenarioId: scenarioIdentity.scenarioId } : {}),
      name: scenarioIdentity.displayName,
      type: current.type,
      expectedBehavior: formatExpectedBehavior(current.given, current.when, current.then),
      evidenceRef: 'N/A',
      coverageLevel: 'missing',
      freshness: 'unknown',
      status: 'missing_evidence',
      codeFiles: '—',
      notes: current.type === 'boundary' ? 'Boundary scenario; should-pass evidence.' : 'Critical behavior scenario.',
    })
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    const heading = line.match(/^###\s+(Scenario|Boundary):\s*(.+)$/i)
    if (heading) {
      pushCurrent()
      current = {
        type: heading[1]!.toLowerCase() === 'boundary' ? 'boundary' : 'scenario',
        name: heading[2]!.trim(),
        given: [],
        when: [],
        then: [],
      }
      currentStep = null
      continue
    }

    if (!current) continue

    const stepHeading = line.match(/^(Given|When|Then):\s*$/i)
    if (stepHeading) {
      currentStep = stepHeading[1]!.toLowerCase() as 'given' | 'when' | 'then'
      continue
    }

    if (!currentStep || !line.startsWith('-')) continue
    const item = line.replace(/^[-*]\s*/, '').trim()
    if (item) current[currentStep].push(item)
  }

  pushCurrent()
  return rows
}

function parseScenarioIdentity(rawName: string): { scenarioId?: string; displayName: string } {
  const trimmed = rawName.trim()
  const match = trimmed.match(/^([A-Z]+-\d+)\b\s*[:：\-–—]?\s*(.*)$/i)
  if (!match) return { displayName: trimmed }

  const scenarioId = match[1]!.trim()
  const displayName = match[2]?.trim() || scenarioId
  return { scenarioId, displayName }
}

function parseEvidenceMappingTable(content: string): BehaviorEvidenceMapping[] {
  const lines = content.split('\n')
  const newFormatStart = lines.findIndex(line =>
    /^\|\s*Scenario\s*ID\s*\|\s*Criticality\s*\|\s*Evidence\s*Ref\s*\|\s*Evidence\s*Type\s*\|/i.test(line.trim()),
  )
  if (newFormatStart >= 0) return parseNewFormatEvidenceMappingTable(lines, newFormatStart)

  const oldFormatStart = lines.findIndex(line =>
    /^\|\s*Behavior\s*\|\s*Evidence\s*Type\s*\|\s*Expected\s*Evidence\s*\|\s*Status\s*\|/i.test(line.trim()),
  )
  if (oldFormatStart >= 0) return parseOldFormatEvidenceMappingTable(lines, oldFormatStart)

  return []
}

function parseNewFormatEvidenceMappingTable(lines: string[], tableStart: number): BehaviorEvidenceMapping[] {
  const mappings: BehaviorEvidenceMapping[] = []
  for (const line of lines.slice(tableStart + 1)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) break
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue

    const cells = splitMarkdownTableRow(trimmed)
    if (cells.length < 8) continue
    const scenarioId = cells[0]?.trim() ?? ''
    if (!scenarioId) continue

    mappings.push({
      scenarioId,
      criticality: cells[1] || 'critical',
      evidenceRef: cells[2] || 'N/A',
      evidenceType: cells[3] || 'manual',
      coverageLevel: normalizeCoverageLevelForArchive(cells[4] ?? ''),
      equivalenceRationale: cells[5] ?? '',
      freshness: normalizeFreshnessForArchive(cells[6] ?? ''),
      status: normalizeEvidenceStatusForArchive(cells[7] ?? ''),
    })
  }
  return mappings
}

function parseOldFormatEvidenceMappingTable(lines: string[], tableStart: number): BehaviorEvidenceMapping[] {
  const mappings: BehaviorEvidenceMapping[] = []
  for (const line of lines.slice(tableStart + 1)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) break
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue

    const cells = splitMarkdownTableRow(trimmed)
    if (cells.length < 4) continue
    const scenarioId = cells[0]?.trim() ?? ''
    if (!scenarioId) continue
    const status = normalizeEvidenceStatusForArchive(cells[3] ?? '')

    mappings.push({
      scenarioId,
      criticality: 'critical',
      evidenceRef: cells[2] || 'N/A',
      evidenceType: cells[1] || 'manual',
      coverageLevel: status === 'verified' ? 'exact' : 'missing',
      equivalenceRationale: '',
      freshness: 'unknown',
      status,
    })
  }
  return mappings
}

function buildEvidenceMappingIndex(mappings: BehaviorEvidenceMapping[]): Map<string, BehaviorEvidenceMapping> {
  const index = new Map<string, BehaviorEvidenceMapping>()
  for (const mapping of mappings) {
    const keys = [mapping.scenarioId, parseScenarioIdentity(mapping.scenarioId).displayName]
    for (const key of keys) {
      const normalized = normalizeEvidenceKeyForArchive(key)
      if (normalized && !index.has(normalized)) index.set(normalized, mapping)
    }
  }
  return index
}

function enrichBehaviorMappingRow(
  row: BehaviorMappingRow,
  evidenceByKey: Map<string, BehaviorEvidenceMapping>,
  codeFiles: string,
): BehaviorMappingRow {
  const evidence = findEvidenceMappingForRow(row, evidenceByKey)
  const isAdvisory = !evidence && row.type === 'boundary'
  const notes = isAdvisory
    ? `${row.notes.replace(/\.?$/, '')}; advisory.`
    : row.notes

  if (!evidence) {
    return {
      ...row,
      coverageLevel: isAdvisory ? 'not_applicable' : row.coverageLevel,
      status: isAdvisory ? 'not_applicable' : row.status,
      codeFiles,
      notes,
    }
  }

  return {
    ...row,
    evidenceRef: evidence.evidenceRef,
    coverageLevel: evidence.coverageLevel,
    freshness: evidence.freshness,
    status: evidence.status,
    codeFiles,
  }
}

function findEvidenceMappingForRow(
  row: BehaviorMappingRow,
  evidenceByKey: Map<string, BehaviorEvidenceMapping>,
): BehaviorEvidenceMapping | undefined {
  const keys = [row.scenarioId, row.name].filter((key): key is string => Boolean(key))
  for (const key of keys) {
    const directMatch = evidenceByKey.get(normalizeEvidenceKeyForArchive(key))
    if (directMatch) return directMatch
  }

  const normalizedName = normalizeEvidenceKeyForArchive(row.name)
  for (const [key, evidence] of evidenceByKey) {
    if (key.includes(normalizedName) || normalizedName.includes(key)) return evidence
  }
  return undefined
}

function formatChangedCodeFiles(changes: FileChangeRecord[]): string {
  const uniqueFiles = [...new Set(changes.map(change => change.filePath).filter(Boolean))]
  if (uniqueFiles.length === 0) return '—'

  const visibleFiles = uniqueFiles.slice(0, 3)
  const suffix = uniqueFiles.length > visibleFiles.length ? `; +${uniqueFiles.length - visibleFiles.length} more` : ''
  return `${visibleFiles.join('; ')}${suffix}`
}

async function listEvidenceFiles(evidenceDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(evidenceDir, { withFileTypes: true })
    return entries
      .filter(entry => entry.isFile())
      .map(entry => toPortablePath(path.join(evidenceDir, entry.name)))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

function splitMarkdownTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map(cell => cell.trim())
}

function normalizeCoverageLevelForArchive(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'exact') return 'exact'
  if (normalized === 'equivalent') return 'equivalent'
  if (normalized === 'partial') return 'partial'
  if (normalized === 'not_applicable' || normalized === 'n/a' || normalized === 'na') return 'not_applicable'
  return 'missing'
}

function normalizeFreshnessForArchive(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'fresh') return 'fresh'
  if (normalized === 'stale') return 'stale'
  return 'unknown'
}

function normalizeEvidenceStatusForArchive(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'verified' || normalized === 'passed' || normalized === 'pass') return 'verified'
  if (normalized === 'failed' || normalized === 'fail') return 'failed'
  if (normalized === 'not_applicable' || normalized === 'n/a' || normalized === 'na') return 'not_applicable'
  return 'missing_evidence'
}

function normalizeEvidenceKeyForArchive(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_:：\-–—]+/g, ' ')
}

function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

function formatExpectedBehavior(given: string[], when: string[], then: string[]): string {
  const parts = [
    given.length > 0 ? `Given ${given.join('; ')}` : '',
    when.length > 0 ? `When ${when.join('; ')}` : '',
    then.length > 0 ? `Then ${then.join('; ')}` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' / ') : 'Not specified.'
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

// ---------------------------------------------------------------------------
// 轻量版 Behavior → Code 映射生成器（供 quality-gate 环节调用）
// ---------------------------------------------------------------------------

export async function generateBehaviorCodeMapper(
  options: BehaviorCodeMapperOptions
): Promise<string> {
  const { feature, behaviorPath, changes, readiness } = options
  const date = new Date().toISOString().split('T')[0]
  const safeFeature = escapeMarkdown(feature)

  let rows: BehaviorMappingRow[] = []
  let evidenceMappings: BehaviorEvidenceMapping[] = []
  try {
    const content = await fs.readFile(behaviorPath, 'utf-8')
    rows.push(...parseBehaviorMappingRows(content))
    evidenceMappings = parseEvidenceMappingTable(content)
  } catch {
    // 无法读取 behavior 文档时返回占位
  }

  const evidenceByKey = buildEvidenceMappingIndex(evidenceMappings)
  const codeFiles = formatChangedCodeFiles(changes)
  const enrichedRows = rows.map(row => enrichBehaviorMappingRow(row, evidenceByKey, codeFiles))

  const behaviorTableHeader =
    '| Behavior Scenario | Type | Expected Behavior | Code Files | Key Symbols |'
  const behaviorTableSep =
    '|-------------------|------|-------------------|------------|-------------|'
  const behaviorTableRows = enrichedRows.map(row => {
    const symbols = row.codeFiles === '—' ? '—' : 'see behavior.md'
    return `| ${escapeMarkdown(row.name)} | ${escapeMarkdown(row.type)} | ${escapeMarkdown(row.expectedBehavior)} | ${escapeMarkdown(row.codeFiles)} | ${escapeMarkdown(symbols)} |`
  })

  const evidenceTableHeader =
    '| Scenario ID | Criticality | Evidence Ref | Coverage Level | Status |'
  const evidenceTableSep =
    '|-------------|-------------|--------------|----------------|--------|'
  const evidenceTableRows = evidenceMappings.map(ev =>
    `| ${escapeMarkdown(ev.scenarioId)} | ${escapeMarkdown(ev.criticality)} | ${escapeMarkdown(ev.evidenceRef)} | ${escapeMarkdown(ev.coverageLevel)} | ${escapeMarkdown(ev.status)} |`
  )

  const behaviorSection =
    rows.length > 0
      ? [
          '## Behavior to Code Mapping',
          '',
          behaviorTableHeader,
          behaviorTableSep,
          ...behaviorTableRows,
        ].join('\n') + '\n'
      : '## Behavior to Code Mapping\n\nNo behavior scenarios found.\n'

  const evidenceSection =
    evidenceMappings.length > 0
      ? [
          '## Evidence Mapping',
          '',
          evidenceTableHeader,
          evidenceTableSep,
          ...evidenceTableRows,
        ].join('\n') + '\n'
      : ''

  return [
    `# ${safeFeature} - Implementation Mapper`,
    '',
    `**Date**: ${date}`,
    `**Status**: ${readiness ? escapeMarkdown(readiness) : 'Mapped at quality gate'}`,
    '',
    behaviorSection,
    evidenceSection,
  ]
    .filter(Boolean)
    .join('\n')
}
