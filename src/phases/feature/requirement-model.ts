import { z } from 'zod'
import type { FeatureQuestionId } from './state-machine.js'

// --- Enums ---

export const ConstraintCategorySchema = z.enum([
  'compatibility',
  'performance',
  'scope',
  'security',
  'maintainability',
  'time',
])

export const ConstraintSeveritySchema = z.enum(['must', 'should', 'may'])

export const ExpectedSymbolKindSchema = z.enum([
  'function',
  'class',
  'interface',
  'type',
  'const',
  'enum',
])

// --- Leaf schemas ---

export const ConstraintSchema = z.object({
  id: z.string().min(1),
  category: ConstraintCategorySchema,
  severity: ConstraintSeveritySchema,
  description: z.string().min(1),
  rationale: z.string().min(1),
  verificationMethod: z.string().min(1),
  sourceQuestionId: z.string().transform((val): FeatureQuestionId => val as FeatureQuestionId),
})

export const ScopeBoundarySchema = z.object({
  inScope: z.array(z.string()),
  outOfScope: z.array(z.string()),
  touchedModules: z.array(z.string()).optional(),
})

export const AcceptanceCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
})

export const ExpectedSymbolSchema = z.object({
  name: z.string().min(1),
  kind: ExpectedSymbolKindSchema,
  module: z.string().optional(),
})

export const ExpectedModuleSchema = z.object({
  path: z.string().min(1),
  purpose: z.string().min(1),
})

export const RiskSchema = z.object({
  description: z.string().min(1),
  mitigation: z.string().min(1),
})

export const DesignViewMetadataSchema = z.object({
  viewName: z.string().min(1),
  description: z.string().min(1),
  audience: z.string().optional(),
})

export const VerificationAssertionSchema = z.object({
  assertion: z.string().min(1),
  method: z.string().min(1),
  constraintId: z.string().optional(),
})

// --- Root schema ---

export const RequirementModelSchema = z.object({
  feature: z.string().min(1),
  featureTitle: z.string().optional(),
  sourceIntent: z.string().optional(),
  convergenceStatus: z.enum(['final', 'draft_with_assumptions']).optional(),
  assumptions: z.array(z.string()).optional(),
  pendingConfirmations: z.array(z.string()).optional(),
  constraints: z.array(ConstraintSchema),
  scopeBoundary: ScopeBoundarySchema,
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  goals: z.array(z.string()),
  nonGoals: z.array(z.string()),
  // Optional fields
  problemStatement: z.string().optional(),
  targetUsers: z.string().optional(),
  expectedSymbols: z.array(ExpectedSymbolSchema).optional(),
  expectedModules: z.array(ExpectedModuleSchema).optional(),
  risks: z.array(RiskSchema).optional(),
  testingStrategy: z.string().optional(),
  synthesis: z.record(z.unknown()).optional(),
})

// --- Inferred types ---

export type ConstraintCategory = z.infer<typeof ConstraintCategorySchema>
export type ConstraintSeverity = z.infer<typeof ConstraintSeveritySchema>
export type ExpectedSymbolKind = z.infer<typeof ExpectedSymbolKindSchema>

export type Constraint = z.infer<typeof ConstraintSchema>
export type ScopeBoundary = z.infer<typeof ScopeBoundarySchema>
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>
export type ExpectedSymbol = z.infer<typeof ExpectedSymbolSchema>
export type ExpectedModule = z.infer<typeof ExpectedModuleSchema>
export type Risk = z.infer<typeof RiskSchema>
export type DesignViewMetadata = z.infer<typeof DesignViewMetadataSchema>
export type VerificationAssertion = z.infer<typeof VerificationAssertionSchema>
export type RequirementModel = z.infer<typeof RequirementModelSchema>

// --- Helper: stable IDs via deterministic counter ---

let _idCounter = 0

function nextStableId(prefix: string): string {
  _idCounter++
  return `${prefix}-${String(_idCounter).padStart(4, '0')}`
}

export function resetIdCounter(): void {
  _idCounter = 0
}

/**
 * Creates a minimal valid RequirementModel for tests.
 * IDs are stable (deterministic) across calls within the same counter cycle.
 */
export function createMinimalRequirementModel(feature: string): RequirementModel {
  return {
    feature,
    constraints: [
      {
        id: nextStableId('c'),
        category: 'compatibility',
        severity: 'must',
        description: 'Must be backward compatible',
        rationale: 'Existing integrations depend on current API',
        verificationMethod: 'Existing tests pass without modification',
        sourceQuestionId: 'constraints',
      },
    ],
    scopeBoundary: {
      inScope: [`${feature} core logic`],
      outOfScope: ['unrelated modules'],
    },
    acceptanceCriteria: [
      {
        id: nextStableId('ac'),
        description: 'All existing tests pass',
      },
    ],
    goals: [`${feature} works correctly`],
    nonGoals: ['breaking changes'],
  }
}
