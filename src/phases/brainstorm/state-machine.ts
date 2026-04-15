export type BrainstormQuestionId = 'problem' | 'target-users' | 'scope' | 'priority' | 'constraints'
export type BrainstormWorkflowState = 'collecting' | 'ready_to_generate' | 'generating' | 'completed' | 'failed'

export interface BrainstormOption {
  label: string
  description: string
}

export interface BrainstormQuestion {
  id: BrainstormQuestionId
  header: string
  question: string
  options: BrainstormOption[]
}

export interface BrainstormSession {
  version: 2
  feature: string
  workflowState: BrainstormWorkflowState
  pendingQuestionId: BrainstormQuestionId | null
  promptMode?: 'question' | 'discussion' | undefined
  askedQuestionIds: BrainstormQuestionId[]
  answers: Partial<Record<BrainstormQuestionId, string>>
  generatedDocs: string[]
  generationAttemptCount: number
  lastError?: string | undefined
  lastQuestionPromptedAt?: string | undefined
  lastAnsweredAt?: string | undefined
  updatedAt: string
}

type LegacyBrainstormSession = {
  version?: number
  feature?: string
  status?: string
  currentQuestionId?: BrainstormQuestionId | null
  askedQuestionIds?: BrainstormQuestionId[]
  answers?: Partial<Record<BrainstormQuestionId, string>>
  generatedDocs?: string[]
  updatedAt?: string
}

export const QUESTIONS: BrainstormQuestion[] = [
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

export function createInitialBrainstormSession(feature: string): BrainstormSession {
  return {
    version: 2,
    feature,
    workflowState: 'collecting',
    pendingQuestionId: QUESTIONS[0]?.id ?? null,
    promptMode: 'question',
    askedQuestionIds: [],
    answers: {},
    generatedDocs: [],
    generationAttemptCount: 0,
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeBrainstormSession(feature: string, raw: unknown): BrainstormSession {
  if (!raw || typeof raw !== 'object') {
    return createInitialBrainstormSession(feature)
  }

  const parsed = raw as Partial<BrainstormSession> & LegacyBrainstormSession
  const answers = parsed.answers ?? {}
  const generatedDocs = Array.isArray(parsed.generatedDocs) ? parsed.generatedDocs : []
  const pendingQuestionId = resolvePendingQuestionId(answers, parsed.pendingQuestionId ?? parsed.currentQuestionId ?? null)
  const workflowState = resolveWorkflowState(parsed.workflowState, generatedDocs, pendingQuestionId)

  return {
    version: 2,
    feature,
    workflowState,
    pendingQuestionId: workflowState === 'collecting' ? pendingQuestionId : null,
    promptMode: parsed.promptMode === 'discussion' ? 'discussion' : 'question',
    askedQuestionIds: Array.isArray(parsed.askedQuestionIds) ? uniqueQuestionIds(parsed.askedQuestionIds) : deriveAskedQuestionIds(answers),
    answers,
    generatedDocs,
    generationAttemptCount: typeof parsed.generationAttemptCount === 'number' ? parsed.generationAttemptCount : 0,
    lastError: typeof parsed.lastError === 'string' ? parsed.lastError : undefined,
    lastQuestionPromptedAt: typeof parsed.lastQuestionPromptedAt === 'string' ? parsed.lastQuestionPromptedAt : undefined,
    lastAnsweredAt: typeof parsed.lastAnsweredAt === 'string' ? parsed.lastAnsweredAt : undefined,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  }
}

export function getPendingQuestion(session: BrainstormSession): BrainstormQuestion | undefined {
  if (!session.pendingQuestionId) {
    return QUESTIONS.find((question) => !session.answers[question.id])
  }

  return QUESTIONS.find((question) => question.id === session.pendingQuestionId)
}

export function applyBrainstormAnswer(session: BrainstormSession, answer: string): BrainstormSession {
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

  const nextSession: BrainstormSession = {
    ...session,
    answers,
    askedQuestionIds: uniqueQuestionIds([...session.askedQuestionIds, pendingQuestion.id]),
    pendingQuestionId: nextPendingQuestionId,
    promptMode: nextPendingQuestionId ? 'question' : 'discussion',
    workflowState: nextPendingQuestionId ? 'collecting' : 'ready_to_generate',
    lastAnsweredAt: new Date().toISOString(),
  }

  delete nextSession.lastError
  return nextSession
}

export function markQuestionPrompted(session: BrainstormSession, questionId: BrainstormQuestionId): BrainstormSession {
  return {
    ...session,
    workflowState: 'collecting',
    pendingQuestionId: questionId,
    promptMode: 'question',
    lastQuestionPromptedAt: new Date().toISOString(),
  }
}

export function markGenerating(session: BrainstormSession): BrainstormSession {
  const nextSession: BrainstormSession = {
    ...session,
    workflowState: 'generating',
    pendingQuestionId: null,
    promptMode: 'discussion',
    generationAttemptCount: session.generationAttemptCount + 1,
  }

  delete nextSession.lastError
  return nextSession
}

export function markCompleted(session: BrainstormSession, generatedPath: string): BrainstormSession {
  const generatedDocs = session.generatedDocs.includes(generatedPath)
    ? session.generatedDocs
    : [generatedPath]

  const nextSession: BrainstormSession = {
    ...session,
    workflowState: 'completed',
    pendingQuestionId: null,
    promptMode: 'discussion',
    generatedDocs,
  }

  delete nextSession.lastError
  return nextSession
}

export function markGenerationFailed(session: BrainstormSession, message: string): BrainstormSession {
  return {
    ...session,
    workflowState: 'failed',
    pendingQuestionId: null,
    promptMode: 'discussion',
    lastError: message,
  }
}

export function isAwaitingFormalAnswer(session: BrainstormSession): boolean {
  return session.workflowState === 'collecting'
    && session.promptMode === 'question'
    && Boolean(getPendingQuestion(session))
}

export function shouldGenerateDesign(session: BrainstormSession): boolean {
  return session.workflowState === 'ready_to_generate'
    || session.workflowState === 'generating'
    || session.workflowState === 'failed'
    || (session.workflowState === 'collecting' && !getPendingQuestion(session))
}

export function getRecommendedOptionLabel(session: BrainstormSession, question: BrainstormQuestion): string | undefined {
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

function uniqueQuestionIds(questionIds: BrainstormQuestionId[]): BrainstormQuestionId[] {
  return [...new Set(questionIds)]
}

function deriveAskedQuestionIds(answers: Partial<Record<BrainstormQuestionId, string>>): BrainstormQuestionId[] {
  return QUESTIONS.filter((question) => typeof answers[question.id] === 'string' && answers[question.id]?.trim())
    .map((question) => question.id)
}

function resolvePendingQuestionId(
  answers: Partial<Record<BrainstormQuestionId, string>>,
  candidate: BrainstormQuestionId | null
): BrainstormQuestionId | null {
  if (candidate && !answers[candidate]) {
    return candidate
  }

  return QUESTIONS.find((question) => !answers[question.id])?.id ?? null
}

function resolveWorkflowState(
  workflowState: BrainstormWorkflowState | undefined,
  generatedDocs: string[],
  pendingQuestionId: BrainstormQuestionId | null
): BrainstormWorkflowState {
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
