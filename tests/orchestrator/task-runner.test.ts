import { describe, expect, test } from 'bun:test'
import { TaskRunner } from '../../src/orchestrator/task-runner.js'
import type { ExecutorContext, ExecutorFunction, SchedulerTask } from '../../src/orchestrator/types.js'

function makeTask(overrides: Partial<SchedulerTask> = {}): SchedulerTask {
  return {
    id: 'task-1',
    type: 'example',
    status: 'running',
    attemptCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function makeContext(signal = new AbortController().signal): ExecutorContext {
  return {
    projectDir: process.cwd(),
    signal,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }

    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

describe('TaskRunner', () => {
  test('returns result for successful execution', async () => {
    const runner = new TaskRunner()
    const executor: ExecutorFunction = async () => ({ ok: true, count: 1 })

    const outcome = await runner.run(makeTask(), executor, makeContext())

    expect(outcome).toEqual({ result: { ok: true, count: 1 } })
  })

  test('converts executor exceptions to EXECUTOR_FAILED', async () => {
    const runner = new TaskRunner()
    const executor: ExecutorFunction = async () => {
      throw new Error('boom')
    }

    const outcome = await runner.run(makeTask(), executor, makeContext())

    expect(outcome.error).toEqual({ code: 'EXECUTOR_FAILED', message: 'Executor failed: boom', taskId: 'task-1' })
  })

  test('returns RESULT_NOT_SERIALIZABLE for non-json results', async () => {
    const runner = new TaskRunner()
    const executor: ExecutorFunction = async () => ({ count: 1n })

    const outcome = await runner.run(makeTask(), executor, makeContext())

    expect(outcome.error).toEqual({
      code: 'RESULT_NOT_SERIALIZABLE',
      message: 'Result not serializable: $.count contains non-JSON value: bigint',
      taskId: 'task-1',
    })
  })

  test('returns TASK_TIMEOUT when execution exceeds timeout', async () => {
    const runner = new TaskRunner()
    const executor: ExecutorFunction = async (_task, context) => {
      await waitForAbort(context.signal)
      return { ok: true }
    }

    const outcome = await runner.run(makeTask(), executor, makeContext(), 10)

    expect(outcome.error).toEqual({ code: 'TASK_TIMEOUT', message: 'Task timed out after 10ms: task-1', taskId: 'task-1' })
  })

  test('returns cancel error when external signal aborts', async () => {
    const runner = new TaskRunner()
    const controller = new AbortController()
    const executor: ExecutorFunction = async (_task, context) => {
      await waitForAbort(context.signal)
      return { ok: true }
    }

    const runPromise = runner.run(makeTask(), executor, makeContext(controller.signal), 100)
    controller.abort(new Error('cancelled'))

    const outcome = await runPromise

    expect(outcome.error).toEqual({
      code: 'SCHEDULER_STOPPED',
      message: 'Scheduler stopped, task aborted: task-1',
      taskId: 'task-1',
    })
  })

  test('cancel takes precedence over timeout when both happen', async () => {
    const runner = new TaskRunner()
    const controller = new AbortController()
    const executor: ExecutorFunction = async (_task, context) => {
      await waitForAbort(context.signal)
      return { ok: true }
    }

    const runPromise = runner.run(makeTask(), executor, makeContext(controller.signal), 20)
    setTimeout(() => controller.abort(new Error('cancelled first')), 5)

    const outcome = await runPromise

    expect(outcome.error).toEqual({
      code: 'SCHEDULER_STOPPED',
      message: 'Scheduler stopped, task aborted: task-1',
      taskId: 'task-1',
    })
  })
})
