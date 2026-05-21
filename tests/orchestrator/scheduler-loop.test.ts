import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { SchedulerLoop } from '../../src/orchestrator/scheduler-loop.js'
import { StateStore } from '../../src/orchestrator/state-store.js'
import type { ExecutorFunction } from '../../src/orchestrator/types.js'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openflow-scheduler-loop-'))
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

describe('SchedulerLoop', () => {
  test('submit and execute a simple task', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    scheduler.registerExecutor('simple', async () => ({ ok: true }))
    const taskId = scheduler.submitTask({ type: 'simple' })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(20)
    await scheduler.stopScheduler()

    expect(scheduler.getTask(taskId).status).toBe('succeeded')
    expect(scheduler.getTask(taskId).result).toEqual({ ok: true })
  })

  test('runs dependency chain A -> B in order', async () => {
    const order: string[] = []
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    const executor: ExecutorFunction = async (task) => {
      order.push(task.id)
      return { id: task.id }
    }
    scheduler.registerExecutor('dep', executor)
    const taskA = scheduler.submitTask({ type: 'dep' })
    const taskB = scheduler.submitTask({ type: 'dep', dependsOn: [taskA] })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(10)
    await scheduler.tick()
    await sleep(10)
    await scheduler.stopScheduler()

    expect(order).toEqual([taskA, taskB])
    expect(scheduler.getTask(taskB).status).toBe('succeeded')
  })

  test('serializes two write-lock tasks on the same file', async () => {
    const events: string[] = []
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10, maxConcurrency: 2 })
    scheduler.registerExecutor('lock', async (task) => {
      events.push(`start:${task.id}`)
      await sleep(15)
      events.push(`end:${task.id}`)
      return { done: true }
    })

    const first = scheduler.submitTask({
      type: 'lock',
      resources: [{ kind: 'file', id: 'shared.txt', mode: 'write' }],
    })
    const second = scheduler.submitTask({
      type: 'lock',
      resources: [{ kind: 'file', id: 'shared.txt', mode: 'write' }],
    })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(20)
    await scheduler.tick()
    await sleep(20)
    await scheduler.stopScheduler()

    expect(events).toEqual([`start:${first}`, `end:${first}`, `start:${second}`, `end:${second}`])
  })

  test('missing executor keeps task ready', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    const taskId = scheduler.submitTask({ type: 'missing' })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(10)
    await scheduler.stopScheduler()

    expect(scheduler.getTask(taskId).status).toBe('ready')
  })

  test('cancels a pending task', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const taskId = scheduler.submitTask({ type: 'simple' })

    const task = scheduler.cancelTask(taskId)

    expect(task.status).toBe('cancelled')
  })

  test('cancels a running task and executor sees abort signal', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    let aborted = false
    scheduler.registerExecutor('long', async (_task, context) => {
      await waitForAbort(context.signal)
      aborted = context.signal.aborted
      return { ignored: true }
    })
    const taskId = scheduler.submitTask({ type: 'long' })

    scheduler.startScheduler()
    await scheduler.tick()
    scheduler.cancelTask(taskId)
    await sleep(20)
    await scheduler.stopScheduler()

    expect(aborted).toBe(true)
    expect(scheduler.getTask(taskId).status).toBe('cancelled')
  })

  test('retries a failed task', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    let attempts = 0
    scheduler.registerExecutor('flaky', async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('first failure')
      }
      return { ok: true }
    })
    const taskId = scheduler.submitTask({ type: 'flaky' })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(20)

    expect(scheduler.getTask(taskId).status).toBe('failed')

    scheduler.retryTask(taskId)
    await scheduler.tick()
    await sleep(20)
    await scheduler.stopScheduler()

    expect(scheduler.getTask(taskId).status).toBe('succeeded')
    expect(scheduler.getTask(taskId).attemptCount).toBe(1)
  })

  test('runAfter keeps task pending until due', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    scheduler.registerExecutor('future', async () => ({ ok: true }))
    const taskId = scheduler.submitTask({ type: 'future', runAfter: Date.now() + 10_000 })

    scheduler.startScheduler()
    await scheduler.tick(Date.now())
    await scheduler.stopScheduler()

    expect(scheduler.getTask(taskId).status).toBe('pending')
  })

  test('recovery marks persisted running tasks as SCHEDULER_INTERRUPTED', () => {
    const root = makeTempRoot()
    const store = new StateStore(root)
    store.save([
      {
        id: 'stale-running',
        type: 'recover',
        status: 'running',
        attemptCount: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ])

    const scheduler = new SchedulerLoop(root)
    scheduler.startScheduler()

    const task = scheduler.getTask('stale-running')
    expect(task.status).toBe('failed')
    expect(task.error).toEqual({
      code: 'SCHEDULER_INTERRUPTED',
      message: 'Scheduler interrupted during task execution: stale-running',
      taskId: 'stale-running',
    })
  })

  test('stopScheduler drains running tasks without aborting by default', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    scheduler.registerExecutor('drain', async () => {
      await sleep(20)
      return { done: true }
    })
    const taskId = scheduler.submitTask({ type: 'drain' })

    scheduler.startScheduler()
    await scheduler.tick()
    await scheduler.stopScheduler()

    expect(scheduler.getTask(taskId).status).toBe('succeeded')
  })

  test('stopScheduler with abortRunning aborts running tasks', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    scheduler.registerExecutor('abortable', async (_task, context) => {
      await waitForAbort(context.signal)
      return { never: 'used' }
    })
    const taskId = scheduler.submitTask({ type: 'abortable' })

    scheduler.startScheduler()
    await scheduler.tick()
    await scheduler.stopScheduler({ abortRunning: true })

    expect(scheduler.getTask(taskId).status).toBe('cancelled')
  })

  test('listTasks returns corrupted flag from state store', () => {
    const root = makeTempRoot()
    const store = new StateStore(root)
    fs.mkdirSync(store.stateDir, { recursive: true })
    fs.writeFileSync(store.tasksPath, '{bad json', 'utf8')
    fs.writeFileSync(store.backupPath, '{also bad json', 'utf8')

    const scheduler = new SchedulerLoop(root)
    scheduler.startScheduler()

    expect(scheduler.listTasks().corrupted).toBe(true)
  })

  test('max concurrency defaults to 1', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    let concurrent = 0
    let maxSeen = 0
    scheduler.registerExecutor('serial', async () => {
      concurrent += 1
      maxSeen = Math.max(maxSeen, concurrent)
      await sleep(15)
      concurrent -= 1
      return { ok: true }
    })
    scheduler.submitTask({ type: 'serial' })
    scheduler.submitTask({ type: 'serial' })

    scheduler.startScheduler()
    await scheduler.tick()
    await sleep(20)
    await scheduler.tick()
    await sleep(20)
    await scheduler.stopScheduler()

    expect(maxSeen).toBe(1)
  })
})
