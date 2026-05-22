export interface FeatureConfig {
  enabled: boolean
  auto_trigger: boolean
  trigger_mode: FeatureTriggerMode
  generate_prd: boolean
  closure: FeatureClosureConfig
}

export type FeatureTriggerMode = 'smart' | 'always' | 'never'

export interface FeatureClosureConfig {
  enabled: boolean
  auto_transition: boolean
  strong_signals: string[]
  weak_signals: string[]
  weak_signal_threshold: number
}

export interface TddConfig {
  enabled: boolean
}

export interface AdapterConfig {
  command?: string
  args?: string[]
  timeout?: number
  onMissing?: 'skip' | 'fail'
}

export interface ConsistencyAdapterConfig {
  drift_check?: boolean
  current_constraints?: boolean
  decisions_constraints?: boolean
  symbol_level?: boolean
}

export interface VerificationAdapterConfig {
  secret?: AdapterConfig
  vuln?: AdapterConfig
  dependency?: AdapterConfig
  consistency?: ConsistencyAdapterConfig
}

export interface VerificationConfig {
  in_plan: boolean
  security: SecurityCheckType[]
  quality: QualityCheckType[]
  auto_fix: boolean
  completion_prompt: boolean
  allow_accept_failures?: boolean
  adapters?: VerificationAdapterConfig
}

export type SecurityCheckType = 'secret' | 'vuln' | 'dependency'
export type QualityCheckType = 'lint' | 'typecheck' | 'test' | 'format'

export interface ArchiveConfig {
  enabled: boolean
  drift_check?: boolean
  auto_promote_current?: boolean
  sync_promotion_fallback?: boolean
}

export interface AcceptanceConfig {
  enabled: boolean
  trigger_words_zh: string[]
  trigger_words_en: string[]
  doc_sync_prompt: boolean
  drift_detection: boolean
}

