import { SchedulerError, executorFailed, resultNotSerializable, schedulerStopped, taskTimeout } from './errors.js'
import type { ExecutorContext, ExecutorFunction, SchedulerTask, TaskError } from './types.js'

type RunResult = { result?: unknown; error?: TaskError }
type SettledResult = { kind: 'result'; value: unknown } | { kind: 'error'; error: TaskError }

export class TaskRunner {
  async run(
    task: SchedulerTask,
    executor: ExecutorFunction,
    context: ExecutorContext,
    timeoutMs?: number,
  ): Promise<RunResult> {
    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    let cancelled = false

    const onExternalAbort = (): void => {
      cancelled = true
      controller.abort(context.signal.reason)
    }

    if (context.signal.aborted) {
      return { error: schedulerStopped(task.id).toTaskError() }
    }

    context.signal.addEventListener('abort', onExternalAbort, { once: true })

    if (timeoutMs !== undefined) {
      timeoutId = setTimeout(() => {
        if (cancelled) {
          return
        }

        timedOut = true
        controller.abort(new Error(`Task timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }

    const executorContext: ExecutorContext = { ...context, signal: controller.signal }

    const abortPromise = new Promise<SettledResult>((resolve) => {
      const onAbort = (): void => {
        resolve({
          kind: 'error',
          error: cancelled
            ? schedulerStopped(task.id).toTaskError()
            : taskTimeout(task.id, timeoutMs ?? 0).toTaskError(),
        })
      }

      if (controller.signal.aborted) {
        onAbort()
        return
      }

      controller.signal.addEventListener('abort', onAbort, { once: true })
    })

    const executorPromise = this.execute(task, executor, executorContext)

    try {
      const settled = await Promise.race([executorPromise, abortPromise])
      return settled.kind === 'result' ? { result: settled.value } : { error: settled.error }
    } finally {
      context.signal.removeEventListener('abort', onExternalAbort)
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      void executorPromise.catch(() => undefined)
      if (!controller.signal.aborted && (timedOut || cancelled)) {
        controller.abort()
      }
    }
  }

  private async execute(
    task: SchedulerTask,
    executor: ExecutorFunction,
    context: ExecutorContext,
  ): Promise<SettledResult> {
    try {
      const result = await executor(task, context)
      try {
        this.assertSerializable(task.id, result)
        return { kind: 'result', value: result }
      } catch (error) {
        if (error instanceof SchedulerError) {
          return { kind: 'error', error: error.toTaskError() }
        }

        const reason = error instanceof Error ? error.message : String(error)
        return { kind: 'error', error: resultNotSerializable(task.id, reason).toTaskError() }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      return { kind: 'error', error: executorFailed(task.id, reason).toTaskError() }
    }
  }

  private assertSerializable(taskId: string, value: unknown): void {
    try {
      this.validateJsonSerializable(value)
      JSON.stringify(value)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw resultNotSerializable(taskId, reason)
    }
  }

  private validateJsonSerializable(value: unknown, location = '$', seen = new WeakSet<object>()): void {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      return
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error(`${location} must be a finite number`)
      }
      return
    }

    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
      throw new Error(`${location} contains non-JSON value: ${typeof value}`)
    }

    if (Array.isArray(value)) {
      if (seen.has(value)) {
        throw new Error(`${location} contains a circular reference`)
      }
      seen.add(value)
      value.forEach((item, index) => this.validateJsonSerializable(item, `${location}[${index}]`, seen))
      seen.delete(value)
      return
    }

    if (typeof value === 'object') {
      if (seen.has(value)) {
        throw new Error(`${location} contains a circular reference`)
      }
      seen.add(value)
      for (const [key, child] of Object.entries(value)) {
        this.validateJsonSerializable(child, `${location}.${key}`, seen)
      }
      seen.delete(value)
    }
  }
}
