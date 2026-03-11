import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowConfig } from '../types.js'
import type { ParsedTask } from './parser.js'
import { parsePlanTasks, extractPlanName } from './parser.js'
import { escapeMarkdown, findLatestDocument } from '../utils/index.js'
import { logger } from '../utils/logger.js'

interface DesignDocSummary {
  proposal?: string
  design?: string
  decisions?: string
}

export interface EnhancePlanOptions {
  planPath: string
  config: OpenFlowConfig
  baseDir: string
}

export async function enhancePlan(options: EnhancePlanOptions): Promise<boolean> {
  const { planPath, config, baseDir } = options

  try {
    const content = await fs.readFile(planPath, 'utf-8')
    const tasks = parsePlanTasks(content)

    if (tasks.length === 0) {
      logger.info('No tasks found in plan to enhance')
      return false
    }

    const featureName = extractPlanName(planPath)
    let enhancedContent = content
    let enhancementAdded = false

    if (featureName && config.brainstorming.enabled) {
      const designSummary = await readDesignDocuments(baseDir, config.brainstorming.output_dir, featureName)
      if (designSummary) {
        enhancedContent = addDesignContextSection(enhancedContent, designSummary, featureName)
        enhancementAdded = true
        logger.info('Added design context to plan', { feature: featureName })
      }
    }

    if (config.tdd.enabled) {
      const implementationTasks = tasks.filter((t) => t.isImplementation)

      if (implementationTasks.length >= config.tdd.expand_threshold) {
        enhancedContent = addTddExpansionComment(enhancedContent, implementationTasks)
        enhancementAdded = true
        logger.info('Added TDD expansion hints', { count: implementationTasks.length })
      }
    }

    if (config.verification.in_plan) {
      enhancedContent = addVerificationSection(enhancedContent, config.verification)
      enhancementAdded = true
      logger.info('Added verification tasks section')
    }

    if (enhancementAdded) {
      await fs.writeFile(planPath, enhancedContent, 'utf-8')
      logger.info('Enhanced plan written', { path: planPath })
      return true
    }

    return false
  } catch (error) {
    logger.error('Failed to enhance plan', error instanceof Error ? error : undefined)
    return false
  }
}

async function readDesignDocuments(
  baseDir: string,
  outputDir: string,
  feature: string
): Promise<DesignDocSummary | null> {
  const designDir = path.join(baseDir, outputDir, feature)

  try {
    const stats = await fs.stat(designDir)
    if (!stats.isDirectory()) return null
  } catch {
    return null
  }

  const summary: DesignDocSummary = {}

  const proposalPath = await findLatestDocument(designDir, /^\d{8}-proposal\.md$/)
  if (proposalPath) {
    summary.proposal = await extractKeySections(proposalPath)
  }

  const designPath = await findLatestDocument(designDir, /^\d{8}-design\.md$/)
  if (designPath) {
    summary.design = await extractKeySections(designPath)
  }

  const decisionsPath = await findLatestDocument(designDir, /^\d{8}-decisions\.md$/)
  if (decisionsPath) {
    summary.decisions = await extractKeySections(decisionsPath)
  }

  if (!summary.proposal && !summary.design && !summary.decisions) {
    return null
  }

  return summary
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

function addDesignContextSection(content: string, summary: DesignDocSummary, feature: string): string {
  const sections: string[] = []

  if (summary.proposal) {
    sections.push(`#### Proposal\n${summary.proposal}`)
  }
  if (summary.design) {
    sections.push(`#### Design\n${summary.design}`)
  }
  if (summary.decisions) {
    sections.push(`#### Decisions\n${summary.decisions}`)
  }

  if (sections.length === 0) return content

  const designSection = `
---
## Design Context

> Auto-injected from \`docs/design/${escapeMarkdown(feature)}/\` by OpenFlow.
> Refer to the original design documents for full details.

${sections.join('\n\n')}

`

  const lines = content.split('\n')
  let insertIndex = 1

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i]
    if (currentLine?.startsWith('# ')) {
      insertIndex = i + 1
      break
    }
  }

  lines.splice(insertIndex, 0, designSection)
  return lines.join('\n')
}

function addTddExpansionComment(content: string, tasks: ParsedTask[]): string {
  const taskList = tasks.map((t) => `- Task ${t.id}: ${escapeMarkdown(t.title)}`).join('\n')

  const tddComment = `
<!-- OpenFlow TDD Expansion Hint
The following implementation tasks should follow TDD (Red-Green-Refactor):

${taskList}

For each implementation task:
1. RED: Write failing test first
2. GREEN: Implement minimal code to pass
3. REFACTOR: Clean up while keeping tests green
-->

`

  const lines = content.split('\n')
  let insertIndex = 1

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i]
    if (currentLine?.startsWith('# ')) {
      insertIndex = i + 1
      break
    }
  }

  lines.splice(insertIndex, 0, tddComment)
  return lines.join('\n')
}

function addVerificationSection(content: string, verification: OpenFlowConfig['verification']): string {
  const securityChecks = verification.security
    .map((s) => {
      switch (s) {
        case 'secret':
          return '- [ ] **Secret Scan**: Check for accidentally committed secrets'
        case 'vuln':
          return '- [ ] **Vulnerability Scan**: Run dependency vulnerability check'
        case 'dependency':
          return '- [ ] **Dependency Review**: Verify new dependencies are trusted'
        default:
          return `- [ ] **${escapeMarkdown(s)}**: Run security check`
      }
    })
    .join('\n')

  const qualityChecks = verification.quality
    .map((q) => {
      switch (q) {
        case 'lint':
          return '- [ ] **Lint Check**: Run linter'
        case 'typecheck':
          return '- [ ] **Type Check**: Run type checker'
        case 'test':
          return '- [ ] **Test Suite**: Run all tests'
        case 'format':
          return '- [ ] **Format Check**: Run formatter check'
        default:
          return `- [ ] **${escapeMarkdown(q)}**: Run quality check`
      }
    })
    .join('\n')

  const verificationSection = `

---
## Verification Phase

### Security Checks
${securityChecks}

### Quality Checks
${qualityChecks}

> Auto-generated by OpenFlow. Complete all verification tasks before archiving.
`

  return content + verificationSection
}
