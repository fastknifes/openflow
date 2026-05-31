import type { TaskError } from './types.js'

// ---------------------------------------------------------------------------
// SchedulerError
// ---------------------------------------------------------------------------

/**
 * Base error class for all scheduler failures.
 *
 * Shape: `{ code, message, taskId? }` — matches the `TaskError` interface
 * so the same object can be persisted directly on a failed task.
 */
export class SchedulerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly taskId?: string,
  ) {
    super(message)
    this.name = 'SchedulerError'
  }

  /** Convert to the plain TaskError shape for persistence. */
  toTaskError(): TaskError {
    const err: TaskError = { code: this.code, message: this.message }
    if (this.taskId !== undefined) {
      err.taskId = this.taskId
    }
    return err
  }
}

// ---------------------------------------------------------------------------
// Error factories
// ---------------------------------------------------------------------------

/** Task ID does not exist in the store. */
export function taskNotFound(taskId: string): SchedulerError {
  return new SchedulerError('TASK_NOT_FOUND', `Task not found: ${taskId}`, taskId)
}

/** Attempted to register a second executor for the same type. */
export function duplicateExecutor(type: string): SchedulerError {
  return new SchedulerError('DUPLICATE_EXECUTOR', `Executor already registered for type: ${type}`)
}

/** No executor registered for the given type. */
export function executorNotFound(type: string): SchedulerError {
  return new SchedulerError('EXECUTOR_NOT_FOUND', `No executor registered for type: ${type}`)
}

/** A task lists itself in its own dependsOn. */
export function selfDependency(taskId: string): SchedulerError {
  return new SchedulerError('SELF_DEPENDENCY', `Task cannot depend on itself: ${taskId}`, taskId)
}

/** A dependency references a task that does not exist. */
export function dependencyNotFound(taskId: string, depId: string): SchedulerError {
  return new SchedulerError('DEPENDENCY_NOT_FOUND', `Dependency not found: ${depId} (required by ${taskId})`, taskId)
}

/** Adding a dependency would create a cycle. */
export function cycleDetected(taskId: string, cyclePath: string): SchedulerError {
  return new SchedulerError('CYCLE_DETECTED', `Dependency cycle detected: ${cyclePath}`, taskId)
}

/** Resource lock descriptor is invalid (empty kind/id). */
export function invalidResource(taskId: string, reason: string): SchedulerError {
  return new SchedulerError('INVALID_RESOURCE', `Invalid resource: ${reason}`, taskId)
}

/** Task payload cannot be serialized to JSON. */
export function payloadNotSerializable(taskId: string, reason: string): SchedulerError {
  return new SchedulerError('PAYLOAD_NOT_SERIALIZABLE', `Payload not serializable: ${reason}`, taskId)
}

/** Executor result cannot be serialized to JSON. */
export function resultNotSerializable(taskId: string, reason: string): SchedulerError {
  return new SchedulerError('RESULT_NOT_SERIALIZABLE', `Result not serializable: ${reason}`, taskId)
}

/** Payload or result contains a sensitive field (secret/token/password). */
export function sensitiveFieldRejected(taskId: string, field: string): SchedulerError {
  return new SchedulerError('SENSITIVE_FIELD_REJECTED', `Sensitive field rejected: ${field}`, taskId)
}

/** A status transition is not legal per the state machine. */
export function invalidStateTransition(taskId: string, from: string, to: string): SchedulerError {
  return new SchedulerError(
    'INVALID_STATE_TRANSITION',
    `Invalid state transition: ${from} -> ${to} (task ${taskId})`,
    taskId,
  )
}

/** Executor threw an error during execution. */
export function executorFailed(taskId: string, reason: string): SchedulerError {
  return new SchedulerError('EXECUTOR_FAILED', `Executor failed: ${reason}`, taskId)
}

/** Running task discovered after scheduler restart — cannot safely resume. */
export function schedulerInterrupted(taskId: string): SchedulerError {
  return new SchedulerError('SCHEDULER_INTERRUPTED', `Scheduler interrupted during task execution: ${taskId}`, taskId)
}

/** Task was aborted because stopScheduler({ abortRunning: true }) was called. */
export function schedulerStopped(taskId: string): SchedulerError {
  return new SchedulerError('SCHEDULER_STOPPED', `Scheduler stopped, task aborted: ${taskId}`, taskId)
}

/** Task exceeded its timeoutMs limit. */
export function taskTimeout(taskId: string, timeoutMs: number): SchedulerError {
  return new SchedulerError('TASK_TIMEOUT', `Task timed out after ${timeoutMs}ms: ${taskId}`, taskId)
}
