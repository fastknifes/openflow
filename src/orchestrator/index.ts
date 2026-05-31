/**
 * Orchestrator barrel — re-exports all scheduler public API surface.
 *
 * This file contains ZERO logic. It only re-exports symbols from the
 * individual modules so consumers can import from a single entry-point.
 */

// Core scheduler loop (primary public API)
export { SchedulerLoop } from './scheduler-loop.js'

// Internal engines (exposed for advanced / testing use)
export { DagEngine } from './drg-engine.js'
export { ResourceLockManager } from './resource-lock-manager.js'
export { StateStore, type LoadResult } from './state-store.js'
export { ExecutorRegistry } from './executor-registry.js'
export { TaskRunner } from './task-runner.js'

// Errors
export {
  SchedulerError,
  taskNotFound,
  duplicateExecutor,
  executorNotFound,
  selfDependency,
  dependencyNotFound,
  cycleDetected,
  invalidResource,
  payloadNotSerializable,
  resultNotSerializable,
  sensitiveFieldRejected,
  invalidStateTransition,
  executorFailed,
  schedulerInterrupted,
  schedulerStopped,
  taskTimeout,
} from './errors.js'

// Types
export type {
  TaskStatus,
  TaskType,
  ResourceMode,
  ResourceLock,
  TaskPayload,
  TaskResult,
  TaskError,
  SchedulerTask,
  ExecutorContext,
  ExecutorFunction,
  TaskFilter,
  HistoryEvent,
  SchedulerStatus,
  StopOptions,
} from './types.js'
