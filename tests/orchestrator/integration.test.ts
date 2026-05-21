/**
 * Integration test — full in-process scenario exercising the scheduler
 * public API through SchedulerLoop only.
 *
 * Covers: dependency ordering, resource-lock serialization, cancellation
 * with AbortSignal, crash recovery, listTasks / getTask correctness.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { SchedulerLoop } from '../../src/orchestrator/index.js'
import type { ExecutorFunction, SchedulerTask } from '../../src/orchestrator/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openflow-integration-'))
  tempRoots.push(root)
  return root
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Integration scenarios
// ---------------------------------------------------------------------------

describe('Integration: SchedulerLoop end-to-end', () => {
  test('dependency chain A -> B executes in order', async () => {
    const order: string[] = []
    const scheduler = new SchedulerLoop(makeTempRoot(), {
      tickIntervalMs: 10,
    })

    const executor: ExecutorFunction = async (task) => {
      order.push(task.id)
      return { id: task.id }
    }
    scheduler.registerExecutor('build', executor)

    // 1. Submit task A (no dependencies)
    const taskA = scheduler.submitTask({ type: 'build' })

    // 2. Submit task B (depends on A)
    const taskB = scheduler.submitTask({ type: 'build', dependsOn: [taskA] })

    // 3. Start scheduler and let tasks run
    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(20)
    await scheduler.tick()
    await sleep(20)
    await scheduler.stopScheduler()

    // 4. Verify B succeeds after A
    expect(order).toEqual([taskA, taskB])
    expect(scheduler.getTask(taskA).status).toBe('succeeded')
    expect(scheduler.getTask(taskB).status).toBe('succeeded')
  })

  test('write-lock on same file prevents concurrent execution', async () => {
    const events: string[] = []
    const scheduler = new SchedulerLoop(makeTempRoot(), {
      tickIntervalMs: 10,
      maxConcurrency: 2,
    })

    scheduler.registerExecutor('build', async (task) => {
      events.push(`start:${task.id}`)
      await sleep(30)
      events.push(`end:${task.id}`)
      return { done: true }
    })

    const resource = { kind: 'file', id: 'output.txt', mode: 'write' as const }

    const first = scheduler.submitTask({ type: 'build', resources: [resource] })
    const second = scheduler.submitTask({ type: 'build', resources: [resource] })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(40)
    await scheduler.tick()
    await sleep(40)
    await scheduler.stopScheduler()

    // Must be serialized — second starts only after first ends
    expect(events).toEqual([
      `start:${first}`,
      `end:${first}`,
      `start:${second}`,
      `end:${second}`,
    ])
  })

  test('cancel running task — executor receives AbortSignal', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), {
      tickIntervalMs: 10,
    })
    let signalReceived = false
    let abortReason: string | undefined

    scheduler.registerExecutor('build', async (_task, context) => {
      await waitForAbort(context.signal)
      signalReceived = context.signal.aborted
      abortReason = context.signal.reason?.message
      return { ignored: true }
    })

    const taskId = scheduler.submitTask({ type: 'build' })

    scheduler.startScheduler()
    await scheduler.tick()
    scheduler.cancelTask(taskId)
    await sleep(30)
    await scheduler.stopScheduler()

    expect(signalReceived).toBe(true)
    expect(scheduler.getTask(taskId).status).toBe('cancelled')
  })

  test('crash recovery: new SchedulerLoop recovers stale running task as SCHEDULER_INTERRUPTED', async () => {
    const root = makeTempRoot()

    // --- Phase 1: start a long-running task and force-stop the scheduler ---
    const scheduler1 = new SchedulerLoop(root, { tickIntervalMs: 10 })
    let runningPhase1 = false
    scheduler1.registerExecutor('build', async () => {
      runningPhase1 = true
      await sleep(300) // Long enough that we force-stop before it finishes
      return { ok: true }
    })

    const longTaskId = scheduler1.submitTask({ type: 'build' })
    scheduler1.startScheduler()
    await scheduler1.tick()
    await sleep(20) // let executor start

    expect(runningPhase1).toBe(true)

    // Force-stop without draining (simulate crash) — just abandon the loop
    await scheduler1.stopScheduler()

    // Task should still be in a terminal state after stop (drained or cancelled)
    // We simulate a crash by manually writing a running state
    const stateDir = path.join(root, '.sisyphus', 'openflow', 'scheduler')
    const tasksPath = path.join(stateDir, 'tasks.json')
    const raw = JSON.parse(fs.readFileSync(tasksPath, 'utf8'))
    // Force the task back to running to simulate a crash mid-execution
    raw.tasks[0].status = 'running'
    fs.writeFileSync(tasksPath, JSON.stringify(raw, null, 2))

    // --- Phase 2: create a new SchedulerLoop on the same directory ---
    const scheduler2 = new SchedulerLoop(root, { tickIntervalMs: 10 })
    scheduler2.registerExecutor('build', async () => ({ recovered: true }))
    scheduler2.startScheduler()

    const recovered = scheduler2.getTask(longTaskId)
    expect(recovered.status).toBe('failed')
    expect(recovered.error?.code).toBe('SCHEDULER_INTERRUPTED')

    await scheduler2.stopScheduler()
  })

  test('listTasks returns correct status for all tasks', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), {
      tickIntervalMs: 10,
      maxConcurrency: 1,
    })

    scheduler.registerExecutor('build', async () => ({ ok: true }))

    const taskA = scheduler.submitTask({ type: 'build' })
    const taskB = scheduler.submitTask({ type: 'build' })
    const taskC = scheduler.submitTask({ type: 'build' })

    // Cancel one before starting
    scheduler.cancelTask(taskC)

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(20)
    await scheduler.tick()
    await sleep(20)
    await scheduler.tick()
    await sleep(20)
    await scheduler.stopScheduler()

    const { tasks } = scheduler.listTasks()
    expect(tasks.length).toBe(3)

    const a = tasks.find((t) => t.id === taskA)!
    const b = tasks.find((t) => t.id === taskB)!
    const c = tasks.find((t) => t.id === taskC)!

    expect(a.status).toBe('succeeded')
    expect(b.status).toBe('succeeded')
    expect(c.status).toBe('cancelled')
  })

  test('getTask returns correct individual task', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), {
      tickIntervalMs: 10,
    })

    scheduler.registerExecutor('build', async (task) => ({
      built: task.id,
    }))

    const taskA = scheduler.submitTask({
      type: 'build',
      payload: { name: 'alpha' },
    })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(20)
    await scheduler.stopScheduler()

    const task = scheduler.getTask(taskA)
    expect(task.id).toBe(taskA)
    expect(task.status).toBe('succeeded')
    expect(task.type).toBe('build')
    expect(task.result).toEqual({ built: taskA })
  })

  test('listTasks with filter returns matching subset', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), {
      tickIntervalMs: 10,
      maxConcurrency: 2,
    })

    scheduler.registerExecutor('build', async () => ({ ok: true }))
    scheduler.registerExecutor('test', async () => ({ passed: true }))

    const taskA = scheduler.submitTask({ type: 'build' })
    const taskB = scheduler.submitTask({ type: 'test' })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(30)
    await scheduler.stopScheduler()

    const buildTasks = scheduler.listTasks({ type: 'build' }).tasks
    expect(buildTasks.length).toBe(1)
    expect(buildTasks[0].id).toBe(taskA)

    const testTasks = scheduler.listTasks({ type: 'test' }).tasks
    expect(testTasks.length).toBe(1)
    expect(testTasks[0].id).toBe(taskB)

    const succeeded = scheduler.listTasks({ status: 'succeeded' }).tasks
    expect(succeeded.length).toBe(2)
  })
})
