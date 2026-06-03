import { randomUUID } from 'node:crypto'

import type { SchedulerLoop } from './scheduler-loop.js'
import type { SchedulerTask, TaskPayload } from './types.js'

export interface HardenDagDescriptor {
  dagId: string
  prefix: string
}

export type ReviewerTaskPayload = TaskPayload
export type ExecutorTaskPayload = TaskPayload

const HARDEN_PREFIX = 'harden-'
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'blocked'])

export class HardenDagManager {
  private static activePrefix: string | undefined
  private activeDagId: string | undefined
  private prefix: string | undefined
  private previousTaskId: string | undefined

  constructor(private readonly scheduler: SchedulerLoop) {}

  createHardenDag(_feature: string): HardenDagDescriptor {
    if (HardenDagManager.activePrefix !== undefined) {
      const activeReservedTask = this.scheduler
        .listTasksByPrefix(HardenDagManager.activePrefix)
        .find((task) => !TERMINAL_STATUSES.has(task.status))
      if (activeReservedTask !== undefined || this.scheduler.listTasksByPrefix(HardenDagManager.activePrefix).length === 0) {
        throw new Error('A harden DAG is already running')
      }
      HardenDagManager.activePrefix = undefined
    }

    const activeTask = this.scheduler
      .listTasksByPrefix(HARDEN_PREFIX)
      .find((task) => !TERMINAL_STATUSES.has(task.status))

    if (activeTask !== undefined) {
      throw new Error('A harden DAG is already running')
    }

    const dagId = randomUUID()
    const prefix = `${HARDEN_PREFIX}${dagId}-`
    HardenDagManager.activePrefix = prefix
    this.activeDagId = dagId
    this.prefix = prefix
    this.previousTaskId = undefined
    return { dagId, prefix }
  }

  submitReviewerTask(round: number, payload: ReviewerTaskPayload): string {
    return this.submitTask('harden-reviewer', round, payload)
  }

  submitExecutorTask(round: number, payload: ExecutorTaskPayload): string {
    return this.submitTask('harden-executor', round, payload)
  }

  async awaitTask(taskId: string, timeoutMs = 15 * 60 * 1000): Promise<SchedulerTask> {
    const startedAt = Date.now()
    while (Date.now() - startedAt <= timeoutMs) {
      const task = this.scheduler.getTask(taskId)
      if (TERMINAL_STATUSES.has(task.status)) return task
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out waiting for harden task ${taskId}`)
  }

  cancel(): string[] {
    if (this.prefix === undefined) return []
    const cancelled = this.scheduler.cancelTasksByPrefix(this.prefix)
    if (HardenDagManager.activePrefix === this.prefix) HardenDagManager.activePrefix = undefined
    this.activeDagId = undefined
    this.prefix = undefined
    this.previousTaskId = undefined
    return cancelled
  }

  archiveAndDestroy(prefix = this.prefix): string[] {
    if (prefix === undefined) return []
    const cancelled = this.scheduler.cancelTasksByPrefix(prefix)
    if (HardenDagManager.activePrefix === prefix) HardenDagManager.activePrefix = undefined
    if (this.prefix === prefix) {
      this.activeDagId = undefined
      this.prefix = undefined
      this.previousTaskId = undefined
    }
    return cancelled
  }

  private submitTask(type: string, round: number, payload: TaskPayload): string {
    if (this.prefix === undefined || this.activeDagId === undefined) {
      throw new Error('Harden DAG has not been created')
    }

    const taskInput: Parameters<SchedulerLoop['submitTask']>[0] = {
      type,
      payload: {
        ...omitUndefinedPayloadFields(payload),
        dagId: this.activeDagId,
        round,
      },
      idPrefix: this.prefix,
    }
    if (this.previousTaskId !== undefined) {
      taskInput.dependsOn = [this.previousTaskId]
    }
    const taskId = this.scheduler.submitTask(taskInput)
    this.previousTaskId = taskId
    return taskId
  }
}

function omitUndefinedPayloadFields(payload: TaskPayload): TaskPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as TaskPayload
}
