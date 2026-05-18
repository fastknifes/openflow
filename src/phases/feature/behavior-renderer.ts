import type { RequirementModel } from './requirement-model.js'

const NOT_SPECIFIED = 'Not specified.'

export function renderBehaviorDocument(model: RequirementModel): string {
  const sections = [
    `# ${escapeInline(model.featureTitle ?? model.feature)} - Observable Behavior`,
    '',
    renderDraftNotice(model),
    renderConsensusSummary(model),
    renderFeatureCommandBehavior(model),
    renderUserContext(model),
    renderTriggerRules(model),
    renderNonTriggerRules(model),
    renderUserVisibleScenarios(model),
    renderRequiredContent(model),
    renderSuccessResponses(model),
    renderMustNotBehavior(model),
    renderAcceptanceVerificationMapping(model),
  ]

  return sections.join('\n').trimEnd() + '\n'
}

function renderDraftNotice(model: RequirementModel): string {
  if (model.convergenceStatus !== 'draft_with_assumptions') {
    return ''
  }

  return ['> **Draft with Assumptions / 带假设的草稿**', '', 'Assumptions in this behavior document are not confirmed facts.'].join('\n')
}

function renderConsensusSummary(model: RequirementModel): string {
  const lines = ['## Human Consensus Summary', '']
  lines.push(`Feature title: ${escapeInline(model.featureTitle ?? model.feature)}`)
  lines.push(`Internal slug: ${escapeInline(model.feature)}`)
  if (model.sourceIntent) lines.push(`Source intent: ${escapeInline(model.sourceIntent)}`)
  if (model.problemStatement) lines.push(`Problem statement: ${escapeInline(model.problemStatement)}`)
  return lines.join('\n')
}

function renderFeatureCommandBehavior(model: RequirementModel): string {
  if (!isFeatureCommandBehavior(model)) {
    return ''
  }

  const lines = ['## Feature Command Behavior', '']
  lines.push('- `/openflow-feature` may be invoked with no argument when context identifies the feature idea.')
  lines.push('- Natural-language command arguments are treated as feature intent before slug sanitization.')
  lines.push('- Meaningful Chinese or mixed-language input must not fail with “Feature name is too short after sanitization”.')
  lines.push('- Ambiguous feature identity asks one natural-language disambiguation question instead of asking for a slug.')

  const assumptions = model.assumptions ?? []
  if (assumptions.length > 0) {
    lines.push('')
    lines.push('Assumptions:')
    for (const assumption of assumptions) lines.push(`- ${escapeInline(assumption)}`)
  }

  const pending = model.pendingConfirmations ?? []
  if (pending.length > 0) {
    lines.push('')
    lines.push('Pending confirmations:')
    for (const item of pending) lines.push(`- ${escapeInline(item)}`)
  }

  return lines.join('\n')
}

function isFeatureCommandBehavior(model: RequirementModel): boolean {
  const searchable = [
    model.feature,
    model.featureTitle,
    model.sourceIntent,
    model.problemStatement,
    ...model.goals,
    ...model.nonGoals,
    ...model.scopeBoundary.inScope,
    ...model.scopeBoundary.outOfScope,
    ...model.acceptanceCriteria.map((criterion) => criterion.description),
    ...model.constraints.map((constraint) => constraint.description),
  ].filter(Boolean).join(' ').toLowerCase()

  return searchable.includes('/openflow-feature')
    || searchable.includes('openflow-feature')
    || searchable.includes('feature command')
    || searchable.includes('natural-language command')
    || searchable.includes('feature identity')
}

// ── User Context ──────────────────────────────────────────────────────────

function renderUserContext(model: RequirementModel): string {
  const lines = ['## User Context', '']

  if (!model.targetUsers && !model.problemStatement) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  if (model.targetUsers) {
    lines.push(`**Target users:** ${escapeInline(model.targetUsers)}`)
    lines.push('')
  }

  if (model.problemStatement) {
    lines.push(`**Problem statement:** ${escapeInline(model.problemStatement)}`)
    lines.push('')
  }

  return trimTrailingBlank(lines).join('\n')
}

// ── Trigger Rules ─────────────────────────────────────────────────────────

