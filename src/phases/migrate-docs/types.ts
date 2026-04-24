/**
 * Migration types for the docs-migration-command feature
 *
 * These types define the data structures used throughout the migration process
 * from source document detection to final cleanup.
 */

// ============================================================================
// Stage Types
// ============================================================================

/** Migration workflow stages representing the complete migration lifecycle */
export type MigrationStage =
  | 'detect'
  | 'scan'
  | 'classify'
  | 'clarify'
  | 'plan'
  | 'apply'
  | 'cleanup'
  | 'completed'
  | 'failed'

// ============================================================================
// Source Types
// ============================================================================

/** Supported source document types/frameworks */
export type SourceType =
  | 'openspec'
  | 'spec-kit'
  | 'kiro'
  | 'cursor'
  | 'trae'
  | 'generic'

// ============================================================================
// Confidence Types
// ============================================================================

/** Confidence levels for classification results */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

// ============================================================================
// Inventory Types
// ============================================================================

/** File metadata collected during the scanning phase */
export interface FileInventory {
  /** Absolute path to the source file */
  sourcePath: string
  /** Path relative to the source root */
  relativePath: string
  /** File size in bytes */
  size: number
  /** Last modification timestamp */
  modifiedAt: string
  /** File extension (e.g., '.md', '.markdown') */
  extension: string
  /** Directory context - parent directory name or path segment */
  directoryContext: string
  /** Optional adapter-specific metadata */
  adapterMetadata?: Record<string, string>
}

// ============================================================================
// Classification Types
// ============================================================================

/** Target category for classified documents within the OpenFlow structure */
export type TargetCategory =
  | 'current/requirements'
  | 'current/design'
  | 'current/spec'
  | 'current/workflow'
  | 'changes'
  | 'archive'
  | 'decisions'
  | 'references/raw'
  | 'references/notes'
  | 'references/research'

/** Result of classifying a single file for migration */
export interface ClassificationResult {
  /** The inventory item being classified */
  inventoryItem: FileInventory
  /** The determined target category for this file */
  targetType: TargetCategory
  /** Qualitative confidence level */
  confidence: ConfidenceLevel
  /** Numerical confidence score (0.0 to 1.0) */
  confidenceScore: number
  /** Name of the adapter used for classification */
  adapterUsed: string
  /** Human-readable explanation of the classification decision */
  reasoning: string
  /** Proposed target path for this file */
  proposedTargetPath?: string
}

// ============================================================================
// Conflict Types
// ============================================================================

/** Record of a conflict detected during migration planning */
export interface ConflictRecord {
  /** Unique conflict identifier */
  id: string
  /** Type of conflict */
  type: 'target-collision' | 'lifecycle-conflict' | 'adr-candidate'
  /** First conflicting source */
  sourceA: string
  /** Second conflicting source */
  sourceB: string
  /** Human-readable description of the conflict */
  description: string
  /** Resolution status */
  resolution?: 'accepted' | 'rejected' | 'alternative'
  /** Alternative target if resolution is 'alternative' */
  resolutionTarget?: TargetCategory
  /** When the conflict was resolved */
  timestamp?: string
}

// ============================================================================
// Plan Types
// ============================================================================

/** Types of migration operations */
export type MigrationOperationType = 'create' | 'create_dir' | 'modify' | 'skip'

/** A single operation in the migration plan */
export interface MigrationOperation {
  /** Operation type */
  type: MigrationOperationType
  /** Source file path (undefined for create_dir) */
  sourcePath?: string
  /** Target file path */
  targetPath: string
  /** Content to write (for create operations) */
  content?: string
  /** Reason for operation (especially for skip) */
  reason?: string
}

/** The complete migration plan containing all operations */
export interface MigrationPlan {
  /** Array of all migration operations to execute */
  operations: MigrationOperation[]
  /** Directories that need to be created */
  directoryCreations: string[]
  /** Recorded conflicts and their resolutions */
  conflictResolutions: ConflictRecord[]
  /** Plan summary statistics */
  summary: PlanSummary
}

