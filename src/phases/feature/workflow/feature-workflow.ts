import type { OpenFlowContext } from '../../../types.js'
import { clearRecentFeatureCompletion } from '../../../hooks/feature-workflow.js'
import {
  type FeatureSession,
  markGenerating,
} from '../state-machine.js'

import { OpenFlowError, ErrorCode } from '../../../utils/errors.js'
import { sanitizeFeatureName } from '../../../utils/security.js'
import { logger } from '../../../utils/logger.js'
import { getToolSessionID } from './infra/command-context.js'
import {
  bindSessionToFeature,
  loadFeatureSession,
  saveFeatureSession,
} from './infra/session-store.js'
import {
  formatGenerationResultAll,
  formatLowConfidenceFeatureIdentity,
  formatRecoveryGuidance,
  formatSameSessionSwitchRejection,
  formatStatusSummary,
} from './infra/response.js'
import { getTemplateRequirements, formatTemplateRequirements } from '../readiness-evaluator.js'
import { finalizeFeatureWorkflow } from './finalization.js'
import {
  hasPendingHarvestResponse,
  shouldReturnEarly,
} from './rules/decision.js'
import { resolveFeature, looksLikeFeatureContinuationRequest } from './rules/resolution.js'
import { updateStateMd } from './rules/state-document.js'

export async function runFeatureWorkflow(
  ctx: OpenFlowContext,
  feature?: string,
  _answer?: string,
  action?: 'status' | 'collect' | 'generate',
  facts?: Record<string, string>,
  toolContext?: unknown,
): Promise<string> {
  // ── Phase 1: Initialize session ──
  const initResult = await initializeFeatureSession(ctx, feature, toolContext)
  if (initResult.kind === 'missing') {
    throw new OpenFlowError(
      ErrorCode.INVALID_INPUT,
      'Describe the feature idea in natural language, or continue in a session that already has one active feature.',
    )
  }
  if (initResult.kind === 'low-confidence') {
    return initResult.response
  }

  const { session, sanitizedFeature } = initResult

  // ── Phase 2: Early return guards ──
  if (await shouldReturnEarly(session, undefined)) {
    return formatGenerationResultAll(sanitizedFeature, session.generatedDocs, session.featureTitle)
  }

  if (hasPendingHarvestResponse(session, undefined)) {
    return finalizeFeatureWorkflow(ctx, session, toolContext, undefined)
  }

  if (session.lastError?.includes('upgraded to v4')) {
    return formatRecoveryGuidance(session)
  }

  // ── Phase 3: Action dispatch ──
  const effectiveAction = action ?? 'status'

  switch (effectiveAction) {
    case 'status':
    case 'collect':
      return handleCollectFlow(ctx, session, sanitizedFeature, facts, effectiveAction)
    case 'generate':
      return handleGenerateFlow(ctx, session, sanitizedFeature, toolContext)
    default:
      throw new OpenFlowError(ErrorCode.INVALID_INPUT, `Unknown action: ${effectiveAction}`)
  }
}

// ── Session initialization ──

type SessionInitResult =
  | { kind: 'missing' }
  | { kind: 'low-confidence'; response: string }
  | { kind: 'ok'; session: FeatureSession; sanitizedFeature: string }

async function initializeFeatureSession(
  ctx: OpenFlowContext,
  feature: string | undefined,
  toolContext: unknown,
): Promise<SessionInitResult> {
  const resolvedFeature = await resolveFeature(ctx, feature, toolContext)
  if (resolvedFeature.kind === 'missing') {
    return { kind: 'missing' }
  }

  if (resolvedFeature.identity.lowConfidenceReason) {
    if (resolvedFeature.identity.lowConfidenceReason === 'generic_instruction' && resolvedFeature.identity.sourceIntent) {
      return {
        kind: 'low-confidence',
        response: formatSameSessionSwitchRejection(resolvedFeature.identity.slug, resolvedFeature.identity.sourceIntent),
      }
    }
    return { kind: 'low-confidence', response: formatLowConfidenceFeatureIdentity(resolvedFeature.identity) }
  }

  const sanitizedFeature = sanitizeFeatureName(resolvedFeature.identity.slug)
  let session = await loadFeatureSession(ctx.directory, sanitizedFeature, ctx.config.paths.feature_state)
  session = mergeIdentity(session, resolvedFeature.identity)
  session = applyContinuationIdentity(session, feature, resolvedFeature.identity)

  await bindSessionToFeature(ctx.directory, toolContext, sanitizedFeature, ctx.config.paths.feature_state)
  await clearRecentFeatureCompletion(ctx.directory, getToolSessionID(toolContext))

  return { kind: 'ok', session, sanitizedFeature }
}

