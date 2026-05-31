/**
 * PRD information extraction — reads design documents and extracts structured info.
 */
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { RequirementModelSchema, type RequirementModel } from '../../requirement-model.js'
import { logger } from '../../../../utils/logger.js'


export interface DesignInfo {
  problemStatement: string
  successCriteria: string[]
  overview: string
  components: string[]
  goals: string[]
  constraints: string[]
  outOfScope: string[]
}

export async function readRequirementModelFromWorkspace(
  designDir: string,
): Promise<RequirementModel | null> {
  for (const fileName of ['design.meta.json', 'requirements.json']) {
    const filePath = path.join(designDir, fileName)

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return RequirementModelSchema.parse(JSON.parse(content) as unknown)
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
        continue
      }

      logger.debug('Failed to read requirement model for PRD generation', {
        designDir,
        filePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return null
}

export function designInfoFromRequirementModel(model: RequirementModel): DesignInfo {
  const constraints = model.constraints.map(
    (constraint) =>
      `[${constraint.severity.toUpperCase()} / ${constraint.category}] ${constraint.description}`,
  )

  return {
    problemStatement: model.problemStatement ?? model.feature,
    successCriteria: model.acceptanceCriteria.map((criterion) => criterion.description),
    overview: '',
    components: model.scopeBoundary.inScope,
    goals: model.goals,
    constraints,
    outOfScope: model.scopeBoundary.outOfScope,
  }
}

export async function extractDesignInfo(
  designDir: string,
  findPreferredDocument: (dir: string, names: string[], pattern: RegExp) => Promise<string | null>,
): Promise<DesignInfo> {
  const info: DesignInfo = {
    problemStatement: '',
    successCriteria: [],
    overview: '',
    components: [],
    goals: [],
    constraints: [],
    outOfScope: [],
  }

  // Try to read proposal.md for problem statement and success criteria
  const proposalPath = await findPreferredDocument(designDir, ['proposal.md'], /^\d{8}-proposal\.md$/)
  if (proposalPath) {
    try {
      const content = await fs.readFile(proposalPath, 'utf-8')
      info.problemStatement = extractSection(content, 'Problem Statement', '## Success Criteria')
      info.successCriteria = extractChecklist(content, 'Success Criteria')
    } catch (error) {
      logger.debug('Failed to extract proposal details for PRD generation', {
        proposalPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Try to read design.md for overview and components
  const designPath = await findPreferredDocument(designDir, ['design.md'], /^\d{8}-design\.md$/)
  if (designPath) {
    try {
      const content = await fs.readFile(designPath, 'utf-8')
      info.overview = extractSection(content, 'Overview', '## Architecture')
      info.components = extractComponentNames(content)
    } catch (error) {
      logger.debug('Failed to extract design details for PRD generation', {
        designPath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return info
}

function extractSection(content: string, startMarker: string, endMarker: string): string {
  const startIdx = content.indexOf(`## ${startMarker}`)
  if (startIdx === -1) return ''

  const endIdx = content.indexOf(endMarker, startIdx)
  const sectionContent =
    endIdx === -1 ? content.substring(startIdx) : content.substring(startIdx, endIdx)

  // Clean up the section
  return sectionContent
    .replace(`## ${startMarker}`, '')
    .replace(/\n+/g, ' ')
    .trim()
    .substring(0, 500) // Limit length
}

function extractChecklist(content: string, sectionName: string): string[] {
  const startIdx = content.indexOf(`## ${sectionName}`)
  if (startIdx === -1) return []

  const endIdx = content.indexOf('##', startIdx + 1)
  const sectionContent =
    endIdx === -1 ? content.substring(startIdx) : content.substring(startIdx, endIdx)

  const items: string[] = []
  const lines = sectionContent.split('\n')

  for (const line of lines) {
    const match = line.match(/^-\s*\[?\s*[x\s]?\s*\]?\s*(.+)$/)
    if (match && match[1]) {
      const trimmed = match[1].trim()
      if (trimmed) {
        items.push(trimmed)
      }
    }
  }

  return items
}

function extractComponentNames(content: string): string[] {
  const components: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const match = line.match(/^###\s+(.+)$/)
    if (match && match[1]) {
      const name = match[1]
      if (!name.includes('Component Name')) {
        components.push(name.trim())
      }
    }
  }

  return components
}
