import * as fs from 'node:fs/promises'
import type { OpenFlowConfig } from '../types.js'
import type { ParsedTask } from './parser.js'
import { parsePlanTasks, extractPlanName } from './parser.js'
import { escapeMarkdown, findLatestDocument } from '../utils/index.js'
import { getDesignCandidatePaths } from '../config.js'
import { logger } from '../utils/logger.js'
import { formatSecurityChecks, formatQualityChecks } from '../utils/verification-checks.js'
import type { VerificationFailureCategory } from '../types.js'

interface DesignDocSummary {
  proposal?: string
  design?: string
  decisions?: string
}

const DESIGN_CONTEXT_HEADER = '## Design Context'
const TDD_EXPANDED_HEADER = '## TDD Expanded Tasks'
const VERIFICATION_HEADER = '## Verification Phase'

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
      const designSummary = await readDesignDocuments(baseDir, featureName)
      if (designSummary) {
        const withDesignContext = addDesignContextSection(enhancedContent, designSummary, featureName)
        if (withDesignContext !== enhancedContent) {
          enhancedContent = withDesignContext
          enhancementAdded = true
          logger.info('Added design context to plan', { feature: featureName })
        }
      }
    }

    if (config.tdd.enabled) {
      const implementationTasks = tasks.filter((t) => t.isImplementation)

      if (implementationTasks.length >= config.tdd.expand_threshold) {
        const withTddExpansion = addTddExpansionComment(enhancedContent, implementationTasks)
        if (withTddExpansion !== enhancedContent) {
          enhancedContent = withTddExpansion
          enhancementAdded = true
          logger.info('Added TDD expansion hints', { count: implementationTasks.length })
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
  feature: string
): Promise<DesignDocSummary | null> {
  const candidateDirs = getDesignCandidatePaths(baseDir, feature)

  for (const designDir of candidateDirs) {
    try {
      const stats = await fs.stat(designDir)
      if (!stats.isDirectory()) continue
    } catch {
      continue
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

    if (summary.proposal || summary.design || summary.decisions) {
      return summary
    }
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

function addTddExpansionComment(content: string, tasks: ParsedTask[]): string {
  if (content.includes(TDD_EXPANDED_HEADER)) return content

  const tddExpandedTasks: string[] = []
  
  for (const task of tasks) {
    tddExpandedTasks.push(`
### Task ${task.id}: ${escapeMarkdown(task.title)} (TDD)

**Files:**
- Test: \`tests/unit/path/to/test.ts\`
- Implementation: \`src/path/to/file.ts\`

- [ ] **Step 1: RED - Write failing test**
\`\`\`typescript
// Write test for ${task.title}
describe('${task.title}', () => {
  it('should work correctly', () => {
    // Arrange
    // Act
    // Assert
  })
})
\`\`\`

- [ ] **Step 2: Run test to verify it fails**
Run: \`bun test tests/unit/path/to/test.ts\`
Expected: FAIL

- [ ] **Step 3: GREEN - Implement minimal code**
\`\`\`typescript
// Minimal implementation to pass
\`\`\`

- [ ] **Step 4: Run test to verify it passes**
Run: \`bun test tests/unit/path/to/test.ts\`
Expected: PASS

- [ ] **Step 5: REFACTOR - Clean up while keeping tests green**

- [ ] **Step 6: Commit**
\`\`\`bash
git add tests/ src/
git commit -m "feat: ${task.title}"
\`\`\`
`)
  }

  const tddSection = `
---
${TDD_EXPANDED_HEADER}

> Auto-expanded by OpenFlow. Each implementation task follows Red-Green-Refactor cycle.

${tddExpandedTasks.join('\n')}

`
  return insertAfterTopTitle(content, tddSection)
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

### Failure Handling
- Quality failure: fix implementation and rerun verification.
- Security failure: block archive until fixed.
- Consistency failure: sync docs and implementation, then rerun verification.

> Auto-generated by OpenFlow. Complete all verification tasks before archiving.
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
