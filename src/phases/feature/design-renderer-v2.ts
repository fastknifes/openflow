import type { RequirementModelV2 } from './requirement-model-v2.js'
import { escapeInline } from '../../utils/markdown-helpers.js'

const NOT_SPECIFIED = 'Not specified.'

export function renderDesignDocumentV2(model: RequirementModelV2): string {
  const sections = [
    `# ${escapeInline(model.title ?? model.feature)} - Design`,
    '',
    renderOverview(model),
    renderProblem(model),
    renderGoals(model),
    renderNonGoals(model),
    renderDecisions(model),
    renderConstraints(model),
    renderExecutionSafety(model),
    renderStateIsolation(model),
    renderArchitecture(model),
    renderTaskFlows(model),
    renderDataContracts(model),
    renderIntegrationBoundaries(model),
    renderSuccessCriteria(model),
    renderBehaviorScenarios(model),
    renderRisks(model),
    renderTestingStrategy(model),
    renderOpenQuestions(model),
  ]

  return sections.join('\n').trimEnd() + '\n'
}

// --- Section Renderers ---

function renderOverview(model: RequirementModelV2): string {
  const lines = ['## Overview', '']
  lines.push(`Feature: ${escapeInline(model.feature)}`)
  lines.push(`Completeness: ${model.completeness}`)
  if (model.goals.length > 0) {
    lines.push('')
    lines.push('Primary goals:')
    for (const goal of model.goals) lines.push(`- ${escapeInline(goal.description)}`)
  }
  return lines.join('\n')
}

function renderProblem(model: RequirementModelV2): string {
  const lines = ['## Problem', '']
  lines.push(`**Current state:** ${escapeInline(model.problem.currentState)}`)

  if (model.problem.painPoints.length > 0) {
    lines.push('')
    lines.push('**Pain points:**')
    for (const pain of model.problem.painPoints) {
      lines.push(`- ${escapeInline(pain)}`)
    }
  }

  lines.push('')
  lines.push(`**Desired change:** ${escapeInline(model.problem.desiredChange)}`)

  return lines.join('\n')
}

