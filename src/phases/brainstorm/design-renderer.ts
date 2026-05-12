import type { ExpectedSymbol, RequirementModel } from './requirement-model.js'

const NOT_SPECIFIED = 'Not specified.'

export function renderDesignDocument(model: RequirementModel): string {
  const sections = [
    `# ${escapeInline(model.feature)} - Design`,
    '',
    renderOverview(model),
    renderProblem(model),
    renderGoals(model),
    renderNonGoals(model),
    renderArchitecture(model),
    renderBehaviorAlignment(model),
    renderDesignConstraints(model),
    renderSuccessCriteria(model),
    renderProposedDesign(model),
    renderRisksAndMitigations(model),
    renderTestingStrategy(model),
  ]

  return sections.join('\n').trimEnd() + '\n'
}

function renderOverview(model: RequirementModel): string {
  const lines = ['## Overview', '']

  lines.push(`Feature: ${escapeInline(model.feature)}`)

  if (model.targetUsers) {
    lines.push(`Target users: ${escapeInline(model.targetUsers)}`)
  }

  const overviewNotes: string[] = []
  if (model.scopeBoundary.inScope.length > 0) {
    overviewNotes.push(`In scope: ${joinInlineList(model.scopeBoundary.inScope)}`)
  }
  if (model.scopeBoundary.outOfScope.length > 0) {
    overviewNotes.push(`Out of scope: ${joinInlineList(model.scopeBoundary.outOfScope)}`)
  }

  if (overviewNotes.length > 0) {
    lines.push(...overviewNotes)
  } else {
    lines.push(NOT_SPECIFIED)
  }

  return lines.join('\n')
}

function renderProblem(model: RequirementModel): string {
  return ['## Problem', '', escapeParagraph(model.problemStatement)].join('\n')
}

function renderGoals(model: RequirementModel): string {
  return renderBulletSection('## Goals', model.goals)
}

function renderNonGoals(model: RequirementModel): string {
  return renderBulletSection('## Non-Goals', model.nonGoals)
}

