import type { FeatureQuestionId } from './state-machine.js'
import { RequirementModelSchema } from './requirement-model.js'
import type { Constraint, ConstraintCategory, ConstraintSeverity, RequirementModel } from './requirement-model.js'

type Answers = Partial<Record<FeatureQuestionId, string>>

type ConstraintTemplate = {
  category: ConstraintCategory
  severity: ConstraintSeverity
  description: string
  rationale: string
  verificationMethod: string
}

type ScopeBoundary = RequirementModel['scopeBoundary']
type AcceptanceCriterion = RequirementModel['acceptanceCriteria'][number]

const PRIORITY_CONSTRAINTS: Record<string, ConstraintTemplate[]> = {
  '快速上线': [
    {
      category: 'scope',
      severity: 'must',
      description: 'Minimize scope so the first release can ship quickly',
      rationale: 'The stated priority is fast delivery over broader expansion',
      verificationMethod: 'Review the change list to confirm only the smallest viable slice is included',
    },
  ],
  '易维护': [
    {
      category: 'maintainability',
      severity: 'should',
      description: 'Favor code clarity and maintainable structure in the implementation',
      rationale: 'The feature should remain easy to understand and support over time',
      verificationMethod: 'Use code review to confirm naming, structure, and responsibilities stay clear',
    },
  ],
  '可扩展': [
    {
      category: 'maintainability',
      severity: 'should',
      description: 'Preserve clear extension points for future capabilities',
      rationale: 'The priority emphasizes future growth instead of a one-off implementation',
      verificationMethod: 'Review the design for modular seams or interfaces that allow follow-on changes',
    },
  ],
  '风险最小': [
    {
      category: 'compatibility',
      severity: 'must',
      description: 'Keep a rollback path available for the change',
      rationale: 'Minimizing risk requires an easy way to revert if issues appear',
      verificationMethod: 'Confirm the rollout can be disabled or reverted without manual data repair',
    },
    {
      category: 'scope',
      severity: 'must',
      description: 'Keep the change scope narrow to reduce regression surface area',
      rationale: 'Smaller changes reduce the number of failure modes introduced at once',
      verificationMethod: 'Review the touched files and modules for unnecessary breadth',
    },
    {
      category: 'compatibility',
      severity: 'must',
      description: 'Protect existing behavior with explicit regression coverage',
      rationale: 'Regression safety is part of the stated top priority',
      verificationMethod: 'Run targeted regression tests around existing behavior',
    },
  ],
}

const CONSTRAINTS_CONSTRAINTS: Record<string, ConstraintTemplate[]> = {
  '兼容现有系统': [
    {
      category: 'compatibility',
      severity: 'must',
      description: 'Preserve compatibility guarantees with existing systems and interfaces',
      rationale: 'The feature must not break current integrations or established behavior',
      verificationMethod: 'Validate existing callers and integration tests continue to pass unchanged',
    },
  ],
  '最小改动': [
    {
      category: 'scope',
      severity: 'must',
      description: 'Respect module boundary constraints and keep the implementation localized',
      rationale: 'The chosen constraint explicitly prefers the smallest possible code footprint',
      verificationMethod: 'Review touched modules to confirm unrelated areas remain unchanged',
    },
  ],
  '性能要求': [
    {
      category: 'performance',
      severity: 'must',
      description: 'Meet defined performance thresholds for the affected workflow',
      rationale: 'Performance has been identified as a primary design constraint',
      verificationMethod: 'Measure runtime or resource usage against the expected threshold',
    },
  ],
  '交付时间': [
    {
      category: 'time',
      severity: 'must',
      description: 'Converge on a solution that fits the delivery window',
      rationale: 'The time window is tight and must shape implementation trade-offs',
      verificationMethod: 'Review milestone scope against the agreed delivery deadline',
    },
  ],
}

