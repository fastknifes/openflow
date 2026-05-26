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

type DimensionState = 'answered' | 'inferred' | 'missing'
type Materiality = 'high' | 'medium' | 'low'

interface DimensionStatus {
  id: FeatureQuestionId
  state: DimensionState
  materiality: Materiality
  reason: string
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

  const dimensions = assessDimensions(session)
  const problemClear = isClear(dimensions.problem)
  const boundaryClear = isClear(dimensions.scope)
  const outcomeClear = isClear(dimensions.constraints) || isClear(dimensions.priority)
  const inferredOutcomeAssumptions = dimensions.constraints.state === 'inferred' && !hasText(session.answers.constraints) && !hasText(session.answers.priority)
    ? ['Expected outcome is inferred from the source intent and should be revisited if implementation needs a sharper success criterion.']
    : []
  const questionStatus = selectNextQuestion(dimensions, session)
  const question = questionStatus ? QUESTION_BY_ID.get(questionStatus.id) : undefined

  if (problemClear && boundaryClear && outcomeClear && !question) {
    return {
      kind: 'ready_to_generate',
      knownFacts,
      assumptions: [...assumptions, ...inferredOutcomeAssumptions],
      pendingConfirmations,
      rationale: 'The feature direction is clear enough to summarize with any remaining unknowns as assumptions.',
    }
  }

  return {
    kind: 'ask_next',
    knownFacts,
    assumptions,
    pendingConfirmations: question ? [...pendingConfirmations, question.question] : pendingConfirmations,
    question,
    rationale: question
      ? questionStatus?.reason ?? 'This is the one missing decision most likely to change the generated design.'
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
    session.answers['target-users'] ? `Target users: ${session.answers['target-users']}` : '',
    session.answers.scope ? `Scope: ${session.answers.scope}` : '',
    session.answers.priority ? `Priority: ${session.answers.priority}` : '',
    session.answers.constraints ? `Constraints: ${session.answers.constraints}` : '',
  ].filter(Boolean)
}

function assessDimensions(session: FeatureSession): Record<FeatureQuestionId, DimensionStatus> {
  const sourceIntent = session.sourceIntent?.trim() ?? ''
  const featureText = [session.feature, session.featureTitle, sourceIntent].filter(Boolean).join(' ')
  const featureLooksUserFacing = hasUserFacingSignals(featureText)
  const featureLooksRisky = hasRiskSignals(featureText)

  return {
    problem: statusFor(
      'problem',
      session.answers.problem,
      sourceIntent ? 'inferred' : 'missing',
      'The problem statement decides what the generated design optimizes for.',
      'high',
    ),
    'target-users': statusFor(
      'target-users',
      session.answers['target-users'],
      featureLooksUserFacing ? 'missing' : 'inferred',
      featureLooksUserFacing
        ? 'Target users can change UX, permissions, wording, and observable behavior.'
        : 'Target users are inferred from the current feature context and are unlikely to change the first design draft.',
      featureLooksUserFacing ? 'medium' : 'low',
    ),
    scope: statusFor(
      'scope',
      session.answers.scope,
      inferScopeState(session),
      'Scope determines whether this is additive, an enhancement, a refactor, or a workflow change.',
      'high',
    ),
    priority: statusFor(
      'priority',
      session.answers.priority,
      featureLooksRisky ? 'missing' : 'inferred',
      featureLooksRisky
        ? 'Priority is needed because this feature appears to involve risk, compatibility, performance, or delivery trade-offs.'
        : 'Priority is not the next design-shaping gap for this feature.',
      featureLooksRisky ? 'medium' : 'low',
    ),
    constraints: statusFor(
      'constraints',
      session.answers.constraints,
      sourceIntent && isClear(statusFor('scope', session.answers.scope, inferScopeState(session), '', 'high')) ? 'inferred' : 'missing',
      sourceIntent
        ? 'Constraints can be inferred for a draft from the source intent, but should remain an assumption unless confirmed.'
        : 'A key constraint is needed to keep the design bounded and testable.',
      'medium',
    ),
  }
}

function statusFor(
  id: FeatureQuestionId,
  answer: string | undefined,
  fallbackState: DimensionState,
  reason: string,
  materiality: Materiality,
): DimensionStatus {
  return {
    id,
    state: hasText(answer) ? 'answered' : fallbackState,
    materiality,
    reason,
  }
}

function inferScopeState(session: FeatureSession): DimensionState {
  if (session.skippedQuestionIds.includes('scope')) return 'inferred'
  const searchable = [session.feature, session.featureTitle, session.sourceIntent].filter(Boolean).join(' ')
  return hasScopeSignals(searchable) ? 'inferred' : 'missing'
}

function selectNextQuestion(
  dimensions: Record<FeatureQuestionId, DimensionStatus>,
  session: FeatureSession,
): DimensionStatus | undefined {
  const priority: FeatureQuestionId[] = ['problem', 'scope', 'target-users', 'constraints', 'priority']

  for (const id of priority) {
    const status = dimensions[id]
    if (!status || session.skippedQuestionIds.includes(id)) continue
    if (status.state === 'answered' || status.state === 'inferred') continue
    if (status.materiality === 'low') continue
    return status
  }

  return undefined
}

function isClear(status: DimensionStatus): boolean {
  return status.state === 'answered' || status.state === 'inferred'
}

function hasText(value?: string): boolean {
  return Boolean(value?.trim())
}

function hasScopeSignals(value: string): boolean {
  return /(?:new[-\s]?feature|enhancement|refactor|workflow|新功能|增强|重构|流程|改造|优化)/iu.test(value)
}

function hasUserFacingSignals(value: string): boolean {
  return /(?:用户|客户|管理员|开发者|使用者|权限|角色|界面|页面|交互|命令|customer|admin|operator|role|permission|ui|ux|frontend)/iu.test(value)
}

function hasRiskSignals(value: string): boolean {
  return /(?:risk|compat|performance|security|migration|deadline|rollback|风险|兼容|性能|安全|迁移|期限|回滚|取舍|trade[-\s]?off)/iu.test(value)
}

function withDefaultAssumption(assumptions: string[]): string[] {
  return assumptions.length > 0
    ? assumptions
    : ['Some details were not explicitly confirmed and should be revisited if they affect implementation.']
}
