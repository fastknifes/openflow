import type { RequirementModel } from './requirement-model.js'

const NOT_SPECIFIED = 'Not specified.'

export function renderDesignDocument(model: RequirementModel): string {
  const sections = [
    `# ${escapeInline(model.featureTitle ?? model.feature)} - Design`,
    '',
    renderDraftNotice(model),
    renderConsensusSummary(model),
    renderIdentity(model),
    renderOverview(model),
    renderProblem(model),
    renderFrontendAsciiPreview(model),
    renderGoals(model),
    renderNonGoals(model),
    renderBehaviorAlignment(model),
    renderDesignConstraints(model),
    renderSuccessCriteria(model),
    renderRisksAndMitigations(model),
    renderTestingStrategy(model),
  ]

  return sections.join('\n').trimEnd() + '\n'
}

function renderDraftNotice(model: RequirementModel): string {
  if (model.convergenceStatus !== 'draft_with_assumptions') {
    return ''
  }

  return ['> **Draft with Assumptions / 带假设的草稿**', '', 'This document contains assumptions that must not be treated as confirmed implementation constraints.'].join('\n')
}

function renderConsensusSummary(model: RequirementModel): string {
  const lines = ['## Human Consensus Summary', '']
  lines.push(`Feature title: ${escapeInline(model.featureTitle ?? model.feature)}`)
  lines.push(`Internal slug: ${escapeInline(model.feature)}`)
  if (model.sourceIntent) lines.push(`Source intent: ${escapeInline(model.sourceIntent)}`)
  lines.push(`Problem or improvement target: ${escapeParagraph(model.problemStatement)}`)
  lines.push(`Expected result: ${model.goals.length > 0 ? joinInlineList(model.goals) : NOT_SPECIFIED}`)
  return lines.join('\n')
}

