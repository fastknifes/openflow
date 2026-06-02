import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ZodError } from 'zod'
import { ensureChangeWorkspacePath } from '../../../../config.js'
import { createSafePath } from '../../../../utils/security.js'
import { renderDesignDocument } from '../../../../phases/feature/design-renderer.js'
import { renderBehaviorDocument } from '../../../../phases/feature/behavior-renderer.js'
import { renderDesignDocumentV2 } from '../../../../phases/feature/design-renderer-v2.js'
import { renderBehaviorDocumentV2 } from '../../../../phases/feature/behavior-renderer-v2.js'
import { defaultSynthesizer } from '../../../../phases/feature/llm-adapter.js'
import { buildSessionRequirementModelV2, convertV2ToLegacy } from '../../../../phases/feature/requirement-pipeline-v2.js'
import { RequirementModelSchema } from '../../../../phases/feature/requirement-model.js'
import type { ConstraintCategory, ConstraintSeverity, RequirementModel } from '../../../../phases/feature/requirement-model.js'
import type { DesignReviewReport } from '../../../../phases/feature/design-review-report.js'
import { createDesignReviewUnavailable, evaluateDesignSufficiency, renderDesignReviewSummary } from '../../../../phases/feature/design-sufficiency-review.js'
import { applyConfirmedHarvestToRequirementModel } from '../../../../phases/feature/context-harvest.js'
import type { FeatureSession } from '../../../../phases/feature/state-machine.js'
import type { OpenFlowContext } from '../../../../types.js'
import { renderFeatureStateDocument, writeFileAtomic } from './state-document.js'
import { appendCrossValidationSummary, buildCrossValidationDocuments, evaluateCrossValidation } from './cross-validation.js'
import { markDraftBlocked } from '../../state-machine.js'
import { saveFeatureSession } from '../infra/session-store.js'
import { OpenFlowError, ErrorCode } from '../../../../utils/errors.js'

export async function prepareRequirementModel(
  session: FeatureSession,
  seedModel?: RequirementModel,
): Promise<RequirementModel> {
  const baseModel = seedModel ?? buildSessionRequirementModel(session)

  try {
    const enrichedModel = await defaultSynthesizer.synthesize(baseModel)
    return RequirementModelSchema.parse(enrichedModel)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(error.message)
    }

    throw error
  }
}

export function buildSessionRequirementModel(session: FeatureSession): RequirementModel {
  const facts: Record<string, string> = { ...session.collectedFacts }
  if (!facts.problem && session.sourceIntent && session.sourceIntent !== session.feature) {
    facts.problem = session.sourceIntent
  }

  // Extract AI-injected structured data from `_`-prefixed facts keys.
  // These are populated by the AI via action='collect' and mapped directly
  // into the requirement model fields — no hardcoded templates needed.
  const { constraints, remainingFacts: factsAfterConstraints } = extractStructuredConstraints(facts)
  const goals = parseJsonArray(facts._goals)
  const nonGoals = parseJsonArray(facts._nonGoals)
  const acceptanceCriteria = parseJsonArray(facts._acceptanceCriteria).map((desc, i) => ({
    id: `ac-${String(i + 1).padStart(4, '0')}`,
    description: desc,
  }))

  // Remove `_`-prefixed keys so they don't pollute sourceContext
  const cleanFacts = Object.fromEntries(
    Object.entries(factsAfterConstraints).filter(([k]) => !k.startsWith('_')),
  )

  const problemStatement = cleanFacts.problem?.trim() || undefined
  const feature = session.feature
  const scope = cleanFacts.scope?.trim() || ''

  // Build fallback content from collected facts when AI did not inject
  // structured data via `_`-prefixed keys. This ensures generated documents
  // always reflect the user's input, even if the AI skips the injection step.
  const resolvedConstraints = constraints.length > 0
    ? constraints
    : buildFallbackConstraints(cleanFacts, feature)
  const resolvedGoals = goals.length > 0
    ? goals
    : buildFallbackGoals(problemStatement, feature)
  const resolvedNonGoals = nonGoals.length > 0
    ? nonGoals
    : buildFallbackNonGoals(cleanFacts)
  const resolvedAcceptanceCriteria = acceptanceCriteria.length > 0
    ? acceptanceCriteria
    : buildFallbackAcceptanceCriteria(cleanFacts, resolvedGoals)

  const skeletonModel = RequirementModelSchema.parse({
    feature,
    featureTitle: session.featureTitle,
    sourceIntent: session.sourceIntent,
    convergenceStatus: session.draftStatus,
    assumptions: session.assumptions,
    pendingConfirmations: session.pendingConfirmations,
    problemStatement,
    targetUsers: cleanFacts['target-users']?.trim() || undefined,
    constraints: resolvedConstraints,
    scopeBoundary: {
      inScope: scope ? [`${feature} ${scope}`] : [feature],
      outOfScope: resolvedNonGoals.length > 0 ? resolvedNonGoals.slice(0, 3) : [],
    },
    acceptanceCriteria: resolvedAcceptanceCriteria,
    goals: resolvedGoals,
    nonGoals: resolvedNonGoals,
    sourceContext: {
      facts: cleanFacts,
      assumptions: session.assumptions,
    },
  })

  return RequirementModelSchema.parse(
    applyConfirmedHarvestToRequirementModel(
      skeletonModel,
      session.pendingContextHarvest?.confirmedItems,
    ),
  )
}

