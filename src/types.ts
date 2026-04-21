export interface BrainstormingConfig {
  enabled: boolean
  output_dir: string
  auto_trigger: boolean
  trigger_mode: BrainstormTriggerMode
  generate_prd: boolean
  prd_output_dir: string
  closure: BrainstormClosureConfig
}

export type BrainstormTriggerMode = 'smart' | 'always' | 'never'

export interface BrainstormClosureConfig {
  enabled: boolean
  auto_transition: boolean
  strong_signals: string[]
  weak_signals: string[]
  weak_signal_threshold: number
}

export interface TddConfig {
  enabled: boolean
  expand_threshold: number
}

export interface VerificationConfig {
  in_plan: boolean
  security: SecurityCheckType[]
  quality: QualityCheckType[]
  auto_fix: boolean
  completion_prompt: boolean
}

export type SecurityCheckType = 'secret' | 'vuln' | 'dependency'
export type QualityCheckType = 'lint' | 'typecheck' | 'test' | 'format'

export interface ArchiveConfig {
  enabled: boolean
  output_dir: string
  drift_check?: boolean
  auto_promote_current?: boolean
}

export interface AcceptanceConfig {
  enabled: boolean
  trigger_words_zh: string[]
  trigger_words_en: string[]
  doc_sync_prompt: boolean
  drift_detection: boolean
}

export interface OpenFlowConfig {
  brainstorming: BrainstormingConfig
  tdd: TddConfig
  verification: VerificationConfig
  acceptance: AcceptanceConfig
  archive: ArchiveConfig
}

export const defaultConfig: OpenFlowConfig = {
  brainstorming: {
    enabled: true,
    output_dir: 'docs/changes',
    auto_trigger: true,
    trigger_mode: 'smart',
    generate_prd: true,
    prd_output_dir: 'docs/changes',
    closure: {
      enabled: true,
      auto_transition: true,
      strong_signals: ['按这个做', '按这个方案推进', '生成正式文档', '就按这个方向', 'go with this', 'proceed with this', 'generate formal docs'],
      weak_signals: ['可以', '好', '确认', '没问题', 'done', 'looks good', 'approved'],
      weak_signal_threshold: 2,
    },
  },
  tdd: {
    enabled: true,
    expand_threshold: 3,
  },
  verification: {
    in_plan: true,
    security: ['secret', 'vuln'],
    quality: ['lint', 'typecheck', 'test'],
    auto_fix: false,
    completion_prompt: true,
  },
  acceptance: {
    enabled: true,
    trigger_words_zh: ['调整', '改一下', '测试发现', '验收', '检查', '问题', '还有问题', '需要改'],
    trigger_words_en: ['adjust', 'fix', 'test found', 'acceptance', 'check', 'issue', 'tweak', 'modify'],
    doc_sync_prompt: true,
    drift_detection: true,
  },
  archive: {
    enabled: true,
    output_dir: 'docs/archive',
    drift_check: true,
    auto_promote_current: true,
  },
}

// 已增强的计划记录（内存中）
export interface EnhancedPlansState {
  plans: Set<string>
}

// 文件变更记录（从 Session API 获取）
export interface FileChangeRecord {
  filePath: string
  tool: 'write' | 'edit'
  timestamp?: number
}

export interface OpenFlowContext {
  directory: string
  worktree: string
  client: unknown
  $: unknown
  config: OpenFlowConfig
  enhancedPlans: Set<string>
}

export type BrainstormWorkflowState = 'collecting' | 'ready_to_generate' | 'generating' | 'completed' | 'failed'

export type BrainstormQuestionId = 'problem' | 'target-users' | 'scope' | 'priority' | 'constraints'

export interface PersistedBrainstormSession {
  version: 2
  feature: string
  workflowState: BrainstormWorkflowState
  pendingQuestionId: BrainstormQuestionId | null
  askedQuestionIds: BrainstormQuestionId[]
  answers: Partial<Record<BrainstormQuestionId, string>>
  generatedDocs: string[]
  generationAttemptCount: number
  lastError?: string
  lastQuestionPromptedAt?: string
  lastAnsweredAt?: string
  updatedAt: string
}

export interface ActiveBrainstormIndex {
  bySessionID: Record<string, { feature: string; updatedAt: string }>
}

export interface RecentBrainstormCompletionIndex {
  bySessionID: Record<string, { feature: string; completedAt: string }>
}

export type RequestType = 'trivial' | 'explicit' | 'exploratory' | 'open-ended' | 'fix'

export type BrainstormTriggerSource = 'intent' | 'fallback' | 'config'

export type TaskType = 'implementation' | 'test' | 'verification' | 'review' | 'setup' | 'unknown'

export interface ParsedTask {
  id: number
  title: string
  description: string
  type: TaskType
  dependencies: number[]
  isImplementation: boolean
  raw: string
  lineNumber: number
}

// 验收阶段类型
export type DevelopmentPhase =
  | 'implementation'
  | 'acceptance'
  | 'verification_pending'
  | 'verification_failed'
  | 'archived'
  | 'promotion_pending'
  | 'promoted'

export type VerificationFailureCategory = 'quality' | 'security' | 'consistency'

export type PromotionType = 'ADD' | 'UPDATE' | 'REMOVE'

export type CurrentPromotionStrategy = 'direct_migration' | 'synthesized_refresh'

export interface CurrentPromotionSuggestion {
  type: PromotionType
  targetArea: 'design' | 'requirements'
  targetPath: string
  sourcePath?: string
  strategy?: CurrentPromotionStrategy
  reason: string
}

export interface PendingDocUpdate {
  file: string
  timestamp: string
  reason?: string
}

export enum VerifyReadinessStatus {
  Ready = 'ready',
  ReadyWithDocUpdates = 'ready_with_doc_updates',
  NotReady = 'not_ready',
  NeedsDecision = 'needs_decision',
}

export enum VerifyDecisionType {
  RuleConflict = 'rule_conflict',
  CurrentConflict = 'current_conflict',
  BusinessDecision = 'business_decision',
}

export interface VerifyResult {
  readiness: VerifyReadinessStatus
  reasonCodes: string[]
  decisionType?: VerifyDecisionType
  evidenceSummary: string
  constraintsChecked: string[]
  verifiedAt: string
}

export interface AcceptanceState {
  feature: string
  phase: DevelopmentPhase
  phaseStartedAt: string
  sessionID?: string
  implementationEndedAt?: string
  verificationPromptedAt?: string
  verificationCompletedAt?: string
  verificationFailureCategory?: VerificationFailureCategory
  pendingDocUpdates: PendingDocUpdate[]
  waitingForDocUpdateConfirm?: boolean
  lastChangedFile?: string
  promotionSuggestions?: CurrentPromotionSuggestion[]
  promotionDecidedAt?: string
  promotionApplied?: boolean
  promotionAppliedAt?: string
  readiness?: VerifyReadinessStatus
  verifyResult?: VerifyResult
}

// 按阶段分段的文件变更记录
export interface PhasedChanges {
  implementation: FileChangeRecord[]
  acceptance: FileChangeRecord[]
}

// 设计文档漂移检测结果
export interface DriftItem {
  item: string
  designDoc: string
  actualCode: string
  reason: string
}
