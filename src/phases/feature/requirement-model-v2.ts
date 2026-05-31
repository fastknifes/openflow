import { z } from 'zod'
import type { RequirementEvidence } from './requirement-evidence.js'

// --- Requirement Model v2: Structured requirement with semantic depth ---

export const ProblemStatementSchema = z.object({
  currentState: z.string().min(1),
  painPoints: z.array(z.string()),
  desiredChange: z.string().min(1),
  sourceEvidenceIds: z.array(z.string()),
})

export const GoalSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().optional(),
  sourceEvidenceIds: z.array(z.string()),
})

export const DesignDecisionSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  sourceEvidenceIds: z.array(z.string()),
})

export const ConstraintSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['compatibility', 'performance', 'scope', 'security', 'maintainability', 'time']),
  severity: z.enum(['must', 'should', 'may']),
  description: z.string().min(1),
  rationale: z.string().min(1),
  verificationMethod: z.string().min(1),
  sourceEvidenceIds: z.array(z.string()),
})

export const NonGoalSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  sourceEvidenceIds: z.array(z.string()),
})

export const SuccessCriterionSchema = z.object({
  id: z.string().min(1),
  outcome: z.string().min(1),
  verificationMethod: z.string().min(1),
  evidenceType: z.enum(['test', 'manual-review', 'log', 'state-inspection']),
  sourceEvidenceIds: z.array(z.string()),
})

export const BehaviorScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  actor: z.string().min(1),
  given: z.array(z.string()),
  when: z.string().min(1),
  then: z.array(z.string().min(1)),
  sourceEvidenceIds: z.array(z.string()),
})

export const ArchitectureComponentSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  responsibilities: z.array(z.string()),
})

export const TaskFlowStepSchema = z.object({
  id: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  output: z.string().optional(),
})

export const TaskFlowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  mermaid: z.string().optional(),
  steps: z.array(TaskFlowStepSchema),
})

export const DataFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean(),
  description: z.string().min(1),
})

export const DataContractSchema = z.object({
  name: z.string().min(1),
  purpose: z.string().min(1),
  fields: z.array(DataFieldSchema),
})

export const IntegrationBoundarySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  contract: z.string().min(1),
  allowedChanges: z.array(z.string()),
  forbiddenChanges: z.array(z.string()),
})

export const RiskSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  mitigation: z.string().min(1),
  sourceEvidenceIds: z.array(z.string()),
})

export const TestingStrategySchema = z.object({
  unitTests: z.string().optional(),
  integrationTests: z.string().optional(),
  endToEndTests: z.string().optional(),
  manualVerification: z.string().optional(),
})

export const OpenQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  blocking: z.boolean().default(false),
})

export const RequirementsCompletenessSchema = z.enum([
  'complete',
  'missing_goals',
  'missing_acceptance_criteria',
  'missing_behavior_scenarios',
  'missing_architecture',
  'insufficient_evidence',
])

// --- Root schema ---

export const RequirementModelV2Schema = z.object({
  feature: z.string().min(1),
  title: z.string().min(1),

  problem: ProblemStatementSchema,
  goals: z.array(GoalSchema),
  decisions: z.array(DesignDecisionSchema),
  constraints: z.array(ConstraintSchema),
  nonGoals: z.array(NonGoalSchema),

  behaviorScenarios: z.array(BehaviorScenarioSchema),
  successCriteria: z.array(SuccessCriterionSchema),

  architecture: z.object({
    components: z.array(ArchitectureComponentSchema),
    taskFlows: z.array(TaskFlowSchema),
    payloadSchemas: z.array(DataContractSchema),
    integrationBoundaries: z.array(IntegrationBoundarySchema),
  }).optional(),

  risks: z.array(RiskSchema),
  testingStrategy: TestingStrategySchema.optional(),

  openQuestions: z.array(OpenQuestionSchema),
  completeness: RequirementsCompletenessSchema,

  // Provenance
  evidence: z.custom<RequirementEvidence>(),
})

// --- Inferred Types ---

export type ProblemStatement = z.infer<typeof ProblemStatementSchema>
export type Goal = z.infer<typeof GoalSchema>
export type DesignDecision = z.infer<typeof DesignDecisionSchema>
export type ConstraintV2 = z.infer<typeof ConstraintSchema>
export type NonGoalV2 = z.infer<typeof NonGoalSchema>
export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>
export type BehaviorScenario = z.infer<typeof BehaviorScenarioSchema>
export type ArchitectureComponent = z.infer<typeof ArchitectureComponentSchema>
export type TaskFlowStep = z.infer<typeof TaskFlowStepSchema>
export type TaskFlow = z.infer<typeof TaskFlowSchema>
export type DataField = z.infer<typeof DataFieldSchema>
export type DataContract = z.infer<typeof DataContractSchema>
export type IntegrationBoundary = z.infer<typeof IntegrationBoundarySchema>
export type RiskV2 = z.infer<typeof RiskSchema>
export type TestingStrategy = z.infer<typeof TestingStrategySchema>
export type OpenQuestion = z.infer<typeof OpenQuestionSchema>
export type RequirementsCompleteness = z.infer<typeof RequirementsCompletenessSchema>
export type RequirementModelV2 = z.infer<typeof RequirementModelV2Schema>
