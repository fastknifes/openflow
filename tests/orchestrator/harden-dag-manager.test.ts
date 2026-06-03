import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { SchedulerLoop } from '../../src/orchestrator/scheduler-loop.js'
import { HardenDagManager } from '../../src/orchestrator/harden-dag-manager.js'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openflow-harden-dag-'))
  tempRoots.push(root)
  return root
}

// Track managers for cleanup
const managers: HardenDagManager[] = []

afterEach(() => {
  for (const mgr of managers.splice(0)) {
    try {
      mgr.archiveAndDestroy()
    } catch {}
  }
  for (const root of tempRoots.splice(0)) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch {}
  }
})

describe('HardenDagManager', () => {
  test('createHardenDag returns dagId and prefix with correct pattern', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const manager = new HardenDagManager(scheduler)
    managers.push(manager)
    const result = manager.createHardenDag('test-feature')
    expect(result.dagId.length).toBeGreaterThan(0)
    expect(result.prefix).toBe(`harden-${result.dagId}-`)
    expect(result.prefix.startsWith('harden-')).toBe(true)
  })

  test('createHardenDag throws if another DAG is active', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const manager1 = new HardenDagManager(scheduler)
    managers.push(manager1)
    manager1.createHardenDag('feature-1')
    const manager2 = new HardenDagManager(scheduler)
    managers.push(manager2)
    expect(() => manager2.createHardenDag('feature-2')).toThrow('A harden DAG is already running')
  })

  test('submitReviewerTask creates task with type harden-reviewer', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const manager = new HardenDagManager(scheduler)
    managers.push(manager)
    const { prefix } = manager.createHardenDag('test')
    const taskId = manager.submitReviewerTask(1, { test: true })
    expect(taskId.startsWith(prefix)).toBe(true)
    const task = scheduler.getTask(taskId)
    expect(task.type).toBe('harden-reviewer')
    expect(task.payload.round).toBe(1)
  })

  test('submitExecutorTask creates task with type harden-executor', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const manager = new HardenDagManager(scheduler)
    managers.push(manager)
    const { prefix } = manager.createHardenDag('test')
    const taskId = manager.submitExecutorTask(1, { test: true })
    expect(taskId.startsWith(prefix)).toBe(true)
    const task = scheduler.getTask(taskId)
    expect(task.type).toBe('harden-executor')
  })

  test('tasks are chained via dependsOn', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const manager = new HardenDagManager(scheduler)
    managers.push(manager)
    manager.createHardenDag('test')
    const reviewerTaskId = manager.submitReviewerTask(1, {})
    const executorTaskId = manager.submitExecutorTask(1, {})
    const executorTask = scheduler.getTask(executorTaskId)
    expect(executorTask.dependsOn).toEqual([reviewerTaskId])
  })

  test('awaitTask returns terminal task after execution', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot(), { tickIntervalMs: 10 })
    scheduler.registerExecutor('harden-reviewer', async () => ({ ok: true }))
    const manager = new HardenDagManager(scheduler)
    managers.push(manager)
    manager.createHardenDag('test')
    const taskId = manager.submitReviewerTask(1, {})
    scheduler.startScheduler()
    try {
      const task = await manager.awaitTask(taskId, 5000)
      expect(task.status).toBe('succeeded')
      expect(task.id).toBe(taskId)
    } finally {
      await scheduler.stopScheduler()
    }
  })

  test('awaitTask throws on timeout', async () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    // No executor registered → task stays pending
    const manager = new HardenDagManager(scheduler)
    managers.push(manager)
    manager.createHardenDag('test')
    const taskId = manager.submitReviewerTask(1, {})
    await expect(manager.awaitTask(taskId, 200)).rejects.toThrow('Timed out')
  })

  test('archiveAndDestroy cancels tasks and allows new DAG', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const manager1 = new HardenDagManager(scheduler)
    managers.push(manager1)
    manager1.createHardenDag('test-1')
    manager1.submitReviewerTask(1, {})
    manager1.archiveAndDestroy()
    // Should now be able to create a new DAG
    const manager2 = new HardenDagManager(scheduler)
    managers.push(manager2)
    const result = manager2.createHardenDag('test-2')
    expect(result.prefix.startsWith('harden-')).toBe(true)
  })

  test('cancel resets state and allows new DAG', () => {
    const scheduler = new SchedulerLoop(makeTempRoot())
    const manager1 = new HardenDagManager(scheduler)
    managers.push(manager1)
    manager1.createHardenDag('test-1')
    manager1.submitReviewerTask(1, {})
    const cancelled = manager1.cancel()
    expect(cancelled.length).toBeGreaterThanOrEqual(1)
    const manager2 = new HardenDagManager(scheduler)
    managers.push(manager2)
    expect(() => manager2.createHardenDag('test-2')).not.toThrow()
  })
})
