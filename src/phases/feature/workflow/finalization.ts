import type { OpenFlowContext } from '../../../types.js'
import {
  discoverContextPackets,
  renderHarvestSummary,
  renderMultiCandidateSummary,
  resolveHarvestChoice,
  parseHarvestResponse,
  applyHarvestToSession,
  parseItemSelection,
  type HarvestCandidate,
  type HarvestChoice,
} from '../context-harvest.js'
import {
  type FeatureSession,
  markCompleted,
  markGenerating,
  markGenerationFailed,
} from '../state-machine.js'
import { markRecentFeatureCompletion } from '../../../hooks/feature-workflow.js'
import { hasAskQuestion } from '../../../utils/question-guard.js'
import { getToolSessionID } from './infra/command-context.js'
import { saveFeatureSession } from './infra/session-store.js'
import {
  formatGenerationFailure,
  formatGenerationResultAll,
  formatHarvestOpenQuestionBlock,
  formatNextStepOptions,
  formatPostDesignDecisionResult,
} from './infra/response.js'
import { shouldReturnEarly } from './rules/decision.js'
import { askPostDesignConfirmation } from './rules/questioning.js'
import { buildSessionRequirementModel, generateDesignDocument, prepareRequirementModel } from './rules/generation.js'

export async function finalizeFeatureWorkflow(
  ctx: OpenFlowContext,
  session: FeatureSession,
  toolContext?: unknown,
  answer?: string,
): Promise<string> {
  if (await shouldReturnEarly(session, answer)) {
    return formatGenerationResultAll(session.feature, session.generatedDocs, session.featureTitle, session.requirementModel, session.designReview)
  }

  const ignoredIds = session.pendingContextHarvest?.ignoredPacketIds ?? []
  let candidates = await discoverHarvestCandidates(ctx, session, toolContext, ignoredIds)

  const harvestResult = await applyPendingHarvestResponse(ctx, session, candidates, ignoredIds, answer)
  session = harvestResult.session
  candidates = harvestResult.candidates

  if (candidates.length > 0 && !session.pendingContextHarvest?.confirmedPacketId) {
    // Auto-inject packets that don't need user confirmation:
    // - v2 raw-message packets
    // - Legacy packets where all items are pre-confirmed (e.g., from legacy brainstorm format)
    const autoInjectCandidate = candidates.find((c) => {
      if (c.packet.rawMessages && c.packet.rawMessages.length > 0) return true
      if (c.items.length > 0 && c.items.every((item) => item.confirmedBy)) return true
      return false
    })
    if (autoInjectCandidate) {
      session = applyHarvestToSession(session, { kind: 'use', candidate: autoInjectCandidate })
      session = preserveIgnoredHarvestIds(session, ignoredIds)
      await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    } else {
      const prompt = await presentHarvestSummary(ctx, session, toolContext, candidates, ignoredIds)
      if (typeof prompt === 'string') {
        return prompt
      }
      session = prompt
    }
  }

  if (session.draftStatus === 'final' && hasBlockingHarvestOpenQuestion(session)) {
    await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    return formatHarvestOpenQuestionBlock(session)
  }

  return generateFeatureDocuments(ctx, session, toolContext)
}

async function discoverHarvestCandidates(
  ctx: OpenFlowContext,
  session: FeatureSession,
  toolContext: unknown,
  ignoredIds: string[],
): Promise<HarvestCandidate[]> {
  try {
    return await discoverContextPackets(
      ctx.directory,
      getToolSessionID(toolContext),
      session.feature,
      ignoredIds,
    )
  } catch {
    return []
  }
}

