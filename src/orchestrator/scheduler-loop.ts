import { randomUUID } from 'node:crypto'

import { schedulerInterrupted, schedulerStopped } from './errors.js'
import { DagEngine } from './drg-engine.js'
import { ResourceLockManager } from './resource-lock-manager.js'
import { StateStore } from './state-store.js'
import { ExecutorRegistry } from './executor-registry.js'
import { TaskRunner } from './task-runner.js'
import type {
  ExecutorContext,
  ExecutorFunction,
  HistoryEvent,
  ResourceLock,
  SchedulerStatus,
  SchedulerTask,
  StopOptions,
  TaskError,
  TaskFilter,
  TaskPayload,
  TaskStatus,
} from './types.js'

interface SchedulerLoopOptions {
  maxConcurrency?: number
  tickIntervalMs?: number
}

interface SubmitTaskInput {
  type: string
  payload?: TaskPayload
  dependsOn?: string[]
  resources?: ResourceLock[]
  timeoutMs?: number
  runAfter?: number
}

interface RunningTaskState {
  controller: AbortController
  promise: Promise<void>
  stopError?: TaskError
}

const DEFAULT_TICK_INTERVAL_MS = 100

export class SchedulerLoop {
  private dagEngine = new DagEngine()
  private readonly lockManager = new ResourceLockManager()
  private readonly stateStore: StateStore
  private readonly executorRegistry = new ExecutorRegistry()
  private readonly taskRunner = new TaskRunner()
  private readonly runningTasks = new Map<string, RunningTaskState>()
  private intervalHandle: ReturnType<typeof setInterval> | undefined
  private tickInFlight: Promise<void> | undefined
  private corrupted = false
  private started = false
  private readonly maxConcurrency: number
  private readonly tickIntervalMs: number

