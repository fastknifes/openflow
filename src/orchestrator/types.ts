/**
 * Scheduler type contracts — shared across all orchestrator modules.
 *
 * These types are intentionally pure data; no behaviour, no filesystem,
 * no LLM / OpenCode dependency.
 */

// ---------------------------------------------------------------------------
// Status & primitives
// ---------------------------------------------------------------------------

/** Possible states of a scheduler task. */
export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'blocked'

/** Opaque string identifying the task type (maps to an executor). */
export type TaskType = string

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/** Whether a resource lock is read-only or exclusive-write. */
export type ResourceMode = 'read' | 'write'

/** A lock claim on a named resource. */
export interface ResourceLock {
  kind: string
  id: string
  mode: ResourceMode
}

// ---------------------------------------------------------------------------
// Payload / result / error
// ---------------------------------------------------------------------------

/** JSON-serializable task input. */
export type TaskPayload = Record<string, unknown>

/** JSON-serializable task output (may be absent). */
export type TaskResult = Record<string, unknown> | undefined

/** Structured error attached to a failed task. */
export interface TaskError {
  code: string
  message: string
  taskId?: string
}

// ---------------------------------------------------------------------------
// SchedulerTask
// ---------------------------------------------------------------------------

/** Core task object stored and persisted by the scheduler. */
export interface SchedulerTask {
  id: string
  type: TaskType
  status: TaskStatus
  payload?: TaskPayload
  dependsOn?: string[]
  resources?: ResourceLock[]
  timeoutMs?: number
  runAfter?: number
  attemptCount: number
  createdAt: number
  updatedAt: number
  result?: TaskResult
  error?: TaskError
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/** Context passed to every executor invocation. */
export interface ExecutorContext {
  projectDir: string
  signal: AbortSignal
  logger: {
    info(msg: string): void
    warn(msg: string): void
    error(msg: string): void
  }
}

/** Function signature that executors must satisfy. */
export type ExecutorFunction = (
  task: SchedulerTask,
  context: ExecutorContext,
) => Promise<unknown>

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Filter criteria for listTasks / queries. */
export interface TaskFilter {
  status?: TaskStatus
  type?: TaskType
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** A single audit event recorded in the scheduler history log. */
export interface HistoryEvent {
  timestamp: number
  taskId: string
  event: string
  previousStatus?: TaskStatus
  nextStatus?: TaskStatus
  reason?: string
}

// ---------------------------------------------------------------------------
// Status & control
// ---------------------------------------------------------------------------

/** Snapshot of scheduler state returned by status queries. */
export interface SchedulerStatus {
  tasks: SchedulerTask[]
  corrupted: boolean
}

/** Options for stopScheduler. */
export interface StopOptions {
  abortRunning?: boolean
}
