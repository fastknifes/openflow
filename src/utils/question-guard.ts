import { logger } from '../utils/logger.js'

/**
 * Question tool wrapper with defense mechanisms.
 *
 * Problem it solves:
 * - OpenCode may re-render the question picker with a new requestID, causing
 *   user input to disappear and the same question to re-pop.
 * - Recursive calls to handlers (e.g. handleFeature) may carry the same
 *   messageID, triggering duplicate-message paths that skip answer application.
 * - Direct askQuestion throws if the transport is interrupted, crashing the flow.
 *
 * Defense layers:
 * 1. Duplicate-message idempotency (same messageID → skip without re-prompting)
 * 2. Re-prompt prevention (same questionId already prompted → skip)
 * 3. Graceful degradation (askQuestion failure → undefined, no throw)
 */

export interface GuardedQuestion {
  id: string
  header: string
  question: string
  options: Array<{ label: string; description: string }>
  multiple?: boolean
  custom?: boolean
}

export interface QuestionToolContext {
  sessionID?: string
  messageID?: string
  askQuestion(input: { questions: GuardedQuestion[] }): Promise<string[][]>
}

export interface QuestionGuardOptions {
  /** Already-prompted question ids (e.g. FeatureSession.questionPickerPromptedIds) */
  promptedIds?: string[]
  /** Last consumed message id (e.g. FeatureSession.lastConsumedMessageId) */
  lastMessageId?: string
}

export interface QuestionGuardResult {
  answer: string | undefined
  /** True if skipped because the same messageID was already processed */
  wasDuplicateMessage: boolean
  /** True if skipped because this questionId was already prompted */
  wasAlreadyPrompted: boolean
  /** Updated promptedIds (caller should persist if needed) */
  updatedPromptedIds: string[]
  /** Updated lastMessageId (caller should persist if needed) */
  updatedMessageId?: string
}

/**
 * Ask a question through the interactive tool with guard rails.
 *
 * @param ctx          The tool context carrying askQuestion and message metadata
 * @param question     The question to ask (must have a stable id)
 * @param opts         Optional persisted guard state
 * @returns            Guard result with answer and state updates
 */
export async function askGuardedQuestion(
  ctx: QuestionToolContext,
  question: GuardedQuestion,
  opts?: QuestionGuardOptions,
): Promise<QuestionGuardResult> {
  const promptedIds = new Set(opts?.promptedIds ?? [])
  const lastMessageId = opts?.lastMessageId

  logger.debug('session', 'askGuardedQuestion entered', { questionId: question.id, messageID: ctx.messageID, lastMessageId })

  // Defense 1: duplicate message idempotency.
  // If the same messageID is seen again (e.g. recursive handler call or
  // OpenCode retry), do not re-prompt; return empty so the caller can
  // decide whether to advance with cached state or return text guidance.
  if (ctx.messageID && lastMessageId === ctx.messageID) {
    logger.info('session', 'question skipped: duplicate message', { questionId: question.id, messageID: ctx.messageID })
    return {
      answer: undefined,
      wasDuplicateMessage: true,
      wasAlreadyPrompted: promptedIds.has(question.id),
      updatedPromptedIds: Array.from(promptedIds),
      updatedMessageId: lastMessageId,
    }
  }

  // Defense 2: re-prompt prevention.
  // If this exact questionId was already popped in a prior turn, skip the
  // picker and let the caller fall back to text guidance.
  if (promptedIds.has(question.id)) {
    logger.info('session', 'question skipped: already prompted', { questionId: question.id })
    return {
      answer: undefined,
      wasDuplicateMessage: false,
      wasAlreadyPrompted: true,
      updatedPromptedIds: Array.from(promptedIds),
      updatedMessageId: lastMessageId,
    }
  }

  if (!ctx.askQuestion) {
    logger.warn('session', 'question skipped: askQuestion not available', { questionId: question.id })
    return {
      answer: undefined,
      wasDuplicateMessage: false,
      wasAlreadyPrompted: false,
      updatedPromptedIds: Array.from(promptedIds),
      updatedMessageId: lastMessageId,
    }
  }

  logger.debug('session', 'question picker invoking', { questionId: question.id, header: question.header })

  try {
    const answers = await ctx.askQuestion({ questions: [question] })
    const answer = answers[0]?.[0]?.trim() || undefined

    // Mark as prompted even if answer is empty, so we don't re-pop the picker
    // if the user dismissed it or submitted an empty response.
    promptedIds.add(question.id)

    logger.info('session', 'question picker returned', { questionId: question.id, hasAnswer: !!answer, answerLength: answer?.length })

    return {
      answer,
      wasDuplicateMessage: false,
      wasAlreadyPrompted: false,
      updatedPromptedIds: Array.from(promptedIds),
      updatedMessageId: ctx.messageID,
    }
  } catch (error) {
    // Defense 3: graceful degradation.
    // If the question transport fails (e.g. user closed picker, network
    // hiccup, OpenCode state reset), return undefined instead of crashing.
    logger.warn('session', 'question picker failed', { questionId: question.id, error: error instanceof Error ? error.message : String(error) })
    return {
      answer: undefined,
      wasDuplicateMessage: false,
      wasAlreadyPrompted: false,
      updatedPromptedIds: Array.from(promptedIds),
      updatedMessageId: lastMessageId,
    }
  }
}

export function hasAskQuestion(value: unknown): value is QuestionToolContext {
  if (!value || typeof value !== 'object') {
    return false
  }
  return 'askQuestion' in value && typeof (value as Record<string, unknown>).askQuestion === 'function'
}