const SCOPE_CONSTRAINTS: Record<string, ConstraintTemplate[]> = {
  'new-feature': [
    {
      category: 'scope',
      severity: 'should',
      description: 'Keep the implementation additive and focused on the new capability',
      rationale: 'A new feature should avoid redefining stable behavior outside the requested capability',
      verificationMethod: 'Review the change set to confirm it adds the new path without unrelated rewrites',
    },
  ],
  enhancement: [
    {
      category: 'scope',
      severity: 'should',
      description: 'Limit the enhancement to the targeted existing behavior',
      rationale: 'Enhancements should improve the intended flow without widening into unrelated work',
      verificationMethod: 'Check that changed behavior stays constrained to the named enhancement area',
    },
  ],
  refactor: [
    {
      category: 'maintainability',
      severity: 'should',
      description: 'Preserve external behavior while improving internal structure',
      rationale: 'Refactors should optimize maintainability without changing public outcomes',
      verificationMethod: 'Compare before and after behavior with focused regression tests',
    },
  ],
  workflow: [
    {
      category: 'scope',
      severity: 'may',
      description: 'Optimize workflow steps without introducing unnecessary product surface area',
      rationale: 'Workflow changes should streamline execution rather than expand the feature set',
      verificationMethod: 'Review the resulting flow to confirm the simplification stays bounded',
    },
  ],
}

function normalizeAnswer(value: string | undefined): string {
  return value?.trim() ?? ''
}