function renderArchitecture(model: RequirementModel): string {
  const lines = ['## Architecture', '']
  const expectedModules = model.expectedModules ?? []

  if (expectedModules.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  const symbolsByModule = groupSymbolsByModule(model.expectedSymbols ?? [])

  expectedModules.forEach((expectedModule, index) => {
    if (index > 0) {
      lines.push('')
    }

    const normalizedPath = normalizeModulePath(expectedModule.path)
    lines.push(`### Component: ${escapeInline(expectedModule.purpose)}`)
    lines.push('')
    lines.push(`- Location: ${escapeInline(normalizedPath)}`)

    const moduleSymbols = symbolsByModule.get(normalizedPath) ?? []
    if (moduleSymbols.length > 0) {
      for (const symbol of moduleSymbols) {
        lines.push(`- ${renderCodeIdentifier(symbol.name)} (${escapeInline(symbol.kind)})`)
      }
    } else {
      lines.push(`- Symbols: ${NOT_SPECIFIED}`)
    }
  })

  return lines.join('\n')
}

function renderDesignConstraints(model: RequirementModel): string {
  const lines = ['## Design Constraints', '']

  if (model.constraints.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const constraint of model.constraints) {
    lines.push(`- [${constraint.severity}] ${escapeInline(constraint.description)}`)
  }

  return lines.join('\n')
}

function renderSuccessCriteria(model: RequirementModel): string {
  const lines = ['## Success Criteria', '']

  if (model.acceptanceCriteria.length === 0) {
    lines.push(`- [ ] ${NOT_SPECIFIED}`)
    return lines.join('\n')
  }

  for (const criterion of model.acceptanceCriteria) {
    lines.push(`- [ ] ${escapeInline(criterion.description)}`)
  }

  return lines.join('\n')
}

function renderBehaviorAlignment(model: RequirementModel): string {
  const lines = ['## Behavior Alignment', '']

  if (model.acceptanceCriteria.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  lines.push('| Behavior Scenario | Design Response | Files / Modules | Risk |')
  lines.push('|------------------|-----------------|-----------------|------|')

  const modules = (model.expectedModules ?? []).map((m) => m.path).join(', ')
  const riskMap: Record<string, string> = { must: 'High', should: 'Medium', may: 'Low' }

  for (const criterion of model.acceptanceCriteria) {
    const relatedConstraint = model.constraints.find(
      (c) => criterion.description.toLowerCase().includes(c.description.toLowerCase()),
    )
    const risk = relatedConstraint ? (riskMap[relatedConstraint.severity] ?? 'Medium') : 'Medium'
    lines.push(
      `| ${escapeInline(criterion.description)} | See constraints (${String(model.constraints.length)} total) | ${modules || 'Not specified.'} | ${risk} |`,
    )
  }

  return lines.join('\n')
}

function renderProposedDesign(model: RequirementModel): string {
  const lines = ['## Proposed Design', '']
  const proposalNotes: string[] = []

  if (model.problemStatement) {
    proposalNotes.push(`Address the problem statement: ${escapeInline(model.problemStatement)}`)
  }

  if (model.scopeBoundary.inScope.length > 0) {
    proposalNotes.push(`Primary scope: ${joinInlineList(model.scopeBoundary.inScope)}`)
  }

  if (model.synthesis && Object.keys(model.synthesis).length > 0) {
    proposalNotes.push(`Synthesis: ${escapeInline(JSON.stringify(model.synthesis))}`)
  }

  lines.push(proposalNotes.length > 0 ? proposalNotes.join(' ') : NOT_SPECIFIED)
  return lines.join('\n')
}

function renderRisksAndMitigations(model: RequirementModel): string {
  const lines = ['## Risks And Mitigations', '']

  if (!model.risks || model.risks.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const risk of model.risks) {
    lines.push(`- Risk: ${escapeInline(risk.description)} Mitigation: ${escapeInline(risk.mitigation)}`)
  }

  return lines.join('\n')
}

function renderTestingStrategy(model: RequirementModel): string {
  return ['## Testing Strategy', '', escapeParagraph(model.testingStrategy)].join('\n')
}

function renderBulletSection(heading: string, items: string[]): string {
  const lines = [heading, '']

  if (items.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const item of items) {
    lines.push(`- ${escapeInline(item)}`)
  }

  return lines.join('\n')
}

function escapeParagraph(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    return NOT_SPECIFIED
  }

  return escapeInline(value)
}

function joinInlineList(items: string[]): string {
  return items.map((item) => escapeInline(item)).join('; ')
}

function groupSymbolsByModule(symbols: ExpectedSymbol[]): Map<string, ExpectedSymbol[]> {
  const grouped = new Map<string, ExpectedSymbol[]>()

  for (const symbol of symbols) {
    const normalizedPath = normalizeModulePath(symbol.module)
    if (!normalizedPath) {
      continue
    }

    const existing = grouped.get(normalizedPath) ?? []
    existing.push(symbol)
    grouped.set(normalizedPath, existing)
  }

  return grouped
}

function normalizeModulePath(modulePath: string | undefined): string {
  if (!modulePath) {
    return ''
  }

  const normalized = modulePath.replace(/\\/g, '/').trim()
  const srcIndex = normalized.indexOf('src/')
  if (srcIndex >= 0) {
    return normalized.slice(srcIndex)
  }

  return normalized
}

function renderCodeIdentifier(value: string): string {
  return `\`${escapeCode(value)}\``
}

function escapeCode(value: string): string {
  return normalizeWhitespace(value).replace(/`/g, "'")
}

function escapeInline(value: string): string {
  return normalizeWhitespace(value).replace(/([\\`*_{}\[\]()#+>|])/g, '\\$1')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
}
