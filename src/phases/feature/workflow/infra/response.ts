import { escapeMarkdown } from '../../../../utils/security.js'
import type { FeatureSession, PostDesignDecision } from '../../../../phases/feature/state-machine.js'
import type { DerivedFeatureIdentity } from '../../../../utils/feature-resolver.js'
import type { RequirementModel } from '../../../../phases/feature/requirement-model.js'
import type { DesignReviewReport } from '../../../../phases/feature/design-review-report.js'

export function formatHarvestOpenQuestionBlock(session: FeatureSession): string {
  const questions = session.pendingConfirmations
    .filter((item) => item.startsWith('Open question from brainstorm'))
    .map((item) => `- ${escapeMarkdown(item)}`)
    .join('\n')

  return `## Feature Design Pending

Feature: ${escapeMarkdown(session.feature)}

The confirmed brainstorm packet contains blocking open questions, so OpenFlow will not generate a final design yet.

Pending confirmations:
${questions}

Answer the open questions, or explicitly ask to generate a draft with assumptions.`
}

export function formatSameSessionSwitchRejection(activeFeature: string, attemptedInput: string): string {
  return `## Same-Session Feature Switch Rejected

This session already has an active feature: \`${escapeMarkdown(activeFeature)}\`.

Your input was interpreted as a request for a different feature:
> ${escapeMarkdown(attemptedInput.slice(0, 200))}

OpenFlow does not allow switching to a different feature within the same session. To continue:

1. **Continue with the current feature**: use natural language to refine or answer pending questions about \`${escapeMarkdown(activeFeature)}\`.
2. **Start a new session**: to work on a different feature, create a new session and run \`/openflow-feature\` there.`
}

export function formatRecoveryGuidance(session: FeatureSession): string {
  const stateLabel = session.workflowState === 'failed' ? 'failed' : 'draft_blocked'
  const errorDetail = session.lastError ? `\n\nError: ${escapeMarkdown(session.lastError)}` : ''

  return `## Feature Recovery Needed

Feature: \`${escapeMarkdown(session.feature)}\`
State: \`${stateLabel}\`
Attempts: ${session.generationAttemptCount}${errorDetail}

The feature design is in a non-recoverable ${stateLabel} state. To proceed:

1. **Re-describe the feature**: run \`/openflow-feature ${escapeMarkdown(session.feature)}\` in a new session to start fresh.
2. **Delete session state**: manually remove \`.openflow/feature/${escapeMarkdown(session.feature)}.json\` and retry.

OpenFlow will not silently retry generation from a ${stateLabel} state.`
}

export function formatNextStepOptions(feature: string, designReview?: DesignReviewReport): string {
  if (designReview?.status === 'not_ready') {
    const missing = designReview.missingImplementationFacts.length > 0
      ? designReview.missingImplementationFacts.map((fact) => `- ${escapeMarkdown(fact.key)}: ${escapeMarkdown(fact.question)}`).join('\n')
      : '- Review the Design Sufficiency Review section and add missing implementation constraints.'

    return `## Next Step Options

- Add missing implementation constraints
- Review design sufficiency report
- Inspect generated artifacts

Design is not ready for implementation planning yet.

Required next facts:
${missing}`
  }

  return `## Next Step Options

- Proceed to implementation planning
- Review design documents
- Inspect generated artifacts

> To proceed, manually run \`/openflow-writing-plan ${escapeMarkdown(feature)}\` when ready.`
}

export function formatPostDesignDecisionResult(decision: PostDesignDecision, feature: string, model?: RequirementModel, designReview?: DesignReviewReport): string {
  if (decision === 'proceed_to_plan') {
    if (designReview?.status === 'not_ready') {
      return `## Post-Design Confirmation

Design is not ready for implementation planning yet.

${formatDesignDocumentReview(model, designReview)}

Add the missing implementation constraints before running \`/openflow-writing-plan ${escapeMarkdown(feature)}\`.`
    }

    return `## Post-Design Confirmation

Design is ready for implementation planning. To generate the plan, manually run:

\`\`\`
/openflow-writing-plan ${escapeMarkdown(feature)}
\`\`\`

OpenFlow will not run this automatically; start it only when you are ready.`
  }

  if (decision === 'review_docs') {
    return formatDesignDocumentReview(model, designReview)
  }

  return `## Documents Ready

The generated design documents are ready for inspection. Review them before choosing whether to proceed to planning or refine constraints.`
}

