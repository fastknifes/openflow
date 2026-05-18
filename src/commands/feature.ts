import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ZodError } from 'zod'
import type { OpenFlowContext } from '../types.js'
import { ensureChangeWorkspacePath } from '../config.js'
import { clearRecentFeatureCompletion, markRecentFeatureCompletion } from '../hooks/feature-workflow.js'
import { evaluateFeatureConvergence, detectFlowSignal } from '../phases/feature/convergence.js'
import { buildRequirementModel } from '../phases/feature/constraint-derivation.js'
import { renderDesignDocument } from '../phases/feature/design-renderer.js'
import { renderBehaviorDocument } from '../phases/feature/behavior-renderer.js'
import { defaultSynthesizer } from '../phases/feature/llm-adapter.js'
import { RequirementModelSchema } from '../phases/feature/requirement-model.js'
import type { RequirementModel } from '../phases/feature/requirement-model.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { createSafePath, escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import { deriveFeatureIdentity, findActiveFeature, findIncompleteFeatureSessions, type DerivedFeatureIdentity, type FeatureSessionCandidate } from '../utils/feature-resolver.js'
import {
  applyFeatureAnswer,
  FeatureQuestion,
  FeatureQuestion as PersistedFeatureQuestion,
  FeatureSession,
  FeatureOption,
  createInitialFeatureSession,
  getPendingQuestion,
  getRecommendedOptionLabel,
  isAwaitingFormalAnswer,
  markCompleted,
  markGenerating,
  markGenerationFailed,
  markQuestionPrompted,
  normalizeFeatureSession,
  shouldGenerateDesign,
} from '../phases/feature/state-machine.js'

interface FeatureQuestionInput {
  question: string
  header: string
  options: FeatureOption[]
  multiple?: boolean
  custom?: boolean
}

type FeatureQuestionAnswer = string[]

interface FeatureInteractiveToolContext {
  sessionID?: string
  askQuestion(input: { questions: FeatureQuestionInput[] }): Promise<FeatureQuestionAnswer[]>
}

interface FeatureSessionIndex {
  bySessionID: Record<string, { feature: string; updatedAt: string }>
}

type FeatureResolution =
  | { kind: 'resolved'; identity: DerivedFeatureIdentity }
  | { kind: 'ambiguous'; candidates: FeatureSessionCandidate[] }
  | { kind: 'missing' }

