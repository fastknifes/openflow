export type StructuralCompleteness =
  | 'missing_goals'
  | 'missing_acceptance_criteria'
  | 'missing_behavior_scenarios'
  | 'missing_architecture'
  | 'structurally_complete'

export type DesignReadiness =
  | 'ready_for_planning'
  | 'needs_implementation_constraints'
  | 'needs_behavior_examples'
  | 'needs_data_contracts'
  | 'needs_failure_semantics'
  | 'not_ready'

export type DesignReviewSeverity = 'blocking' | 'warning' | 'info'

export type DesignReviewCategory =
  | 'constraint_specificity'
  | 'behavior_coverage'
  | 'data_contract'
  | 'failure_semantics'
  | 'state_management'
  | 'integration_boundary'
  | 'verification'

export interface DesignReviewFinding {
  id: string
  severity: DesignReviewSeverity
  category: DesignReviewCategory
  message: string
  evidenceIds: string[]
  suggestedFix: string
}

export interface ConstraintCoverage {
  constraintId: string
  constraintText: string
  coveredByGoals: string[]
  coveredByScenarios: string[]
  coveredBySuccessCriteria: string[]
  coveredByArchitecture: string[]
  sufficiency: 'sufficient' | 'partial' | 'missing'
  missingDetails: string[]
}

export interface MissingFactRequest {
  key: string
  question: string
  reason: string
  exampleAnswer?: string
}

export interface DesignReviewReport {
  status: 'ready' | 'not_ready'
  summary: string
  structuralCompleteness: StructuralCompleteness
  designReadiness: DesignReadiness
  findings: DesignReviewFinding[]
  coverageMatrix: ConstraintCoverage[]
  missingImplementationFacts: MissingFactRequest[]
}

export interface GeneratedDocumentForReview {
  name: string
  content: string
}