// --- Structured data extraction helpers ---

// Keys that are meta-level (not design content) and should not become constraints
const META_FACT_KEYS = new Set(['problem', 'scope', 'target-users', 'priority'])

interface ConstraintInput {
  description: string
  category?: string
  severity?: string
  rationale?: string
  verificationMethod?: string
}

function extractStructuredConstraints(
  facts: Record<string, string>,
): { constraints: RequirementModel['constraints']; remainingFacts: Record<string, string> } {
  const raw = facts._constraints
  if (!raw) {
    return { constraints: [], remainingFacts: facts }
  }

  try {
    const items: ConstraintInput[] = JSON.parse(raw)
    if (!Array.isArray(items)) {
      return { constraints: [], remainingFacts: facts }
    }

    const constraints = items
      .filter((item) => item && typeof item.description === 'string' && item.description.trim())
      .map((item, i) => ({
        id: `c-${String(i + 1).padStart(4, '0')}`,
        category: validateCategory(item.category),
        severity: validateSeverity(item.severity),
        description: item.description.trim(),
        rationale: item.rationale?.trim() || 'Provided by AI during feature design',
        verificationMethod: item.verificationMethod?.trim() || 'Review implementation against constraint',
        sourceQuestionId: 'ai-injected',
      }))

    const remainingFacts = Object.fromEntries(
      Object.entries(facts).filter(([k]) => k !== '_constraints'),
    )
    return { constraints, remainingFacts }
  } catch {
    return { constraints: [], remainingFacts: facts }
  }
}

function validateCategory(value?: string): ConstraintCategory {
  const valid: ConstraintCategory[] = ['compatibility', 'performance', 'scope', 'security', 'maintainability', 'time']
  return valid.includes(value as ConstraintCategory) ? value as ConstraintCategory : 'scope'
}

function validateSeverity(value?: string): ConstraintSeverity {
  const valid: ConstraintSeverity[] = ['must', 'should', 'may']
  return valid.includes(value as ConstraintSeverity) ? value as ConstraintSeverity : 'should'
}

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return []
  }
}

// --- Fallback builders: derive model content from collected facts ---

/**
 * When the AI didn't provide a meaningful problem statement (only the feature
 * slug), try to synthesize one from brainstorm assumptions or sourceIntent.
 */
