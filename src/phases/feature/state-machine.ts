import type { ExtractedItem } from './context-packet.js'
import type { RequirementModel } from './requirement-model.js'
import type { DesignReviewReport } from './design-review-report.js'

export type FeatureWorkflowState = 'collecting' | 'ready_to_generate' | 'failed' | 'draft_blocked' | 'complete'
export type FeatureDraftStatus = 'final' | 'draft_with_assumptions'
export type PostDesignDecision = 'proceed_to_plan' | 'review_docs' | 'inspect'

export interface FeatureSession {
  version: 4
  feature: string
  featureTitle?: string | undefined
  sourceIntent?: string | undefined
  workflowState: FeatureWorkflowState
  collectedFacts: Record<string, string>
  assumptions: string[]
  pendingConfirmations: string[]
  draftStatus: FeatureDraftStatus
  postDesignDecision?: PostDesignDecision | undefined
  requirementModel?: RequirementModel | undefined
  designReview?: DesignReviewReport | undefined
  generatedDocs: string[]
  generationAttemptCount: number
  lastConsumedMessageId?: string | undefined
  lastError?: string | undefined
  updatedAt: string
  clarificationState?: {
    round: number
    maxRounds: number
    unresolvedDimensions?: string[]
  } | undefined
  pendingContextHarvest?: {
    awaitingPacketId?: string | undefined
    confirmedPacketId?: string | undefined
    confirmedItems?: ExtractedItem[] | undefined
    ignoredPacketIds: string[]
  } | undefined
}

// Legacy v3 session format (for upgrade detection only)
type LegacyV3Session = {
  version?: number
  feature?: string
  featureTitle?: string
  sourceIntent?: string
  // other v3 fields are ignored
}

