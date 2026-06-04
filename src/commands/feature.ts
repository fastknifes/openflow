import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ZodError } from 'zod'
import type { OpenFlowContext } from '../types.js'
import { ensureChangeWorkspacePath } from '../config.js'
import { t, tArray } from '../i18n/index.js'
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
import { logger } from '../utils/logger.js'
import { deriveFeatureIdentity, type DerivedFeatureIdentity } from '../utils/feature-resolver.js'
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
  type PostDesignDecision,
  shouldGenerateDesign,
} from '../phases/feature/state-machine.js'
import {
  askGuardedQuestion,
  hasAskQuestion,
  type QuestionToolContext,
  type QuestionGuardResult,
} from '../utils/question-guard.js'
import {
  discoverContextPackets,
  renderHarvestSummary,
  renderMultiCandidateSummary,
  resolveHarvestChoice,
  parseHarvestResponse,
  applyHarvestToSession,
  applyConfirmedHarvestToRequirementModel,
  parseItemSelection,
  type HarvestChoice,
} from '../phases/feature/context-harvest.js'

interface FeatureSessionIndex {
  bySessionID: Record<string, { feature: string; updatedAt: string }>
}

type FeatureResolution =
  | { kind: 'resolved'; identity: DerivedFeatureIdentity }
  | { kind: 'missing' }

export async function handleFeature(
  ctx: OpenFlowContext,
  feature?: string,
  answer?: string,
  toolContext?: unknown
): Promise<string> {
  const resolvedFeature = await resolveFeature(ctx, feature, toolContext)
  if (resolvedFeature.kind === 'missing') {
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      'Describe the feature idea in natural language, or continue in a session that already has one active feature.'
    )
  }

  if (resolvedFeature.identity.lowConfidenceReason) {
    // Same-session switching rejection: if session has an active feature and
    // the user tried to start a different one, show explicit rejection message
    if (resolvedFeature.identity.lowConfidenceReason === 'generic_instruction' && resolvedFeature.identity.sourceIntent) {
      return formatSameSessionSwitchRejection(resolvedFeature.identity.slug, resolvedFeature.identity.sourceIntent)
    }
    return formatLowConfidenceFeatureIdentity(resolvedFeature.identity)
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature.identity.slug)
  let session = await loadFeatureSession(ctx.directory, sanitizedFeature, ctx.config.paths.feature_state)
  session = mergeIdentity(session, resolvedFeature.identity)

  // Auto-fill session for continuation requests to skip question collection
  if (feature?.trim() && looksLikeFeatureContinuationRequest(feature) && resolvedFeature.identity.sourceIntent) {
    session = {
      ...session,
      answers: {
        ...session.answers,
        problem: resolvedFeature.identity.sourceIntent,
      },
      skippedQuestionIds: uniqueQuestionIds([...session.skippedQuestionIds, 'scope', 'constraints', 'priority']),
      draftStatus: 'draft_with_assumptions',
      assumptions: uniqueStrings([
        ...session.assumptions,
        'Feature intent inferred from session context; details may need refinement.',
      ]),
    }
  }

  await bindSessionToFeature(ctx.directory, toolContext, sanitizedFeature, ctx.config.paths.feature_state)
  await clearRecentFeatureCompletion(ctx.directory, getToolSessionID(toolContext))

  if (session.workflowState === 'complete' && session.generatedDocs.length > 0 && !answer?.trim()) {
    return formatGenerationResultAll(sanitizedFeature, session.generatedDocs, session.featureTitle)
  }

  if (
    session.pendingContextHarvest?.awaitingPacketId &&
    answer?.trim() &&
    parseHarvestResponse(answer.trim())
  ) {
    return finalizeFeature(ctx, session, toolContext, answer)
  }

  if (answer?.trim()) {
    const messageID = getToolMessageID(toolContext)
    if (messageID && session.lastConsumedMessageId === messageID) {
        const convergence = evaluateFeatureConvergence(session, answer)
        if (convergence.kind === 'ask_next' && convergence.question) {
          session = markQuestionPrompted(session, convergence.question.id)
          await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
          return formatQuestionPrompt(sanitizedFeature, session, convergence.question, convergence.rationale)
        }

        if (shouldGenerateDesign(session) || convergence.kind !== 'ask_next') {
          return finalizeFeature(ctx, session, toolContext, answer)
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
      await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
      await updateStateMd(ctx, session)
      return `${validationError}\n\n${formatQuestionPrompt(sanitizedFeature, session, pendingQuestion)}`
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
    await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    // Update state.md as the design-stage Feature Brief after each answer
    await updateStateMd(ctx, session)
  }

  // Handle failed/draft_blocked state: return recovery guidance instead of silently retrying
  if (session.workflowState === 'failed' && session.generatedDocs.length === 0) {
    return formatRecoveryGuidance(session)
  }
  if (session.workflowState === 'draft_blocked') {
    return formatRecoveryGuidance(session)
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
    await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    return finalizeFeature(ctx, session, toolContext, answer)
  }

  const pendingQuestion = convergence.question ?? getPendingQuestion(session)
  if (!pendingQuestion) {
    return finalizeFeature(ctx, session, toolContext, answer)
  }

  const wasQuestionPickerAlreadyPrompted = session.questionPickerPromptedIds.includes(pendingQuestion.id)
  session = markQuestionPrompted(session, pendingQuestion.id)
  await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)

  if (hasAskQuestion(toolContext) && !answer?.trim() && isAwaitingFormalAnswer(session) && !wasQuestionPickerAlreadyPrompted) {
    logger.info('feature', 'invoking question picker', { questionId: pendingQuestion.id, feature: sanitizedFeature })
    const guardResult = await askSingleQuestion(session, pendingQuestion, toolContext)

    // Update session with guard state so recursive calls see the persisted prompt record.
    // NOTE: we intentionally do NOT set lastConsumedMessageId here.
    // lastConsumedMessageId tracks the user's answer message, not the question prompt.
    // Setting it here would cause the recursive call to hit the duplicate-message guard
    // in handleFeature before applyFeatureAnswer runs, skipping answer application.
    if (guardResult.updatedPromptedIds.length > session.questionPickerPromptedIds.length) {
      session = markQuestionPickerPrompted(session, pendingQuestion.id)
    }
    await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)

    if (guardResult.answer) {
      logger.info('feature', 'question answered, recursing handleFeature', { questionId: pendingQuestion.id, answerLength: guardResult.answer.length })
      return handleFeature(ctx, sanitizedFeature, guardResult.answer, toolContext)
    }

    // Defense: if guard prevented re-prompt (duplicate message or already prompted),
    // return text guidance instead of hanging or popping the picker again.
    if (guardResult.wasAlreadyPrompted || guardResult.wasDuplicateMessage) {
      logger.info('feature', 'question guard prevented re-prompt', { questionId: pendingQuestion.id, wasAlreadyPrompted: guardResult.wasAlreadyPrompted, wasDuplicateMessage: guardResult.wasDuplicateMessage })
      return `${formatQuestionPrompt(sanitizedFeature, session, pendingQuestion, convergence.rationale)}\n\n> ${t('commands.feature.guardAlreadyPrompted')}`
    }
  }

  return formatQuestionPrompt(sanitizedFeature, session, pendingQuestion, convergence.rationale)
}

