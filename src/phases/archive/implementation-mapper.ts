import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { AcceptanceState, FileChangeRecord, DriftItem, PhasedChanges } from '../../types.js'
import { escapeMarkdown } from '../../utils/security.js'
import { logger } from '../../utils/logger.js'
import { generateCodeMappingTable } from './code-mapper.js'

export interface ImplementationMapperOptions {
  feature: string
  archiveDir: string
  designExists: boolean
  planExists: boolean
  changes: FileChangeRecord[]
  acceptanceState?: AcceptanceState | null
  phasedChanges?: PhasedChanges
  driftItems?: DriftItem[]
}

export async function generateImplementationMapper(options: ImplementationMapperOptions): Promise<string> {
  const { feature, designExists, planExists, changes, acceptanceState, phasedChanges, driftItems } = options
  
  const date = new Date().toISOString().split('T')[0]
  const safeFeature = escapeMarkdown(feature)
  
  const designLink = designExists ? '- [设计文档](./design/)' : ''
  const planLink = planExists ? '- [执行计划](./plans/)' : ''
  
  const filesTable = generateFilesTable(changes)
  const acceptanceSection = formatAcceptanceSection(acceptanceState, phasedChanges)
  const driftSection = formatDriftSection(acceptanceState, driftItems)
  
  const codeMappingSection = generateImplementationMappingSection(feature, changes)
  
  return `# ${safeFeature} - Implementation Mapper

**Date**: ${date}
**Status**: Archived

## 1. 概述

本归档单元用于冻结本次变更的实现、文档与验收痕迹，并建立需求、设计、代码与验收之间的追溯关系。

## 2. 冻结工件

${designLink}
${planLink}
- [需求文档](./requirements/)

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

function generateImplementationMappingSection(
  feature: string,
  changes: FileChangeRecord[]
): string {
  if (changes.length === 0) {
    return `| 能力点 | 实现位置 | 说明 |
|--------|----------|------|
| *待补充* | | |

> 使用 /openflow/archive 自动生成实现映射。`
  }

  const mappings = generateCodeMappingTable(feature, changes)
  const header = '| 能力点 | 实现位置 | 说明 |\n|--------|----------|------|'
  const rows = mappings.map(mapping => (
    `| ${escapeMarkdown(mapping.step)} | ${escapeMarkdown(mapping.filePath)} | ${escapeMarkdown(mapping.description || '')} |`
  ))

  return [header, ...rows].join('\n')
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
