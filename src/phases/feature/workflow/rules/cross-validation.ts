import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export interface CrossValidationGap {
  severity: 'non_blocking' | 'blocking' | 'critical_blocking'
  description: string
}

export interface CrossValidationResult {
  status: 'Passed' | 'Blocking' | 'Critical Blocking'
  hasCriticalBlocking: boolean
  hasBlocking: boolean
  gaps: CrossValidationGap[]
  checkedDocuments: Array<{ name: string; content: string }>
}

export function evaluateCrossValidation(documents: Array<{ name: string; content: string }>): CrossValidationResult {
  const checkedDocuments = documents
    .filter((document) => document.content.trim().length > 0)

  const gaps: CrossValidationGap[] = []

  // Structural checks
  for (const doc of checkedDocuments) {
    const body = doc.content.trim()

    const placeholderMatch = body.match(/(?:TBD|TODO|FIXME|待定|待补充|待定义|待完善)[^\n]*/gi)
    if (placeholderMatch) {
      gaps.push({
        severity: 'blocking',
        description: `${doc.name}: contains ${placeholderMatch.length} placeholder(s): ${placeholderMatch.slice(0, 3).join(', ')}`,
      })
    }

    if (doc.name === 'design.md') {
      if (!/^#+\s+(?:Overview|概述)/mu.test(body)) {
        gaps.push({ severity: 'blocking', description: 'design.md: missing Overview section' })
      }
    }
    if (doc.name === 'behavior.md') {
      if (!/^#+\s+(?:Scenario|场景|Behavior|行为)/mu.test(body)) {
        gaps.push({ severity: 'blocking', description: 'behavior.md: missing Scenario/Behavior section' })
      }
    }
  }

  // Cross-reference check
  const designDoc = checkedDocuments.find((d) => d.name === 'design.md')
  const behaviorDoc = checkedDocuments.find((d) => d.name === 'behavior.md')
  if (designDoc && behaviorDoc) {
    const designConstraints = designDoc.content.match(/^[-*]\s+.*(?:must|必须|shall|不得|禁止)/gimu)
    if (designConstraints && designConstraints.length > 0) {
      const behaviorSections = behaviorDoc.content.match(/^#{2,}\s+/gm)
      if (!behaviorSections || behaviorSections.length < 2) {
        gaps.push({
          severity: 'non_blocking',
          description: 'behavior.md: may not cover all design constraints (few scenario sections found)',
        })
      }
    }
  }

  // Critical Blocking checks
  for (const doc of checkedDocuments) {
    const body = doc.content.toLowerCase()

    if (/(?:删除.*数据|drop\s+table|truncate|rm\s+-rf|delete\s+from)/iu.test(body)) {
      if (!/(?:软删除|soft.delete|backup|备份|undo|回滚|rollback|cascade.*off)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: data deletion without explicit backup/rollback mitigation`,
        })
      }
    }

    if (/(?:sudo|root|admin.*password|secret.*key|api[_-]?key|access[_-]?token)/iu.test(body)) {
      if (!/(?:permission|权限|authorization|auth|access[_-]?control|role|角色)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: sensitive credential/permission reference without access control`,
        })
      }
    }

    if (/(?:自动执行|auto.*execute|cron|schedule|webhook.*trigger|自动部署)/iu.test(body)) {
      if (!/(?:confirmation|确认|guard|guardrail|安全|dry[_-]?run|sandbox)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: automatic execution without safety guard/confirmation`,
        })
      }
    }

    if (/(?:全局|global|cross[_-]?session|所有用户|all[_-]?users)/iu.test(body)) {
      if (!/(?:atomic|原子|lock|锁|transaction|事务|隔离|isolation)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: global/cross-session state mutation without isolation mechanism`,
        })
      }
    }
  }

  const criticalGaps = gaps.filter((g) => g.severity === 'critical_blocking')
  const blockingGaps = gaps.filter((g) => g.severity === 'blocking')

  const overallStatus = criticalGaps.length > 0 ? 'Critical Blocking'
    : blockingGaps.length > 0 ? 'Blocking'
    : 'Passed'

  return {
    status: overallStatus,
    hasCriticalBlocking: criticalGaps.length > 0,
    hasBlocking: blockingGaps.length > 0,
    gaps,
    checkedDocuments,
  }
}

export function appendCrossValidationSummary(content: string, documents: Array<{ name: string; content: string }>): string {
  const result = evaluateCrossValidation(documents)

  const checkedList = result.checkedDocuments
    .map((document) => `- ${document.name}: present`)
    .join('\n')

  const gapSummary = result.gaps.length > 0
    ? `\n\n### Gap Classification\n${result.gaps.map((g) => `- [${g.severity.replace('_', ' ')}] ${g.description}`).join('\n')}`
    : ''

  const statsLine = result.hasCriticalBlocking
    ? `- Critical Blocking gaps: ${result.gaps.filter((g) => g.severity === 'critical_blocking').length}`
    : result.hasBlocking
      ? `- Blocking gaps: ${result.gaps.filter((g) => g.severity === 'blocking').length}`
      : `- Non-blocking gaps: ${result.gaps.filter((g) => g.severity === 'non_blocking').length}`

  return `${content.trimEnd()}

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: ${result.status}
- Documents checked in order:
${checkedList}
${statsLine}${gapSummary}
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
`
}

export async function buildCrossValidationDocuments(workspaceDir: string): Promise<Array<{ name: string; content: string }>> {
  const requiredOrder = ['requirements.md', 'prd.md', 'design.md', 'behavior.md', 'decisions.md']
  const documents: Array<{ name: string; content: string }> = []

  for (const docName of requiredOrder) {
    const docPath = path.join(workspaceDir, docName)
    try {
      const body = await fs.readFile(docPath, 'utf-8')
      if (body.trim()) {
        documents.push({ name: docName, content: body })
      }
    } catch {
      // File does not exist — skip (conditional document)
    }
  }

  return documents
}