async function applyHarvestChoiceAndSave(
  ctx: OpenFlowContext,
  session: FeatureSession,
  choice: HarvestChoice,
  ignoredIds: string[],
): Promise<FeatureSession> {
  if (choice.kind === 'ignore') {
    session = {
      ...session,
      pendingContextHarvest: {
        ignoredPacketIds: [...ignoredIds, choice.candidate.packet.id],
      },
    }
  } else {
    session = applyHarvestToSession(session, choice)
    session = {
      ...session,
      pendingContextHarvest: {
        ...session.pendingContextHarvest,
        ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? ignoredIds,
      },
    }
  }
  await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
  return session
}

async function finalizeFeature(
  ctx: OpenFlowContext,
  session: FeatureSession,
  toolContext?: unknown,
  answer?: string,
): Promise<string> {
  const existingGenerated = session.generatedDocs[0]
  if (session.workflowState === 'complete' && existingGenerated && !answer?.trim()) {
    return formatGenerationResultAll(session.feature, session.generatedDocs, session.featureTitle, session.requirementModel)
  }

  // --- Context Harvest ---
  const ignoredIds = session.pendingContextHarvest?.ignoredPacketIds ?? []
  let candidates: import('../phases/feature/context-harvest.js').HarvestCandidate[] = []

  try {
    candidates = await discoverContextPackets(
      ctx.directory,
      getToolSessionID(toolContext),
      session.feature,
      ignoredIds,
    )
  } catch {
    // Fail-safe: discovery errors fall through to normal generation
    candidates = []
  }

  // Handle a pending harvest response from a previous turn
  if (session.pendingContextHarvest?.awaitingPacketId && answer?.trim()) {
    const directive = parseHarvestResponse(answer.trim())
    const candidate = candidates.find(
      (c) => c.packet.id === session.pendingContextHarvest!.awaitingPacketId,
    )

    if (directive && candidate) {
      if (directive === 'ignore') {
        session = {
          ...session,
          pendingContextHarvest: {
            ignoredPacketIds: [...ignoredIds, candidate.packet.id],
          },
        }
        candidates = candidates.filter((c) => c.packet.id !== candidate.packet.id)
      } else if (directive === 'use') {
        session = applyHarvestToSession(session, { kind: 'use', candidate })
        session = {
          ...session,
          pendingContextHarvest: {
            ...session.pendingContextHarvest,
            ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? ignoredIds,
          },
        }
      } else if (directive === 'edit') {
        const editText = answer.trim().replace(/^edit[\s:]*/iu, '').trim()
        const editedItems = parseItemSelection(editText, candidate.items)
        session = applyHarvestToSession(session, {
          kind: 'edit',
          candidate,
          editedItems,
          editNote: editText || undefined,
        })
        session = {
          ...session,
          pendingContextHarvest: {
            ...session.pendingContextHarvest,
            ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? ignoredIds,
          },
        }
      }
      await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
      // Fall through to generation below
    } else {
      // Not a recognised harvest response → clear pending and fall back
      session = { ...session, pendingContextHarvest: undefined }
      await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    }
  }

  // If there are unconfirmed candidates, present them before generating
  if (
    candidates.length > 0 &&
    !session.pendingContextHarvest?.confirmedPacketId
  ) {
    const summary =
      candidates.length === 1
        ? renderHarvestSummary(candidates[0]!)
        : renderMultiCandidateSummary(candidates)

    // Interactive mode
    if (hasAskQuestion(toolContext)) {
      const choice = await resolveHarvestChoice(toolContext, candidates)
      if (choice) {
        session = await applyHarvestChoiceAndSave(ctx, session, choice, ignoredIds)
        // Fall through to generation
      } else {
        // Cancelled / failed → non-interactive fallback prompt
        session = {
          ...session,
          pendingContextHarvest: {
            ignoredPacketIds: ignoredIds,
            awaitingPacketId: candidates[0]!.packet.id,
          },
        }
        await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
        return `${summary}\n\nPlease reply with **use**, **edit**, or **ignore** to proceed.`
      }
    } else {
      // Non-interactive: print summary and wait for confirmation
      session = {
        ...session,
        pendingContextHarvest: {
          ignoredPacketIds: ignoredIds,
          awaitingPacketId: candidates[0]!.packet.id,
        },
      }
      await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
      return `${summary}\n\nPlease reply with **use**, **edit**, or **ignore** to proceed.`
    }
  }

  if (session.draftStatus === 'final' && hasBlockingHarvestOpenQuestion(session)) {
    await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    return formatHarvestOpenQuestionBlock(session)
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
    await saveFeatureSession(ctx.directory, generatingSession, ctx.config.paths.feature_state)

    const { designPath, behaviorPath, requirementModel: validatedModel } = await generateDesignDocument(ctx, generatingSession)
    const allGeneratedDocs = [designPath]
    if (behaviorPath) {
      allGeneratedDocs.push(behaviorPath)
    }
    let completedSession = markCompleted(
      {
        ...generatingSession,
        requirementModel: validatedModel,
        generatedDocs: allGeneratedDocs,
      },
      allGeneratedDocs
    )
    await saveFeatureSession(ctx.directory, completedSession, ctx.config.paths.feature_state)
    await markRecentFeatureCompletion(ctx.directory, getToolSessionID(toolContext), completedSession.feature)

    const baseResult = formatGenerationResultAll(session.feature, completedSession.generatedDocs, completedSession.featureTitle, validatedModel)

    if (hasAskQuestion(toolContext) && !completedSession.postDesignDecision) {
      const decision = await askPostDesignConfirmation(toolContext, validatedModel)
      if (decision) {
        completedSession = {
          ...completedSession,
          postDesignDecision: decision,
        }
        await saveFeatureSession(ctx.directory, completedSession, ctx.config.paths.feature_state)
        return `${baseResult}\n\n${formatPostDesignDecisionResult(decision, session.feature, validatedModel)}`
      }
    }

    if (!hasAskQuestion(toolContext)) {
      return `${baseResult}\n\n${formatNextStepOptions(session.feature)}`
    }

    return baseResult
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedSession = markGenerationFailed(markGenerating(session), message)
    await saveFeatureSession(ctx.directory, failedSession, ctx.config.paths.feature_state)
    return formatGenerationFailure(session.feature, message)
  }
}

