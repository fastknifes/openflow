import { buildRequirementModel } from './constraint-derivation.js'
import type { RequirementModel } from './requirement-model.js'

export type FeatureQuestionId = 'problem' | 'target-users' | 'scope' | 'priority' | 'constraints'
export type FeatureWorkflowState = 'collecting' | 'ready_to_generate' | 'generating' | 'completed' | 'failed'
export type FeatureDraftStatus = 'final' | 'draft_with_assumptions'

export interface FeatureOption {
  label: string
  description: string
}

export interface FeatureQuestion {
  id: FeatureQuestionId
  header: string
  question: string
  options: FeatureOption[]
}

export interface FeatureSession {
  version: 2 | 3
  feature: string
  featureTitle?: string | undefined
  sourceIntent?: string | undefined
  workflowState: FeatureWorkflowState
  pendingQuestionId: FeatureQuestionId | null
  promptMode?: 'question' | 'discussion' | undefined
  askedQuestionIds: FeatureQuestionId[]
  answers: Partial<Record<FeatureQuestionId, string>>
  assumptions: string[]
  pendingConfirmations: string[]
  skippedQuestionIds: FeatureQuestionId[]
  abstractionPreference?: 'product' | 'implementation' | undefined
  draftStatus: FeatureDraftStatus
  requirementModel?: RequirementModel
  generatedDocs: string[]
  generationAttemptCount: number
  lastConsumedMessageId?: string | undefined
  lastError?: string | undefined
  lastQuestionPromptedAt?: string | undefined
  lastAnsweredAt?: string | undefined
  updatedAt: string
}

type LegacyFeatureSession = {
  version?: number
  feature?: string
  status?: string
  currentQuestionId?: FeatureQuestionId | null
  askedQuestionIds?: FeatureQuestionId[]
  answers?: Partial<Record<FeatureQuestionId, string>>
  featureTitle?: string
  sourceIntent?: string
  assumptions?: string[]
  pendingConfirmations?: string[]
  skippedQuestionIds?: FeatureQuestionId[]
  abstractionPreference?: string
  draftStatus?: FeatureDraftStatus
  generatedDocs?: string[]
  lastConsumedMessageId?: string
  updatedAt?: string
}

export const QUESTIONS: FeatureQuestion[] = [
  {
    id: 'problem',
    header: '核心问题',
    question: '这个功能主要要解决什么问题？',
    options: [
      { label: '提升效率', description: '减少重复操作或人工成本' },
      { label: '修复痛点', description: '解决当前流程中的明显问题' },
      { label: '支持新场景', description: '覆盖新的业务或协作场景' },
      { label: '改善体验', description: '提升用户体验和可理解性' },
    ],
  },
  {
    id: 'target-users',
    header: '目标用户',
    question: '这个功能的主要使用者是谁？',
    options: [
      { label: '内部开发者', description: '工程或研发内部使用' },
      { label: '终端用户', description: '直接面向产品使用者' },
      { label: '管理员', description: '面向运维或管理角色' },
      { label: '第三方系统', description: '面向外部系统集成' },
    ],
  },
  {
    id: 'scope',
    header: '改动范围',
    question: '这次需求更接近哪一种范围？',
    options: [
      { label: 'new-feature', description: '全新功能' },
      { label: 'enhancement', description: '现有功能增强' },
      { label: 'refactor', description: '以重构或改造为主' },
      { label: 'workflow', description: '以流程优化为主' },
    ],
  },
  {
    id: 'priority',
    header: '首要目标',
    question: '这次最重要的优先级是什么？',
    options: [
      { label: '快速上线', description: '优先尽快交付' },
      { label: '易维护', description: '优先清晰和长期维护' },
      { label: '可扩展', description: '优先未来扩展能力' },
      { label: '风险最小', description: '优先减少兼容与回归风险' },
    ],
  },
  {
    id: 'constraints',
    header: '关键约束',
    question: '这次设计最需要考虑的一个约束是什么？',
    options: [
      { label: '兼容现有系统', description: '需要保持现有接口和行为兼容' },
      { label: '最小改动', description: '尽量减少涉及模块和改动范围' },
      { label: '性能要求', description: '需要关注性能或资源使用' },
      { label: '交付时间', description: '时间窗口很紧，需要快速收敛' },
    ],
  },
]