function buildFallbackConstraints(
  facts: Record<string, string>,
  feature: string,
): RequirementModel['constraints'] {
  const constraints: RequirementModel['constraints'] = []

  const entries = Object.entries(facts).filter(
    ([k, v]) => !META_FACT_KEYS.has(k) && v.trim().length > 0,
  )

  if (entries.length === 0) {
    // No facts beyond problem/scope — provide a single scope constraint
    constraints.push({
      id: 'c-0001',
      category: 'scope',
      severity: 'should',
      description: `${feature} implementation must align with the described design intent`,
      rationale: 'Fallback constraint: no structured constraints were provided by AI',
      verificationMethod: 'Review design document against user intent',
      sourceQuestionId: 'fallback',
    })
    return constraints
  }

  for (const [key, value] of entries) {
    constraints.push({
      id: `c-${String(constraints.length + 1).padStart(4, '0')}`,
      category: inferCategoryFromKey(key),
      severity: 'should',
      description: value.trim(),
      rationale: `Derived from collected fact: ${key}`,
      verificationMethod: `Verify implementation satisfies the ${key} requirement`,
      sourceQuestionId: 'fallback',
    })
  }

  return constraints
}

function buildFallbackGoals(
  problemStatement: string | undefined,
  feature: string,
): string[] {
  // Use problem statement as primary goal
  if (problemStatement) {
    return [problemStatement]
  }
  return [`Deliver ${feature}`]
}

function buildFallbackNonGoals(facts: Record<string, string>): string[] {
  // Check for explicit non-goals or out-of-scope signals
  const nonGoalFacts = Object.entries(facts)
    .filter(([k]) => /non[- ]?goal|out[- ]?of[- ]?scope|exclude|not.include/i.test(k))
    .map(([, v]) => v.trim())
    .filter(Boolean)

  return nonGoalFacts
}

function buildFallbackAcceptanceCriteria(
  facts: Record<string, string>,
  goals: string[],
): RequirementModel['acceptanceCriteria'] {
  // If there's a problem statement or goals, create basic acceptance criteria
  const criteria: RequirementModel['acceptanceCriteria'] = []

  for (let i = 0; i < Math.min(goals.length, 3); i++) {
    const goal = goals[i]
    if (goal) {
      criteria.push({
        id: `ac-${String(criteria.length + 1).padStart(4, '0')}`,
        description: goal,
      })
    }
  }

  if (criteria.length === 0 && facts.problem) {
    criteria.push({
      id: 'ac-0001',
      description: `Address the described problem: ${facts.problem}`,
    })
  }

  return criteria
}

function inferCategoryFromKey(key: string): ConstraintCategory {
  const lower = key.toLowerCase()
  if (/sec|auth|perm|encrypt|vuln/i.test(lower)) return 'security'
  if (/perf|latenc|throughput|speed|memory/i.test(lower)) return 'performance'
  if (/compat|version|browser|platform/i.test(lower)) return 'compatibility'
  if (/maintain|clean|refactor|test/i.test(lower)) return 'maintainability'
  if (/deadline|milestone|time|schedule/i.test(lower)) return 'time'
  return 'scope'
}

export async function generateDesignDocument(
  ctx: OpenFlowContext,
  session: FeatureSession,
): Promise<{ designPath: string; behaviorPath: string; requirementModel: RequirementModel; designReview: DesignReviewReport }> {
  const reuseResult = await tryReuseExistingDocuments(session)
  if (reuseResult) {
    return reuseResult
  }

  const validatedModel = await prepareRequirementModel(session, session.requirementModel)
  const rendered = await renderAllDocuments(ctx, session, validatedModel)
  await writeDocumentsToWorkspace(rendered)

  return {
    designPath: rendered.designPath,
    behaviorPath: rendered.behaviorPath,
    requirementModel: validatedModel,
    designReview: rendered.designReview,
  }
}

// ── Strategy layer: reuse existing documents if available ──────────────────

async function tryReuseExistingDocuments(
  session: FeatureSession,
): Promise<{ designPath: string; behaviorPath: string; requirementModel: RequirementModel; designReview: DesignReviewReport } | null> {
  const existingGenerated = session.generatedDocs[0]
  if (!existingGenerated) {
    return null
  }

  try {
    await fs.access(existingGenerated)
    const existingModel = await prepareRequirementModel(session, session.requirementModel)
    const existingBehaviorPath = path.join(path.dirname(existingGenerated), 'behavior.md')
    await fs.access(existingBehaviorPath)
    return {
      designPath: existingGenerated,
      behaviorPath: existingBehaviorPath,
      requirementModel: existingModel,
      designReview: createDesignReviewUnavailable('Existing generated documents were reused; rerun generation to refresh the design sufficiency review.'),
    }
  } catch {
    return null
  }
}