function hasBlockingHarvestOpenQuestion(session: FeatureSession): boolean {
  return session.pendingConfirmations.some((item) => item.startsWith('Open question from brainstorm'))
}

function formatHarvestOpenQuestionBlock(session: FeatureSession): string {
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
  toolContext: QuestionToolContext
): Promise<QuestionGuardResult> {
  return askGuardedQuestion(
    {
      sessionID: toolContext.sessionID,
      messageID: getToolMessageID(toolContext),
      askQuestion: toolContext.askQuestion,
    },
    {
      id: question.id,
      header: question.header,
      question: question.question,
      options: getRecommendedOptions(session, question),
      multiple: false,
      custom: true,
    },
    {
      promptedIds: session.questionPickerPromptedIds,
      lastMessageId: session.lastConsumedMessageId,
    },
  )
}

async function resolveFeature(ctx: OpenFlowContext, feature: string | undefined, toolContext: unknown): Promise<FeatureResolution> {
  if (feature?.trim()) {
    if (looksLikeFeatureContinuationRequest(feature)) {
      const continued = await resolveContinuationFeature(ctx, toolContext)
      if (continued) return { kind: 'resolved', identity: continued }
    }

    // Reject same-session feature switching: if this session already has a feature,
    // don't allow switching to a different one
    const sessionID = getToolSessionID(toolContext)
    if (sessionID) {
      const index = await loadFeatureSessionIndex(ctx.directory, ctx.config.paths.feature_state)
      const activeFeature = index.bySessionID[sessionID]?.feature
      if (activeFeature) {
        // Session already has a feature - check if the new text refers to the same feature
        const newIdentity = deriveFeatureIdentity(feature)
        if (newIdentity.slug !== activeFeature) {
          // Different feature - explicit session-guard rejection
          return {
            kind: 'resolved',
            identity: {
              slug: activeFeature,
              sourceIntent: feature,
              lowConfidenceReason: 'generic_instruction' as const,
            },
          }
        }
        // Same feature - allow (re-entry/continuation)
        return { kind: 'resolved', identity: { slug: activeFeature, sourceIntent: feature } }
      }
    }

    return { kind: 'resolved', identity: deriveFeatureIdentity(feature) }
  }

  const sessionID = getToolSessionID(toolContext)
  if (sessionID) {
    const index = await loadFeatureSessionIndex(ctx.directory, ctx.config.paths.feature_state)
    const activeFeature = index.bySessionID[sessionID]?.feature
    if (activeFeature) {
      return { kind: 'resolved', identity: { slug: activeFeature } }
    }
  }

  const inferredFromCurrentSession = await inferFeatureIdentityFromSessionHistory(ctx, sessionID)
  return inferredFromCurrentSession
    ? { kind: 'resolved', identity: inferredFromCurrentSession }
    : { kind: 'missing' }
}

