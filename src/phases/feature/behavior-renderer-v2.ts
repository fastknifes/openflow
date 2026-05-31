import type { RequirementModelV2 } from './requirement-model-v2.js'
import { escapeInline } from '../../utils/markdown-helpers.js'

const NOT_SPECIFIED = 'Not specified.'

export function renderBehaviorDocumentV2(model: RequirementModelV2): string {
  const sections = [
    `# ${escapeInline(model.title ?? model.feature)} - Observable Behavior`,
    '',
    renderUserContext(model),
    renderTriggerRules(model),
    renderExecutionSafety(model),
    renderStateIsolation(model),
    renderNonTriggerRules(model),
    renderBehaviorScenarios(model),
    renderSuccessCriteria(model),
    renderMustNotBehavior(model),
    renderOpenQuestions(model),
  ]

  return sections.join('\n').trimEnd() + '\n'
}

function renderUserContext(model: RequirementModelV2): string {
  return [
    '## User Context',
    '',
    `Current state: ${escapeInline(model.problem.currentState)}`,
    `Desired change: ${escapeInline(model.problem.desiredChange)}`,
  ].join('\n')
}

function renderTriggerRules(model: RequirementModelV2): string {
  const lines = ['## Trigger Rules', '']
  if (model.goals.length === 0 && model.constraints.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const goal of model.goals) lines.push(`- Goal: ${escapeInline(goal.description)}`)
  for (const constraint of model.constraints.filter((c) => c.severity === 'must')) {
    lines.push(`- Must satisfy: ${escapeInline(constraint.description)}`)
  }
  return lines.join('\n')
}

function renderStateIsolation(model: RequirementModelV2): string {
  const isolationConstraints = model.constraints.filter((constraint) =>
    /(?:isolation|隔离|lock|锁|namespace|命名空间|dag\s*id|DAG ID|互不可见|不跨|not.*shared|not.*cross)/iu.test(constraint.description),
  )

  if (isolationConstraints.length === 0) {
    return ''
  }

  const lines = ['## State Isolation / Safety', '']
  lines.push('The following isolation mechanisms apply to global/cross-session state:')
  for (const constraint of isolationConstraints) {
    lines.push(`- ${escapeInline(constraint.description)}`)
  }
  return lines.join('\n')
}

function renderExecutionSafety(model: RequirementModelV2): string {
  const safetyConstraints = model.constraints.filter((constraint) =>
    /(?:safety|guard|guardrail|confirmation|确认|安全|dry[_-]?run|sandbox|风险评估|用户确认|主动触发|不会.*自动|not.*automatic|manual.*approval)/iu.test(constraint.description),
  )

  if (safetyConstraints.length === 0) {
    return ''
  }

  const lines = ['## Execution Safety / Confirmation Guard', '']
  lines.push('Automatic execution is constrained by the following confirmation / safety guard mechanisms:')
  for (const constraint of safetyConstraints) {
    lines.push(`- ${escapeInline(constraint.description)}`)
  }
  return lines.join('\n')
}

function renderNonTriggerRules(model: RequirementModelV2): string {
  const lines = ['## Non-Trigger Rules', '']
  if (model.nonGoals.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }
  for (const nonGoal of model.nonGoals) lines.push(`- ${escapeInline(nonGoal.description)}`)
  return lines.join('\n')
}

function renderBehaviorScenarios(model: RequirementModelV2): string {
  const lines = ['## Behavior Scenarios', '']
  if (model.behaviorScenarios.length === 0) {
    lines.push('No verified observable scenarios were synthesized from evidence.')
    lines.push('Add explicit examples or acceptance criteria to populate this section.')
    lines.push('')
    lines.push('### User-Visible Scenarios')
    lines.push('Not specified.')
    return lines.join('\n')
  }

  for (const scenario of model.behaviorScenarios) {
    lines.push(`### ${escapeInline(scenario.title)}`)
    lines.push(`Actor: ${escapeInline(scenario.actor)}`)
    lines.push('')
    lines.push('Given:')
    for (const given of scenario.given) lines.push(`- ${escapeInline(given)}`)
    lines.push(`When: ${escapeInline(scenario.when)}`)
    lines.push('Then:')
    for (const then of scenario.then) lines.push(`- ${escapeInline(then)}`)
    lines.push('')
  }
  return lines.join('\n')
}

function renderSuccessCriteria(model: RequirementModelV2): string {
  const lines = ['## Acceptance / Verification Mapping', '']
  if (model.successCriteria.length === 0) {
    lines.push('No verified acceptance criteria were synthesized from evidence.')
    lines.push('Add explicit observable examples or `_acceptanceCriteria` facts to populate this section.')
    return lines.join('\n')
  }

  lines.push('| Criterion | Verification | Evidence Type |')
  lines.push('|-----------|--------------|---------------|')
  for (const criterion of model.successCriteria) {
    lines.push(`| ${escapeInline(criterion.outcome)} | ${escapeInline(criterion.verificationMethod)} | ${criterion.evidenceType} |`)
  }
  return lines.join('\n')
}

function renderMustNotBehavior(model: RequirementModelV2): string {
  const lines = ['## Must Not Behavior', '']
  if (model.nonGoals.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }
  for (const nonGoal of model.nonGoals) lines.push(`- Must not: ${escapeInline(nonGoal.description)}`)
  return lines.join('\n')
}

function renderOpenQuestions(model: RequirementModelV2): string {
  if (model.openQuestions.length === 0) return ''
  const lines = ['## Open Questions', '']
  for (const question of model.openQuestions) lines.push(`- ${escapeInline(question.question)}`)
  return lines.join('\n')
}