// ── Collect flow (status + collect) ──

async function handleCollectFlow(
  ctx: OpenFlowContext,
  session: FeatureSession,
  sanitizedFeature: string,
  facts: Record<string, string> | undefined,
  effectiveAction: 'status' | 'collect',
): Promise<string> {
  if (facts && effectiveAction === 'collect') {
    const { _remove, ...actualFacts } = facts

    const sanitizedFacts = Object.fromEntries(
      Object.entries(actualFacts).map(([key, value]) => [
        sanitizeFactValue(key),
        sanitizeFactValue(value, key.startsWith('_')),
      ]),
    )

    let updatedFacts = { ...session.collectedFacts, ...sanitizedFacts }

    // _remove: delete specified keys from collected facts
    if (_remove) {
      const keysToRemove = String(_remove).split(',').map((k) => k.trim()).filter(Boolean)
      for (const key of keysToRemove) {
        delete updatedFacts[key]
      }
    }

    session = {
      ...session,
      collectedFacts: updatedFacts,
      updatedAt: new Date().toISOString(),
    }
    await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
    await updateStateMd(ctx, session)
    logger.info('feature', 'facts collected', { feature: sanitizedFeature, factKeys: Object.keys(sanitizedFacts) })
  }

  const requirements = getTemplateRequirements()
  const templateReport = formatTemplateRequirements(requirements)

  const statusSummary = formatStatusSummary(sanitizedFeature, session)

  return statusSummary + '\n\n---\n' + templateReport
}

// ── Generate flow ──

async function handleGenerateFlow(
  ctx: OpenFlowContext,
  session: FeatureSession,
  sanitizedFeature: string,
  toolContext: unknown,
): Promise<string> {
  if (session.workflowState === 'complete' || session.workflowState === 'ready_to_generate') {
    return finalizeFeatureWorkflow(ctx, session, toolContext, undefined)
  }

  logger.info('feature', 'starting document generation', { feature: sanitizedFeature })
  session = markGenerating(session)
  await saveFeatureSession(ctx.directory, session, ctx.config.paths.feature_state)
  const result = await finalizeFeatureWorkflow(ctx, session, toolContext, undefined)
  return result
}

function sanitizeFactValue(value: string, allowExtended = false): string {
  return value.trim().slice(0, allowExtended ? 16384 : 256)
}

function applyContinuationIdentity(
  session: FeatureSession,
  feature: string | undefined,
  identity: { sourceIntent?: string | undefined; title?: string | undefined },
): FeatureSession {
  if (!feature?.trim() || !looksLikeFeatureContinuationRequest(feature) || !identity.sourceIntent) {
    return session
  }

  return {
    ...session,
    collectedFacts: {
      ...session.collectedFacts,
      ...(identity.sourceIntent ? { problem: identity.sourceIntent } : {}),
    },
    draftStatus: 'draft_with_assumptions',
    assumptions: uniqueStrings([
      ...session.assumptions,
      'Feature intent inferred from session context; details may need refinement.',
    ]),
  }
}

function mergeIdentity(session: FeatureSession, identity: { title?: string | undefined; sourceIntent?: string | undefined }): FeatureSession {
  return {
    ...session,
    featureTitle: session.featureTitle ?? identity.title,
    sourceIntent: session.sourceIntent ?? identity.sourceIntent,
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