function looksLikeFeatureContinuationRequest(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  const continuationKeywords = tArray('signals.feature.continuation.keywords')
  const excludeKeywords = tArray('signals.feature.continuation.exclude')
  return new RegExp(`(?:${continuationKeywords.join('|')})`, 'iu').test(normalized)
    && !new RegExp(`(?:${excludeKeywords.join('|')})`, 'u').test(value)
}

async function resolveContinuationFeature(ctx: OpenFlowContext, toolContext: unknown): Promise<DerivedFeatureIdentity | undefined> {
  const sessionID = getToolSessionID(toolContext)
  if (sessionID) {
    const index = await loadFeatureSessionIndex(ctx.directory, ctx.config.paths.feature_state)
    const activeFeature = index.bySessionID[sessionID]?.feature
    if (activeFeature) {
      return { slug: activeFeature }
    }
  }

  return inferFeatureIdentityFromSessionHistory(ctx, sessionID)
}

async function inferFeatureIdentityFromSessionHistory(ctx: OpenFlowContext, sessionID: string | undefined): Promise<DerivedFeatureIdentity | undefined> {
  if (!sessionID) return undefined
  const client = (ctx.client as { session?: { messages?: (args: unknown) => Promise<unknown> } }).session
  if (!client?.messages) return undefined

  let response: unknown
  try {
    response = await client.messages({
      path: { id: sessionID },
      query: { directory: ctx.directory },
    })
  } catch {
    try {
      response = await client.messages({ id: sessionID, directory: ctx.directory })
    } catch {
      return undefined
    }
  }

  const text = extractRecentAssistantText(response)
  return inferFeatureIdentityFromText(text)
}

function extractRecentAssistantText(response: unknown): string {
  const records = extractMessageRecords(response)
  const assistantTexts = records
    .filter((record) => record.role !== 'user')
    .map((record) => record.text)
    .filter(Boolean)

  return assistantTexts.slice(-6).join('\n\n')
}

function extractMessageRecords(value: unknown): Array<{ role?: string; text: string }> {
  if (Array.isArray(value)) {
    return value.flatMap(extractMessageRecords)
  }

  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>

  for (const key of ['messages', 'data', 'items', 'results']) {
    const nested = record[key]
    if (Array.isArray(nested)) return extractMessageRecords(nested)
  }

  const role = typeof record.role === 'string'
    ? record.role
    : typeof (record.message as Record<string, unknown> | undefined)?.role === 'string'
      ? ((record.message as Record<string, unknown>).role as string)
      : undefined
  const text = extractTextFromUnknown(record)
  if (!text) return []
  return role ? [{ role, text }] : [{ text }]
}

function extractTextFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractTextFromUnknown).filter(Boolean).join('\n')
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const directText = typeof record.text === 'string'
    ? record.text
    : typeof record.content === 'string'
      ? record.content
      : undefined
  if (directText) return directText

  const parts = Array.isArray(record.parts) ? record.parts : undefined
  if (parts) return parts.map(extractTextFromUnknown).filter(Boolean).join('\n')

  const message = record.message
  if (message && typeof message === 'object') return extractTextFromUnknown(message)
  return ''
}