function renderGoals(model: RequirementModelV2): string {
  const lines = ['## Goals', '']

  if (model.goals.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const goal of model.goals) {
    lines.push(`### ${escapeInline(goal.id)}: ${escapeInline(goal.description)}`)
    if (goal.rationale) {
      lines.push(`> ${escapeInline(goal.rationale)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function renderNonGoals(model: RequirementModelV2): string {
  const lines = ['## Non-Goals', '']

  if (model.nonGoals.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const ng of model.nonGoals) {
    lines.push(`- ${escapeInline(ng.description)}`)
  }

  return lines.join('\n')
}

function renderDecisions(model: RequirementModelV2): string {
  const lines = ['## Design Decisions', '']

  if (model.decisions.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const d of model.decisions) {
    lines.push(`### ${escapeInline(d.topic)}`)
    lines.push(`- **Decision:** ${escapeInline(d.decision)}`)
    lines.push(`- **Rationale:** ${escapeInline(d.rationale)}`)
    lines.push('')
  }

  return lines.join('\n')
}

function renderConstraints(model: RequirementModelV2): string {
  const lines = ['## Design Constraints', '']

  if (model.constraints.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const c of model.constraints) {
    lines.push(`- [${c.severity}] [${c.category}] ${escapeInline(c.description)}`)
    if (c.rationale && c.rationale !== 'From brainstorm-packet-v1') {
      lines.push(`  - Rationale: ${escapeInline(c.rationale)}`)
    }
  }

  return lines.join('\n')
}

function renderExecutionSafety(model: RequirementModelV2): string {
  const safetyConstraints = model.constraints.filter((constraint) =>
    /(?:safety|guard|guardrail|confirmation|确认|安全|dry[_-]?run|sandbox|风险评估|用户确认|主动触发|不会.*自动|not.*automatic|manual.*approval)/iu.test(constraint.description),
  )

  if (safetyConstraints.length === 0) return ''

  const lines = ['## Execution Safety / Confirmation Guard', '']
  lines.push('Automatic execution is constrained by the following confirmation / safety guard mechanisms:')
  for (const constraint of safetyConstraints) lines.push(`- ${escapeInline(constraint.description)}`)
  return lines.join('\n')
}

function renderStateIsolation(model: RequirementModelV2): string {
  const isolationConstraints = model.constraints.filter((constraint) =>
    /(?:isolation|隔离|lock|锁|namespace|命名空间|dag\s*id|DAG ID|互不可见|不跨|not.*shared|not.*cross)/iu.test(constraint.description),
  )

  if (isolationConstraints.length === 0) return ''

  const lines = ['## State Isolation / Safety', '']
  lines.push('Global/cross-session state is constrained by the following isolation mechanisms:')
  for (const constraint of isolationConstraints) lines.push(`- ${escapeInline(constraint.description)}`)
  return lines.join('\n')
}

function renderArchitecture(model: RequirementModelV2): string {
  if (!model.architecture || model.architecture.components.length === 0) {
    return ''
  }

  const lines = ['## Architecture Overview', '']

  lines.push('### Components')
  for (const comp of model.architecture.components) {
    lines.push(`- **${escapeInline(comp.name)}**: ${escapeInline(comp.role)}`)
    for (const resp of comp.responsibilities) {
      lines.push(`  - ${escapeInline(resp)}`)
    }
  }

  return lines.join('\n')
}

function renderTaskFlows(model: RequirementModelV2): string {
  if (!model.architecture || model.architecture.taskFlows.length === 0) {
    return ''
  }

  const lines = ['## Task Flows', '']

  for (const flow of model.architecture.taskFlows) {
    lines.push(`### ${escapeInline(flow.title)}`)
    if (flow.mermaid) {
      lines.push('')
      lines.push('```mermaid')
      lines.push(flow.mermaid)
      lines.push('```')
    }
    lines.push('')
    for (const step of flow.steps) {
      lines.push(`${step.id}. **${escapeInline(step.actor)}**: ${escapeInline(step.action)}`)
      if (step.output) {
        lines.push(`   → Output: ${escapeInline(step.output)}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

function renderDataContracts(model: RequirementModelV2): string {
  if (!model.architecture || model.architecture.payloadSchemas.length === 0) {
    return ''
  }

  const lines = ['## Data Contracts', '']

  for (const schema of model.architecture.payloadSchemas) {
    lines.push(`### ${escapeInline(schema.name)}`)
    lines.push(`Purpose: ${escapeInline(schema.purpose)}`)
    lines.push('')
    lines.push('| Field | Type | Required | Description |')
    lines.push('|-------|------|----------|-------------|')
    for (const field of schema.fields) {
      lines.push(`| ${escapeInline(field.name)} | ${escapeInline(field.type)} | ${field.required ? 'Yes' : 'No'} | ${escapeInline(field.description)} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function renderIntegrationBoundaries(model: RequirementModelV2): string {
  if (!model.architecture || model.architecture.integrationBoundaries.length === 0) {
    return ''
  }

  const lines = ['## Integration Boundaries', '']

  for (const boundary of model.architecture.integrationBoundaries) {
    lines.push(`### ${escapeInline(boundary.from)} → ${escapeInline(boundary.to)}`)
    lines.push(`Contract: ${escapeInline(boundary.contract)}`)
    if (boundary.allowedChanges.length > 0) {
      lines.push('Allowed:')
      for (const allowed of boundary.allowedChanges) {
        lines.push(`- ${escapeInline(allowed)}`)
      }
    }
    if (boundary.forbiddenChanges.length > 0) {
      lines.push('Forbidden:')
      for (const forbidden of boundary.forbiddenChanges) {
        lines.push(`- ${escapeInline(forbidden)}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

function renderSuccessCriteria(model: RequirementModelV2): string {
  const lines = ['## Success Criteria', '']

  if (model.successCriteria.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const sc of model.successCriteria) {
    lines.push(`- [ ] ${escapeInline(sc.outcome)}`)
    lines.push(`  - Verification: ${escapeInline(sc.verificationMethod)}`)
    lines.push(`  - Evidence type: ${sc.evidenceType}`)
  }

  return lines.join('\n')
}

function renderBehaviorScenarios(model: RequirementModelV2): string {
  const lines = ['## Behavior Scenarios', '']

  if (model.behaviorScenarios.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const scenario of model.behaviorScenarios) {
    lines.push(`### ${escapeInline(scenario.title)}`)
    lines.push(`**Actor:** ${escapeInline(scenario.actor)}`)
    lines.push('')
    lines.push('**Given:**')
    for (const given of scenario.given) {
      lines.push(`- ${escapeInline(given)}`)
    }
    lines.push('')
    lines.push(`**When:** ${escapeInline(scenario.when)}`)
    lines.push('')
    lines.push('**Then:**')
    for (const then of scenario.then) {
      lines.push(`- ${escapeInline(then)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function renderRisks(model: RequirementModelV2): string {
  const lines = ['## Risks And Mitigations', '']

  if (model.risks.length === 0) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  for (const risk of model.risks) {
    lines.push(`- **Risk:** ${escapeInline(risk.description)}`)
    lines.push(`  - **Mitigation:** ${escapeInline(risk.mitigation)}`)
  }

  return lines.join('\n')
}

function renderTestingStrategy(model: RequirementModelV2): string {
  const lines = ['## Testing Strategy', '']

  if (!model.testingStrategy) {
    lines.push(NOT_SPECIFIED)
    return lines.join('\n')
  }

  if (model.testingStrategy.unitTests) {
    lines.push(`### Unit Tests`)
    lines.push(escapeInline(model.testingStrategy.unitTests))
    lines.push('')
  }
  if (model.testingStrategy.integrationTests) {
    lines.push(`### Integration Tests`)
    lines.push(escapeInline(model.testingStrategy.integrationTests))
    lines.push('')
  }
  if (model.testingStrategy.endToEndTests) {
    lines.push(`### End-to-End Tests`)
    lines.push(escapeInline(model.testingStrategy.endToEndTests))
    lines.push('')
  }
  if (model.testingStrategy.manualVerification) {
    lines.push(`### Manual Verification`)
    lines.push(escapeInline(model.testingStrategy.manualVerification))
    lines.push('')
  }

  return lines.join('\n')
}

function renderOpenQuestions(model: RequirementModelV2): string {
  if (model.openQuestions.length === 0) {
    return ''
  }

  const lines = ['## Open Questions', '']

  for (const q of model.openQuestions) {
    const marker = q.blocking ? '🔴' : '🟡'
    lines.push(`${marker} **${escapeInline(q.id)}**: ${escapeInline(q.question)}`)
  }

  return lines.join('\n')
}
