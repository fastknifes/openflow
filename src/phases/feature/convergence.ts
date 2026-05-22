import type { FeatureQuestion, FeatureQuestionId, FeatureSession } from './state-machine.js'
import { QUESTIONS } from './state-machine.js'
import { tArray } from '../../i18n/index.js'

export type ConvergenceDecisionKind = 'ask_next' | 'ready_to_generate' | 'draft_with_assumptions'

export interface ConvergenceDecision {
  kind: ConvergenceDecisionKind
  knownFacts: string[]
  assumptions: string[]
  pendingConfirmations: string[]
  question?: FeatureQuestion | undefined
  rationale?: string | undefined
}

const QUESTION_BY_ID = new Map<FeatureQuestionId, FeatureQuestion>(QUESTIONS.map((question) => [question.id, question]))

export function evaluateFeatureConvergence(session: FeatureSession, latestInput?: string): ConvergenceDecision {
  const knownFacts = collectKnownFacts(session)
  const flowSignal = detectFlowSignal(latestInput)
  const assumptions = [...session.assumptions]
  const pendingConfirmations = [...session.pendingConfirmations]

  if (flowSignal === 'product-level') {
    assumptions.push('Keep follow-up discussion at product, workflow, or experience level unless the user asks for implementation design.')
  }

  if (flowSignal === 'proceed') {
    return {
      kind: 'draft_with_assumptions',
      knownFacts,
      assumptions: withDefaultAssumption(assumptions),
      pendingConfirmations,
      rationale: 'The user asked to proceed before all details were confirmed.',
    }
  }

  const problemClear = hasText(session.answers.problem) || hasText(session.sourceIntent)
  const boundaryClear = hasText(session.answers.scope) || session.skippedQuestionIds.includes('scope')
  const outcomeClear = hasText(session.answers.constraints)
    || hasText(session.answers.priority)
    || session.skippedQuestionIds.includes('constraints')
    || (hasText(session.sourceIntent) && boundaryClear)
  const inferredOutcomeAssumptions = hasText(session.sourceIntent) && boundaryClear && !hasText(session.answers.constraints) && !hasText(session.answers.priority)
    ? ['Expected outcome is inferred from the source intent and should be revisited if implementation needs a sharper success criterion.']
    : []

  if (problemClear && boundaryClear && outcomeClear) {
    return {
      kind: 'ready_to_generate',
      knownFacts,
      assumptions: [...assumptions, ...inferredOutcomeAssumptions],
      pendingConfirmations,
      rationale: 'The feature direction is clear enough to summarize with any remaining unknowns as assumptions.',
    }
  }

  const question = selectNextQuestion(session, problemClear, boundaryClear, outcomeClear)
  return {
    kind: 'ask_next',
    knownFacts,
    assumptions,
    pendingConfirmations: question ? [...pendingConfirmations, question.question] : pendingConfirmations,
    question,
    rationale: question
      ? 'This is the one missing decision most likely to change the generated design.'
      : 'No useful follow-up question remains.',
  }
}

export function detectFlowSignal(input?: string): 'none' | 'proceed' | 'product-level' {
  const normalized = input?.trim().toLowerCase() ?? ''
  if (!normalized) return 'none'

  const skipSignals = tArray('signals.convergence.skip')
  if (new RegExp(`(${skipSignals.join('|')})`, 'i').test(normalized)) {
    return 'proceed'
  }

  const productLevelSignals = tArray('signals.convergence.productLevel')
  if (new RegExp(`(${productLevelSignals.join('|')})`, 'i').test(normalized)) {
    return 'product-level'
  }

  return 'none'
}

function collectKnownFacts(session: FeatureSession): string[] {
  return [
    session.sourceIntent ? `Source intent: ${session.sourceIntent}` : '',
    session.answers.problem ? `Problem: ${session.answers.problem}` : '',
    session.answers.scope ? `Scope: ${session.answers.scope}` : '',
    session.answers.priority ? `Priority: ${session.answers.priority}` : '',
    session.answers.constraints ? `Constraints: ${session.answers.constraints}` : '',
  ].filter(Boolean)
}

function selectNextQuestion(
  session: FeatureSession,
  problemClear: boolean,
  boundaryClear: boolean,
  outcomeClear: boolean,
): FeatureQuestion | undefined {
  if (!problemClear && !session.skippedQuestionIds.includes('problem')) {
    return QUESTION_BY_ID.get('problem')
  }

  if (!boundaryClear && !session.skippedQuestionIds.includes('scope')) {
    return QUESTION_BY_ID.get('scope')
  }

  if (!outcomeClear && !session.skippedQuestionIds.includes('constraints')) {
    return QUESTION_BY_ID.get('constraints')
  }

  return undefined
}

function hasText(value?: string): boolean {
  return Boolean(value?.trim())
}

function withDefaultAssumption(assumptions: string[]): string[] {
  return assumptions.length > 0
    ? assumptions
    : ['Some details were not explicitly confirmed and should be revisited if they affect implementation.']
}
