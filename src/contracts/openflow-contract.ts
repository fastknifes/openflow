export interface BehaviorScenario {
  id: string
  name: string
  given: string[]
  when: string[]
  then: string[]
  mustNot?: string[]
  criticality: 'critical' | 'normal' | 'optional'
  /** Backward-compat: verify.ts uses status and detail */
  status?: string
  detail?: string
}

export interface AlignmentItem {
  behaviorId: string
  designResponse: string
  files: string[]
  modules: string[]
  expectedSymbols: string[]
  risk: 'low' | 'medium' | 'high'
  /** Backward-compat: design-drift.ts uses scenarioId */
  scenarioId?: string
}

export interface Constraint {
  source: 'current' | 'decision'
  file: string
  rule: string
  severity: 'blocking' | 'warning'
  /** Backward-compat optional fields used by current-constraints.ts */
  constraintType?: string
  targetPath?: string
  sourceFile?: string
  detail?: string
}

/** Type alias for decisions-constraints.ts backward compat */
export type DecisionConstraint = Constraint

export interface OpenFlowContract {
  feature: string
  sourceFiles: string[]
  behaviorScenarios: BehaviorScenario[]
  alignmentItems: AlignmentItem[]
  currentConstraints: Constraint[]
  decisionConstraints: Constraint[]
  extractedAt: string
  sourceHashes: Record<string, string>
  /** Backward-compat: design-drift.ts accesses expectedSymbols directly on contract */
  expectedSymbols?: Array<{ name: string; kind: string; sourceFile?: string }>
}