function renderIdentity(model: RequirementModel): string {
  const lines = ['## Identity And Assumptions', '']
  lines.push(`- Feature slug: ${escapeInline(model.feature)}`)
  if (model.featureTitle) lines.push(`- Feature title: ${escapeInline(model.featureTitle)}`)
  if (model.sourceIntent) lines.push(`- Source intent: ${escapeInline(model.sourceIntent)}`)

  const assumptions = model.assumptions ?? []
  lines.push('- Assumptions:')
  if (assumptions.length === 0) {
    lines.push(`  - ${NOT_SPECIFIED}`)
  } else {
    for (const assumption of assumptions) lines.push(`  - ${escapeInline(assumption)}`)
  }

  const pending = model.pendingConfirmations ?? []
  lines.push('- Pending confirmations:')
  if (pending.length === 0) {
    lines.push(`  - ${NOT_SPECIFIED}`)
  } else {
    for (const item of pending) lines.push(`  - ${escapeInline(item)}`)
  }

  return lines.join('\n')
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

function renderFrontendAsciiPreview(model: RequirementModel): string {
  if (!isFrontendRequirement(model)) {
    return ''
  }

  const primaryGoal = firstMeaningful(model.goals) ?? firstMeaningful(model.acceptanceCriteria.map((criterion) => criterion.description)) ?? 'User completes the primary interaction'
  const primaryInteraction = firstMeaningful(model.acceptanceCriteria.map((criterion) => criterion.description)) ?? primaryGoal
  const scope = firstMeaningful(model.scopeBoundary.inScope) ?? 'Primary page or component'

  return [
    '## UI / Interaction ASCII Preview',
    '',
    'This feature appears to affect a user-facing frontend. Use this preview to confirm the intended page structure and interaction path before implementation.',
    '',
    '```text',
    '+------------------------------------------------------------+',
    `| ${padAscii('Page / View: ' + scope, 58)} |`,
    '+------------------------------------------------------------+',
    '| Header / Navigation                                        |',
    '+------------------------------------------------------------+',
    '| Main content                                                |',
    `|   Goal: ${padAscii(primaryGoal, 50)} |`,
    '|                                                            |',
    '|   [ Primary action ]        [ Secondary / cancel ]          |',
    '+------------------------------------------------------------+',
    '| Feedback / validation / empty-or-loading state              |',
    '+------------------------------------------------------------+',
    '',
    'Interaction flow:',
    `1. User opens the page/component for: ${toAsciiLine(scope)}`,
    `2. User performs: ${toAsciiLine(primaryInteraction)}`,
    '3. UI updates visible state and shows success, validation, or recovery feedback.',
    '```',
  ].join('\n')
}

function renderGoals(model: RequirementModel): string {
  return renderBulletSection('## Goals', model.goals)
}

function renderNonGoals(model: RequirementModel): string {
  return renderBulletSection('## Non-Goals', model.nonGoals)
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

  lines.push('| Behavior Scenario | Design Response | Risk |')
  lines.push('|------------------|-----------------|------|')

  const riskMap: Record<string, string> = { must: 'High', should: 'Medium', may: 'Low' }

  for (const criterion of model.acceptanceCriteria) {
    const relatedConstraint = model.constraints.find(
      (c) => criterion.description.toLowerCase().includes(c.description.toLowerCase()),
    )
    const risk = relatedConstraint ? (riskMap[relatedConstraint.severity] ?? 'Medium') : 'Medium'
    lines.push(
      `| ${escapeInline(criterion.description)} | Captured as observable product/workflow behavior; implementation structure is deferred until planning. | ${risk} |`,
    )
  }

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

function isFrontendRequirement(model: RequirementModel): boolean {
  const haystack = [
    model.feature,
    model.featureTitle,
    model.sourceIntent,
    model.problemStatement,
    model.targetUsers,
    ...model.goals,
    ...model.scopeBoundary.inScope,
    ...(model.scopeBoundary.touchedModules ?? []),
    ...model.acceptanceCriteria.map((criterion) => criterion.description),
    ...model.constraints.map((constraint) => constraint.description),
    ...(model.expectedModules ?? []).map((module) => `${module.path} ${module.purpose}`),
  ].filter(Boolean).join(' ').toLowerCase()

  if (hasFrontendNegation(haystack)) {
    return false
  }

  return /\b(frontend|front-end|ui|ux|page|screen|react|vue|svelte|css|html|form|modal|button|sidebar|navbar|dashboard)\b/.test(haystack)
    || /前端|页面|界面|交互|组件|表单|按钮|弹窗|侧边栏|导航|看板|仪表盘/.test(haystack)
}

function hasFrontendNegation(value: string): boolean {
  return /\b(no|without|not|exclude|avoid|skip)\s+(frontend|front-end|ui|ux|page|screen|react|vue|svelte|css|html|form|modal|button|sidebar|navbar|dashboard)\b/.test(value)
    || /\b(frontend|front-end|ui|ux|page|screen|react|vue|svelte|css|html|form|modal|button|sidebar|navbar|dashboard)\b.{0,24}\b(not affected|unchanged|out of scope|not impacted)\b/.test(value)
    || /不(涉及|修改|变更|影响|包含).{0,12}(前端|页面|界面|交互|组件)|无需.{0,12}(前端|页面|界面|交互|组件)|(前端|页面|界面|交互|组件).{0,12}(不受影响|不变|排除|不在范围)/.test(value)
}

function firstMeaningful(items: string[]): string | undefined {
  return items.find((item) => item.trim().length > 0)
}

function padAscii(value: string, width: number): string {
  const normalized = toAsciiLine(value)
  if (normalized.length >= width) {
    return normalized.slice(0, width - 3) + '...'
  }

  return normalized.padEnd(width, ' ')
}

function toAsciiLine(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\|/g, '/')
    .replace(/[\r\n]+/g, ' ')
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

function escapeInline(value: string): string {
  return normalizeWhitespace(value).replace(/([\\`*_{}\[\]()#+>|])/g, '\\$1')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
}
