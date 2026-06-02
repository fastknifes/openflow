import { logger } from './logger.js'
import {
  askGuardedQuestion,
  hasAskQuestion,
  type GuardedQuestion,
  type QuestionToolContext,
} from './question-guard.js'
import { writePendingDecisionFallback } from './question-fallback.js'

/**
 * Batched decision gathering for feature-design workflows.
 *
 * Used when a feature (e.g. `implementation-constraints`) needs to collect
 * a fixed set of user decisions (Q1..QN) as part of the design conversation.
 *
 * Properties:
 * - Each question is asked independently through `askGuardedQuestion`.
 * - A single failure does NOT abort the batch: it falls back to the
 *   question's `defaultAnswer` (if any) or to the sentinel `UNRESOLVED`.
 * - Every failure writes a diagnostic log line AND (when `projectDir`
 *   + `feature` are provided) a `pending-decisions.md` fallback file in
 *   the feature's change workspace.
 * - The whole batch is idempotent: re-running the same batch against the
 *   same `QuestionToolContext.messageID` skips questions already asked.
 */

export interface DecisionQuestion {
  /** Stable id used across turns (e.g. 'impl-constraint-q1') */
  id: string
  /** Short header (shown in the picker, max ~30 chars) */
  header: string
  /** Full question text */
  question: string
  /** Options offered to the user */
  options: ReadonlyArray<{ label: string; description: string }>
  /** Allow multiple selections */
  multiple?: boolean
  /**
   * Answer used when the question tool fails or the user dismisses.
   * If omitted, the entry is recorded as `UNRESOLVED` so the caller can
   * detect and follow up on it.
   */
  defaultAnswer?: string
}

export interface DecisionBatchInput {
  /** The questions to ask, in order */
  questions: ReadonlyArray<DecisionQuestion>
  /** Feature slug used to resolve `docs/changes/{date}-{feature}/...` */
  feature: string
  /** Project root directory */
  projectDir: string
  /** Tool context (same shape as QuestionToolContext) */
  toolContext: unknown
  /** Optional previously-collected answers to seed the result (keyed by id) */
  priorAnswers?: Readonly<Record<string, string>>
}

export interface DecisionBatchResult {
  /** All decisions in the original order */
  decisions: ReadonlyArray<{
    id: string
    header: string
    answer: string
    /** How this answer was obtained */
    source: 'user' | 'default' | 'prior' | 'unresolved'
    /** Diagnostic flag set if the underlying tool call failed */
    toolFailed?: boolean
  }>
  /** True if at least one question hit the fallback path */
  hasFailures: boolean
  /** Relative path to the fallback file, if any failures were written */
  fallbackPath?: string
  /** True if the tool context was not present and the entire batch was defaulted */
  skippedEntirely: boolean
}

export const UNRESOLVED = 'UNRESOLVED'

/**
 * Run a decision batch. Returns a complete result with one entry per
 * question; never throws.
 */
export async function askDecisionBatch(input: DecisionBatchInput): Promise<DecisionBatchResult> {
  const { questions, feature, projectDir, toolContext, priorAnswers } = input

  if (!questions.length) {
    return { decisions: [], hasFailures: false, skippedEntirely: false }
  }

  const decisions: Array<DecisionBatchResult['decisions'][number]> = []
  let hasFailures = false
  let fallbackPath: string | undefined
  let skippedEntirely = false

  const ctx = hasAskQuestion(toolContext) ? (toolContext as QuestionToolContext) : undefined

  if (!ctx) {
    logger.warn('session', 'decision batch: no question tool available — defaulting entire batch', {
      feature,
      questionCount: questions.length,
    })
    skippedEntirely = true
  }

  logger.info('session', 'decision batch started', {
    feature,
    questionCount: questions.length,
    hasTool: !!ctx,
  })

  for (const q of questions) {
    // 1. Honor prior answers (idempotency for resumed runs).
    const prior = priorAnswers?.[q.id]
    if (prior && prior !== UNRESOLVED) {
      decisions.push({ id: q.id, header: q.header, answer: prior, source: 'prior' })
      continue
    }

    // 2. Ask the user, if we can.
    if (!ctx) {
      decisions.push({
        id: q.id,
        header: q.header,
        answer: q.defaultAnswer ?? UNRESOLVED,
        source: q.defaultAnswer ? 'default' : 'unresolved',
        toolFailed: true,
      })
      hasFailures = true
      continue
    }

    const guarded: GuardedQuestion = {
      id: q.id,
      header: q.header,
      question: q.question,
      options: [...q.options],
      multiple: q.multiple ?? false,
      custom: true,
    }

    const result = await askGuardedQuestion(ctx, guarded)
    const userAnswer = result.answer?.trim()

    if (userAnswer) {
      decisions.push({ id: q.id, header: q.header, answer: userAnswer, source: 'user' })
      continue
    }

    // 3. No answer — dismiss or tool failure.
    //
    // Idempotency skips (duplicate message / already prompted) are NOT
    // true failures — they're guard-layer short-circuits.
    const isIdempotencySkip = result.wasDuplicateMessage || result.wasAlreadyPrompted
    const toolFailed = !isIdempotencySkip

    if (toolFailed) {
      hasFailures = true
      const fb = await writePendingDecisionFallback({
        projectDir,
        feature,
        question: guarded,
        failureKind: 'unknown',
        errorMessage: 'Question tool returned no answer (tool failed or user dismissed).',
      }).catch(() => undefined)

      if (fb && !fallbackPath) fallbackPath = fb.path
    }

    decisions.push({
      id: q.id,
      header: q.header,
      answer: q.defaultAnswer ?? UNRESOLVED,
      source: q.defaultAnswer ? 'default' : 'unresolved',
      toolFailed,
    })
  }

  logger.info('session', 'decision batch completed', {
    feature,
    total: decisions.length,
    userAnswers: decisions.filter((d) => d.source === 'user').length,
    defaults: decisions.filter((d) => d.source === 'default').length,
    unresolved: decisions.filter((d) => d.source === 'unresolved').length,
    hasFailures,
    fallbackPath,
  })

  const result: DecisionBatchResult = { decisions, hasFailures, skippedEntirely }
  if (fallbackPath) result.fallbackPath = fallbackPath
  return result
}

/**
 * Render a decision batch as a markdown summary, suitable for inclusion
 * in a design doc or plan file under an `## Decisions` section.
 */
export function formatDecisionSummary(result: DecisionBatchResult): string {
  if (!result.decisions.length) return '_No decisions._'

  const lines = result.decisions.map((d) => {
    const marker =
      d.source === 'user' ? '✓' : d.source === 'default' ? '~' : d.source === 'prior' ? '⟳' : '✗'
    return `- ${marker} **${d.header}** (\`${d.id}\`): ${d.answer}  _(source: ${d.source})_`
  })

  const footer = result.hasFailures
    ? `\n\n> ⚠ ${result.decisions.filter((d) => d.toolFailed).length} question(s) failed. See \`${result.fallbackPath ?? 'pending-decisions.md'}\` for details.`
    : ''

  return lines.join('\n') + footer
}