async function applyPendingHarvestResponse(
  ctx: OpenFlowContext,
  session: FeatureSession,
  candidates: HarvestCandidate[],
  ignoredIds: string[],
  answer?: string,
): Promise<{ session: FeatureSession; candidates: HarvestCandidate[] }> {
  if (!session.pendingContextHarvest?.awaitingPacketId || !answer?.trim()) {
    return { session, candidates }
  }

  const directive = parseHarvestResponse(answer.trim())
  const candidate = candidates.find(
    (item) => item.packet.id === session.pendingContextHarvest!.awaitingPacketId,
  )

  if (directive && candidate) {
    if (directive === 'ignore') {
      session = {
        ...session,
        pendingContextHarvest: {
          ignoredPacketIds: [...ignoredIds, candidate.packet.id],
        },
      }
      candidates = candidates.filter((item) => item.packet.id !== candidate.packet.id)
    } else if (directive === 'use') {
      session = applyHarvestToSession(session, { kind: 'use', candidate })
      session = preserveIgnoredHarvestIds(session, ignoredIds)
    } else if (directive === 'edit') {
      const editText = answer.trim().replace(/^edit[\s:]*/iu, '').trim()
      const editedItems = parseItemSelection(editText, candidate.items)
      session = applyHarvestToSession(session, {
        kind: 'edit',
        candidate,
        editedItems,
        editNote: editText || undefined,
      })
      session = preserveIgnoredHarvestIds(session, ignoredIds)
    }
    await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    return { session, candidates }
  }

  session = { ...session, pendingContextHarvest: undefined }
  await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
  return { session, candidates }
}

async function presentHarvestSummary(
  ctx: OpenFlowContext,
  session: FeatureSession,
  toolContext: unknown,
  candidates: HarvestCandidate[],
  ignoredIds: string[],
): Promise<FeatureSession | string> {
  const summary = candidates.length === 1
    ? renderHarvestSummary(candidates[0]!)
    : renderMultiCandidateSummary(candidates)

  if (hasAskQuestion(toolContext)) {
    const choice = await resolveHarvestChoice(toolContext, candidates)
    if (choice) {
      return applyHarvestChoiceAndSave(ctx, session, choice, ignoredIds)
    }
  }

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
    session = preserveIgnoredHarvestIds(session, ignoredIds)
  }
  await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
  return session
}

async function generateFeatureDocuments(
  ctx: OpenFlowContext,
  session: FeatureSession,
  toolContext: unknown,
): Promise<string> {
  try {
    const requirementModel = await prepareRequirementModel(
      session,
      buildSessionRequirementModel(session),
    )
    const generatingSession = markGenerating({
      ...session,
      requirementModel,
    })
    await saveFeatureSession(ctx.directory, generatingSession, ctx.config.paths.feature_state)

    const { designPath, behaviorPath, requirementModel: validatedModel, designReview } = await generateDesignDocument(ctx, generatingSession)
    const allGeneratedDocs = [designPath]
    if (behaviorPath) {
      allGeneratedDocs.push(behaviorPath)
    }
    let completedSession = markCompleted(
      {
        ...generatingSession,
        requirementModel: validatedModel,
        designReview,
        generatedDocs: allGeneratedDocs,
      },
      allGeneratedDocs,
    )
    await saveFeatureSession(ctx.directory, completedSession, ctx.config.paths.feature_state)
    await markRecentFeatureCompletion(ctx.directory, getToolSessionID(toolContext), completedSession.feature)

    const baseResult = formatGenerationResultAll(session.feature, completedSession.generatedDocs, completedSession.featureTitle, validatedModel, designReview)

    if (hasAskQuestion(toolContext) && !completedSession.postDesignDecision) {
      const decision = await askPostDesignConfirmation(toolContext, validatedModel, designReview)
      if (decision) {
        completedSession = {
          ...completedSession,
          postDesignDecision: decision,
        }
        await saveFeatureSession(ctx.directory, completedSession, ctx.config.paths.feature_state)
        return `${baseResult}\n\n${formatPostDesignDecisionResult(decision, session.feature, validatedModel, designReview)}`
      }
    }

    if (!hasAskQuestion(toolContext)) {
      return `${baseResult}\n\n${formatNextStepOptions(session.feature, designReview)}`
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

function preserveIgnoredHarvestIds(session: FeatureSession, ignoredIds: string[]): FeatureSession {
  return {
    ...session,
    pendingContextHarvest: {
      ...session.pendingContextHarvest,
      ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? ignoredIds,
    },
  }
}