export async function handleFeature(
  ctx: OpenFlowContext,
  feature?: string,
  answer?: string,
  toolContext?: unknown
): Promise<string> {
  if (!ctx.config.feature.enabled) {
    return 'Feature design phase is disabled in configuration'
  }

  const resolvedFeature = await resolveFeature(ctx, feature, toolContext)
  if (resolvedFeature.kind === 'ambiguous') {
    return formatFeatureDisambiguation(resolvedFeature.candidates)
  }

  if (resolvedFeature.kind === 'missing') {
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      'Describe the feature idea in natural language, or continue in a session that already has one active feature.'
    )
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature.identity.slug)
  let session = await loadFeatureSession(ctx.directory, sanitizedFeature)
  session = mergeIdentity(session, resolvedFeature.identity)
  await bindSessionToFeature(ctx.directory, toolContext, sanitizedFeature)
  await clearRecentFeatureCompletion(ctx.directory, getToolSessionID(toolContext))

  if (session.workflowState === 'completed' && session.generatedDocs.length > 0) {
    await clearSessionBindingIfCompleted(ctx.directory, toolContext, session)
    return formatGenerationResultAll(sanitizedFeature, session.generatedDocs, session.featureTitle)
  }

  if (answer?.trim()) {
    const messageID = getToolMessageID(toolContext)
    if (messageID && session.lastConsumedMessageId === messageID) {
        const convergence = evaluateFeatureConvergence(session, answer)
        if (convergence.kind === 'ask_next' && convergence.question) {
          session = markQuestionPrompted(session, convergence.question.id)
          await saveFeatureSession(ctx.directory, session)
          return formatQuestionPrompt(sanitizedFeature, session, convergence.question, convergence.rationale)
        }

        if (shouldGenerateDesign(session) || convergence.kind !== 'ask_next') {
          return finalizeFeature(ctx, session, toolContext)
        }

      return formatGenerationResultAll(sanitizedFeature, session.generatedDocs, session.featureTitle)
    }

    const flowSignal = detectFlowSignal(answer)
    if (flowSignal === 'product-level') {
      session = { ...session, abstractionPreference: 'product' }
    }

    const validationError = flowSignal === 'none' ? validatePendingAnswer(session, answer) : undefined
    if (validationError) {
      const pendingQuestion = getPendingQuestion(session)
      if (!pendingQuestion) {
        return validationError
      }

      session = markQuestionPrompted(session, pendingQuestion.id)
      await saveFeatureSession(ctx.directory, session)
      return `${validationError}\n\n${formatQuestionPrompt(sanitizedFeature, session, pendingQuestion)}`
    }

    if (flowSignal === 'none') {
      const selectedQuestion = evaluateFeatureConvergence(session, answer).question
      if (selectedQuestion && selectedQuestion.id !== session.pendingQuestionId) {
        session = markQuestionPrompted(session, selectedQuestion.id)
      }
    }

    if (flowSignal === 'proceed') {
      const pendingQuestion = getPendingQuestion(session)
      session = {
        ...session,
        draftStatus: 'draft_with_assumptions',
        skippedQuestionIds: pendingQuestion ? uniqueQuestionIds([...session.skippedQuestionIds, pendingQuestion.id]) : session.skippedQuestionIds,
        assumptions: uniqueStrings([...session.assumptions, 'The user asked OpenFlow to proceed using current context and assumptions.']),
        lastConsumedMessageId: messageID ?? session.lastConsumedMessageId,
      }
    } else {
      session = applyFeatureAnswer(session, answer, messageID)
    }
    await saveFeatureSession(ctx.directory, session)
  }

  const convergence = evaluateFeatureConvergence(session, answer)
  if (convergence.kind === 'ready_to_generate' || convergence.kind === 'draft_with_assumptions' || shouldGenerateDesign(session)) {
    session = {
      ...session,
      workflowState: 'ready_to_generate',
      promptMode: 'discussion',
      pendingQuestionId: null,
      draftStatus: convergence.kind === 'draft_with_assumptions' ? 'draft_with_assumptions' : session.draftStatus,
      assumptions: uniqueStrings([...session.assumptions, ...convergence.assumptions]),
      pendingConfirmations: uniqueStrings([...session.pendingConfirmations, ...convergence.pendingConfirmations]),
    }
    await saveFeatureSession(ctx.directory, session)
    return finalizeFeature(ctx, session, toolContext)
  }

  const pendingQuestion = convergence.question ?? getPendingQuestion(session)
  if (!pendingQuestion) {
    return finalizeFeature(ctx, session, toolContext)
  }

  session = markQuestionPrompted(session, pendingQuestion.id)
  await saveFeatureSession(ctx.directory, session)

  if (hasAskQuestion(toolContext) && !answer?.trim() && isAwaitingFormalAnswer(session)) {
    const interactiveAnswer = await askSingleQuestion(session, pendingQuestion, toolContext)
    if (interactiveAnswer) {
      return handleFeature(ctx, sanitizedFeature, interactiveAnswer, toolContext)
    }
  }

  return formatQuestionPrompt(sanitizedFeature, session, pendingQuestion, convergence.rationale)
}

async function finalizeFeature(
  ctx: OpenFlowContext,
  session: FeatureSession,
  toolContext?: unknown
): Promise<string> {
  const existingGenerated = session.generatedDocs[0]
  if (session.workflowState === 'completed' && existingGenerated) {
    await clearSessionBindingIfCompleted(ctx.directory, toolContext, session)
    return formatGenerationResultAll(session.feature, session.generatedDocs, session.featureTitle, session.requirementModel)
  }

  try {
    const requirementModel = await prepareRequirementModel(
      session,
      buildSessionRequirementModel(session)
    )
    const generatingSession = markGenerating({
      ...session,
      requirementModel,
    })
    await saveFeatureSession(ctx.directory, generatingSession)

    const { designPath, behaviorPath, requirementModel: validatedModel } = await generateDesignDocument(ctx, generatingSession)
    const allGeneratedDocs = [designPath]
    if (behaviorPath) {
      allGeneratedDocs.push(behaviorPath)
    }
    const completedSession = markCompleted(
      {
        ...generatingSession,
        requirementModel: validatedModel,
        generatedDocs: allGeneratedDocs,
      },
      allGeneratedDocs
    )
    await saveFeatureSession(ctx.directory, completedSession)
    await markRecentFeatureCompletion(ctx.directory, getToolSessionID(toolContext), completedSession.feature)
    await clearSessionBindingIfCompleted(ctx.directory, toolContext, completedSession)
    return formatGenerationResultAll(session.feature, completedSession.generatedDocs, completedSession.featureTitle, validatedModel)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedSession = markGenerationFailed(markGenerating(session), message)
    await saveFeatureSession(ctx.directory, failedSession)
    return formatGenerationFailure(session.feature, message)
  }
}