export function createInitialFeatureSession(feature: string): FeatureSession {
  return {
    version: 3,
    feature,
    workflowState: 'collecting',
    pendingQuestionId: QUESTIONS[0]?.id ?? null,
    promptMode: 'question',
    askedQuestionIds: [],
    answers: {},
    assumptions: [],
    pendingConfirmations: [],
    skippedQuestionIds: [],
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

  const parsed = raw as Partial<FeatureSession> & LegacyFeatureSession
  const answers = parsed.answers ?? {}
  const requirementModel = parsed.version && parsed.version >= 3 && parsed.requirementModel
    ? parsed.requirementModel
    : buildRequirementModel(feature, answers)
  const generatedDocs = Array.isArray(parsed.generatedDocs) ? parsed.generatedDocs : []
  const pendingQuestionId = resolvePendingQuestionId(answers, parsed.pendingQuestionId ?? parsed.currentQuestionId ?? null)
  const workflowState = resolveWorkflowState(parsed.workflowState, generatedDocs, pendingQuestionId)

  return {
    version: 3,
    feature,
    featureTitle: typeof parsed.featureTitle === 'string' ? parsed.featureTitle : undefined,
    sourceIntent: typeof parsed.sourceIntent === 'string' ? parsed.sourceIntent : undefined,
    workflowState,
    pendingQuestionId: workflowState === 'collecting' ? pendingQuestionId : null,
    promptMode: parsed.promptMode === 'discussion' ? 'discussion' : 'question',
    askedQuestionIds: Array.isArray(parsed.askedQuestionIds) ? uniqueQuestionIds(parsed.askedQuestionIds) : deriveAskedQuestionIds(answers),
    answers,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.filter((item): item is string => typeof item === 'string') : [],
    pendingConfirmations: Array.isArray(parsed.pendingConfirmations) ? parsed.pendingConfirmations.filter((item): item is string => typeof item === 'string') : [],
    skippedQuestionIds: Array.isArray(parsed.skippedQuestionIds) ? uniqueQuestionIds(parsed.skippedQuestionIds) : [],
    abstractionPreference: parsed.abstractionPreference === 'product' || parsed.abstractionPreference === 'implementation' ? parsed.abstractionPreference : undefined,
    draftStatus: parsed.draftStatus === 'draft_with_assumptions' ? 'draft_with_assumptions' : 'final',
    requirementModel,
    generatedDocs,
    generationAttemptCount: typeof parsed.generationAttemptCount === 'number' ? parsed.generationAttemptCount : 0,
    lastConsumedMessageId: typeof parsed.lastConsumedMessageId === 'string' ? parsed.lastConsumedMessageId : undefined,
    lastError: typeof parsed.lastError === 'string' ? parsed.lastError : undefined,
    lastQuestionPromptedAt: typeof parsed.lastQuestionPromptedAt === 'string' ? parsed.lastQuestionPromptedAt : undefined,
    lastAnsweredAt: typeof parsed.lastAnsweredAt === 'string' ? parsed.lastAnsweredAt : undefined,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  }
}

export function getPendingQuestion(session: FeatureSession): FeatureQuestion | undefined {
  if (!session.pendingQuestionId) {
    return QUESTIONS.find((question) => !session.answers[question.id])
  }

  return QUESTIONS.find((question) => question.id === session.pendingQuestionId)
}

export function applyFeatureAnswer(session: FeatureSession, answer: string, consumedMessageId?: string): FeatureSession {
  const pendingQuestion = getPendingQuestion(session)
  if (!pendingQuestion) {
    return session
  }

  const trimmedAnswer = answer.trim()
  const answers = {
    ...session.answers,
    [pendingQuestion.id]: trimmedAnswer,
  }
  const nextPendingQuestionId = resolvePendingQuestionId(answers, null)

  const nextSession: FeatureSession = {
    ...session,
    answers,
    askedQuestionIds: uniqueQuestionIds([...session.askedQuestionIds, pendingQuestion.id]),
    pendingQuestionId: nextPendingQuestionId,
    promptMode: nextPendingQuestionId ? 'question' : 'discussion',
    workflowState: nextPendingQuestionId ? 'collecting' : 'ready_to_generate',
    lastConsumedMessageId: consumedMessageId ?? session.lastConsumedMessageId,
    lastAnsweredAt: new Date().toISOString(),
  }

  delete nextSession.lastError
  return nextSession
}

export function markQuestionPrompted(session: FeatureSession, questionId: FeatureQuestionId): FeatureSession {
  return {
    ...session,
    workflowState: 'collecting',
    pendingQuestionId: questionId,
    promptMode: 'question',
    lastQuestionPromptedAt: new Date().toISOString(),
  }
}

export function markGenerating(session: FeatureSession): FeatureSession {
  const nextSession: FeatureSession = {
    ...session,
    workflowState: 'generating',
    pendingQuestionId: null,
    promptMode: 'discussion',
    generationAttemptCount: session.generationAttemptCount + 1,
  }

  delete nextSession.lastError
  return nextSession
}

export function markCompleted(session: FeatureSession, generatedPaths: string | string[]): FeatureSession {
  const generatedDocs = Array.from(new Set([
    ...session.generatedDocs,
    ...(Array.isArray(generatedPaths) ? generatedPaths : [generatedPaths]),
  ].filter((path) => path.trim().length > 0)))

  const nextSession: FeatureSession = {
    ...session,
    workflowState: 'completed',
    pendingQuestionId: null,
    promptMode: 'discussion',
    generatedDocs,
  }

  delete nextSession.lastError
  return nextSession
}

export function markGenerationFailed(session: FeatureSession, message: string): FeatureSession {
  return {
    ...session,
    workflowState: 'failed',
    pendingQuestionId: null,
    promptMode: 'discussion',
    lastError: message,
  }
}

export function isAwaitingFormalAnswer(session: FeatureSession): boolean {
  return session.workflowState === 'collecting'
    && session.promptMode === 'question'
    && Boolean(getPendingQuestion(session))
}

export function shouldGenerateDesign(session: FeatureSession): boolean {
  return session.workflowState === 'ready_to_generate'
    || session.workflowState === 'generating'
    || session.workflowState === 'failed'
    || (session.workflowState === 'collecting' && !getPendingQuestion(session))
}

export function getRecommendedOptionLabel(session: FeatureSession, question: FeatureQuestion): string | undefined {
  switch (question.id) {
    case 'problem':
      return featureLooksLikeImprovement(session.feature) ? '改善体验' : '支持新场景'
    case 'target-users':
      return '内部开发者'
    case 'scope':
      return featureLooksLikeImprovement(session.feature) ? 'enhancement' : 'new-feature'
    case 'priority':
      return '风险最小'
    case 'constraints':
      return '兼容现有系统'
    default:
      return question.options[0]?.label
  }
}

function featureLooksLikeImprovement(feature: string): boolean {
  return /(improve|optimi|refactor|upgrade|enhance|fix|adjust|tweak)/i.test(feature)
}

function uniqueQuestionIds(questionIds: FeatureQuestionId[]): FeatureQuestionId[] {
  return [...new Set(questionIds)]
}

function deriveAskedQuestionIds(answers: Partial<Record<FeatureQuestionId, string>>): FeatureQuestionId[] {
  return QUESTIONS.filter((question) => typeof answers[question.id] === 'string' && answers[question.id]?.trim())
    .map((question) => question.id)
}

function resolvePendingQuestionId(
  answers: Partial<Record<FeatureQuestionId, string>>,
  candidate: FeatureQuestionId | null
): FeatureQuestionId | null {
  if (candidate && !answers[candidate]) {
    return candidate
  }

  return QUESTIONS.find((question) => !answers[question.id])?.id ?? null
}

function resolveWorkflowState(
  workflowState: FeatureWorkflowState | undefined,
  generatedDocs: string[],
  pendingQuestionId: FeatureQuestionId | null
): FeatureWorkflowState {
  if (generatedDocs.length > 0) {
    return 'completed'
  }

  if (workflowState === 'generating' || workflowState === 'failed') {
    return workflowState
  }

  if (!pendingQuestionId) {
    return workflowState === 'completed' ? 'completed' : 'ready_to_generate'
  }

  return 'collecting'
}