export function formatDesignDocumentReview(model?: RequirementModel, designReview?: DesignReviewReport): string {
  if (designReview) {
    const findings = designReview.findings.length > 0
      ? designReview.findings.map((finding) => `- [${finding.severity}] ${escapeMarkdown(finding.category)}: ${escapeMarkdown(finding.message)}\n  - Suggested fix: ${escapeMarkdown(finding.suggestedFix)}`).join('\n')
      : '- None.'

    const missingFacts = designReview.missingImplementationFacts.length > 0
      ? designReview.missingImplementationFacts.map((fact) => `- ${escapeMarkdown(fact.key)}: ${escapeMarkdown(fact.question)}\n  - Reason: ${escapeMarkdown(fact.reason)}`).join('\n')
      : '- None.'

    const coverage = designReview.coverageMatrix.length > 0
      ? designReview.coverageMatrix.map((row) => `- ${escapeMarkdown(row.constraintId)}: ${row.sufficiency} (${row.missingDetails.length > 0 ? escapeMarkdown(row.missingDetails.join(', ')) : 'covered'})`).join('\n')
      : '- No important constraints were evaluated.'

    return `## Design Document Review

Status: ${designReview.status === 'ready' ? 'Ready' : 'Not Ready'}
Structural Completeness: \`${designReview.structuralCompleteness}\`
Design Readiness: \`${designReview.designReadiness}\`

${escapeMarkdown(designReview.summary)}

### Findings
${findings}

### Constraint Coverage
${coverage}

### Required Next Facts
${missingFacts}`
  }

  const constraints = model?.constraints?.length
    ? model.constraints.map((constraint) => `- ${escapeMarkdown(constraint.description)}`).join('\n')
    : '- None recorded.'

  return `## Design Document Review

Documents to review:
- \`design.md\`
- \`behavior.md\`

Constraints from the requirement model:
${constraints}

Assistant/runtime instruction: review whether these constraints are sufficient for implementation planning, including boundary coverage, compatibility expectations, and unresolved confirmations. Do not assume constraint sufficiency without checking the generated documents.`
}

export function formatStatusSummary(feature: string, session: FeatureSession): string {
  const facts = Object.entries(session.collectedFacts).length > 0
    ? Object.entries(session.collectedFacts).map(([key, value]) => `- ${escapeMarkdown(key)} = ${escapeMarkdown(value)}`).join('\n')
    : '- No facts collected yet.'

  const assumptions = session.assumptions.length > 0
    ? session.assumptions.map((item) => `- ${escapeMarkdown(item)}`).join('\n')
    : '- None recorded.'

  const pending = session.pendingConfirmations.length > 0
    ? session.pendingConfirmations.map((item) => `- ${escapeMarkdown(item)}`).join('\n')
    : '- None recorded.'

  return `## Feature Design Context

Feature: ${escapeMarkdown(session.featureTitle ?? feature)}
Internal slug: \`${escapeMarkdown(feature)}\`
Status: \`${session.workflowState}\`

### Collected Facts
${facts}

### Assumptions
${assumptions}

### Pending Confirmations
${pending}
`
}

export function formatLowConfidenceFeatureIdentity(identity: DerivedFeatureIdentity): string {
  const reason = identity.lowConfidenceReason === 'generic_slug'
    ? 'The provided feature name is too generic to create a durable workspace name.'
    : 'The request describes a workflow action, but not the specific feature or problem to name.'

  return `## Feature Identity Needed

${reason}

Please provide a short, specific feature name or one-sentence intent, for example:

\`quality-gate-stage-applicability\`

OpenFlow will not create a \`feature-*\`, \`future-*\`, or other placeholder workspace from this input.`
}

export function formatGenerationResultAll(feature: string, generatedPaths: string[], title?: string, model?: RequirementModel, designReview?: DesignReviewReport): string {
  const paths = generatedPaths.length > 0
    ? generatedPaths.map((p) => `- \`${escapeMarkdown(p)}\``).join('\n')
    : '- (no documents generated)'
  const consensus = model?.problemStatement ?? model?.sourceIntent ?? title ?? feature
  const assumptions = model?.assumptions?.length
    ? model.assumptions.map((item) => `- ${escapeMarkdown(item)}`).join('\n')
    : '- None recorded.'
  const pending = model?.pendingConfirmations?.length
    ? model.pendingConfirmations.map((item) => `- ${escapeMarkdown(item)}`).join('\n')
    : '- None recorded.'
  const constraints = model?.constraints?.length
    ? model.constraints.map((constraint) => `- ${escapeMarkdown(constraint.description)}`).join('\n')
    : '- None recorded.'

  const reviewStatus = designReview
    ? `\nDesign Review: ${designReview.status === 'ready' ? 'Ready' : 'Not Ready'} (\`${designReview.designReadiness}\`)\n`
    : ''

  return `## Feature Design Complete

Feature: ${escapeMarkdown(feature)}
${title ? `Title: ${escapeMarkdown(title)}\n` : ''}Consensus: ${escapeMarkdown(consensus)}${reviewStatus}

Generated documents:
${paths}

Assumptions:
${assumptions}

Pending confirmations:
${pending}

Constraints:
${constraints}`
}

export function formatGenerationFailure(feature: string, message: string): string {
  return `## Feature Design Pending

Feature: ${escapeMarkdown(feature)}

All answers are collected, but design generation failed and can be retried.

Error:
- ${escapeMarkdown(message)}

Continue with \`/openflow-feature ${escapeMarkdown(feature)}\` to retry generation.`
}
