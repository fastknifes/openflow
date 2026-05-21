import {
  cycleDetected,
  dependencyNotFound,
  invalidStateTransition,
  selfDependency,
  taskNotFound,
} from './errors.js'
import type { SchedulerTask, TaskStatus } from './types.js'

const LEGAL_TRANSITIONS = new Map<TaskStatus, readonly TaskStatus[]>([
  ['pending', ['ready', 'blocked', 'cancelled']],
  ['ready', ['running', 'blocked', 'cancelled']],
  ['running', ['succeeded', 'failed', 'cancelled']],
  ['failed', ['pending']],
  ['succeeded', []],
  ['cancelled', []],
  ['blocked', []],
])

const UNRUN_STATUSES = new Set<TaskStatus>(['pending', 'ready', 'blocked'])

export class DagEngine {
  private readonly tasks = new Map<string, SchedulerTask>()

  submitTask(task: SchedulerTask): SchedulerTask {
    this.validateDependencies(task.id, task.dependsOn ?? [])
    this.tasks.set(task.id, this.cloneTask(task))
    return this.getTask(task.id)
  }

  addDependency(taskId: string, dependencyId: string): SchedulerTask {
    const task = this.requireTask(taskId)
    if (taskId === dependencyId) {
      throw selfDependency(taskId)
    }
    if (!this.tasks.has(dependencyId)) {
      throw dependencyNotFound(taskId, dependencyId)
    }
    this.assertNoCycle(taskId, dependencyId)

    const dependencies = new Set(task.dependsOn ?? [])
    dependencies.add(dependencyId)
    const updated = { ...task, dependsOn: [...dependencies], updatedAt: Date.now() }
    this.tasks.set(taskId, updated)
    return this.cloneTask(updated)
  }

  transitionTask(taskId: string, nextStatus: TaskStatus): SchedulerTask {
    const task = this.requireTask(taskId)
    this.assertLegalTransition(task.id, task.status, nextStatus)

    const updated = this.withStatus(task, nextStatus)
    this.tasks.set(taskId, updated)

    if (nextStatus === 'failed' || nextStatus === 'cancelled') {
      this.blockDownstream(taskId)
    }

    return this.cloneTask(updated)
  }

  retryTask(taskId: string): SchedulerTask {
    const task = this.requireTask(taskId)
    this.assertLegalTransition(task.id, task.status, 'pending')

    const updated: SchedulerTask = {
      ...task,
      status: 'pending',
      attemptCount: task.attemptCount + 1,
      updatedAt: Date.now(),
    }
    delete updated.error
    this.tasks.set(taskId, updated)
    return this.cloneTask(updated)
  }

  getReadyTasks(now = Date.now()): SchedulerTask[] {
    for (const task of this.tasks.values()) {
      if (task.status === 'pending' && this.isDue(task, now) && this.dependenciesSucceeded(task)) {
        this.tasks.set(task.id, this.withStatus(task, 'ready'))
      }
    }

    return [...this.tasks.values()]
      .filter((task) => task.status === 'ready' && this.isDue(task, now))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((task) => this.cloneTask(task))
  }

  getTask(taskId: string): SchedulerTask {
    return this.cloneTask(this.requireTask(taskId))
  }

  listTasks(): SchedulerTask[] {
    return [...this.tasks.values()].map((task) => this.cloneTask(task))
  }

  private validateDependencies(taskId: string, dependencyIds: readonly string[]): void {
    for (const dependencyId of dependencyIds) {
      if (taskId === dependencyId) {
        throw selfDependency(taskId)
      }
      if (!this.tasks.has(dependencyId)) {
        throw dependencyNotFound(taskId, dependencyId)
      }
      this.assertNoCycle(taskId, dependencyId)
    }
  }

  private assertNoCycle(taskId: string, dependencyId: string): void {
    const path = this.findPath(dependencyId, taskId)
    if (path !== undefined) {
      throw cycleDetected(taskId, [taskId, ...path].join(' -> '))
    }
  }

  private findPath(fromId: string, targetId: string, path: string[] = [fromId]): string[] | undefined {
    if (fromId === targetId) {
      return path
    }

    const task = this.tasks.get(fromId)
    if (task === undefined) {
      return undefined
    }

    for (const dependencyId of task.dependsOn ?? []) {
      const nextPath = this.findPath(dependencyId, targetId, [...path, dependencyId])
      if (nextPath !== undefined) {
        return nextPath
      }
    }

    return undefined
  }

  private blockDownstream(rootId: string): void {
    const visited = new Set<string>()
    const stack = [rootId]

    while (stack.length > 0) {
      const failedOrCancelledId = stack.pop()
      if (failedOrCancelledId === undefined || visited.has(failedOrCancelledId)) {
        continue
      }
      visited.add(failedOrCancelledId)

      for (const task of this.tasks.values()) {
        if ((task.dependsOn ?? []).includes(failedOrCancelledId)) {
          if (UNRUN_STATUSES.has(task.status)) {
            this.tasks.set(task.id, this.withStatus(task, 'blocked'))
            stack.push(task.id)
          }
        }
      }
    }
  }

  private dependenciesSucceeded(task: SchedulerTask): boolean {
    return (task.dependsOn ?? []).every((dependencyId) => this.requireTask(dependencyId).status === 'succeeded')
  }

  private isDue(task: SchedulerTask, now: number): boolean {
    return task.runAfter === undefined || task.runAfter <= now
  }

  private assertLegalTransition(taskId: string, from: TaskStatus, to: TaskStatus): void {
    if (!(LEGAL_TRANSITIONS.get(from) ?? []).includes(to)) {
      throw invalidStateTransition(taskId, from, to)
    }
  }

  private withStatus(task: SchedulerTask, status: TaskStatus): SchedulerTask {
    return { ...task, status, updatedAt: Date.now() }
  }

  private requireTask(taskId: string): SchedulerTask {
    const task = this.tasks.get(taskId)
    if (task === undefined) {
      throw taskNotFound(taskId)
    }
    return task
  }

  private cloneTask(task: SchedulerTask): SchedulerTask {
    const cloned: SchedulerTask = {
      id: task.id,
      type: task.type,
      status: task.status,
      attemptCount: task.attemptCount,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }
    if (task.timeoutMs !== undefined) {
      cloned.timeoutMs = task.timeoutMs
    }
    if (task.runAfter !== undefined) {
      cloned.runAfter = task.runAfter
    }
    if (task.dependsOn !== undefined) {
      cloned.dependsOn = [...task.dependsOn]
    }
    if (task.resources !== undefined) {
      cloned.resources = task.resources.map((resource) => ({ ...resource }))
    }
    if (task.payload !== undefined) {
      cloned.payload = { ...task.payload }
    }
    if (task.result !== undefined) {
      cloned.result = { ...task.result }
    }
    if (task.error !== undefined) {
      cloned.error = { ...task.error }
    }
    return cloned
  }
}
