import type { FeatureSession } from './state-machine.js'
import type { RequirementModelV2 } from './requirement-model-v2.js'
import type { RequirementModel } from './requirement-model.js'
import { normalizeEvidence } from './evidence-normalizer.js'
import { defaultSynthesizerV2 } from './synthesizer-v2.js'
import { validateRequirementQuality } from './quality-validator.js'
import { renderDesignDocumentV2 } from './design-renderer-v2.js'

/**
 * Build a RequirementModelV2 from session state using the new
 * evidence → synthesizer → validator pipeline.
 */
export async function buildSessionRequirementModelV2(
  session: FeatureSession,
): Promise<RequirementModelV2 | null> {
  try {
    // 1. Normalize all evidence
    const evidence = normalizeEvidence(session)

    // 2. Synthesize structured model
    const model = await defaultSynthesizerV2.synthesize(evidence)

    // 3. Validate quality
    const quality = validateRequirementQuality(model)

    if (quality.status === 'blocked') {
      // V2 must still render honest draft output instead of falling back to
      // V1, because V1 fabricates placeholder goals/scenarios. Quality
      // issues are surfaced in the rendered document and session state.
      console.warn('Requirement quality blocked:', quality.issues.map((i) => i.message).join('; '))
    }

    return model
  } catch (error) {
    console.warn('V2 synthesis failed, falling back to V1:', error)
    return null
  }
}

/**
 * Generate design document using V2 renderer.
 * Returns null if V2 model cannot be built.
 */
export async function tryGenerateDesignDocumentV2(
  session: FeatureSession,
): Promise<string | null> {
  const model = await buildSessionRequirementModelV2(session)
  if (!model) return null

  return renderDesignDocumentV2(model)
}

/**
 * Convert RequirementModelV2 to legacy RequirementModel for backward compatibility.
 */
export function convertV2ToLegacy(model: RequirementModelV2): RequirementModel {
  return {
    feature: model.feature,
    featureTitle: model.title,
    sourceIntent: model.evidence.sourceIntent,
    convergenceStatus: model.openQuestions.length > 0 ? 'draft_with_assumptions' : 'final',
    assumptions: model.evidence.rawSources.map((s) => s.content),
    pendingConfirmations: model.openQuestions.map((q) => q.question),
    problemStatement: model.problem.currentState,
    targetUsers: undefined,
    constraints: model.constraints.map((c) => ({
      id: c.id,
      category: c.category,
      severity: c.severity,
      description: c.description,
      rationale: c.rationale,
      verificationMethod: c.verificationMethod,
      sourceQuestionId: 'v2',
    })),
    scopeBoundary: {
      inScope: model.goals.map((g) => g.description),
      outOfScope: model.nonGoals.map((ng) => ng.description),
    },
    acceptanceCriteria: model.successCriteria.map((sc) => ({
      id: sc.id,
      description: sc.outcome,
    })),
    goals: model.goals.map((g) => g.description),
    nonGoals: model.nonGoals.map((ng) => ng.description),
    risks: model.risks.map((r) => ({
      description: r.description,
      mitigation: r.mitigation,
    })),
    testingStrategy: model.testingStrategy
      ? [
          model.testingStrategy.unitTests,
          model.testingStrategy.integrationTests,
          model.testingStrategy.endToEndTests,
          model.testingStrategy.manualVerification,
        ]
          .filter(Boolean)
          .join('\n')
      : undefined,
    sourceContext: {
      facts: Object.fromEntries(
        model.evidence.problems.map((p) => ['problem', p.content] as [string, string]),
      ),
      assumptions: model.evidence.rawSources.map((s) => s.content),
    },
  }
}