export interface WritingPlanConfig {
  enabled: boolean
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogOutput = 'console' | 'file' | 'both'
export type LogFormat = 'text' | 'json'
export type LogCategory = 'harden' | 'session' | 'quality_gate' | 'config' | 'drift' | 'orchestrator' | 'feature' | 'archive' | 'default'

export interface LoggingConfig {
  level: LogLevel
  output: LogOutput
  path: string
  maxFiles: number
  categories: LogCategory[] | 'all'
  format: LogFormat
}

export interface GuardianConfig {
  enabled: boolean
  auto_start: boolean
  auto_fix: boolean
  max_retries: number
  contract_cache: boolean
}

export type HardenFindingLevel = 'blocking_bug' | 'spec_violation' | 'regression_risk' | 'test_gap' | 'design_ambiguity' | 'style_or_preference'

export type HardenFindingConfidence = 'high' | 'medium' | 'low'

export type HardenFindingStatus = 'suspected' | 'confirmed' | 'fixed' | 'verified' | 'dismissed' | 'needs_decision'

export type Disposition = 'must_fix' | 'accepted_known_issue' | 'design_divergence' | 'false_positive' | 'needs_decision' | 'superseded'

export interface HardenTraceEntry {
  round: number
  agent: string
  tokens: number
  result: string
  timestamp: string
}

export interface HardenFinding {
  level: HardenFindingLevel
  description: string
  evidence: string
  files: string[]
  lines?: string
  id?: string
  normalizedKey?: string
  confidence?: HardenFindingConfidence
  status?: HardenFindingStatus
  disposition?: Disposition
  repeatCount?: number
}

export interface HardenRoundResult {
  round: number
  findings: HardenFinding[]
  fixReport?: string
  fixDiff?: string
}

export type HardenStatus = 'pass' | 'pass_with_risks' | 'max_rounds_reached' | 'budget_exhausted' | 'needs_human' | 'rejected' | 'review_inconclusive' | 'executor_blocked' | 'known_issues_accepted'

export interface HardenResult {
  status: HardenStatus
  rounds: HardenRoundResult[]
  budgetConsumed: number
  summary: string
  stopReason?: string
  trace?: HardenTraceEntry[]
  acceptedFindingsSummary?: string
  coordinatorSessionId?: string
  totalTokensConsumed?: number
}

export type HardenMode = 'quick' | 'standard' | 'deep'

export type ComplexityGrade = 'trivial' | 'simple' | 'complex'

export interface HardenConfig {
  enabled: boolean
  maxRounds: number
  maxArgumentRoundsPerFinding: number
  reviewerModel?: string
  executorModel?: string
}

export type HardenExecutorVerdict = 'accept' | 'reject' | 'partial'

export interface HardenDispositionItem {
  findingId: string
  verdict: HardenExecutorVerdict
  rationale: string
  fixSummary?: string
}

export interface HardenRebuttalRecord {
  reviewerRebuttalSessionId: string
  challenge: string
  executorFinalSessionId: string
  finalVerdict: HardenExecutorVerdict
}

export interface HardenRoundSessionIds {
  round: number
  reviewerSessionId: string
  executorSessionId: string
  reviewerRebuttalSessionId?: string
  executorRebuttalSessionId?: string
}

export type DriftDisposition = 'auto_repaired' | 'ambiguous_needs_confirmation' | 'violation_needs_fix' | 'no_drift'

export interface DriftGuardianConfig {
  enabled: boolean
  auto_start: boolean
  auto_fix: boolean
  max_retries: number
  contract_cache: boolean
}

export interface GuardianRepairRecord {
  timestamp: string
  feature: string
  filePath: string
  disposition: 'auto_repaired'
  originalSegment: string
  repairedSegment: string
  reason: string
}

export interface GuardianPendingItem {
  timestamp: string
  feature: string
  filePath: string
  item: string
  disposition: 'ambiguous_needs_confirmation' | 'violation_needs_fix'
  reason: string
  suggestedFix?: string
}

export interface GuardianEvidence {
  autoRepairs: number
  pendingAmbiguities: number
  unresolvedViolations: number
  contractSource: string
  repairRecords: GuardianRepairRecord[]
  pendingItems: GuardianPendingItem[]
}

export interface GuardianJobState {
  feature: string
  sessionId: string
  startedAt: string
  lastCheckedAt?: string
  repairsCount: number
  pendingCount: number
}

export interface FileChangedEvent {
  type: 'file_changed'
  filePath: string
  tool: 'write' | 'edit'
  timestamp: number
  sessionId?: string
}

export interface ContractConsumer {
  onEvent(event: FileChangedEvent): Promise<void>
  onSessionEvent(event: { type: string; sessionId?: string }): Promise<void>
}

export interface EvidenceSinkEntry {
  source: 'guardian' | 'verify' | 'archive'
  feature: string
  timestamp: string
  data: unknown
}

export interface PathsConfig {
  changes: string
  archive: string
  current_requirements: string
  current_design: string
  current_spec: string
  current_workflow: string
  builds: string
  plans: string
  acceptance_state: string
  feature_state: string
  change_units: string
  guardian_state: string
  boulder_state: string
  evidence_dir: string
  implementation_runs: string
  worktree_dir: string
}

export type OpenFlowLocale = 'zh-CN' | 'en'

export interface OpenFlowConfig {
  paths: PathsConfig
  feature: FeatureConfig
  tdd: TddConfig
  verification: VerificationConfig
  acceptance: AcceptanceConfig
  archive: ArchiveConfig
  writingPlan: WritingPlanConfig
  harden: HardenConfig
  guardian: DriftGuardianConfig
  logging?: LoggingConfig
  executionQualityPolicy?: ExecutionQualityPolicyConfig
  locale?: OpenFlowLocale
}

export const defaultConfig: OpenFlowConfig = {
  locale: 'zh-CN',
  paths: {
    changes: 'docs/changes',
    archive: 'docs/archive',
    current_requirements: 'docs/current/requirements',
    current_design: 'docs/current/design',
    current_spec: 'docs/current/spec',
    current_workflow: 'docs/current/workflow',
    builds: '.sisyphus/builds',
    plans: '.sisyphus/plans',
    acceptance_state: '.sisyphus/acceptance.local.md',
    feature_state: '.sisyphus/feature',
    change_units: '.sisyphus/change-units.json',
    guardian_state: '.sisyphus/openflow/guardian',
    boulder_state: '.sisyphus/boulder.json',
    evidence_dir: '.sisyphus/evidence',
    implementation_runs: '.sisyphus/openflow/runs',
    worktree_dir: '.sisyphus/worktree',
  },
  feature: {
    enabled: true,
    auto_trigger: true,
    trigger_mode: 'smart',
    generate_prd: true,
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
  },
  verification: {
    in_plan: true,
    security: ['secret', 'vuln'],
    quality: ['lint', 'typecheck', 'test'],
    auto_fix: false,
    completion_prompt: true,
    allow_accept_failures: true,
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
    drift_check: true,
    auto_promote_current: true,
  },
  writingPlan: { enabled: true },
  harden: {
    enabled: true,
    maxRounds: 5,
    maxArgumentRoundsPerFinding: 2,
  },
  guardian: {
    enabled: true,
    auto_start: true,
    auto_fix: true,
    max_retries: 3,
    contract_cache: true,
  },
  logging: {
    level: 'info',
    output: 'console',
    path: '.sisyphus/openflow/logs',
    maxFiles: 7,
    categories: 'all',
    format: 'text',
  },
  executionQualityPolicy: {
    enabled: true,
    defaultMode: 'balanced',
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

export type FeatureWorkflowState = 'collecting' | 'ready_to_generate' | 'generating' | 'completed' | 'failed'

export type FeatureQuestionId = 'problem' | 'target-users' | 'scope' | 'priority' | 'constraints'

export interface PersistedFeatureSession {
  version: 2
  feature: string
  workflowState: FeatureWorkflowState
  pendingQuestionId: FeatureQuestionId | null
  askedQuestionIds: FeatureQuestionId[]
  answers: Partial<Record<FeatureQuestionId, string>>
  generatedDocs: string[]
  generationAttemptCount: number
  lastError?: string
  lastQuestionPromptedAt?: string
  lastAnsweredAt?: string
  updatedAt: string
}

export interface ActiveFeatureIndex {
  bySessionID: Record<string, { feature: string; updatedAt: string }>
}

export interface RecentFeatureCompletionIndex {
  bySessionID: Record<string, { feature: string; completedAt: string }>
}

export type RequestType = 'trivial' | 'explicit' | 'exploratory' | 'open-ended' | 'fix'

export type FeatureTriggerSource = 'intent' | 'fallback' | 'config'

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

export type VerificationFailureCategory = 'quality' | 'security' | 'consistency' | 'compilation'

export type PromotionType = 'ADD' | 'UPDATE' | 'REMOVE'

export type CurrentPromotionStrategy = 'direct_migration' | 'synthesized_refresh'

export interface CurrentPromotionSuggestion {
  type: PromotionType
  targetArea: 'design' | 'requirements' | 'behavior'
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

export type ArchiveDocUpdateConfirmationStatus = 'confirmed' | 'declined'

export interface VerifyEvidenceCheckResult {
  name: string
  passed: boolean
  category: VerificationFailureCategory
  detail?: string
}

export type BehaviorScenarioCheckStatus = 'verified' | 'missing_evidence' | 'failed' | 'not_applicable'

export interface BehaviorScenarioCheckResult {
  scenarioId: string
  name: string
  criticality?: 'critical' | 'normal' | 'optional'
  status: BehaviorScenarioCheckStatus
  evidenceType?: string
  evidenceReference?: string
  detail?: string
  coverageLevel?: BehaviorCoverageLevel
  freshness?: BehaviorFreshness
  equivalenceRationale?: string
}

export interface VerifyEvidencePacket {
  checksRun: string[]
  checkResults: VerifyEvidenceCheckResult[]
  behaviorScenarios?: BehaviorScenarioCheckResult[]
  classifiedEvidenceGaps?: ClassifiedEvidenceGap[]
  observedBehaviorSummary: string
  intendedVsActualDelta: string
  docAlignmentSummary: string
  constraintConflictSummary: string
  knownRisksOrMissingEvidence: string
  behaviorEvidence?: BehaviorScenarioEvidence[]
}

export type BehaviorEvidenceStatus = 'verified' | 'missing_evidence' | 'failed' | 'not_applicable'

export type BehaviorCriticality = 'critical' | 'normal' | 'optional'
export type BehaviorCoverageLevel = 'exact' | 'equivalent' | 'partial' | 'missing' | 'not_applicable'
export type BehaviorFreshness = 'fresh' | 'stale' | 'unknown'

export interface BehaviorScenarioEvidence {
  scenarioName: string
  status: BehaviorEvidenceStatus
  evidenceType: string
  evidenceReference: string
  reason: string
  scenarioId?: string
  criticality?: BehaviorCriticality
  coverageLevel?: BehaviorCoverageLevel
  equivalenceRationale?: string
  freshness?: BehaviorFreshness
}

export interface VerifyResult {
  readiness: VerifyReadinessStatus
  reasonCodes: string[]
  decisionType?: VerifyDecisionType
  evidenceSummary: string
  constraintsChecked: string[]
  verifiedAt: string
}

export interface HardenTerminalSummary {
  status: string
  stopReason: string
  unresolvedMustFixCount: number
  unresolvedNeedsDecisionCount: number
  acceptedKnownIssueCount: number
}

export interface AcceptedKnownIssueSummary {
  findingId: string
  disposition: 'accepted_known_issue' | 'design_divergence'
  rationale: string
  archiveEffect: 'non_blocking' | 'doc_update_required' | 'decision_required'
  evidenceRefs: string[]
  verifyStatus: string
}

export type IssueClassification =
  | 'bugfix'
  | 'data_issue'
  | 'config_issue'
  | 'environment_issue'
  | 'doc_ambiguity'
  | 'behavior_change'
  | 'cannot_determine'

export type GovernancePromotionStatus =
  | 'none'
  | 'candidate_created'
  | 'confirmed'
  | 'needs_decision'
  | 'blocked_unapproved'

export type IssueWorkflowStatus =
  | 'reported'
  | 'investigating'
  | 'classified'
  | 'fixing'
  | 'verifying'
  | 'resolved'
  | 'closed'

export interface IssuePacketEvidence {
  source: string
  summary: string
}

export interface IssuePacket {
  version: 1
  slug: string
  symptom: string
  environment: 'local' | 'staging' | 'production'
  status: IssueWorkflowStatus
  classification: IssueClassification
  confidence: 'low' | 'medium' | 'high'
  evidence: IssuePacketEvidence[]
  hypotheses: string[]
  rootCause?: string
  recommendedAction?: string
  requiredChecks: string[]
  fixSummary?: string
  verificationEvidence?: string
  residualRisk?: string
  noFixNeededReason?: string
  createdAt: string
  updatedAt: string
  /** Session ID that created this issue. Used for session-scoped blocking. */
  sessionID?: string
}

/** Implementation lifecycle states for stateful quality guardrails.
 *  - clean: no implementation changes since last verify
 *  - dirty: implementation changes detected, readiness may be stale
 *  - verified: quality-gate passed with fresh readiness
 *  - stale: verified but subsequent implementation changes detected
 *  - blocked: completion/archive blocked until quality-gate re-run
 */
export type ImplementationState = 'clean' | 'dirty' | 'verified' | 'stale' | 'blocked'

/** Metadata for implementation state tracking */
export interface ImplementationStateMetadata {
  /** Current implementation state */
  state: ImplementationState
  /** ISO-8601 timestamp when state was last updated */
  updatedAt: string
  /** Files that caused the state transition to dirty/stale */
  changedFiles?: string[]
  /** Git HEAD at time of state update */
  gitHead?: string
  /** Whether the state transition was from a verify success */
  fromVerify?: boolean
}

/** Status of an implementation run */
export type ImplementationRunStatus =
  | 'created'
  | 'starting_backend'
  | 'running'
  | 'quality_gate_pending'
  | 'quality_gate_running'
  | 'ready_for_archive'
  | 'archiving'
  | 'archived'
  | 'blocked'
  | 'cancelled'

/** Backend type for implementation execution */
export type ImplementationBackend = 'omo' | 'opencode'

/** Container mode for implementation run isolation */
export type ImplementationContainerMode = 'session' | 'worktree'

/** A single implementation run tracking record */
export interface ImplementationRun {
  /** Unique run identifier */
  runID: string
  /** Feature slug this run belongs to */
  feature: string
  /** Session ID that owns this run */
  sessionID: string
  /** Message ID that triggered this run */
  messageID: string
  /** Agent name executing this run */
  agent: string
  /** Working directory for the run */
  directory: string
  /** Git worktree path if using worktree isolation */
  worktree?: string
  /** Git branch used for the worktree */
  branch?: string
  /** Base ref (git HEAD) when the worktree was created */
  baseRef?: string
  /** Backend executing the run */
  backend: ImplementationBackend
  /** Command used to invoke the backend */
  backendCommand: string
  /** Current run status */
  status: ImplementationRunStatus
  /** Isolation mode for the run */
  containerMode: ImplementationContainerMode
  /** Worktree kind: main worktree or derived worktree */
  worktreeKind?: 'main' | 'derived'
  /** Commit policy for this run */
  commitPolicy?: 'archive'
  /** Cleanup policy for the worktree */
  cleanupPolicy?: string
  /** Whether the main worktree was dirty before isolated execution began */
  mainWorktreeDirty?: boolean
  /** ISO-8601 timestamp when run was created */
  startedAt: string
  /** ISO-8601 timestamp when run was last updated */
  updatedAt: string
  /** Path to run events log */
  eventsPath: string
  /** Path to run observations log */
  observationsPath: string
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
  archiveUsedDocUpdateConfirmPath?: boolean
  archiveDocUpdateConfirmationStatus?: ArchiveDocUpdateConfirmationStatus
  archiveDocUpdateConfirmedAt?: string
  promotionSuggestions?: CurrentPromotionSuggestion[]
  promotionDecidedAt?: string
  promotionApplied?: boolean
  promotionAppliedAt?: string
  readiness?: VerifyReadinessStatus
  verifyResult?: VerifyResult
  acceptedFailures?: boolean
  // Issue-mode fields
  mode?: 'feature' | 'issue'
  issueSlug?: string
  rawIssue?: string
  primaryClassification?: IssueClassification
  classifications?: IssueClassification[]
  governancePromotionStatus?: GovernancePromotionStatus
  issueClarificationPath?: string
  promotionCandidatePath?: string
  /** Evidence freshness metadata for quality-gate reuse decisions */
  evidenceFreshness?: EvidenceFreshnessMetadata
  /** Structured harden terminal summary used by archive gating */
  hardenTerminalSummary?: HardenTerminalSummary
  /** Audit trail for accepted known issues recorded by quality-gate */
  acceptedKnownIssues?: AcceptedKnownIssueSummary[]
  /** Minimal harden terminal summary persisted as JSON */
  hardenSummary?: string
  /** Quality-gate orchestration applicability metadata; not verify readiness. */
  qualityGateApplicability?: QualityGateApplicabilityResult
  /** Marks limited-context technical readiness for later post-hoc issue archive handling. */
  postHocIssue?: boolean
  /** Implementation state for stateful quality guardrails */
  implementationState?: ImplementationStateMetadata
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

// Execution Quality Policy types
export type QualityMode = 'fast' | 'balanced' | 'strict'

export type HardenPolicy = 'none' | 'risk-based' | 'final'

export interface ExecutionQualityPolicy {
  feature: string
  plan_name: string
  executor: string
  quality_mode: QualityMode
  harden_policy: HardenPolicy
  verify_policy: string
  selected_at: string
  selected_by: string
}

export interface ExecutionQualityPolicyConfig {
  enabled: boolean
  defaultMode: QualityMode
}

// ── Quality Gate contracts ────────────────────────────────────────────────
// Shared types for autonomous quality gate orchestration.
// Reuses HardenStatus, HardenPolicy, and VerifyReadinessStatus.
// Readiness fields mirror VerifyResult fields (flattened, prefixed) for
// archive compatibility — no separate readiness store.

/** The semantic context source available to the quality gate.
 *  Represents what kind of work triggered evaluation — NOT a quality mode. */
export type QualityGateContextKind =
  | 'feature'   // feature/change workflow
  | 'issue'     // issue investigation
  | 'plan'      // plan execution context
  | 'request'   // generic user request without explicit workflow
  | 'limited'   // context available but budget-restricted
  | 'none'      // no semantic context available

export type QualityGateApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'needs_workflow_stage'
  | 'limited_context'

export type QualityGateTaskKind =
  | 'implementation_done'
  | 'bugfix_done'
  | 'archive_ready'
  | 'design_only'
  | 'planning_only'
  | 'metadata_only'
  | 'rename_only'
  | 'docs_only'
  | 'unknown'

export interface QualityGateApplicabilityResult {
  status: QualityGateApplicabilityStatus
  reasonCode: string
  reason: string
  taskKind: QualityGateTaskKind
  shouldRunVerify: boolean
  shouldRunHarden: boolean
  archiveReadinessEligible: boolean
  nextStep: string
}

export type EvidenceGapKind =
  | 'blocking_evidence_gap'
  | 'workflow_stage_missing'
  | 'limited_context_gap'
  | 'informational_gap'

export interface ClassifiedEvidenceGap {
  code: string
  kind: EvidenceGapKind
  message: string
  nextStep: string
}

export interface QualityGateResult {
  /** Feature name this quality gate was evaluated for */
  feature: string
  /** Semantic context source (feature / issue / plan / request / limited / none) */
  contextKind: QualityGateContextKind
  /** The harden policy decided (none / risk-based / final) */
  hardenDecision: HardenPolicy
  /** Result of harden if executed */
  hardenStatus?: HardenStatus
  /** Readiness for archive — reuses VerifyReadinessStatus */
  readiness?: VerifyReadinessStatus
  /** Reason codes for the readiness decision */
  readinessReasonCodes?: string[]
  /** Summary of readiness-relevant evidence */
  readinessEvidenceSummary?: string
  /** Constraints checked during verification */
  readinessConstraintsChecked?: string[]
  /** When readiness was last verified (ISO timestamp) */
  readinessVerifiedAt?: string
  /** High-level evidence narrative */
  evidenceSummary?: string
  /** Non-blocking warnings collected during evaluation */
  warnings: string[]
  /** True when context budget was insufficient — NOT a failure signal */
  limitedContext: boolean
  /** Applicability decision made before harden/verify side effects */
  applicability?: QualityGateApplicabilityResult
}

// ── Evidence Freshness Metadata ───────────────────────────────────────────
// Tracks when evidence was recorded so the quality gate can distinguish
// fresh, stale, and missing evidence without trusting natural-language claims.

export interface EvidenceFreshnessMetadata {
  /** Git HEAD commit hash when evidence was recorded (git rev-parse HEAD) */
  gitHead: string
  /** Changed files at time of recording (git diff --name-only) */
  changedFiles: string[]
  /** Short diff identity hash for quick comparison */
  diffHash: string
  /** ISO-8601 timestamp when evidence was recorded */
  recordedAt: string
  /** Names of evidence checks that were run (e.g. ["test", "typecheck"]) */
  evidenceChecks: string[]
  /** Human-readable summary of the evidence collected */
  evidenceSummary: string
}

export type EvidenceFreshnessStatus = 'fresh' | 'stale' | 'missing'

export interface EvidenceFreshnessResult {
  status: EvidenceFreshnessStatus
  /** Stored metadata (present unless status is 'missing') */
  metadata?: EvidenceFreshnessMetadata
  /** Human-readable reason for the classification */
  reason: string
  /** When stale: what specifically differed (e.g. "git HEAD changed", "working tree changed") */
  staleDetails?: string[]
}

/** Injectable workspace snapshot — allows tests to avoid real git commands. */
export interface CurrentWorkspaceState {
  gitHead: string
  changedFiles: string[]
  /** Unix-ms timestamp of the most recent changed file (optional) */
  latestChangeTimestamp?: number
}
