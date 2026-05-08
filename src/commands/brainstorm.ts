import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ZodError } from 'zod'
import type { OpenFlowContext } from '../types.js'
import { ensureChangeWorkspacePath } from '../config.js'
import { clearRecentBrainstormCompletion, markRecentBrainstormCompletion } from '../hooks/brainstorm-workflow.js'
import { buildRequirementModel } from '../phases/brainstorm/constraint-derivation.js'
import { renderDesignDocument } from '../phases/brainstorm/design-renderer.js'
import { defaultSynthesizer } from '../phases/brainstorm/llm-adapter.js'
import { RequirementModelSchema } from '../phases/brainstorm/requirement-model.js'
import type { RequirementModel } from '../phases/brainstorm/requirement-model.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { createSafePath, escapeMarkdown, sanitizeFeatureName } from '../utils/security.js'
import {
  applyBrainstormAnswer,
  BrainstormQuestion,
  BrainstormQuestion as PersistedBrainstormQuestion,
  BrainstormSession,
  BrainstormOption,
  createInitialBrainstormSession,
  getPendingQuestion,
  getRecommendedOptionLabel,
  isAwaitingFormalAnswer,
  markCompleted,
  markGenerating,
  markGenerationFailed,
  markQuestionPrompted,
  normalizeBrainstormSession,
  shouldGenerateDesign,
} from '../phases/brainstorm/state-machine.js'

interface BrainstormQuestionInput {
  question: string
  header: string
  options: BrainstormOption[]
  multiple?: boolean
  custom?: boolean
}

type BrainstormQuestionAnswer = string[]

interface BrainstormInteractiveToolContext {
  sessionID?: string
  askQuestion(input: { questions: BrainstormQuestionInput[] }): Promise<BrainstormQuestionAnswer[]>
}

interface BrainstormSessionIndex {
  bySessionID: Record<string, { feature: string; updatedAt: string }>
}

export async function handleBrainstorm(
  ctx: OpenFlowContext,
  feature?: string,
  answer?: string,
  toolContext?: unknown
): Promise<string> {
  if (!ctx.config.brainstorming.enabled) {
    return 'Brainstorm phase is disabled in configuration'
  }

  const resolvedFeature = await resolveFeature(ctx.directory, feature, toolContext)
  if (!resolvedFeature) {
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      'Feature name is required. Start with /openflow-brainstorm <feature-name> or continue in the same session.'
    )
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature)
  let session = await loadBrainstormSession(ctx.directory, sanitizedFeature)
  await bindSessionToFeature(ctx.directory, toolContext, sanitizedFeature)
  await clearRecentBrainstormCompletion(ctx.directory, getToolSessionID(toolContext))

  if (session.workflowState === 'completed' && session.generatedDocs.length > 0) {
    await clearSessionBindingIfCompleted(ctx.directory, toolContext, session)
    return formatGenerationResult(sanitizedFeature, session.generatedDocs[0] ?? '')
  }

  if (answer?.trim()) {
    const validationError = validatePendingAnswer(session, answer)
    if (validationError) {
      const pendingQuestion = getPendingQuestion(session)
      if (!pendingQuestion) {
        return validationError
      }

      session = markQuestionPrompted(session, pendingQuestion.id)
      await saveBrainstormSession(ctx.directory, session)
      return `${validationError}\n\n${formatQuestionPrompt(sanitizedFeature, session, pendingQuestion)}`
    }

    session = applyBrainstormAnswer(session, answer)
    await saveBrainstormSession(ctx.directory, session)
  }

  if (shouldGenerateDesign(session)) {
    return finalizeBrainstorm(ctx, session, toolContext)
  }

  const pendingQuestion = getPendingQuestion(session)
  if (!pendingQuestion) {
    return finalizeBrainstorm(ctx, session, toolContext)
  }

  session = markQuestionPrompted(session, pendingQuestion.id)
  await saveBrainstormSession(ctx.directory, session)

  if (hasAskQuestion(toolContext) && !answer?.trim() && isAwaitingFormalAnswer(session)) {
    const interactiveAnswer = await askSingleQuestion(session, pendingQuestion, toolContext)
    if (interactiveAnswer) {
      return handleBrainstorm(ctx, sanitizedFeature, interactiveAnswer, toolContext)
    }
  }

  return formatQuestionPrompt(sanitizedFeature, session, pendingQuestion)
}