// ============================================================================
// Apply Types
// ============================================================================

/** Result of applying the migration plan */
export interface ApplyResult {
  /** Files that were successfully created */
  createdFiles: string[]
  /** Files that were successfully modified */
  modifiedFiles: string[]
  /** Files that were successfully deleted */
  deletedFiles: string[]
  /** Files that were skipped with reasons */
  skippedFiles: { path: string; reason: string }[]
  /** Operations that failed during application */
  failedOps: Array<{
    operation: MigrationOperation
    error: string
  }>
}

// ============================================================================
// Clarification Types
// ============================================================================

/** A single user answer to a clarification question */
export interface UserAnswer {
  /** Question identifier */
  questionId: string
  /** User's answer */
  answer: string
  /** When the answer was provided */
  timestamp: string
}

/** A pending question waiting for user clarification */
export interface PendingQuestion {
  /** Unique question identifier */
  id: string
  /** Section header or context for the question */
  header: string
  /** The actual question text */
  question: string
  /** Available options */
  options: QuestionOption[]
  /** Topic for batching related questions */
  batchTopic: string
  /** Files affected by this question */
  affectedFiles?: string[]
  /** Classification proposals for the affected files */
  classificationProposal?: ClassificationResult[]
  /** Description of any conflict */
  conflictDescription?: string
}

/** Option for a pending question */
export interface QuestionOption {
  /** Display label */
  label: string
  /** Option description */
  description: string
  /** Optional value for this option */
  value?: string
}

// ============================================================================
// Cleanup Types
// ============================================================================

/** Disposition options for original source documents after migration */
export type DisposalMode = 'keep' | 'move-to-references' | 'delete'

// ============================================================================
// Adapter Types
// ============================================================================

/** Result of an adapter's detection operation */
export interface AdapterDetectResult {
  /** The source type detected */
  adapter: SourceType
  /** Whether the adapter detected its source type */
  detected: boolean
  /** Detection confidence score (0.0 to 1.0) */
  confidence: number
  /** Optional metadata from detection */
  metadata?: Record<string, string> | undefined
}

// ============================================================================
// State Type
// ============================================================================

/** Complete migration state for persistence and recovery */
export interface MigrationState {
  /** State version for migrations */
  version: 1
  /** Unique migration identifier */
  migrationId: string
  /** Current migration stage */
  stage: MigrationStage
  /** Source directory path */
  sourcePath: string
  /** Target root directory */
  targetRoot: string
  /** Detected source type */
  sourceType: SourceType | null

  // Configuration
  /** Disposal mode for source documents */
  disposalMode: DisposalMode
  /** Whether to run in dry-run mode */
  dryRun: boolean

  // Progress tracking
  /** Results of completed stages */
  stageResults: StageResult[]
  /** When the migration was started */
  startedAt: string
  /** Last update timestamp */
  updatedAt: string
  /** When the migration was completed */
  completedAt?: string

  // Data
  /** Scanned file inventory */
  inventory: FileInventory[]
  /** Classification results */
  classifications: ClassificationResult[]
  /** Detected conflicts */
  conflicts: ConflictRecord[]
  /** Questions awaiting user input */
  pendingQuestions: PendingQuestion[]
  /** User answers to resolved questions */
  resolvedQuestions: UserAnswer[]
  /** Migration plan (generated in plan stage) */
  plan?: MigrationPlan
  /** Apply operation results */
  applyResult?: ApplyResult

  // Error handling
  /** Last error message if stage failed */
  lastError?: string

  // Adapter detection
  /** All adapters that detected the source */
  detectedAdapters?: { type: SourceType; confidence: number; metadata?: Record<string, string> }[]
  /** Selected adapter for this migration */
  selectedAdapter?: SourceType

