import { z } from 'zod'

// --- Evidence Source Types ---

export const EvidenceSourceSchema = z.enum([
  'user',
  'assistant',
  'brainstorm-packet-v1',
  'brainstorm-packet-v2',
  'feature-fact',
  'ai-injected',
])

export const EvidenceConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const EvidenceTypeSchema = z.enum([
  'problem',
  'goal',
  'decision',
  'constraint',
  'nonGoal',
  'example',
  'risk',
  'openQuestion',
  'architecture',
  'integration',
  'dataContract',
])

export const EvidenceItemSchema = z.object({
  id: z.string().min(1),
  type: EvidenceTypeSchema,
  content: z.string().min(1),
  source: EvidenceSourceSchema,
  confidence: EvidenceConfidenceSchema,
  confirmedBy: z.string().optional(),
  quote: z.string().optional(),
  sourceSessionID: z.string().optional(),
})

// --- Requirement Evidence ---

export const RequirementEvidenceSchema = z.object({
  feature: z.string().min(1),
  sourceIntent: z.string().optional(),

  problems: z.array(EvidenceItemSchema),
  goals: z.array(EvidenceItemSchema),
  decisions: z.array(EvidenceItemSchema),
  constraints: z.array(EvidenceItemSchema),
  nonGoals: z.array(EvidenceItemSchema),
  examples: z.array(EvidenceItemSchema),
  risks: z.array(EvidenceItemSchema),
  openQuestions: z.array(EvidenceItemSchema),
  architectureNotes: z.array(EvidenceItemSchema),
  integrationNotes: z.array(EvidenceItemSchema),
  dataContractNotes: z.array(EvidenceItemSchema),

  rawSources: z.array(z.object({
    type: z.string(),
    content: z.string(),
    timestamp: z.string().optional(),
  })),
})

// --- Inferred Types ---

export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>
export type EvidenceConfidence = z.infer<typeof EvidenceConfidenceSchema>
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>
export type RequirementEvidence = z.infer<typeof RequirementEvidenceSchema>

// --- Helpers ---

let _evidenceIdCounter = 0

export function resetEvidenceIdCounter(): void {
  _evidenceIdCounter = 0
}

export function nextEvidenceId(prefix: string): string {
  _evidenceIdCounter++
  return `${prefix}-${String(_evidenceIdCounter).padStart(4, '0')}`
}

/**
 * Build empty evidence from feature name.
 */
export function createEmptyEvidence(feature: string): RequirementEvidence {
  return {
    feature,
    problems: [],
    goals: [],
    decisions: [],
    constraints: [],
    nonGoals: [],
    examples: [],
    risks: [],
    openQuestions: [],
    architectureNotes: [],
    integrationNotes: [],
    dataContractNotes: [],
    rawSources: [],
  }
}
