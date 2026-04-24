import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { AcceptanceState, FileChangeRecord, DriftItem, PhasedChanges } from '../../types.js'
import { escapeMarkdown } from '../../utils/security.js'
import { logger } from '../../utils/logger.js'
import { generateCodeMappingTable } from './code-mapper.js'
import { collectTraceabilityItems, type TraceabilityResult } from './traceability.js'

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
}

export async function generateImplementationMapper(options: ImplementationMapperOptions): Promise<string> {
  const {
    feature,
    projectDir,
    designPath,
    requirementsPath,
    designExists,
    planExists,
    changes,
    acceptanceState,
    phasedChanges,
    driftItems,
  } = options

  const date = new Date().toISOString().split('T')[0]
  const safeFeature = escapeMarkdown(feature)

  const designLink = designExists ? '- [设计文档](./design.md)' : ''
  const planLink = planExists ? '- [执行计划](./plan.md)' : ''
  const requirementsLink = requirementsPath ? '- [需求文档](./prd.md)' : ''

  const filesTable = generateFilesTable(changes)
  const acceptanceSection = formatAcceptanceSection(acceptanceState, phasedChanges)
  const driftSection = formatDriftSection(acceptanceState, driftItems)
  const traceability = await collectTraceabilityItems(projectDir, requirementsPath, designPath)
  const codeMappingOptions = {
    projectDir,
    ...(acceptanceState !== undefined ? { acceptanceState } : {}),
    ...(phasedChanges !== undefined ? { phasedChanges } : {}),
  }
  const codeMappingSection = await generateImplementationMappingSection(feature, changes, traceability, codeMappingOptions)

  return `# ${safeFeature} - Implementation Mapper

**Date**: ${date}
**Status**: Archived

## 1. 概述

本归档单元用于冻结本次变更的实现、文档与验收痕迹，并建立需求、提案、设计、代码与验证之间的追溯关系。

## 2. 冻结工件

${designLink}
${planLink}
${requirementsLink}

## 3. 实现映射

${codeMappingSection}

## 4. 修改的文件

${filesTable}

## 5. 验收与验证留痕

${acceptanceSection}

## 6. 已知偏差

${driftSection}
`
}

function generateFilesTable(changes: FileChangeRecord[]): string {
  if (changes.length === 0) {
    return '| *No changes recorded* | | |'
  }

  const header = '| 文件路径 | 变更类型 | 时间戳 |'
  const separator = '|----------|----------|--------|'
  const rows = changes.map(c => {
    const changeType = c.tool === 'write' ? 'created' : 'modified'
    const timestamp = c.timestamp ? new Date(c.timestamp).toISOString() : '-'
    return `| ${escapeMarkdown(c.filePath)} | ${changeType} | ${timestamp} |`
  })

  return [header, separator, ...rows].join('\n')
}

function formatAcceptanceSection(
  state: AcceptanceState | null | undefined,
  phasedChanges?: PhasedChanges
): string {
  if (phasedChanges && phasedChanges.acceptance.length > 0) {
    const header = '| 文件 | 变更类型 | 时间戳 |'
    const separator = '|------|----------|--------|'
    const rows = phasedChanges.acceptance.map(change =>
      `| ${escapeMarkdown(change.filePath)} | ${change.tool === 'write' ? 'created' : 'modified'} | ${change.timestamp ? new Date(change.timestamp).toISOString() : '-'} |`
    )
    return [header, separator, ...rows].join('\n')
  }

  if (!state || state.pendingDocUpdates.length === 0) {
    return '无额外验收阶段变更记录。'
  }

  const header = '| 变更时间 | 变更文件 | 原因 |'
  const separator = '|----------|----------|------|'
  const rows = state.pendingDocUpdates.map(u =>
    `| ${u.timestamp} | ${escapeMarkdown(u.file)} | ${escapeMarkdown(u.reason || '-')} |`
  )

  return [header, separator, ...rows].join('\n')
}

function formatDriftSection(state: AcceptanceState | null | undefined, driftItems?: DriftItem[]): string {
  if (driftItems && driftItems.length > 0) {
    const rows = driftItems.map(item => `- **${escapeMarkdown(item.item)}**: ${escapeMarkdown(item.reason)} (${escapeMarkdown(item.actualCode)})`)
    return ['检测到以下设计偏差：', '', ...rows].join('\n')
  }

  if (!state || state.pendingDocUpdates.length === 0) {
    return '无已知偏差。'
  }

  return `验收阶段有 ${state.pendingDocUpdates.length} 个文件变更记录等待同步到相关文档。

> 声明：本 implementation mapper 基于归档时状态生成，若文档未回写，实际实现可能与设计记录存在偏差。`
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
    return '未记录到需求/提案/设计追溯项，也没有检测到代码变更。'
  }

  const generateOptions = {
    projectDir: options.projectDir,
    traceabilityItems: traceability.items,
    ...(options.acceptanceState !== undefined ? { acceptanceState: options.acceptanceState } : {}),
    ...(options.phasedChanges !== undefined ? { phasedChanges: options.phasedChanges } : {}),
  }
  const mappings = await generateCodeMappingTable(feature, changes, generateOptions)

  if (mappings.length === 0) {
    return '未生成可用的追溯映射，请查看下方修改文件清单。'
  }

  const header = '| 追溯来源 | 需求 / 提案项 | 变更代码证据 | 提取符号 | 验证证据 |\n|----------|----------------|--------------|----------|----------|'
  const rows = mappings.map(mapping => (
    `| ${escapeMarkdown(mapping.source)} | ${escapeMarkdown(mapping.step)} | ${escapeMarkdown(mapping.filePath)} | ${escapeMarkdown(mapping.symbol || '-')} | ${escapeMarkdown(mapping.verificationEvidence || '')} |`
  ))

  const note = traceability.usedDesignFallback
    ? '> 未发现 requirements / proposal 追溯项，已回退使用 design 文档生成追溯关系。\n'
    : ''

  return [note, header, ...rows].filter(Boolean).join('\n')
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
