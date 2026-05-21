import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowConfig } from '../types.js'
import type { ParsedTask } from './parser.js'
import { parsePlanTasks, extractPlanName } from './parser.js'
import { escapeMarkdown, findLatestDocument } from '../utils/index.js'
import { getDesignCandidatePaths } from '../config.js'
import { readDesignContextPacket } from '../commands/writing-plan.js'
import { logger } from '../utils/logger.js'
import { formatSecurityChecks, formatQualityChecks } from '../utils/verification-checks.js'
import type { VerificationFailureCategory } from '../types.js'

interface DesignDocSummary {
  proposal?: string
  design?: string
  decisions?: string
}

const DESIGN_CONTEXT_HEADER = '## Design Context'
const VERIFICATION_HEADER = '## Verification Phase'
const BUDGET_WARNING_HEADER = '## Plan Budget Warning'

const MAX_SAME_WAVE_TASKS = 4
const MAX_ESTIMATED_UNITS = 20

export interface EnhancePlanOptions {
  planPath: string
  config: OpenFlowConfig
  baseDir: string
}

export function classifyVerificationFailure(reason: string): VerificationFailureCategory {
  const normalized = reason.toLowerCase()
  if (/secret|vuln|security|credential|token/.test(normalized)) {
    return 'security'
  }
  if (/drift|mismatch|sync|inconsistent|doc/.test(normalized)) {
    return 'consistency'
  }
  return 'quality'
}

export async function enhancePlan(options: EnhancePlanOptions): Promise<boolean> {
  const { planPath, config, baseDir } = options
  const featureWorkflowConfig = (config as unknown as Record<string, { enabled: boolean }>)['feature']!

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

    if (featureName && featureWorkflowConfig.enabled) {
      const designSummary = await readDesignDocuments(baseDir, featureName, config)
      if (designSummary) {
        const withDesignContext = addDesignContextSection(enhancedContent, designSummary, featureName)
        if (withDesignContext !== enhancedContent) {
          enhancedContent = withDesignContext
          enhancementAdded = true
          logger.info('Added design context to plan', { feature: featureName })
        }
      }
    }

    if (config.verification.in_plan) {
      const withVerificationSection = addVerificationSection(enhancedContent, config.verification)
      if (withVerificationSection !== enhancedContent) {
        enhancedContent = withVerificationSection
        enhancementAdded = true
        logger.info('Added verification tasks section')
      }
    }

    // Budget warning: always evaluated, non-blocking
    const withBudgetWarning = addBudgetWarning(enhancedContent, tasks)
    if (withBudgetWarning !== enhancedContent) {
      enhancedContent = withBudgetWarning
      enhancementAdded = true
      logger.info('Added plan budget warning', { tasks: tasks.length })
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
  feature: string,
  config?: import('../types.js').OpenFlowConfig,
): Promise<DesignDocSummary | null> {
  const candidatePaths = await getDesignCandidatePaths(baseDir, feature, config)
  const workspacePaths = new Set<string>()
  const designContext = await readDesignContextPacket(baseDir, feature, config)
  const summary: DesignDocSummary = {}

  if (designContext) {
    summary.design = designContext
  }

  for (const candidatePath of candidatePaths) {
    try {
      const stats = await fs.stat(candidatePath)
      if (stats.isFile()) {
        workspacePaths.add(path.dirname(candidatePath))
        continue
      }
      if (stats.isDirectory()) {
        workspacePaths.add(candidatePath)
      }
    } catch {
      continue
    }
  }

  for (const workspacePath of workspacePaths) {
    const proposalPath = await findLatestDocument(workspacePath, /^(?:proposal|\d{8}-proposal)\.md$/)
    if (proposalPath && !summary.proposal) {
      summary.proposal = await extractKeySections(proposalPath)
    }

    const decisionsPath = await findLatestDocument(workspacePath, /^(?:decisions|\d{8}-decisions)\.md$/)
    if (decisionsPath && !summary.decisions) {
      summary.decisions = await extractKeySections(decisionsPath)
    }
  }

  if (summary.proposal || summary.design || summary.decisions) {
    return summary
  }

  return null
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

function addBudgetWarning(content: string, tasks: ParsedTask[]): string {
  if (content.includes(BUDGET_WARNING_HEADER)) return content

  const taskCount = tasks.length
  const implementationCount = tasks.filter((t) => t.isImplementation).length
  // Estimated units: implementation tasks ≈3 units (TDD cycle), others ≈1
  const estimatedUnits = implementationCount * 3 + (taskCount - implementationCount) * 1

  if (taskCount <= MAX_SAME_WAVE_TASKS && estimatedUnits <= MAX_ESTIMATED_UNITS) {
    return content
  }

  const lines: string[] = [
    '',
    '---',
    BUDGET_WARNING_HEADER,
    '',
    '> This plan exceeds recommended task density. The warning is non-blocking —',
    '> implementation may proceed, but consider splitting into smaller waves.',
    '',
    `- **Same-wave tasks**: ${taskCount} (recommended max: ${MAX_SAME_WAVE_TASKS})`,
    `- **Estimated execution units**: ${estimatedUnits} (recommended max: ${MAX_ESTIMATED_UNITS})`,
    '',
    '**Suggestion**: Split large waves across multiple `/start-work` invocations',
    'or reduce per-wave task count to keep execution feedback loops short.',
    '',
  ]

  return content + lines.join('\n')
}

function addDesignContextSection(content: string, summary: DesignDocSummary, feature: string): string {
  if (content.includes(DESIGN_CONTEXT_HEADER)) return content

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
${DESIGN_CONTEXT_HEADER}

> Auto-injected from the active OpenFlow design workspace for \`${escapeMarkdown(feature)}\`.
> Refer to the original design documents for full details.

${sections.join('\n\n')}

`
  return insertAfterTopTitle(content, designSection)
}

function addVerificationSection(content: string, verification: OpenFlowConfig['verification']): string {
  if (content.includes(VERIFICATION_HEADER)) return content

  const securityChecks = formatSecurityChecks(verification.security, 'plan')
  const qualityChecks = formatQualityChecks(verification.quality, 'plan')

  const verificationSection = `

---
${VERIFICATION_HEADER}

### Security Checks
${securityChecks}

### Quality Checks
${qualityChecks}

### Final Verification Authority

**After all implementation tasks are complete, invoke \`openflow-quality-gate\` as the final readiness authority.**

The quality gate performs:
- Adversarial hardening assessment (risk-based)
- Evidence collection and verification
- Readiness classification (\`Ready\`, \`ReadyWithDocUpdates\`, \`NotReady\`, \`NeedsDecision\`)

Do not claim completion until \`openflow-quality-gate\` returns \`Ready\` or \`ReadyWithDocUpdates\`.

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. \`openflow-quality-gate\` is the final verification authority.
`

  return content + verificationSection
}

function insertAfterTopTitle(content: string, section: string): string {
  const lines = content.split('\n')
  let insertIndex = 1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.startsWith('# ')) {
      insertIndex = i + 1
      break
    }
  }

  lines.splice(insertIndex, 0, section)
  return lines.join('\n')
}