  constructor(
    private readonly projectRoot: string,
    options: SchedulerLoopOptions = {},
  ) {
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 1)
    this.tickIntervalMs = Math.max(1, options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS)
    this.stateStore = new StateStore(projectRoot)
  }

  registerExecutor(type: string, executor: ExecutorFunction): void {
    this.executorRegistry.registerExecutor(type, executor)
  }

  hasExecutor(type: string): boolean {
    return this.executorRegistry.hasExecutor(type)
  }

  submitTask(input: SubmitTaskInput): string {
    const now = Date.now()
    const taskId = this.createTaskId()
    const task: SchedulerTask = {
      id: taskId,
      type: input.type,
      status: 'pending',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    if (input.payload !== undefined) {
      task.payload = { ...input.payload }
    }
    if (input.dependsOn !== undefined && input.dependsOn.length > 0) {
      task.dependsOn = [...input.dependsOn]
    }
    if (input.resources !== undefined && input.resources.length > 0) {
      task.resources = input.resources.map((resource) => ({ ...resource }))
    }
    if (input.timeoutMs !== undefined) {
      task.timeoutMs = input.timeoutMs
    }
    if (input.runAfter !== undefined) {
      task.runAfter = input.runAfter
    }

    this.dagEngine.submitTask(task)
    this.persistTasks()
    this.appendHistory({ timestamp: now, taskId, event: 'created', nextStatus: 'pending' })
    return taskId
  }

  getTask(taskId: string): SchedulerTask {
    return this.dagEngine.getTask(taskId)
  }

  listTasks(filter?: TaskFilter): SchedulerStatus {
    const tasks = this.dagEngine.listTasks().filter((task) => this.matchesFilter(task, filter))
    return { tasks, corrupted: this.corrupted }
  }

  cancelTask(taskId: string): SchedulerTask {
    const task = this.dagEngine.getTask(taskId)

    if (task.status === 'pending' || task.status === 'ready') {
      const cancelled = this.transitionTask(taskId, 'cancelled', 'cancelled')
      this.persistTasks()
      return cancelled
    }

    if (task.status === 'running') {
      const runningTask = this.runningTasks.get(taskId)
      runningTask?.controller.abort(new Error('Task cancelled'))
      return this.dagEngine.getTask(taskId)
    }

    return task
  }

  retryTask(taskId: string): SchedulerTask {
    const previous = this.dagEngine.getTask(taskId)
    const retried = this.dagEngine.retryTask(taskId)
    this.appendHistory({
      timestamp: Date.now(),
      taskId,
      event: 'retried',
      previousStatus: previous.status,
      nextStatus: retried.status,
    })
    this.persistTasks()
    return retried
  }

  startScheduler(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.loadPersistedState()
    this.intervalHandle = setInterval(() => {
      void this.tick()
    }, this.tickIntervalMs)
  }

  async stopScheduler(options: StopOptions = {}): Promise<void> {
    if (this.intervalHandle !== undefined) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = undefined
    }
    this.started = false

    if (options.abortRunning === true) {
      for (const [taskId, runningTask] of this.runningTasks.entries()) {
        runningTask.stopError = schedulerStopped(taskId).toTaskError()
        runningTask.controller.abort(new Error('Scheduler stopped'))
      }
    }

    if (this.tickInFlight !== undefined) {
      await this.tickInFlight
    }

    await Promise.all([...this.runningTasks.values()].map((runningTask) => runningTask.promise))

    for (const taskId of this.runningTasks.keys()) {
      this.lockManager.releaseLocks(taskId)
    }

    this.persistTasks()
  }

  async tick(now = Date.now()): Promise<void> {
    if (this.tickInFlight !== undefined) {
      return this.tickInFlight
    }

    this.tickInFlight = this.runTick(now)
    try {
      await this.tickInFlight
    } finally {
      this.tickInFlight = undefined
    }
  }

  private async runTick(now: number): Promise<void> {
    const readyTasks = this.dagEngine.getReadyTasks(now)

    for (const task of readyTasks) {
      if (!this.executorRegistry.hasExecutor(task.type)) {
        this.logger.warn(`No executor registered for task type: ${task.type}`)
        continue
      }

      if (this.runningTasks.size >= this.maxConcurrency) {
        break
      }

      const resources = task.resources ?? []
      if (!this.lockManager.acquireLocks(task.id, resources)) {
        continue
      }

      const executor = this.executorRegistry.getExecutor(task.type)
      if (executor === undefined) {
        this.lockManager.releaseLocks(task.id)
        continue
      }

      const runningTask = this.transitionTask(task.id, 'running', 'running')
      const controller = new AbortController()
      const promise = this.executeTask(runningTask, executor, controller)
      this.runningTasks.set(task.id, { controller, promise })
    }
  }

  private async executeTask(
    task: SchedulerTask,
    executor: ExecutorFunction,
    controller: AbortController,
  ): Promise<void> {
    const context: ExecutorContext = {
      projectDir: this.projectRoot,
      signal: controller.signal,
      logger: this.logger,
    }

    try {
      const outcome = await this.taskRunner.run(task, executor, context, task.timeoutMs)
      const runningState = this.runningTasks.get(task.id)

      if (outcome.error !== undefined) {
        if (this.shouldCancelTask(outcome.error, runningState?.stopError) || controller.signal.aborted) {
          this.setTaskError(task.id, runningState?.stopError)
          this.transitionTask(task.id, 'cancelled', 'cancelled', outcome.error.code)
        } else {
          this.setTaskError(task.id, outcome.error)
          this.transitionTask(task.id, 'failed', 'failed', outcome.error.code)
        }
      } else {
        this.setTaskResult(task.id, outcome.result)
        this.transitionTask(task.id, 'succeeded', 'succeeded')
      }
    } finally {
      this.runningTasks.delete(task.id)
      this.lockManager.releaseLocks(task.id)
      this.persistTasks()
    }
  }

  private shouldCancelTask(error: TaskError, stopError?: TaskError): boolean {
    return error.code === 'SCHEDULER_STOPPED' || stopError !== undefined
  }

  private loadPersistedState(): void {
    const loaded = this.stateStore.load()
    this.corrupted = loaded.corrupted
    this.dagEngine = new DagEngine()

    for (const task of loaded.tasks) {
      const restoredTask = { ...task }
      if (task.dependsOn !== undefined) {
        restoredTask.dependsOn = [...task.dependsOn]
      }
      if (task.resources !== undefined) {
        restoredTask.resources = task.resources.map((resource) => ({ ...resource }))
      }
      if (task.payload !== undefined) {
        restoredTask.payload = { ...task.payload }
      }
      if (task.result !== undefined) {
        restoredTask.result = { ...task.result }
      }
      if (task.error !== undefined) {
        restoredTask.error = { ...task.error }
      }

      if (restoredTask.status === 'running') {
        restoredTask.status = 'failed'
        restoredTask.updatedAt = Date.now()
        restoredTask.error = schedulerInterrupted(restoredTask.id).toTaskError()
        this.appendHistory({
          timestamp: restoredTask.updatedAt,
          taskId: restoredTask.id,
          event: 'recovered',
          previousStatus: 'running',
          nextStatus: 'failed',
          reason: 'SCHEDULER_INTERRUPTED',
        })
      }

      this.dagEngine.submitTask(restoredTask)
    }

    this.lockManager.cleanupOrphans(new Set())
    this.persistTasks()
  }

  private transitionTask(
    taskId: string,
    nextStatus: TaskStatus,
    event: string,
    reason?: string,
  ): SchedulerTask {
    const previous = this.dagEngine.getTask(taskId)
    const updated = this.dagEngine.transitionTask(taskId, nextStatus)
    const historyEvent: HistoryEvent = {
      timestamp: Date.now(),
      taskId,
      event,
      previousStatus: previous.status,
      nextStatus: updated.status,
    }
    if (reason !== undefined) {
      historyEvent.reason = reason
    }
    this.appendHistory(historyEvent)
    return updated
  }

  private setTaskError(taskId: string, error: TaskError | undefined): void {
    const task = this.dagEngine.getTask(taskId)
    const updated: SchedulerTask = { ...task, updatedAt: Date.now() }
    if (task.dependsOn !== undefined) {
      updated.dependsOn = [...task.dependsOn]
    }
    if (task.resources !== undefined) {
      updated.resources = task.resources.map((resource) => ({ ...resource }))
    }
    if (task.payload !== undefined) {
      updated.payload = { ...task.payload }
    }
    if (task.result !== undefined) {
      updated.result = { ...task.result }
    }
    if (error !== undefined) {
      updated.error = { ...error }
    } else {
      delete updated.error
    }

    this.replaceTask(updated)
  }

  private setTaskResult(taskId: string, result: unknown): void {
    const task = this.dagEngine.getTask(taskId)
    const updated: SchedulerTask = { ...task, updatedAt: Date.now() }
    if (task.dependsOn !== undefined) {
      updated.dependsOn = [...task.dependsOn]
    }
    if (task.resources !== undefined) {
      updated.resources = task.resources.map((resource) => ({ ...resource }))
    }
    if (task.payload !== undefined) {
      updated.payload = { ...task.payload }
    }
    if (result !== undefined && result !== null && typeof result === 'object' && !Array.isArray(result)) {
      updated.result = { ...(result as Record<string, unknown>) }
    } else if (result === undefined) {
      delete updated.result
    } else {
      updated.result = { value: result }
    }
    delete updated.error

    this.replaceTask(updated)
  }

  private replaceTask(task: SchedulerTask): void {
    const tasks = this.dagEngine.listTasks().map((current) => (current.id === task.id ? task : current))
    this.dagEngine = new DagEngine()
    for (const currentTask of tasks) {
      this.dagEngine.submitTask(currentTask)
    }
  }

  private persistTasks(): void {
    this.stateStore.save(this.dagEngine.listTasks())
  }

  private appendHistory(event: HistoryEvent): void {
    this.stateStore.appendHistory(event)
  }

  private matchesFilter(task: SchedulerTask, filter?: TaskFilter): boolean {
    if (filter?.status !== undefined && task.status !== filter.status) {
      return false
    }
    if (filter?.type !== undefined && task.type !== filter.type) {
      return false
    }
    return true
  }

  private createTaskId(): string {
    try {
      return randomUUID()
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
  }

  private readonly logger: ExecutorContext['logger'] = {
    info: () => undefined,
    warn: (message: string) => {
      console.warn(`[SchedulerLoop] ${message}`)
    },
    error: (message: string) => {
      console.error(`[SchedulerLoop] ${message}`)
    },
  }
}