function renderTriggerRules(model: RequirementModel): string {
  const lines = ['## Trigger Rules', '']
  const triggers: string[] = []

  for (const goal of model.goals) {
    triggers.push(`Goal-driven: ${escapeInline(goal)}`)
  }

  for (const item of model.scopeBoundary.inScope) {
    triggers.push(`In-scope match: ${escapeInline(item)}`)
  }

  for (const c of model.constraints) {
    if (c.severity === 'must') {
      triggers.push(`Must constraint: ${escapeInline(c.description)}`)
    } else if (c.severity === 'should') {
      triggers.push(`Should constraint: ${escapeInline(c.description)}`)
    }
  }

  if (triggers.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  lines.push('These conditions activate or require the feature behavior:')
  lines.push('')
  for (const t of triggers) {
    lines.push(`- ${t}`)
  }

  return lines.join('\n')
}

// ── Non-Trigger Rules ─────────────────────────────────────────────────────

function renderNonTriggerRules(model: RequirementModel): string {
  const lines = ['## Non-Trigger Rules', '']
  const nonTriggers: string[] = []

  for (const item of model.scopeBoundary.outOfScope) {
    nonTriggers.push(`Out of scope: ${escapeInline(item)}`)
  }

  for (const ng of model.nonGoals) {
    nonTriggers.push(`Not a goal: ${escapeInline(ng)}`)
  }

  for (const c of model.constraints) {
    if (c.severity === 'may') {
      nonTriggers.push(`May constraint (non-trigger): ${escapeInline(c.description)}`)
    }
  }

  if (nonTriggers.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  lines.push('These conditions do NOT activate the feature:')
  lines.push('')
  for (const nt of nonTriggers) {
    lines.push(`- ${nt}`)
  }

  return lines.join('\n')
}

// ── User-Visible Scenarios ────────────────────────────────────────────────

function renderUserVisibleScenarios(model: RequirementModel): string {
  const lines = [
    '## User-Visible Scenarios',
    '',
    'Each scenario describes what a user or external caller observes — not how the system produces it internally.',
    '',
  ]

  if (model.acceptanceCriteria.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const criterion of model.acceptanceCriteria) {
    lines.push(`### Scenario: ${escapeInline(criterion.description)}`)
    lines.push('')
    lines.push('**Given:**')
    for (const condition of buildScenarioGiven(model)) {
      lines.push(`- ${escapeInline(condition)}`)
    }
    lines.push('')
    lines.push('**When:**')
    lines.push('- A user or caller triggers the behavior described by this scenario')
    lines.push('')
    lines.push('**Then (observable outcome):**')
    lines.push(`- ${escapeInline(criterion.description)}`)
    lines.push('- The outcome is visible to the user or caller without inspecting implementation internals')
    lines.push('')
  }

  return trimTrailingBlank(lines).join('\n')
}

// ── Required Content ──────────────────────────────────────────────────────

function renderRequiredContent(model: RequirementModel): string {
  const lines = ['## Required Content', '']
  const required: string[] = []

  for (const item of model.scopeBoundary.inScope) {
    required.push(`Must include: ${escapeInline(item)}`)
  }

  for (const goal of model.goals) {
    required.push(`Required outcome: ${escapeInline(goal)}`)
  }

  for (const c of model.constraints) {
    if (c.severity === 'must') {
      required.push(`Must satisfy constraint: ${escapeInline(c.description)} (verify by: ${escapeInline(c.verificationMethod)})`)
    }
  }

  if (required.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  lines.push('The following content or outcomes must be present in any successful response:')
  lines.push('')
  for (const r of required) {
    lines.push(`- ${r}`)
  }

  return lines.join('\n')
}

// ── Success Responses ─────────────────────────────────────────────────────

function renderSuccessResponses(model: RequirementModel): string {
  const lines = ['## Success Responses', '']

  if (model.acceptanceCriteria.length === 0 && model.goals.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const criterion of model.acceptanceCriteria) {
    lines.push(`**Success:** ${escapeInline(criterion.description)}`)
    lines.push('')
  }

  for (const goal of model.goals) {
    const alreadyCovered = model.acceptanceCriteria.some(ac => ac.description === goal)
    if (!alreadyCovered) {
      lines.push(`**Success:** ${escapeInline(goal)}`)
      lines.push('')
    }
  }

  return trimTrailingBlank(lines).join('\n')
}

// ── Must Not Behavior ─────────────────────────────────────────────────────

function renderMustNotBehavior(model: RequirementModel): string {
  const lines = ['## Must Not Behavior', '']
  const mustNots: string[] = []

  for (const ng of model.nonGoals) {
    mustNots.push(`Must not: ${escapeInline(ng)}`)
  }

  for (const item of model.scopeBoundary.outOfScope) {
    mustNots.push(`Excluded: ${escapeInline(item)}`)
  }

  for (const c of model.constraints) {
    if (c.category === 'security') {
      mustNots.push(`Security boundary: ${escapeInline(c.description)} — must not violate (${c.severity})`)
    }
  }

  if (mustNots.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  lines.push('The following outcomes must not occur as user-visible behavior:')
  lines.push('')
  for (const mn of mustNots) {
    lines.push(`- ${mn}`)
  }

  return lines.join('\n')
}

// ── Acceptance / Verification Mapping ─────────────────────────────────────

function renderAcceptanceVerificationMapping(model: RequirementModel): string {
  const lines = ['## Acceptance / Verification Mapping', '']

  if (model.acceptanceCriteria.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  lines.push('Each acceptance criterion maps to an observable scenario and verification approach:')
  lines.push('')
  lines.push('| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |')
  lines.push('|---------------------|----------|--------------|-------------------|--------|')

  for (const criterion of model.acceptanceCriteria) {
    const scenario = escapeInline(criterion.description)
    const evidenceType = escapeInline(model.testingStrategy ?? 'manual')
    const expectedEvidence = `User-observable confirmation that "${criterion.description}" occurs`
    lines.push(
      `| ${scenario} | ${scenario} | ${evidenceType} | ${expectedEvidence} | pending |`,
    )
  }

  return lines.join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildScenarioGiven(model: RequirementModel): string[] {
  const conditions: string[] = []

  if (model.targetUsers) {
    conditions.push(`The target user is: ${model.targetUsers}`)
  }

  if (model.problemStatement) {
    conditions.push(`The problem context is: ${model.problemStatement}`)
  }

  if (conditions.length === 0) {
    conditions.push(`The feature "${model.feature}" is available`)
  }

  return conditions
}

function escapeInline(value: string): string {
  return normalizeWhitespace(value).replace(/([\\`*_{}\[\]()#+>|])/g, '\\$1')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
}

function trimTrailingBlank(lines: string[]): string[] {
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}
