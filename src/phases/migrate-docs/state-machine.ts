/**
 * Migration state machine - pure functions for state transitions
 * Following feature workflow's pattern: no I/O, only state transformations
 */

import {
  type MigrationState,
  type MigrationStage,
  type SourceType,
  type StageResult,
  type ConflictRecord,
  type PendingQuestion,
  type UserAnswer,
  type DisposalMode,
  VALID_STAGE_TRANSITIONS,
  STAGE_ORDER,
} from './types.js'

// ============================================================================
// State Creation
// ============================================================================

/**
 * Create initial migration state
 */
export function createInitialMigrationState(
  sourcePath: string,
  targetRoot: string,
  sourceType: SourceType | null = null,
  options: {
    migrationId?: string
    disposalMode?: DisposalMode
    dryRun?: boolean
  } = {}
): MigrationState {
  const now = new Date().toISOString()
  const migrationId = options.migrationId ?? generateMigrationId()

  return {
    version: 1,
    migrationId,
    stage: 'detect',
    sourcePath,
    targetRoot,
    sourceType,
    disposalMode: options.disposalMode ?? 'keep',
    dryRun: options.dryRun ?? false,
    stageResults: [],
    startedAt: now,
    updatedAt: now,
    inventory: [],
    classifications: [],
    conflicts: [],
    pendingQuestions: [],
    resolvedQuestions: [],
  }
}

function generateMigrationId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `migration-${timestamp}-${random}`
}

// ============================================================================
// Stage Transitions
// ============================================================================

/**
 * Validate if a stage transition is legal
 * Stages must progress in order: detect → scan → classify → clarify → plan → apply → cleanup → completed
 */
export function isValidStageTransition(
  fromStage: MigrationStage,
  toStage: MigrationStage
): boolean {
  // Same stage is always valid (no-op)
  if (fromStage === toStage) {
    return true
  }

  // Check if transition is in the valid transitions list
  const validTransitions = VALID_STAGE_TRANSITIONS[fromStage]
  return validTransitions?.includes(toStage) ?? false
}

/**
 * Get the expected next stage in the sequence
 */
export function getExpectedNextStage(currentStage: MigrationStage): MigrationStage | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage)
  if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
    return null
  }
  return STAGE_ORDER[currentIndex + 1] ?? null
}

/**
 * Check if transitioning to a stage would skip intermediate stages
 */
export function wouldSkipStages(
  fromStage: MigrationStage,
  toStage: MigrationStage
): boolean {
  if (fromStage === toStage) return false
  if (toStage === 'failed') return false // Can always transition to failed

  const fromIndex = STAGE_ORDER.indexOf(fromStage)
  const toIndex = STAGE_ORDER.indexOf(toStage)

  if (fromIndex === -1 || toIndex === -1) return false

  // If toIndex is more than 1 ahead, it would skip stages
  return toIndex > fromIndex + 1
}

/**
 * Advance to the next stage
 * @throws Error if transition is not valid
 */