function inferFeatureIdentityFromText(text: string): DerivedFeatureIdentity | undefined {
  const commandSlug = [...text.matchAll(/\/openflow-feature\s+([a-z0-9][a-z0-9-]{2,63})/giu)]
    .map((match) => match[1])
    .filter(Boolean)
    .pop()
  if (commandSlug) {
    return { slug: commandSlug }
  }

  if (/状态化硬约束|stateful\s+guardrails?/iu.test(text)) {
    return {
      slug: 'stateful-quality-guardrails',
      title: '状态化质量门护栏',
      sourceIntent: '把 OpenFlow 的 quality-gate、readiness freshness、实现期状态从提示型建议升级为状态化硬约束，防止 AI 在未完成验证前声称完成。',
    }
  }

  if (/quality[-\s]?gate/iu.test(text) && /readiness\s+freshness|implementation\s+session|完成声明/u.test(text)) {
    return {
      slug: 'stateful-quality-guardrails',
      title: '状态化质量门护栏',
      sourceIntent: '把 quality-gate、readiness freshness、实现期状态从提示型建议升级为状态化硬约束。',
    }
  }

  return undefined
}

async function loadFeatureSession(projectDir: string, feature: string, featureStateDir: string): Promise<FeatureSession> {
  const sessionPath = getFeatureSessionPath(projectDir, feature, featureStateDir)

  try {
    const content = await fs.readFile(sessionPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') {
      throw new OpenFlowError(
        ErrorCode.INVALID_INPUT,
        `Feature session for "${feature}" is corrupt or unreadable. Please re-describe the feature with /openflow-feature to reinitialize, or delete the session file manually: ${sessionPath}`
      )
    }
    return normalizeFeatureSession(feature, parsed)
  } catch (error) {
    if (error instanceof OpenFlowError) {
      throw error
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return createInitialFeatureSession(feature)
    }
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      `Feature session for "${feature}" is corrupt or unreadable. Please re-describe the feature with /openflow-feature to reinitialize, or delete the session file manually: ${sessionPath}`
    )
  }
}

async function saveFeatureSession(projectDir: string, session: FeatureSession, featureStateDir: string): Promise<void> {
  const sessionDir = createSafePath(projectDir, featureStateDir)
  const sessionPath = getFeatureSessionPath(projectDir, session.feature, featureStateDir)
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
  const sessionModel = RequirementModelSchema.parse({
    ...model,
    featureTitle: session.featureTitle,
    sourceIntent: session.sourceIntent,
    convergenceStatus: session.draftStatus,
    assumptions: session.assumptions,
    pendingConfirmations: session.pendingConfirmations,
  })
  return RequirementModelSchema.parse(
    applyConfirmedHarvestToRequirementModel(
      sessionModel,
      session.pendingContextHarvest?.confirmedItems,
    ),
  )
}

function uniqueQuestionIds(questionIds: FeatureQuestion['id'][]): FeatureQuestion['id'][] {
  return [...new Set(questionIds)]
}