async function finalizeBrainstorm(
  ctx: OpenFlowContext,
  session: BrainstormSession,
  toolContext?: unknown
): Promise<string> {
  const existingGenerated = session.generatedDocs[0]
  if (session.workflowState === 'completed' && existingGenerated) {
    await clearSessionBindingIfCompleted(ctx.directory, toolContext, session)
    return formatGenerationResult(session.feature, existingGenerated)
  }

  const requirementModel = session.requirementModel ?? buildRequirementModel(session.feature, session.answers)
  const generatingSession = markGenerating({
    ...session,
    requirementModel,
  })
  await saveBrainstormSession(ctx.directory, generatingSession)

  try {
    const { designPath, requirementModel: validatedModel } = await generateDesignDocument(ctx, generatingSession)
    const completedSession = markCompleted(
      {
        ...generatingSession,
        requirementModel: validatedModel,
      },
      designPath
    )
    await saveBrainstormSession(ctx.directory, completedSession)
    await markRecentBrainstormCompletion(ctx.directory, getToolSessionID(toolContext), completedSession.feature)
    await clearSessionBindingIfCompleted(ctx.directory, toolContext, completedSession)
    return formatGenerationResult(session.feature, designPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedSession = markGenerationFailed(generatingSession, message)
    await saveBrainstormSession(ctx.directory, failedSession)
    return formatGenerationFailure(session.feature, message)
  }
}

async function askSingleQuestion(
  session: BrainstormSession,
  question: BrainstormQuestion,
  toolContext: BrainstormInteractiveToolContext
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

async function resolveFeature(projectDir: string, feature: string | undefined, toolContext: unknown): Promise<string | undefined> {
  if (feature?.trim()) {
    return feature.trim()
  }

  const sessionID = getToolSessionID(toolContext)
  if (!sessionID) {
    return undefined
  }

  const index = await loadBrainstormSessionIndex(projectDir)
  return index.bySessionID[sessionID]?.feature
}

async function loadBrainstormSession(projectDir: string, feature: string): Promise<BrainstormSession> {
  const sessionPath = getBrainstormSessionPath(projectDir, feature)

  try {
    const content = await fs.readFile(sessionPath, 'utf-8')
    return normalizeBrainstormSession(feature, JSON.parse(content) as unknown)
  } catch {
    return createInitialBrainstormSession(feature)
  }
}

async function saveBrainstormSession(projectDir: string, session: BrainstormSession): Promise<void> {
  const sessionDir = createSafePath(projectDir, '.sisyphus', 'brainstorm')
  const sessionPath = getBrainstormSessionPath(projectDir, session.feature)
  session.updatedAt = new Date().toISOString()
  await fs.mkdir(sessionDir, { recursive: true })
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8')
}

function getBrainstormSessionPath(projectDir: string, feature: string): string {
  return createSafePath(projectDir, '.sisyphus', 'brainstorm', `${feature}.json`)
}

function getBrainstormSessionIndexPath(projectDir: string): string {
  return createSafePath(projectDir, '.sisyphus', 'brainstorm', 'active.json')
}

async function loadBrainstormSessionIndex(projectDir: string): Promise<BrainstormSessionIndex> {
  const indexPath = getBrainstormSessionIndexPath(projectDir)

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<BrainstormSessionIndex>
    return {
      bySessionID: parsed.bySessionID && typeof parsed.bySessionID === 'object' ? parsed.bySessionID : {},
    }
  } catch {
    return { bySessionID: {} }
  }
}

async function saveBrainstormSessionIndex(projectDir: string, index: BrainstormSessionIndex): Promise<void> {
  const indexPath = getBrainstormSessionIndexPath(projectDir)
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function bindSessionToFeature(projectDir: string, toolContext: unknown, feature: string): Promise<void> {
  const sessionID = getToolSessionID(toolContext)
  if (!sessionID) return

  const index = await loadBrainstormSessionIndex(projectDir)
  index.bySessionID[sessionID] = {
    feature,
    updatedAt: new Date().toISOString(),
  }
  await saveBrainstormSessionIndex(projectDir, index)
}

async function clearSessionBindingIfCompleted(projectDir: string, toolContext: unknown, session: BrainstormSession): Promise<void> {
  if (session.workflowState !== 'completed') return

  const sessionID = getToolSessionID(toolContext)
  if (!sessionID) return

  const index = await loadBrainstormSessionIndex(projectDir)
  if (!index.bySessionID[sessionID]) return
  delete index.bySessionID[sessionID]
  await saveBrainstormSessionIndex(projectDir, index)
}

function getToolSessionID(toolContext: unknown): string | undefined {
  if (!toolContext || typeof toolContext !== 'object') {
    return undefined
  }

  return typeof (toolContext as { sessionID?: unknown }).sessionID === 'string'
    ? (toolContext as { sessionID: string }).sessionID
    : undefined
}

function getRecommendedOptions(session: BrainstormSession, question: PersistedBrainstormQuestion): BrainstormOption[] {
  const recommendedLabel = getRecommendedOptionLabel(session, question)

  return question.options.map((option) => ({
    ...option,
    label: option.label === recommendedLabel ? `${option.label} (Recommended)` : option.label,
  }))
}

function normalizeInteractiveAnswer(answer: BrainstormQuestionAnswer | undefined): string | undefined {
  const firstAnswer = answer?.[0]?.trim()
  if (!firstAnswer) return undefined
  return firstAnswer.replace(/\s*\(Recommended\)$/u, '').trim()
}

function validatePendingAnswer(session: BrainstormSession, answer: string): string | undefined {
  const pendingQuestion = getPendingQuestion(session)
  if (!pendingQuestion || !isAwaitingFormalAnswer(session)) {
    return undefined
  }

  const normalized = answer.trim().toLowerCase()
  if (!normalized) {
    return 'Please answer the current brainstorm question before continuing.'
  }

  if (looksLikeLowSignalAnswer(normalized)) {
    return 'That reply is too short to record as the formal brainstorm answer. Please choose an option or provide a short concrete answer.'
  }

  if (looksLikeCommandEcho(normalized)) {
    return 'That looks like a command or command echo, not the answer itself. Please answer the current brainstorm question directly.'
  }

  return undefined
}

function looksLikeLowSignalAnswer(answer: string): boolean {
  return /^(好|好的|行|可以|继续|继续吧|嗯|ok|okay|yes|y|继续推进|下一步)$/i.test(answer)
}

function looksLikeCommandEcho(answer: string): boolean {
  return answer.startsWith('/openflow-') || answer.includes('skill(name="openflow-brainstorm"') || answer.includes("skill(name='openflow-brainstorm'")
}

function hasAskQuestion(value: unknown): value is BrainstormInteractiveToolContext {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'askQuestion' in value && typeof value.askQuestion === 'function'
}

async function generateDesignDocument(
  ctx: OpenFlowContext,
  session: BrainstormSession,
): Promise<{ designPath: string; requirementModel: RequirementModel }> {
  const existingGenerated = session.generatedDocs[0]
  if (existingGenerated) {
    try {
      await fs.access(existingGenerated)
      const existingModel = RequirementModelSchema.parse(
        session.requirementModel ?? buildRequirementModel(session.feature, session.answers)
      )
      return {
        designPath: existingGenerated,
        requirementModel: existingModel,
      }
    } catch {
      void 0
    }
  }

  const baseModel = session.requirementModel ?? buildRequirementModel(session.feature, session.answers)

  let validatedModel: RequirementModel
  try {
    const enrichedModel = await defaultSynthesizer.synthesize(baseModel)
    validatedModel = RequirementModelSchema.parse(enrichedModel)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(error.message)
    }
    throw error
  }

  const workspaceDir = await ensureChangeWorkspacePath(ctx.directory, session.feature)
  const relativeWorkspaceDir = path.relative(ctx.directory, workspaceDir)
  const safeWorkspaceDir = createSafePath(ctx.directory, relativeWorkspaceDir)
  await fs.mkdir(safeWorkspaceDir, { recursive: true })

  const designPath = path.join(safeWorkspaceDir, 'design.md')
  const sidecarPath = path.join(safeWorkspaceDir, 'design.meta.json')
  const content = renderDesignDocument(validatedModel)
  await fs.writeFile(designPath, content, 'utf-8')
  await fs.writeFile(sidecarPath, JSON.stringify(validatedModel, null, 2), 'utf-8')
  return {
    designPath,
    requirementModel: validatedModel,
  }
}

function formatQuestionPrompt(feature: string, session: BrainstormSession, question: BrainstormQuestion): string {
  const options = getRecommendedOptions(session, question)
    .map((option) => `- ${escapeMarkdown(option.label)}: ${escapeMarkdown(option.description)}`)
    .join('\n')

  return `## Brainstorm Question

Feature: ${escapeMarkdown(feature)}

### ${escapeMarkdown(question.header)}
${escapeMarkdown(question.question)}

Options:
${options}

Reply with your answer through the question picker when available.
Otherwise continue with \`/openflow-brainstorm ${escapeMarkdown(feature)}\`
and provide the next answer in the same session.

Progress:
- answered ${Object.keys(session.answers).length}/5
- next question id: \`${escapeMarkdown(question.id)}\``
}

function formatGenerationResult(feature: string, generatedPath: string): string {
  return `## Brainstorm Complete

Feature: ${escapeMarkdown(feature)}

Design document generated:
- \`${escapeMarkdown(generatedPath)}\``
}

function formatGenerationFailure(feature: string, message: string): string {
  return `## Brainstorm Pending

Feature: ${escapeMarkdown(feature)}

All answers are collected, but design generation failed and can be retried.

Error:
- ${escapeMarkdown(message)}

Continue with \`/openflow-brainstorm ${escapeMarkdown(feature)}\` to retry generation.`
}