  // Target initialization
  /** Whether the target needs OpenFlow init */
  needsOpenFlowInit?: boolean
  /** Whether OpenFlow init has been confirmed */
  openFlowInitConfirmed?: boolean
}

// ============================================================================
// Constants
// ============================================================================

/** Confidence score thresholds for classification quality */
export const CONFIDENCE_THRESHOLDS = {
  /** High confidence threshold - automatic processing allowed */
  HIGH: 0.7,
  /** Medium-low threshold - triggers manual review */
  MEDIUM_LOW: 0.4,
} as const

/** Confirmation phrase required for destructive delete operations */
export const DELETE_CONFIRMATION_PHRASE = 'DELETE ORIGINAL DOCS'

/** Allowed file extensions for document migration */
export const ALLOWED_EXTENSIONS = ['.md', '.markdown'] as const

/** Maximum directory depth for file scanning */
export const MAX_SCAN_DEPTH = 10

/** Maximum number of files to scan */
export const MAX_SCAN_FILES = 5000

// ============================================================================
// Session Index Types
// ============================================================================

/** Index of all migration sessions for a project */
export interface MigrationSessionIndex {
  /** Map of migration IDs to their session entries */
  byMigrationID: Record<string, MigrationSessionEntry>
  /** Currently active migration ID (if any) */
  activeMigrationId?: string
}

/** Entry in the migration session index */
export interface MigrationSessionEntry {
  /** Migration identifier */
  migrationId: string
  /** Source directory path */
  sourcePath: string
  /** Target root directory */
  targetRoot: string
  /** Current migration stage */
  stage: MigrationStage
  /** Last update timestamp */
  updatedAt: string
}

// ============================================================================
// Stage Result Type
// ============================================================================

/** Record of a completed stage */
export interface StageResult {
  /** The stage that was completed */
  stage: MigrationStage
  /** When the stage was completed */
  completedAt: string
  /** Additional stage-specific metadata */
  metadata?: Record<string, unknown>
}

// ============================================================================
// Plan Summary Type
// ============================================================================

/** Summary statistics for a migration plan */
export interface PlanSummary {
  /** Total number of files in the plan */
  totalFiles: number
  /** Breakdown by target category */
  byCategory: Partial<Record<TargetCategory, number>>
  /** Distribution of confidence levels */
  confidenceDistribution: {
    high: number
    medium: number
    low: number
  }
  /** Files that would be overwritten */
  wouldOverwrite: string[]
}

// ============================================================================
// Valid Stage Transitions
// ============================================================================

/** Valid stage transitions - defines the state machine flow */
export const VALID_STAGE_TRANSITIONS: Record<MigrationStage, MigrationStage[]> = {
  detect: ['scan', 'failed'],
  scan: ['classify', 'failed'],
  classify: ['clarify', 'failed'],
  clarify: ['plan', 'failed'],
  plan: ['apply', 'failed'],
  apply: ['cleanup', 'failed'],
  cleanup: ['completed', 'failed'],
  completed: [],
  failed: [],
}

/** Stage order for sequential validation */
export const STAGE_ORDER: MigrationStage[] = [
  'detect',
  'scan',
  'classify',
  'clarify',
  'plan',
  'apply',
  'cleanup',
  'completed',
]

// ============================================================================
// State Normalization
// ============================================================================

/**
 * Normalize and repair partial or inconsistent state
 * Used when loading state from persistence
 */
export function normalizeMigrationState(raw: unknown): MigrationState {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid state: expected object')
  }

  const parsed = raw as Partial<MigrationState>

  // Validate required fields
  if (!parsed.migrationId || typeof parsed.migrationId !== 'string') {
    throw new Error('Invalid state: missing migrationId')
  }

  if (!parsed.sourcePath || typeof parsed.sourcePath !== 'string') {
    throw new Error('Invalid state: missing sourcePath')
  }

  if (!parsed.targetRoot || typeof parsed.targetRoot !== 'string') {
    throw new Error('Invalid state: missing targetRoot')
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
