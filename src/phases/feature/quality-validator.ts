import type { RequirementModelV2 } from './requirement-model-v2.js'

export interface RequirementQualityResult {
  status: 'pass' | 'draft' | 'blocked'
  issues: RequirementQualityIssue[]
}

export interface RequirementQualityIssue {
  severity: 'error' | 'warning' | 'info'
  rule: string
  message: string
  field?: string
}

/**
 * Quality validator for RequirementModelV2.
 *
 * Checks semantic correctness before rendering:
 * - No circular copies between fields
 * - Goals ≠ Problem
 * - Success criteria are observable
 * - Scenarios have real actor/trigger/outcome
 * - Completeness matches feature type
 */
export function validateRequirementQuality(model: RequirementModelV2): RequirementQualityResult {
  const issues: RequirementQualityIssue[] = []

  // 1. Anti-copy rules
  checkAntiCopyRules(model, issues)

  // 2. Observable outcome rules
  checkObservableRules(model, issues)

  // 3. Scenario structure rules
  checkScenarioRules(model, issues)

  // 4. Completeness rules
  checkCompletenessRules(model, issues)

  // Determine status
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')

  if (errors.length > 0) {
    return { status: 'blocked', issues }
  }
  if (warnings.length > 0) {
    return { status: 'draft', issues }
  }

  return { status: 'pass', issues }
}

// --- Rule Implementations ---

function checkAntiCopyRules(model: RequirementModelV2, issues: RequirementQualityIssue[]): void {
  const problemText = model.problem.currentState.toLowerCase().trim()

  // Goal must not equal problem
  for (const goal of model.goals) {
    const goalText = goal.description.toLowerCase().trim()
    if (goalText === problemText || goalText.includes(problemText)) {
      issues.push({
        severity: 'error',
        rule: 'goal-equals-problem',
        message: `Goal "${goal.description}" copies problem statement`,
        field: `goals[${goal.id}]`,
      })
    }
  }

  // Success criterion must not equal goal
  for (const sc of model.successCriteria) {
    const scText = sc.outcome.toLowerCase().trim()
    for (const goal of model.goals) {
      const goalText = goal.description.toLowerCase().trim()
      if (scText === goalText) {
        issues.push({
          severity: 'error',
          rule: 'criterion-equals-goal',
          message: `Success criterion "${sc.outcome}" copies goal`,
          field: `successCriteria[${sc.id}]`,
        })
      }
    }
  }

  // Scenario must not just copy acceptance criterion
  for (const scenario of model.behaviorScenarios) {
    const thenText = scenario.then.join(' ').toLowerCase().trim()
    for (const sc of model.successCriteria) {
      const scText = sc.outcome.toLowerCase().trim()
      if (thenText === scText) {
        issues.push({
          severity: 'warning',
          rule: 'scenario-copies-criterion',
          message: `Scenario "${scenario.title}" outcome is identical to criterion`,
          field: `behaviorScenarios[${scenario.id}]`,
        })
      }
    }
  }

  // Placeholder detection
  const placeholderPatterns = [
    /^deliver\s+\S+$/i,
    /^solve:\s*/i,
    /^not specified\.?$/i,
  ]

  for (const goal of model.goals) {
    if (placeholderPatterns.some((p) => p.test(goal.description.trim()))) {
      issues.push({
        severity: 'error',
        rule: 'placeholder-goal',
        message: `Goal "${goal.description}" is a placeholder`,
        field: `goals[${goal.id}]`,
      })
    }
  }
}

function checkObservableRules(model: RequirementModelV2, issues: RequirementQualityIssue[]): void {
  const observableVerbs = /\b(produces?|generates?|creates?|returns?|shows?|displays?|updates?|notifies?|sends?|rejects?|accepts?|blocks?|allows?|verifies?|passes?|fails?)\b/i

  for (const sc of model.successCriteria) {
    if (!observableVerbs.test(sc.outcome)) {
      issues.push({
        severity: 'warning',
        rule: 'criterion-not-observable',
        message: `Success criterion "${sc.outcome}" lacks observable verb`,
        field: `successCriteria[${sc.id}]`,
      })
    }
  }
}

function checkScenarioRules(model: RequirementModelV2, issues: RequirementQualityIssue[]): void {
  for (const scenario of model.behaviorScenarios) {
    if (scenario.given.length === 0 || scenario.given.every((g) => g.includes('is enabled') || g.includes('is set up'))) {
      issues.push({
        severity: 'warning',
        rule: 'scenario-generic-given',
        message: `Scenario "${scenario.title}" has generic Given clauses`,
        field: `behaviorScenarios[${scenario.id}]`,
      })
    }

    if (scenario.then.length === 0) {
      issues.push({
        severity: 'error',
        rule: 'scenario-no-then',
        message: `Scenario "${scenario.title}" has no Then clause`,
        field: `behaviorScenarios[${scenario.id}]`,
      })
    }
  }
}

function checkCompletenessRules(model: RequirementModelV2, issues: RequirementQualityIssue[]): void {
  if (model.goals.length === 0) {
    issues.push({
      severity: 'error',
      rule: 'missing-goals',
      message: 'No goals defined',
      field: 'goals',
    })
  }

  if (model.successCriteria.length === 0) {
    issues.push({
      severity: 'warning',
      rule: 'missing-success-criteria',
      message: 'No success criteria defined',
      field: 'successCriteria',
    })
  }

  if (model.behaviorScenarios.length === 0) {
    issues.push({
      severity: 'warning',
      rule: 'missing-scenarios',
      message: 'No behavior scenarios defined',
      field: 'behaviorScenarios',
    })
  }

  if (model.risks.length === 0) {
    issues.push({
      severity: 'info',
      rule: 'missing-risks',
      message: 'No risks documented',
      field: 'risks',
    })
  }
}
