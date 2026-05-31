/**
 * Template section requirements for AI-driven readiness evaluation.
 *
 * Instead of checking individual field presence, this module exposes the
 * section names that design.md and behavior.md will contain when generated.
 * The AI compares these sections against the collected state.md content to
 * judge whether enough context exists to fill each section meaningfully.
 *
 * Design intent (Plan C): state.md stays a pure status record; template
 * sections define what the AI needs; the AI itself does the gap analysis.
 */

// ── Section lists (sourced from renderers) ──────────────────────────────────

/**
 * Sections that will appear in design.md.
 *
 * Source: design-renderer.ts → renderDesignDocument()
 * Conditional sections (Draft Notice, UI ASCII Preview) are excluded because
 * they are not always present and do not require user-provided facts.
 */
const DESIGN_TEMPLATE_SECTIONS = [
  'Human Consensus Summary',
  'Identity And Assumptions',
  'Overview',
  'Problem',
  'Goals',
  'Non-Goals',
  'Behavior Alignment',
  'Design Constraints',
  'Success Criteria',
  'Risks And Mitigations',
  'Testing Strategy',
] as const

/**
 * Sections that will appear in behavior.md.
 *
 * Source: behavior-renderer.ts → renderBehaviorDocument()
 * Conditional sections (Draft Notice, Feature Command Behavior) are excluded
 * for the same reason as above.
 */
const BEHAVIOR_TEMPLATE_SECTIONS = [
  'User Context',
  'Trigger Rules',
  'Non-Trigger Rules',
  'User-Visible Scenarios',
  'Required Content',
  'Success Responses',
  'Must Not Behavior',
  'Acceptance / Verification Mapping',
] as const

// ── Public types ────────────────────────────────────────────────────────────

export interface TemplateRequirements {
  designSections: readonly string[]
  behaviorSections: readonly string[]
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getTemplateRequirements(): TemplateRequirements {
  return {
    designSections: DESIGN_TEMPLATE_SECTIONS,
    behaviorSections: BEHAVIOR_TEMPLATE_SECTIONS,
  }
}

export function formatTemplateRequirements(requirements: TemplateRequirements): string {
  const designLines = requirements.designSections.map((s) => `- ${s}`).join('\n')
  const behaviorLines = requirements.behaviorSections.map((s) => `- ${s}`).join('\n')

  return `## Template Section Requirements

### design.md sections (to be generated)

${designLines}

### behavior.md sections (to be generated)

${behaviorLines}

> AI: Compare the collected facts above with these template sections.
> Judge whether enough information exists to fill each section meaningfully.
> A section can be filled from implicit context in the user's natural-language
> descriptions — not every section needs an explicit collected fact.
> If critical sections (Problem, Goals, Design Constraints) cannot be
> meaningfully filled, ask the user for clarification before calling
> \`action='generate'\`.`
}