export function createInitialFeatureSession(feature: string): FeatureSession {
  return {
    version: 4,
    feature,
    workflowState: 'collecting',
    collectedFacts: {},
    assumptions: [],
    pendingConfirmations: [],
    draftStatus: 'final',
    generatedDocs: [],
    generationAttemptCount: 0,
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeFeatureSession(feature: string, raw: unknown): FeatureSession {
  if (!raw || typeof raw !== 'object') {
    return createInitialFeatureSession(feature)
  }

  const parsed = raw as Partial<FeatureSession> & LegacyV3Session

  // Detect old v3 session and return a fresh v4 with upgrade notice
  if (parsed.version && parsed.version < 4) {
    const upgraded = createInitialFeatureSession(feature)
    upgraded.sourceIntent = typeof parsed.sourceIntent === 'string' ? parsed.sourceIntent : undefined
    upgraded.featureTitle = typeof parsed.featureTitle === 'string' ? parsed.featureTitle : undefined
    upgraded.lastError = 'Feature workflow upgraded to v4. Please re-describe your feature with /openflow-feature.'
    return upgraded
  }

  const collectedFacts =
    typeof parsed.collectedFacts === 'object' && parsed.collectedFacts !== null && !Array.isArray(parsed.collectedFacts)
      ? Object.fromEntries(
          Object.entries(parsed.collectedFacts).filter(
            ([key, value]) => typeof key === 'string' && typeof value === 'string',
          ),
        )
      : {}

  const pendingContextHarvest =
    parsed.pendingContextHarvest && typeof parsed.pendingContextHarvest === 'object'
      ? {
          ...(typeof parsed.pendingContextHarvest.awaitingPacketId === 'string'
            ? { awaitingPacketId: parsed.pendingContextHarvest.awaitingPacketId }
            : {}),
          ...(typeof parsed.pendingContextHarvest.confirmedPacketId === 'string'
            ? { confirmedPacketId: parsed.pendingContextHarvest.confirmedPacketId }
            : {}),
          ...(Array.isArray(parsed.pendingContextHarvest.confirmedItems)
            ? {
                confirmedItems: parsed.pendingContextHarvest.confirmedItems.filter(
                  (item): item is ExtractedItem => isExtractedItem(item),
                ),
              }
            : {}),
          ignoredPacketIds: Array.isArray(parsed.pendingContextHarvest.ignoredPacketIds)
            ? parsed.pendingContextHarvest.ignoredPacketIds.filter(
                (id): id is string => typeof id === 'string',
              )
            : [],
        }
      : undefined

  return {
    version: 4,
    feature,
    featureTitle: typeof parsed.featureTitle === 'string' ? parsed.featureTitle : undefined,
    sourceIntent: typeof parsed.sourceIntent === 'string' ? parsed.sourceIntent : undefined,
    workflowState: normalizeWorkflowState(parsed.workflowState, parsed.generatedDocs),
    collectedFacts,
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter((item): item is string => typeof item === 'string')
      : [],
    pendingConfirmations: Array.isArray(parsed.pendingConfirmations)
      ? parsed.pendingConfirmations.filter((item): item is string => typeof item === 'string')
      : [],
    draftStatus: parsed.draftStatus === 'draft_with_assumptions' ? 'draft_with_assumptions' : 'final',
    postDesignDecision:
      parsed.postDesignDecision === 'proceed_to_plan' ||
      parsed.postDesignDecision === 'review_docs' ||
      parsed.postDesignDecision === 'inspect'
        ? parsed.postDesignDecision
        : undefined,
    requirementModel:
      parsed.requirementModel && typeof parsed.requirementModel === 'object'
        ? (parsed.requirementModel as RequirementModel)
        : undefined,
    designReview:
      parsed.designReview && typeof parsed.designReview === 'object'
        ? (parsed.designReview as DesignReviewReport)
        : undefined,
    generatedDocs: Array.isArray(parsed.generatedDocs)
      ? parsed.generatedDocs.filter((p): p is string => typeof p === 'string')
      : [],
    generationAttemptCount: typeof parsed.generationAttemptCount === 'number' ? parsed.generationAttemptCount : 0,
    lastConsumedMessageId: typeof parsed.lastConsumedMessageId === 'string' ? parsed.lastConsumedMessageId : undefined,
    lastError: typeof parsed.lastError === 'string' ? parsed.lastError : undefined,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    pendingContextHarvest,
  }
}

function isExtractedItem(value: unknown): value is ExtractedItem {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<Record<keyof ExtractedItem, unknown>>
  return (
    typeof record.content === 'string' &&
    (record.type === 'problem' ||
      record.type === 'decision' ||
      record.type === 'constraint' ||
      record.type === 'nonGoal' ||
      record.type === 'openQuestion' ||
      record.type === 'risk' ||
      record.type === 'example') &&
    (record.confidence === 'high' || record.confidence === 'medium' || record.confidence === 'low') &&
    (record.source === 'user' || record.source === 'assistant') &&
    (record.confirmedBy === undefined || typeof record.confirmedBy === 'string')
  )
}

export function markGenerating(session: FeatureSession): FeatureSession {
  const nextSession: FeatureSession = {
    ...session,
    workflowState: 'ready_to_generate',
    generationAttemptCount: session.generationAttemptCount + 1,
  }

  delete nextSession.lastError
  return nextSession
}

export function markCompleted(session: FeatureSession, generatedPaths: string | string[]): FeatureSession {
  const generatedDocs = Array.from(
    new Set(
      [...session.generatedDocs, ...(Array.isArray(generatedPaths) ? generatedPaths : [generatedPaths])].filter(
        (path) => path.trim().length > 0,
      ),
    ),
  )

  const nextSession: FeatureSession = {
    ...session,
    workflowState: 'complete',
    generatedDocs,
  }

  delete nextSession.lastError
  return nextSession
}

export function markGenerationFailed(session: FeatureSession, message: string): FeatureSession {
  return {
    ...session,
    workflowState: 'failed',
    lastError: message,
  }
}

export function markDraftBlocked(session: FeatureSession, reason: string): FeatureSession {
  return {
    ...session,
    workflowState: 'draft_blocked',
    lastError: reason,
  }
}

function normalizeWorkflowState(
  workflowState: FeatureWorkflowState | undefined,
  generatedDocs: unknown,
): FeatureWorkflowState {
  if (Array.isArray(generatedDocs) && generatedDocs.length > 0) {
    return 'complete'
  }

  if (
    workflowState === 'failed' ||
    workflowState === 'draft_blocked' ||
    workflowState === 'ready_to_generate'
  ) {
    return workflowState
  }

  return 'collecting'
}
