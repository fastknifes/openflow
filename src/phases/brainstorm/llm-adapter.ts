import type { RequirementModel } from './requirement-model.js'

/**
 * Optional adapter interface for LLM-driven enrichment of RequirementModel.
 * Implementations may add constraints, refine scope, generate acceptance criteria, etc.
 * The system must work without any LLM adapter — use NoOpSynthesizer as default.
 */
export interface DesignSynthesizer {
  synthesize(model: RequirementModel): Promise<RequirementModel>
}

/**
 * Default no-op implementation that returns the model unchanged.
 */
export class NoOpSynthesizer implements DesignSynthesizer {
  async synthesize(model: RequirementModel): Promise<RequirementModel> {
    return model
  }
}

/** Default instance — safe to use when no LLM enrichment is needed. */
export const defaultSynthesizer: DesignSynthesizer = new NoOpSynthesizer()