async function prepareRequirementModel(
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

async function askSingleQuestion(
  session: FeatureSession,
  question: FeatureQuestion,
  toolContext: FeatureInteractiveToolContext
): Promise<string | undefined> {
  const answers = await toolContext.askQuestion({
    questions: [
      {
        question: question.question,
        header: question.header,
        options: getRecommendedOptions(session, question),
        multiple: false,
        custom: true,
      },
    ],
  })

  return normalizeInteractiveAnswer(answers[0])
}

async function resolveFeature(ctx: OpenFlowContext, feature: string | undefined, toolContext: unknown): Promise<FeatureResolution> {
  if (feature?.trim()) {
    const existingCandidate = await resolveExistingFeatureCandidate(ctx.directory, feature)
    if (existingCandidate) {
      return { kind: 'resolved', identity: existingCandidate }
    }

    return { kind: 'resolved', identity: deriveFeatureIdentity(feature) }
  }

  const sessionID = getToolSessionID(toolContext)
  if (sessionID) {
    const index = await loadFeatureSessionIndex(ctx.directory)
    const activeFeature = index.bySessionID[sessionID]?.feature
    if (activeFeature) {
      return { kind: 'resolved', identity: { slug: activeFeature } }
    }
  }

  const incompleteSessions = await findIncompleteFeatureSessions(ctx.directory)
  if (incompleteSessions.length === 1) {
    const candidate = incompleteSessions[0]!
    return {
      kind: 'resolved',
      identity: {
        slug: candidate.slug,
        title: candidate.title,
        sourceIntent: candidate.sourceIntent,
      },
    }
  }

  if (incompleteSessions.length > 1) {
    return { kind: 'ambiguous', candidates: incompleteSessions.slice(0, 5) }
  }

  const activeFeature = await findActiveFeature(ctx)
  if (activeFeature) {
    return { kind: 'resolved', identity: { slug: activeFeature } }
  }

  return { kind: 'missing' }
}

async function resolveExistingFeatureCandidate(projectDir: string, selection: string): Promise<DerivedFeatureIdentity | undefined> {
  const normalizedSelection = normalizeSelectionText(selection)
  if (!normalizedSelection) return undefined

  const candidates = await findIncompleteFeatureSessions(projectDir)
  const matched = candidates.find((candidate) => {
    const values = [candidate.slug, candidate.title, candidate.sourceIntent]
      .map((value) => normalizeSelectionText(value ?? ''))
      .filter(Boolean)

    return values.some((value) => value === normalizedSelection)
      || values.some((value) => value.includes(normalizedSelection) || normalizedSelection.includes(value))
  })

  if (!matched) return undefined

  return {
    slug: matched.slug,
    title: matched.title,
    sourceIntent: matched.sourceIntent,
  }
}

async function loadFeatureSession(projectDir: string, feature: string): Promise<FeatureSession> {
  const sessionPath = getFeatureSessionPath(projectDir, feature)

  try {
    const content = await fs.readFile(sessionPath, 'utf-8')
    return normalizeFeatureSession(feature, JSON.parse(content) as unknown)
  } catch {
    return createInitialFeatureSession(feature)
  }
}

async function saveFeatureSession(projectDir: string, session: FeatureSession): Promise<void> {
  const sessionDir = createSafePath(projectDir, '.sisyphus', 'feature')
  const sessionPath = getFeatureSessionPath(projectDir, session.feature)
  session.updatedAt = new Date().toISOString()
  await fs.mkdir(sessionDir, { recursive: true })
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8')
}

function mergeIdentity(session: FeatureSession, identity: DerivedFeatureIdentity): FeatureSession {
  return {
    ...session,
    featureTitle: session.featureTitle ?? identity.title,
    sourceIntent: session.sourceIntent ?? identity.sourceIntent,
  }
}

function buildSessionRequirementModel(session: FeatureSession): RequirementModel {
  const answers: FeatureSession['answers'] = { ...session.answers }
  if (!answers.problem && session.sourceIntent) {
    answers.problem = session.sourceIntent
  }
  const model = buildRequirementModel(session.feature, answers)
  return RequirementModelSchema.parse({
    ...model,
    featureTitle: session.featureTitle,
    sourceIntent: session.sourceIntent,
    convergenceStatus: session.draftStatus,
    assumptions: session.assumptions,
    pendingConfirmations: session.pendingConfirmations,
  })
}

function uniqueQuestionIds(questionIds: FeatureQuestion['id'][]): FeatureQuestion['id'][] {
  return [...new Set(questionIds)]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeSelectionText(value: string): string {
  return value.trim().toLowerCase().replace(/[`'"\s_-]+/g, '')
}

function getFeatureSessionPath(projectDir: string, feature: string): string {
  return createSafePath(projectDir, '.sisyphus', 'feature', `${feature}.json`)
}

function getFeatureSessionIndexPath(projectDir: string): string {
  return createSafePath(projectDir, '.sisyphus', 'feature', 'active.json')
}

async function loadFeatureSessionIndex(projectDir: string): Promise<FeatureSessionIndex> {
  const indexPath = getFeatureSessionIndexPath(projectDir)

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<FeatureSessionIndex>
    return {
      bySessionID: parsed.bySessionID && typeof parsed.bySessionID === 'object' ? parsed.bySessionID : {},
    }
  } catch {
    return { bySessionID: {} }
  }
}

async function saveFeatureSessionIndex(projectDir: string, index: FeatureSessionIndex): Promise<void> {
  const indexPath = getFeatureSessionIndexPath(projectDir)
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function bindSessionToFeature(projectDir: string, toolContext: unknown, feature: string): Promise<void> {
  const sessionID = getToolSessionID(toolContext)
  if (!sessionID) return

  const index = await loadFeatureSessionIndex(projectDir)
  index.bySessionID[sessionID] = {
    feature,
    updatedAt: new Date().toISOString(),
  }
  await saveFeatureSessionIndex(projectDir, index)
}

async function clearSessionBindingIfCompleted(projectDir: string, toolContext: unknown, session: FeatureSession): Promise<void> {
  if (session.workflowState !== 'completed') return

  const sessionID = getToolSessionID(toolContext)
  if (!sessionID) return

  const index = await loadFeatureSessionIndex(projectDir)
  if (!index.bySessionID[sessionID]) return
  delete index.bySessionID[sessionID]
  await saveFeatureSessionIndex(projectDir, index)
}

function getToolSessionID(toolContext: unknown): string | undefined {
  if (!toolContext || typeof toolContext !== 'object') {
    return undefined
  }

  return typeof (toolContext as { sessionID?: unknown }).sessionID === 'string'
    ? (toolContext as { sessionID: string }).sessionID
    : undefined
}

function getRecommendedOptions(session: FeatureSession, question: PersistedFeatureQuestion): FeatureOption[] {
  const recommendedLabel = getRecommendedOptionLabel(session, question)

  return question.options.map((option) => ({
    ...option,
    label: option.label === recommendedLabel ? `${option.label} (Recommended)` : option.label,
  }))
}

function normalizeInteractiveAnswer(answer: FeatureQuestionAnswer | undefined): string | undefined {
  const firstAnswer = answer?.[0]?.trim()
  if (!firstAnswer) return undefined
  return firstAnswer.replace(/\s*\(Recommended\)$/u, '').trim()
}

function validatePendingAnswer(session: FeatureSession, answer: string): string | undefined {
  const pendingQuestion = getPendingQuestion(session)
  if (!pendingQuestion || !isAwaitingFormalAnswer(session)) {
    return undefined
  }

  const normalized = answer.trim().toLowerCase()
  if (!normalized) {
    return 'Please answer the current feature question before continuing.'
  }

  if (looksLikeLowSignalAnswer(normalized)) {
    return 'That reply is too short to record as the formal feature answer. Please choose an option or provide a short concrete answer.'
  }

  if (looksLikeCommandEcho(normalized)) {
    return 'That looks like a command or command echo, not the answer itself. Please answer the current feature question directly.'
  }

  return undefined
}

function looksLikeLowSignalAnswer(answer: string): boolean {
  return /^(好|好的|行|可以|继续|继续吧|嗯|ok|okay|yes|y|继续推进|下一步)$/i.test(answer)
}

function looksLikeCommandEcho(answer: string): boolean {
  return answer.startsWith('/openflow-') || answer.includes('skill(name="openflow-feature"') || answer.includes("skill(name='openflow-feature'")
}

function hasAskQuestion(value: unknown): value is FeatureInteractiveToolContext {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'askQuestion' in value && typeof value.askQuestion === 'function'
}

async function generateDesignDocument(
  ctx: OpenFlowContext,
  session: FeatureSession,
): Promise<{ designPath: string; behaviorPath: string; requirementModel: RequirementModel }> {
  const existingGenerated = session.generatedDocs[0]
  if (existingGenerated) {
    try {
      await fs.access(existingGenerated)
      const existingModel = await prepareRequirementModel(session, session.requirementModel)
      const existingBehaviorPath = path.join(path.dirname(existingGenerated), 'behavior.md')
      await fs.access(existingBehaviorPath)
      return {
        designPath: existingGenerated,
        behaviorPath: existingBehaviorPath,
        requirementModel: existingModel,
      }
    } catch {
      void 0
    }
  }

  const validatedModel = await prepareRequirementModel(session, session.requirementModel)

  const workspaceDir = await ensureChangeWorkspacePath(ctx.directory, session.feature)
  const relativeWorkspaceDir = path.relative(ctx.directory, workspaceDir)
  const safeWorkspaceDir = createSafePath(ctx.directory, relativeWorkspaceDir)
  await fs.mkdir(safeWorkspaceDir, { recursive: true })

  const designPath = path.join(safeWorkspaceDir, 'design.md')
  const sidecarPath = path.join(safeWorkspaceDir, 'design.meta.json')
  const content = renderDesignDocument(validatedModel)
  const behaviorPath = path.join(safeWorkspaceDir, 'behavior.md')
  const behaviorSidecarPath = path.join(safeWorkspaceDir, 'behavior.meta.json')
  const behaviorContent = renderBehaviorDocument(validatedModel)

  try {
    await fs.writeFile(designPath, content, 'utf-8')
    await fs.writeFile(sidecarPath, JSON.stringify(validatedModel, null, 2), 'utf-8')
    await fs.writeFile(behaviorPath, behaviorContent, 'utf-8')
    await fs.writeFile(behaviorSidecarPath, JSON.stringify(validatedModel, null, 2), 'utf-8')
  } catch (error) {
    await Promise.allSettled([
      fs.rm(designPath, { force: true }),
      fs.rm(sidecarPath, { force: true }),
      fs.rm(behaviorPath, { force: true }),
      fs.rm(behaviorSidecarPath, { force: true }),
    ])
    throw error
  }

  return {
    designPath,
    behaviorPath,
    requirementModel: validatedModel,
  }
}

function getToolMessageID(toolContext: unknown): string | undefined {
  if (!toolContext || typeof toolContext !== 'object') {
    return undefined
  }

  return typeof (toolContext as { messageID?: unknown }).messageID === 'string'
    ? (toolContext as { messageID: string }).messageID
    : undefined
}

function formatQuestionPrompt(feature: string, session: FeatureSession, question: FeatureQuestion, rationale?: string): string {
  const options = getRecommendedOptions(session, question)
    .map((option) => `- ${escapeMarkdown(option.label)}: ${escapeMarkdown(option.description)}`)
    .join('\n')

  const explanation = rationale ? `

Why this matters: ${escapeMarkdown(rationale)}` : ''

  return `## Feature Question

Feature: ${escapeMarkdown(session.featureTitle ?? feature)}
Internal slug: \`${escapeMarkdown(feature)}\`

### ${escapeMarkdown(question.header)}
${escapeMarkdown(question.question)}${explanation}

Options:
${options}

Reply with your answer through the question picker when available.
Otherwise continue with natural language in the same session. You can also say “跳过” or “先生成草稿”.

Progress:
- known facts ${Object.keys(session.answers).length}
- next question id: \`${escapeMarkdown(question.id)}\``
}

function formatFeatureDisambiguation(candidates: FeatureSessionCandidate[]): string {
  const options = candidates
    .map((candidate, index) => `${index + 1}. ${escapeMarkdown(candidate.title ?? candidate.sourceIntent ?? candidate.slug)} (\`${escapeMarkdown(candidate.slug)}\`)`)
    .join('\n')

  return `## Feature Selection Needed

I found multiple unfinished feature ideas. Which one should /openflow-feature continue?

${options}

Reply with the feature idea or a short natural-language description; you do not need to type a slug.`
}

function formatGenerationResultAll(feature: string, generatedPaths: string[], title?: string, model?: RequirementModel): string {
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

  return `## Feature Design Complete

Feature: ${escapeMarkdown(feature)}
${title ? `Title: ${escapeMarkdown(title)}\n` : ''}
Consensus: ${escapeMarkdown(consensus)}

Generated documents:
${paths}

Assumptions:
${assumptions}

Pending confirmations:
${pending}

Constraints:
${constraints}

Suggested next step: review the generated documents, then run \`/openflow-writing-plan ${escapeMarkdown(feature)}\` if you want an implementation plan.`
}

function formatGenerationFailure(feature: string, message: string): string {
  return `## Feature Design Pending

Feature: ${escapeMarkdown(feature)}

All answers are collected, but design generation failed and can be retried.

Error:
- ${escapeMarkdown(message)}

Continue with \`/openflow-feature ${escapeMarkdown(feature)}\` to retry generation.`
}