// ── Render layer: generate document contents + cross-validation ────────────

interface RenderedDocuments {
  designPath: string
  behaviorPath: string
  statePath: string
  designContent: string
  behaviorContent: string
  stateContent: string
  designReview: DesignReviewReport
}

async function renderAllDocuments(
  ctx: OpenFlowContext,
  session: FeatureSession,
  model: RequirementModel,
): Promise<RenderedDocuments> {
  const workspaceDir = await ensureChangeWorkspacePath(ctx.directory, session.feature, ctx.config)
  const relativeWorkspaceDir = path.relative(ctx.directory, workspaceDir)
  const safeWorkspaceDir = createSafePath(ctx.directory, relativeWorkspaceDir)

  const designPath = path.join(safeWorkspaceDir, 'design.md')
  const behaviorPath = path.join(safeWorkspaceDir, 'behavior.md')
  const statePath = path.join(safeWorkspaceDir, 'state.md')

  // Try V2 pipeline for richer document generation
  let content: string
  let v2Model = await buildSessionRequirementModelV2(session)
  if (v2Model) {
    content = renderDesignDocumentV2(v2Model)
  } else {
    content = renderDesignDocument(model)
  }

  const behaviorContent = v2Model ? renderBehaviorDocumentV2(v2Model) : renderBehaviorDocument(model)
  const stateContent = renderFeatureStateDocument(session, v2Model ? convertV2ToLegacy(v2Model) : model, [designPath, behaviorPath])

  const allDocuments = (await buildCrossValidationDocuments(safeWorkspaceDir))
    .filter((document) => document.name !== 'design.md' && document.name !== 'behavior.md')
  allDocuments.push({ name: 'design.md', content })
  allDocuments.push({ name: 'behavior.md', content: behaviorContent })

  // Critical Blocking check: prevent generation of designs with unresolved safety gaps
  const cvResult = evaluateCrossValidation(allDocuments)
  if (cvResult.hasCriticalBlocking) {
    const criticalDescriptions = cvResult.gaps
      .filter((g) => g.severity === 'critical_blocking')
      .map((g) => g.description)
      .join('; ')
    const blockedSession = markDraftBlocked(session, `Critical Blocking gaps: ${criticalDescriptions}`)
    await saveFeatureSession(ctx.directory, blockedSession, ctx.config.paths.feature_state)
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      `Design generation blocked due to critical safety gaps: ${criticalDescriptions}. Resolve these gaps before retrying.`,
    )
  }

  const designReview = v2Model
    ? evaluateDesignSufficiency(v2Model, [
      { name: 'design.md', content },
      { name: 'behavior.md', content: behaviorContent },
    ])
    : createDesignReviewUnavailable('V2 requirement model was unavailable; design sufficiency could not be reviewed structurally.')
  const designReviewSummary = renderDesignReviewSummary(designReview)

  const designContent = `${appendCrossValidationSummary(content, allDocuments).trimEnd()}\n\n${designReviewSummary}\n`
  const behaviorContentWithSummary = `${appendCrossValidationSummary(behaviorContent, allDocuments).trimEnd()}\n\n${designReviewSummary}\n`

  return {
    designPath,
    behaviorPath,
    statePath,
    designContent,
    behaviorContent: behaviorContentWithSummary,
    stateContent,
    designReview,
  }
}

// ── Infrastructure layer: atomic file writes with cleanup ─────────────────

async function writeDocumentsToWorkspace(documents: RenderedDocuments): Promise<void> {
  const dir = path.dirname(documents.designPath)
  await fs.mkdir(dir, { recursive: true })

  try {
    await writeFileAtomic(documents.statePath, documents.stateContent)
    await fs.writeFile(documents.designPath, documents.designContent, 'utf-8')
    await fs.writeFile(documents.behaviorPath, documents.behaviorContent, 'utf-8')
  } catch (error) {
    await Promise.allSettled([
      fs.rm(documents.statePath, { force: true }),
      fs.rm(documents.designPath, { force: true }),
      fs.rm(documents.behaviorPath, { force: true }),
    ])
    throw error
  }
}
