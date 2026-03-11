import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { escapeMarkdown } from '../utils/security.js'
import { logger } from '../utils/logger.js'

export async function generateSrsDocument(
  feature: string,
  archiveDir: string,
  designExists: boolean,
  planExists: boolean
): Promise<void> {
  const safeFeature = escapeMarkdown(feature)
  const date = new Date().toISOString().split('T')[0]

  const designLink = designExists ? '- [设计文档](../design/)' : ''
  const planLink = planExists ? '- [执行计划](../plan/)' : ''

  const srsContent = `# ${safeFeature} - Software Requirements Specification

**Version**: 1.0
**Date**: ${date}
**Status**: Archived

## 1. 概述

本功能已实现并归档。

## 2. 业务流程

{从计划文档提取}

## 3. 代码实现

| 业务步骤 | 实现位置 | 关键代码 |
|----------|----------|----------|
| *待填写* | | |

## 4. 修改的文件

| 文件 | 变更类型 |
|------|----------|
| *待从 Session 获取* | |

## 5. 相关文档
${designLink}
${planLink}
`

  const srsDir = path.join(archiveDir, 'srs')
  await fs.writeFile(path.join(srsDir, 'srs.md'), srsContent, 'utf-8')
  logger.info('Generated SRS document', { feature })
}
