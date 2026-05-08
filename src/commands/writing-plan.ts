import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { RequirementModel } from '../phases/brainstorm/requirement-model.js'
import { RequirementModelSchema } from '../phases/brainstorm/requirement-model.js'
import { getDesignCandidatePaths } from '../config.js'
import { findLatestDocument } from '../utils/index.js'
import { logger } from '../utils/logger.js'

const DESIGN_SIDECAR_FILENAMES = ['design.meta.json', 'requirements.json'] as const

export async function readDesignContextPacket(baseDir: string, feature: string): Promise<string | null> {
  const candidatePaths = await getDesignCandidatePaths(baseDir, feature)

  for (const candidatePath of candidatePaths) {
    const candidate = await resolveDesignCandidate(candidatePath)
    if (!candidate) continue

    const structuredContext = await readStructuredDesignContext(candidate.workspacePath)
    if (structuredContext) {
      return structuredContext
    }

    const designPath = candidate.isFile
      ? candidatePath
      : await findLatestDocument(candidate.workspacePath, /^(?:design|\d{8}-design)\.md$/)
    if (!designPath) continue

    const markdownContext = await extractKeySections(designPath)
    if (markdownContext) {
      return markdownContext
    }
  }

  return null
}

async function resolveDesignCandidate(candidatePath: string): Promise<{ workspacePath: string; isFile: boolean } | null> {
  try {
    const stats = await fs.stat(candidatePath)
    if (stats.isFile()) {
      return { workspacePath: path.dirname(candidatePath), isFile: true }
    }
    if (stats.isDirectory()) {
      return { workspacePath: candidatePath, isFile: false }
    }
  } catch {
    return null
  }

  return null
}

async function readStructuredDesignContext(workspacePath: string): Promise<string | null> {
  for (const fileName of DESIGN_SIDECAR_FILENAMES) {
    const sidecarPath = path.join(workspacePath, fileName)

    try {
      const content = await fs.readFile(sidecarPath, 'utf-8')
      const model = RequirementModelSchema.parse(JSON.parse(content) as unknown)
      const designContext = formatRequirementModelDesignContext(model)
      if (designContext) {
        return designContext
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        continue
      }

      logger.debug('Failed to read writing-plan design sidecar, falling back to markdown', {
        workspacePath,
        sidecarPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return null
}

function formatRequirementModelDesignContext(model: RequirementModel): string {
  const sections: string[] = []
  const problemStatement = model.problemStatement?.trim() || model.feature

  if (problemStatement) {
    sections.push(`### Problem Statement\n${problemStatement}`)
  }

  if (model.goals.length > 0) {
    sections.push(`### Goals\n${model.goals.map((goal) => `- ${goal}`).join('\n')}`)
  }

  if (model.constraints.length > 0) {
    sections.push(`### Constraints\n${model.constraints.map((constraint) => (
      `- [${constraint.severity.toUpperCase()} / ${constraint.category}] ${constraint.description}`
    )).join('\n')}`)
  }

  if (model.acceptanceCriteria.length > 0) {
    sections.push(`### Acceptance Criteria\n${model.acceptanceCriteria.map((criterion) => `- ${criterion.description}`).join('\n')}`)
  }

  return sections.join('\n\n')
}

async function extractKeySections(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const keySections: string[] = []
    let currentSection: string[] = []
    let inKeySection = false
    let sectionTitle = ''

    for (const line of lines) {
      const isHeader = /^#{1,3}\s+/.test(line)

      if (isHeader) {
        if (inKeySection && currentSection.length > 0) {
          keySections.push(`### ${sectionTitle}\n${currentSection.join('\n').trim()}`)
        }
        currentSection = []
        sectionTitle = line.replace(/^#{1,3}\s+/, '').trim()

        const lowerTitle = sectionTitle.toLowerCase()
        inKeySection = /overview|概述|summary|problem|问题|solution|方案|approach|方法|architecture|架构|decision|决策|constraint|约束|requirement|需求|goal|目标/.test(lowerTitle)
      } else if (inKeySection) {
        currentSection.push(line)
      }
    }

    if (inKeySection && currentSection.length > 0) {
      keySections.push(`### ${sectionTitle}\n${currentSection.join('\n').trim()}`)
    }

    if (keySections.length === 0) {
      const firstParagraphs = content.split('\n\n').slice(0, 3).join('\n\n')
      return firstParagraphs.length > 500 ? firstParagraphs.substring(0, 500) + '...' : firstParagraphs
    }

    return keySections.slice(0, 5).join('\n\n')
  } catch {
    return ''
  }
}