function markQuestionPickerPrompted(session: FeatureSession, questionId: FeatureQuestion['id']): FeatureSession {
  return {
    ...session,
    questionPickerPromptedIds: uniqueQuestionIds([...session.questionPickerPromptedIds, questionId]),
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function getFeatureSessionPath(projectDir: string, feature: string, featureStateDir: string): string {
  return createSafePath(projectDir, featureStateDir, `${feature}.json`)
}

function getFeatureSessionIndexPath(projectDir: string, featureStateDir: string): string {
  return createSafePath(projectDir, featureStateDir, 'active.json')
}

async function loadFeatureSessionIndex(projectDir: string, featureStateDir: string): Promise<FeatureSessionIndex> {
  const indexPath = getFeatureSessionIndexPath(projectDir, featureStateDir)

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

async function saveFeatureSessionIndex(projectDir: string, index: FeatureSessionIndex, featureStateDir: string): Promise<void> {
  const indexPath = getFeatureSessionIndexPath(projectDir, featureStateDir)
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function bindSessionToFeature(projectDir: string, toolContext: unknown, feature: string, featureStateDir: string): Promise<void> {
  const sessionID = getToolSessionID(toolContext)
  if (!sessionID) return

  const index = await loadFeatureSessionIndex(projectDir, featureStateDir)
  index.bySessionID[sessionID] = {
    feature,
    updatedAt: new Date().toISOString(),
  }
  await saveFeatureSessionIndex(projectDir, index, featureStateDir)
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

// hasAskQuestion moved to ../utils/question-guard.js

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

  const workspaceDir = await ensureChangeWorkspacePath(ctx.directory, session.feature, ctx.config)
  const relativeWorkspaceDir = path.relative(ctx.directory, workspaceDir)
  const safeWorkspaceDir = createSafePath(ctx.directory, relativeWorkspaceDir)
  await fs.mkdir(safeWorkspaceDir, { recursive: true })

  const designPath = path.join(safeWorkspaceDir, 'design.md')
  const content = renderDesignDocument(validatedModel)
  const behaviorPath = path.join(safeWorkspaceDir, 'behavior.md')
  const behaviorContent = renderBehaviorDocument(validatedModel)
  const statePath = path.join(safeWorkspaceDir, 'state.md')
  const stateContent = renderFeatureStateDocument(session, validatedModel)
  const allDocuments = await buildCrossValidationDocuments(safeWorkspaceDir)

  const designContent = appendCrossValidationSummary(content, allDocuments)
  const behaviorContentWithSummary = appendCrossValidationSummary(behaviorContent, allDocuments)

  try {
    await writeFileAtomic(statePath, stateContent)
    await fs.writeFile(designPath, designContent, 'utf-8')
    await fs.writeFile(behaviorPath, behaviorContentWithSummary, 'utf-8')
  } catch (error) {
    await Promise.allSettled([
      fs.rm(statePath, { force: true }),
      fs.rm(designPath, { force: true }),
      fs.rm(behaviorPath, { force: true }),
    ])
    throw error
  }

  return {
    designPath,
    behaviorPath,
    requirementModel: validatedModel,
  }
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, content, 'utf-8')
  await fs.rename(tempPath, filePath)
}

async function updateStateMd(ctx: OpenFlowContext, session: FeatureSession): Promise<void> {
  const workspaceDir = await ensureChangeWorkspacePath(ctx.directory, session.feature, ctx.config)
  const relativeWorkspaceDir = path.relative(ctx.directory, workspaceDir)
  const statePath = createSafePath(ctx.directory, relativeWorkspaceDir, 'state.md')

  const answers = Object.entries(session.answers)
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')

  const assumptions = session.assumptions.length > 0
    ? session.assumptions.map((a) => `- ${a}`).join('\n')
    : '- None recorded.'

  const content = `# ${session.feature} Feature State

- Status: \`${session.workflowState}\`
- Feature: \`${session.feature}\`
- Updated At: ${new Date().toISOString()}

## Feature Brief

${session.sourceIntent ?? session.featureTitle ?? session.feature}

## Collected Answers

${answers || '- No answers collected yet.'}

## Assumptions

${assumptions}

## Pending Confirmations

${session.pendingConfirmations.length > 0 ? session.pendingConfirmations.map((c) => `- ${c}`).join('\n') : '- None.'}
`

  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await writeFileAtomic(statePath, content)
}

function renderFeatureStateDocument(session: FeatureSession, model: RequirementModel): string {
  const constraints = model.constraints.length > 0
    ? model.constraints.map((constraint) => `- ${escapeMarkdown(constraint.description)}`).join('\n')
    : '- None recorded.'
  const modelAssumptions = model.assumptions ?? []
  const assumptions = modelAssumptions.length > 0
    ? modelAssumptions.map((assumption) => `- ${escapeMarkdown(assumption)}`).join('\n')
    : '- None recorded.'

  return `# ${escapeMarkdown(session.feature)} Feature State

- Status: \`complete\`
- Feature: \`${escapeMarkdown(session.feature)}\`
- Updated At: ${new Date().toISOString()}

## Feature Brief

${escapeMarkdown(model.problemStatement ?? model.sourceIntent ?? session.sourceIntent ?? session.feature)}

## Constraints

${constraints}

## Assumptions

${assumptions}
`
}

async function buildCrossValidationDocuments(workspaceDir: string): Promise<Array<{ name: string; content: string }>> {
  const requiredOrder = ['requirements.md', 'prd.md', 'design.md', 'behavior.md', 'decisions.md']
  const documents: Array<{ name: string; content: string }> = []

  for (const docName of requiredOrder) {
    const docPath = path.join(workspaceDir, docName)
    try {
      const body = await fs.readFile(docPath, 'utf-8')
      if (body.trim()) {
        documents.push({ name: docName, content: body })
      }
    } catch {
      // File does not exist — skip (conditional document)
    }
  }

  return documents
}

function formatSameSessionSwitchRejection(activeFeature: string, attemptedInput: string): string {
  return `## Same-Session Feature Switch Rejected

This session already has an active feature: \`${escapeMarkdown(activeFeature)}\`.

Your input was interpreted as a request for a different feature:
> ${escapeMarkdown(attemptedInput.slice(0, 200))}

OpenFlow does not allow switching to a different feature within the same session. To continue:

1. **Continue with the current feature**: use natural language to refine or answer pending questions about \`${escapeMarkdown(activeFeature)}\`.
2. **Start a new session**: to work on a different feature, create a new session and run \`/openflow-feature\` there.`
}

function formatRecoveryGuidance(session: FeatureSession): string {
  const stateLabel = session.workflowState === 'failed' ? 'failed' : 'draft_blocked'
  const errorDetail = session.lastError ? `\n\nError: ${escapeMarkdown(session.lastError)}` : ''

  return `## Feature Recovery Needed

Feature: \`${escapeMarkdown(session.feature)}\`
State: \`${stateLabel}\`
Attempts: ${session.generationAttemptCount}${errorDetail}

The feature design is in a non-recoverable ${stateLabel} state. To proceed:

1. **Re-describe the feature**: run \`/openflow-feature ${escapeMarkdown(session.feature)}\` in a new session to start fresh.
2. **Delete session state**: manually remove \`.sisyphus/feature/${escapeMarkdown(session.feature)}.json\` and retry.

OpenFlow will not silently retry generation from a ${stateLabel} state.`
}

function appendCrossValidationSummary(content: string, documents: Array<{ name: string; content: string }>): string {
  const checkedDocuments = documents
    .filter((document) => document.content.trim().length > 0)

  // Structural checks: verify each document has basic structure
  const gaps: Array<{ severity: 'non_blocking' | 'blocking' | 'critical_blocking'; description: string }> = []

  for (const doc of checkedDocuments) {
    const body = doc.content.trim()

    // Check for empty sections (placeholders)
    const placeholderMatch = body.match(/(?:TBD|TODO|FIXME|待定|待补充)[^\n]*/gi)
    if (placeholderMatch) {
      gaps.push({
        severity: 'non_blocking',
        description: `${doc.name}: contains ${placeholderMatch.length} placeholder(s): ${placeholderMatch.slice(0, 3).join(', ')}`,
      })
    }

    // Check for required sections based on document type
    if (doc.name === 'design.md') {
      if (!/^#+\s+(?:Overview|概述)/mu.test(body)) {
        gaps.push({ severity: 'blocking', description: 'design.md: missing Overview section' })
      }
    }
    if (doc.name === 'behavior.md') {
      if (!/^#+\s+(?:Scenario|场景|Behavior|行为)/mu.test(body)) {
        gaps.push({ severity: 'blocking', description: 'behavior.md: missing Scenario/Behavior section' })
      }
    }
  }

  // Cross-reference check: design.md constraints should appear in behavior.md scenarios
  const designDoc = checkedDocuments.find((d) => d.name === 'design.md')
  const behaviorDoc = checkedDocuments.find((d) => d.name === 'behavior.md')
  if (designDoc && behaviorDoc) {
    const designConstraints = designDoc.content.match(/^[-*]\s+.*(?:must|必须|shall|不得|禁止)/gimu)
    if (designConstraints && designConstraints.length > 0) {
      // Basic check: behavior doc should have meaningful content matching constraint count
      const behaviorSections = behaviorDoc.content.match(/^#{2,}\s+/gm)
      if (!behaviorSections || behaviorSections.length < 2) {
        gaps.push({
          severity: 'non_blocking',
          description: 'behavior.md: may not cover all design constraints (few scenario sections found)',
        })
      }
    }
  }

  // Critical Blocking checks: security, permissions, data deletion, automatic execution
  for (const doc of checkedDocuments) {
    const body = doc.content.toLowerCase()

    // Security-sensitive patterns that must have explicit mitigations
    if (/(?:删除.*数据|drop\s+table|truncate|rm\s+-rf|delete\s+from)/iu.test(body)) {
      if (!/(?:软删除|soft.delete|backup|备份|undo|回滚|rollback|cascade.*off)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: data deletion without explicit backup/rollback mitigation`,
        })
      }
    }

    // Permission/access control without explicit check
    if (/(?:sudo|root|admin.*password|secret.*key|api[_-]?key|access[_-]?token)/iu.test(body)) {
      if (!/(?:permission|权限|authorization|auth|access[_-]?control|role|角色)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: sensitive credential/permission reference without access control`,
        })
      }
    }

    // Automatic execution without safety guard
    if (/(?:自动执行|auto.*execute|cron|schedule|webhook.*trigger|自动部署)/iu.test(body)) {
      if (!/(?:confirmation|确认|guard|guardrail|安全|dry[_-]?run|sandbox)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: automatic execution without safety guard/confirmation`,
        })
      }
    }

    // Cross-session or global state mutation
    if (/(?:全局|global|cross[_-]?session|所有用户|all[_-]?users)/iu.test(body)) {
      if (!/(?:atomic|原子|lock|锁|transaction|事务|隔离|isolation)/iu.test(body)) {
        gaps.push({
          severity: 'critical_blocking',
          description: `${doc.name}: global/cross-session state mutation without isolation mechanism`,
        })
      }
    }
  }

  const criticalGaps = gaps.filter((g) => g.severity === 'critical_blocking')
  const blockingGaps = gaps.filter((g) => g.severity === 'blocking')
  const nonBlockingGaps = gaps.filter((g) => g.severity === 'non_blocking')

  const overallStatus = criticalGaps.length > 0 ? 'Critical Blocking'
    : blockingGaps.length > 0 ? 'Blocking'
    : 'Passed'

  const checkedList = checkedDocuments
    .map((document) => `- ${document.name}: present`)
    .join('\n')

  const gapSummary = gaps.length > 0
    ? `\n\n### Gap Classification\n${gaps.map((g) => `- [${g.severity.replace('_', ' ')}] ${g.description}`).join('\n')}`
    : ''

  const statsLine = criticalGaps.length > 0
    ? `- Critical Blocking gaps: ${criticalGaps.length}`
    : blockingGaps.length > 0
      ? `- Blocking gaps: ${blockingGaps.length}`
      : `- Non-blocking gaps: ${nonBlockingGaps.length}`

  return `${content.trimEnd()}

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: ${overallStatus}
- Documents checked in order:
${checkedList}
${statsLine}${gapSummary}
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
`
}

function getToolMessageID(toolContext: unknown): string | undefined {
  if (!toolContext || typeof toolContext !== 'object') {
    return undefined
  }

  return typeof (toolContext as { messageID?: unknown }).messageID === 'string'
    ? (toolContext as { messageID: string }).messageID
    : undefined
}

async function askPostDesignConfirmation(toolContext: unknown, _model?: RequirementModel): Promise<PostDesignDecision | undefined> {
  if (!hasAskQuestion(toolContext)) return undefined

  const result = await askGuardedQuestion(
    toolContext,
    {
      id: 'post-design-confirmation',
      header: t('commands.feature.nextStepHeader'),
      question: t('commands.feature.nextStepQuestion'),
      options: [
        { label: t('commands.feature.nextStepOptionPlan'), description: t('commands.feature.nextStepOptionPlanDesc') },
        { label: t('commands.feature.nextStepOptionReview'), description: t('commands.feature.nextStepOptionReviewDesc') },
        { label: t('commands.feature.nextStepOptionInspect'), description: t('commands.feature.nextStepOptionInspectDesc') },
      ],
      multiple: false,
      custom: false,
    },
  )

  const answer = result.answer
  if (answer === t('commands.feature.nextStepOptionPlan')) {
    return 'proceed_to_plan'
  }

  if (answer === t('commands.feature.nextStepOptionReview')) {
    return 'review_docs'
  }

  if (answer === t('commands.feature.nextStepOptionInspect')) {
    return 'inspect'
  }

  return undefined
}

function formatNextStepOptions(feature: string): string {
  return `## Next Step Options

- ${t('commands.feature.nextStepOptionPlan')}: ${t('commands.feature.nextStepOptionPlanDesc')}
- ${t('commands.feature.nextStepOptionReview')}: ${t('commands.feature.nextStepOptionReviewDesc')}
- ${t('commands.feature.nextStepOptionInspect')}: ${t('commands.feature.nextStepOptionInspectDesc')}

> To proceed, manually run \`/openflow-writing-plan ${escapeMarkdown(feature)}\` when ready.`
}

function formatPostDesignDecisionResult(decision: PostDesignDecision, feature: string, model?: RequirementModel): string {
  if (decision === 'proceed_to_plan') {
    return `## Post-Design Confirmation

Design is ready for implementation planning. To generate the plan, manually run:

\`\`\`
/openflow-writing-plan ${escapeMarkdown(feature)}
\`\`\`

OpenFlow will not run this automatically; start it only when you are ready.`
  }

  if (decision === 'review_docs') {
    return formatDesignDocumentReview(model)
  }

  return `## Documents Ready

The generated design documents are ready for inspection. Review them before choosing whether to proceed to planning or refine constraints.`
}

function formatDesignDocumentReview(model?: RequirementModel): string {
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

function formatQuestionPrompt(feature: string, session: FeatureSession, question: FeatureQuestion, rationale?: string): string {
  const options = getRecommendedOptions(session, question)
    .map((option) => `- ${escapeMarkdown(option.label)}: ${escapeMarkdown(option.description)}`)
    .join('\n')

  const explanation = rationale ? `

Why this matters: ${escapeMarkdown(rationale)}` : ''
  const acknowledgement = Object.keys(session.answers).length > 0
    ? `

What is clear now: ${escapeMarkdown(formatKnownAnswerSummary(session))}`
    : ''

  return `## Feature Question

Feature: ${escapeMarkdown(session.featureTitle ?? feature)}
Internal slug: \`${escapeMarkdown(feature)}\`
${acknowledgement}

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

function formatKnownAnswerSummary(session: FeatureSession): string {
  const parts = [
    session.answers.problem ? `problem = ${session.answers.problem}` : '',
    session.answers['target-users'] ? `target users = ${session.answers['target-users']}` : '',
    session.answers.scope ? `scope = ${session.answers.scope}` : '',
    session.answers.priority ? `priority = ${session.answers.priority}` : '',
    session.answers.constraints ? `constraints = ${session.answers.constraints}` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('; ') : 'no confirmed answers yet'
}

function formatLowConfidenceFeatureIdentity(identity: DerivedFeatureIdentity): string {
  const reason = identity.lowConfidenceReason === 'generic_slug'
    ? 'The provided feature name is too generic to create a durable workspace name.'
    : 'The request describes a workflow action, but not the specific feature or problem to name.'

  return `## Feature Identity Needed

${reason}

Please provide a short, specific feature name or one-sentence intent, for example:

\`quality-gate-stage-applicability\`

OpenFlow will not create a \`feature-*\`, \`future-*\`, or other placeholder workspace from this input.`
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
${constraints}`}

function formatGenerationFailure(feature: string, message: string): string {
  return `## Feature Design Pending

Feature: ${escapeMarkdown(feature)}

All answers are collected, but design generation failed and can be retried.

Error:
- ${escapeMarkdown(message)}

Continue with \`/openflow-feature ${escapeMarkdown(feature)}\` to retry generation.`
}