export function advanceStage(
  state: MigrationState,
  stage: MigrationStage
): MigrationState {
  if (!isValidStageTransition(state.stage, stage)) {
    throw new StageTransitionError(
      `Invalid stage transition from '${state.stage}' to '${stage}'`
    )
  }

  if (wouldSkipStages(state.stage, stage)) {
    throw new StageTransitionError(
      `Cannot skip stages: cannot transition from '${state.stage}' to '${stage}'`
    )
  }

  return {
    ...state,
    stage,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Mark the current stage as completed and advance to the next stage
 */
export function markStageCompleted(
  state: MigrationState,
  stage: MigrationStage,
  result?: Omit<StageResult, 'stage' | 'completedAt'>
): MigrationState {
  if (state.stage !== stage) {
    throw new StageTransitionError(
      `Cannot complete stage '${stage}' - current stage is '${state.stage}'`
    )
  }

  const stageResult: StageResult = {
    stage,
    completedAt: new Date().toISOString(),
    ...result,
  }

  const nextStage = getExpectedNextStage(stage)
  if (!nextStage) {
    throw new StageTransitionError(`No next stage after '${stage}'`)
  }

  return {
    ...state,
    stage: nextStage,
    stageResults: [...state.stageResults, stageResult],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Mark migration as failed
 */
export function markFailed(state: MigrationState, error: string): MigrationState {
  return {
    ...state,
    stage: 'failed',
    lastError: error,
    updatedAt: new Date().toISOString(),
  }
}

// ============================================================================
// Pending Questions Management
// ============================================================================

/**
 * Get all pending questions that haven't been resolved yet
 */
export function getPendingQuestions(state: MigrationState): PendingQuestion[] {
  return state.pendingQuestions.filter(
    (q) => !state.resolvedQuestions.some((a) => a.questionId === q.id)
  )
}

/**
 * Get the next pending question
 */
export function getNextPendingQuestion(
  state: MigrationState
): PendingQuestion | undefined {
  return getPendingQuestions(state)[0]
}

/**
 * Check if there are any unresolved pending questions
 */
export function hasPendingQuestions(state: MigrationState): boolean {
  return getPendingQuestions(state).length > 0
}

/**
 * Add a pending question
 */
export function addPendingQuestion(
  state: MigrationState,
  question: Omit<PendingQuestion, 'id'> & { id?: string }
): MigrationState {
  const newQuestion: PendingQuestion = {
    ...question,
    id: question.id ?? generateQuestionId(),
  }

  return {
    ...state,
    pendingQuestions: [...state.pendingQuestions, newQuestion],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Resolve a pending question with an answer
 */
export function resolvePendingQuestion(
  state: MigrationState,
  questionId: string,
  answer: string
): MigrationState {
  const question = state.pendingQuestions.find((q) => q.id === questionId)
  if (!question) {
    throw new StateError(`Question with id '${questionId}' not found`)
  }

  const alreadyResolved = state.resolvedQuestions.some((a) => a.questionId === questionId)
  if (alreadyResolved) {
    throw new StateError(`Question with id '${questionId}' is already resolved`)
  }

  const userAnswer: UserAnswer = {
    questionId,
    answer,
    timestamp: new Date().toISOString(),
  }

  return {
    ...state,
    resolvedQuestions: [...state.resolvedQuestions, userAnswer],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Remove a pending question (without resolving it)
 */
export function removePendingQuestion(
  state: MigrationState,
  questionId: string
): MigrationState {
  return {
    ...state,
    pendingQuestions: state.pendingQuestions.filter((q) => q.id !== questionId),
    updatedAt: new Date().toISOString(),
  }
}

function generateQuestionId(): string {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
}

// ============================================================================
// Conflict Management
// ============================================================================

/**
 * Add a conflict record
 */
export function addConflict(
  state: MigrationState,
  conflict: Omit<ConflictRecord, 'id'> & { id?: string }
): MigrationState {
  const newConflict: ConflictRecord = {
    ...conflict,
    id: conflict.id ?? generateConflictId(),
  }

  return {
    ...state,
    conflicts: [...state.conflicts, newConflict],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Resolve a conflict
 */
export function resolveConflict(
  state: MigrationState,
  conflictId: string,
  resolution: 'accepted' | 'rejected' | 'alternative',
  resolutionTarget?: import('./types').TargetCategory
): MigrationState {
  const conflictIndex = state.conflicts.findIndex((c) => c.id === conflictId)
  if (conflictIndex === -1) {
    throw new StateError(`Conflict with id '${conflictId}' not found`)
  }

  const updatedConflicts = [...state.conflicts]
  const conflict = updatedConflicts[conflictIndex]!
  const resolvedConflict: ConflictRecord = {
    id: conflict.id,
    type: conflict.type,
    sourceA: conflict.sourceA,
    sourceB: conflict.sourceB,
    description: conflict.description,
    resolution,
    timestamp: new Date().toISOString(),
  }
  if (resolutionTarget) {
    (resolvedConflict as ConflictRecord & { resolutionTarget?: typeof resolutionTarget }).resolutionTarget = resolutionTarget
  }
  updatedConflicts[conflictIndex] = resolvedConflict

  return {
    ...state,
    conflicts: updatedConflicts,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Get unresolved conflicts
 */
export function getUnresolvedConflicts(state: MigrationState): ConflictRecord[] {
  return state.conflicts.filter((c) => !c.resolution)
}

function generateConflictId(): string {
  return `conflict-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`
}

// ============================================================================
// State Normalization
// ============================================================================

/**
 * Normalize and repair partial or inconsistent state
 * Used when loading state from persistence
 */
export function normalizeMigrationState(raw: unknown): MigrationState {
  if (!raw || typeof raw !== 'object') {
    throw new StateError('Invalid state: expected object')
  }

  const parsed = raw as Partial<MigrationState>

  // Validate required fields
  if (!parsed.migrationId || typeof parsed.migrationId !== 'string') {
    throw new StateError('Invalid state: missing migrationId')
  }

  if (!parsed.sourcePath || typeof parsed.sourcePath !== 'string') {
    throw new StateError('Invalid state: missing sourcePath')
  }

  if (!parsed.targetRoot || typeof parsed.targetRoot !== 'string') {
    throw new StateError('Invalid state: missing targetRoot')
  }

  const now = new Date().toISOString()

  const result: MigrationState = {
    version: 1,
    migrationId: parsed.migrationId,
    stage: normalizeStage(parsed.stage),
    sourcePath: parsed.sourcePath,
    targetRoot: parsed.targetRoot,
    sourceType: parsed.sourceType ?? null,
    disposalMode: normalizeDisposalMode(parsed.disposalMode),
    dryRun: parsed.dryRun ?? false,
    stageResults: normalizeStageResults(parsed.stageResults),
    startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : now,
    updatedAt: now,
    inventory: normalizeArray(parsed.inventory),
    classifications: normalizeArray(parsed.classifications),
    conflicts: normalizeArray(parsed.conflicts),
    pendingQuestions: normalizeArray(parsed.pendingQuestions),
    resolvedQuestions: normalizeArray(parsed.resolvedQuestions),
  }

  // Add optional fields only if they have values
  if (typeof parsed.completedAt === 'string') {
    result.completedAt = parsed.completedAt
  }
  if (parsed.plan) {
    result.plan = parsed.plan
  }
  if (parsed.applyResult) {
    result.applyResult = parsed.applyResult
  }
  if (typeof parsed.lastError === 'string') {
    result.lastError = parsed.lastError
  }
  if (parsed.detectedAdapters && Array.isArray(parsed.detectedAdapters)) {
    result.detectedAdapters = parsed.detectedAdapters
  }
  if (parsed.selectedAdapter) {
    result.selectedAdapter = parsed.selectedAdapter
  }
  if (parsed.needsOpenFlowInit !== undefined) {
    result.needsOpenFlowInit = parsed.needsOpenFlowInit
  }
  if (parsed.openFlowInitConfirmed !== undefined) {
    result.openFlowInitConfirmed = parsed.openFlowInitConfirmed
  }

  return result
}

function normalizeStage(stage: unknown): MigrationStage {
  const validStages: MigrationStage[] = [
    'detect', 'scan', 'classify', 'clarify', 'plan', 'apply', 'cleanup', 'completed', 'failed'
  ]
  if (typeof stage === 'string' && validStages.includes(stage as MigrationStage)) {
    return stage as MigrationStage
  }
  return 'detect'
}

function normalizeDisposalMode(mode: unknown): DisposalMode {
  const validModes: DisposalMode[] = ['keep', 'move-to-references', 'delete']
  if (typeof mode === 'string' && validModes.includes(mode as DisposalMode)) {
    return mode as DisposalMode
  }
  return 'keep'
}

function normalizeStageResults(results: unknown): StageResult[] {
  if (!Array.isArray(results)) return []
  return results.filter((r): r is StageResult =>
    r &&
    typeof r === 'object' &&
    typeof r.stage === 'string' &&
    typeof r.completedAt === 'string'
  )
}

function normalizeArray<T>(arr: unknown): T[] {
  if (!Array.isArray(arr)) return []
  return arr as T[]
}

// ============================================================================
// Error Classes
// ============================================================================

export class StateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StateError'
  }
}

export class StageTransitionError extends StateError {
  constructor(message: string) {
    super(message)
    this.name = 'StageTransitionError'
  }
}
