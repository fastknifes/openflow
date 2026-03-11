import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { sanitizeFeatureName, createSafePath, safeCopyDirectory, escapeMarkdown, addDatePrefix } from '../utils/security.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { fileExists } from '../hooks/file-utils.js'

export async function handleArchive(ctx: OpenFlowContext, feature?: string): Promise<string> {
  if (!ctx.config.archive.enabled) {
    return 'Archive phase is disabled in configuration'
  }

  if (!feature) {
    throw new OpenFlowError(ErrorCode.INVALID_INPUT, 'Feature name is required. Usage: openflow archive <feature-name>')
  }

  const sanitizedFeature = sanitizeFeatureName(feature)

  const archiveDir = createSafePath(ctx.directory, ctx.config.archive.output_dir, sanitizedFeature)
  const designDir = createSafePath(ctx.directory, ctx.config.brainstorming.output_dir, sanitizedFeature)
  const planPath = createSafePath(ctx.directory, '.sisyphus', 'plans', `${sanitizedFeature}.md`)

  const srsDir = path.join(archiveDir, 'srs')
  await fs.mkdir(srsDir, { recursive: true })

  const designExists = await fileExists(designDir)
  if (designExists) {
    const designArchiveDir = path.join(archiveDir, 'design')
    await safeCopyDirectory(designDir, designArchiveDir, ctx.directory)
  }

  const planExists = await fileExists(planPath)
  if (planExists) {
    const planArchiveDir = path.join(archiveDir, 'plan')
    await fs.mkdir(planArchiveDir, { recursive: true })
    await fs.copyFile(planPath, path.join(planArchiveDir, 'tasks.md'))
  }

  await generateSrsDocument(sanitizedFeature, archiveDir, designExists, planExists)

  return formatArchiveResult(sanitizedFeature, archiveDir, designExists, planExists)
}

function formatArchiveResult(
  feature: string,
  archiveDir: string,
  designExists: boolean,
  planExists: boolean
): string {
  const safePath = escapeMarkdown(archiveDir)

  return `## Archive Complete

**Feature**: ${escapeMarkdown(feature)}
**Archived**: ${new Date().toISOString()}

### Contents
- Design documents: ${designExists ? '✅' : '❌'}
- Plan: ${planExists ? '✅' : '❌'}
- SRS document: ✅

### Location
${safePath}

### Next Steps
Run the openflow-archive skill to generate detailed SRS with code mapping:
\`\`\`
skill(name="openflow-archive", feature="${escapeMarkdown(feature)}")
\`\`\`
`
}

async function generateSrsDocument(
  feature: string,
  archiveDir: string,
  designExists: boolean,
  planExists: boolean
): Promise<void> {
  const srsDir = path.join(archiveDir, 'srs')
  const safeFeature = escapeMarkdown(feature)
  const date = new Date().toISOString().split('T')[0]
  const srsFilename = addDatePrefix('srs.md')

  const designLink = designExists ? '- [设计文档](../design/)' : ''
  const planLink = planExists ? '- [执行计划](../plan/)' : ''

  const srsContent = `# ${safeFeature} - Software Requirements Specification

**Version**: 1.0
**Date**: ${date}
**Status**: Archived

## 1. 概述

本功能已实现并归档。

## 2. 代码实现

| 业务步骤 | 实现位置 | 关键代码 |
|----------|----------|----------|
| *待填写* | | |

> 使用 openflow-archive skill 自动生成代码映射

## 3. 修改的文件

| 文件 | 变更类型 |
|------|----------|
| *待从 Session 获取* | |

## 4. 相关文档

${designLink}
${planLink}
`
  await fs.writeFile(path.join(srsDir, srsFilename), srsContent, 'utf-8')
}