function splitAnswer(value: string | undefined): string[] {
  const trimmed = normalizeAnswer(value)
  if (!trimmed) {
    return []
  }

  return trimmed
    .split(/[\n,，;；]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase()
}

function createConstraint(
  id: string,
  sourceQuestionId: FeatureQuestionId,
  template: ConstraintTemplate,
): Constraint {
  return {
    id,
    category: template.category,
    severity: template.severity,
    description: template.description,
    rationale: template.rationale,
    verificationMethod: template.verificationMethod,
    sourceQuestionId,
  }
}

function createCustomConstraint(id: string, description: string): Constraint {
  return {
    id,
    category: 'scope',
    severity: 'should',
    description,
    rationale: 'This free-text constraint was provided directly during feature design and should be preserved',
    verificationMethod: 'Review the implementation against the exact stated constraint during design and testing',
    sourceQuestionId: 'constraints',
  }
}

function deriveMappedConstraints(
  questionId: FeatureQuestionId,
  rawValue: string | undefined,
  templates: Record<string, ConstraintTemplate[]>,
  nextId: () => string,
): Constraint[] {
  const answer = normalizeAnswer(rawValue)
  if (!answer) {
    return []
  }

  const mapped = templates[normalizeLookupKey(answer)] ?? templates[answer]
  if (!mapped) {
    return []
  }

  return mapped.map((template) => createConstraint(nextId(), questionId, template))
}

function deriveConstraintQuestionConstraints(rawValue: string | undefined, nextId: () => string): Constraint[] {
  const items = splitAnswer(rawValue)
  const constraints: Constraint[] = []

  for (const item of items) {
    const mapped = CONSTRAINTS_CONSTRAINTS[item]
    if (mapped) {
      for (const template of mapped) {
        constraints.push(createConstraint(nextId(), 'constraints', template))
      }
      continue
    }

    constraints.push(createCustomConstraint(nextId(), item))
  }

  return constraints
}

function deriveScopeBoundary(feature: string, answers: Answers): ScopeBoundary {
  const scope = normalizeAnswer(answers.scope)
  const priority = normalizeAnswer(answers.priority)

  const inScope = [
    scope ? `${feature} ${scope}` : feature,
    answers.problem ? `Address the stated problem: ${normalizeAnswer(answers.problem)}` : '',
  ].filter(Boolean)

  const outOfScope = [
    scope === 'new-feature' ? 'Rewriting unrelated existing workflows' : '',
    scope === 'enhancement' ? 'Unrelated feature expansion outside the enhancement target' : '',
    scope === 'refactor' ? 'Changing public behavior beyond the current contract' : '',
    scope === 'workflow' ? 'Large product-surface expansion beyond workflow optimization' : '',
    priority === '快速上线' ? 'Nice-to-have additions that delay first delivery' : '',
  ].filter(Boolean)

  return {
    inScope,
    outOfScope,
  }
}

function deriveAcceptanceCriteria(feature: string, answers: Answers): AcceptanceCriterion[] {
  const criteria: AcceptanceCriterion[] = []
  let counter = 0
  const nextId = (): string => {
    counter++
    return `ac-${String(counter).padStart(4, '0')}`
  }

  const problem = normalizeAnswer(answers.problem)
  const targetUsers = normalizeAnswer(answers['target-users'])
  const priority = normalizeAnswer(answers.priority)
  const constraints = splitAnswer(answers.constraints)

  if (problem) {
    criteria.push({
      id: nextId(),
      description: `${feature} addresses the stated problem: ${problem}`,
      category: 'problem',
    })
  }

  if (targetUsers) {
    criteria.push({
      id: nextId(),
      description: `${feature} works for the target users: ${targetUsers}`,
      category: 'target-users',
    })
  }

  if (priority) {
    criteria.push({
      id: nextId(),
      description: `${feature} implementation reflects the selected priority: ${priority}`,
      category: 'priority',
    })
  }

  for (const constraint of constraints) {
    criteria.push({
      id: nextId(),
      description: `${feature} respects the stated constraint: ${constraint}`,
      category: 'constraints',
    })
  }

  if (criteria.length === 0) {
    criteria.push({
      id: nextId(),
      description: `${feature} behavior is documented and validated`,
      category: 'baseline',
    })
  }

  return criteria
}

function deriveGoals(feature: string, answers: Answers): string[] {
  const goals = [
    answers.problem ? `Solve: ${normalizeAnswer(answers.problem)}` : `Deliver ${feature}`,
    answers['target-users'] ? `Serve target users: ${normalizeAnswer(answers['target-users'])}` : '',
    answers.priority ? `Honor priority: ${normalizeAnswer(answers.priority)}` : '',
  ].filter(Boolean)

  return goals
}

function deriveNonGoals(answers: Answers): string[] {
  const scope = normalizeAnswer(answers.scope)
  const nonGoals = [
    'Unrelated product areas or workflows',
    scope === 'new-feature' ? 'Reworking existing behavior beyond what the new feature needs' : '',
    scope === 'enhancement' ? 'Full redesign of the surrounding feature area' : '',
    scope === 'refactor' ? 'Introducing net-new product behavior as part of the refactor' : '',
    scope === 'workflow' ? 'Broad product expansion outside the workflow itself' : '',
  ].filter(Boolean)

  return nonGoals
}

function deriveTestingStrategy(answers: Answers): string | undefined {
  const focusAreas = [
    normalizeAnswer(answers.priority),
    ...splitAnswer(answers.constraints),
  ].filter(Boolean)

  if (focusAreas.length === 0) {
    return undefined
  }

  return `Use targeted tests and review to verify: ${focusAreas.join(', ')}`
}

export function deriveConstraints(answers: Answers): Constraint[] {
  let counter = 0
  const nextId = (): string => {
    counter++
    return `d-${String(counter).padStart(4, '0')}`
  }

  return [
    ...deriveMappedConstraints('scope', answers.scope, SCOPE_CONSTRAINTS, nextId),
    ...deriveMappedConstraints('priority', answers.priority, PRIORITY_CONSTRAINTS, nextId),
    ...deriveConstraintQuestionConstraints(answers.constraints, nextId),
  ]
}

export function buildRequirementModel(feature: string, answers: Answers): RequirementModel {
  return RequirementModelSchema.parse({
    feature,
    constraints: deriveConstraints(answers),
    scopeBoundary: deriveScopeBoundary(feature, answers),
    acceptanceCriteria: deriveAcceptanceCriteria(feature, answers),
    goals: deriveGoals(feature, answers),
    nonGoals: deriveNonGoals(answers),
    problemStatement: normalizeAnswer(answers.problem) || undefined,
    targetUsers: normalizeAnswer(answers['target-users']) || undefined,
    testingStrategy: deriveTestingStrategy(answers),
  })
}
