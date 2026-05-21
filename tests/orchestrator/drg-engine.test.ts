import { describe, expect, test } from 'bun:test'
import { DagEngine } from '../../src/orchestrator/drg-engine'
import { SchedulerError } from '../../src/orchestrator/errors'
import type { SchedulerTask, TaskStatus } from '../../src/orchestrator/types'

function task(id: string, overrides: Partial<SchedulerTask> = {}): SchedulerTask {
  return {
    id,
    type: 'test',
    status: 'pending',
    attemptCount: 0,
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  }
}

function expectSchedulerCode(fn: () => unknown, code: string): void {
  expect(fn).toThrow(SchedulerError)
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(SchedulerError)
    expect((error as SchedulerError).code).toBe(code)
    return
  }
  throw new Error('Expected SchedulerError')
}

describe('DagEngine state transitions', () => {
  const legalTransitions: Array<[TaskStatus, TaskStatus]> = [
    ['pending', 'ready'],
    ['pending', 'blocked'],
    ['pending', 'cancelled'],
    ['ready', 'running'],
    ['ready', 'blocked'],
    ['ready', 'cancelled'],
    ['running', 'succeeded'],
    ['running', 'failed'],
    ['running', 'cancelled'],
    ['failed', 'pending'],
  ]

  for (const [from, to] of legalTransitions) {
    test(`allows ${from} -> ${to}`, () => {
      const engine = new DagEngine()
      engine.submitTask(task('t-1', { status: from }))

      const updated = from === 'failed' && to === 'pending' ? engine.retryTask('t-1') : engine.transitionTask('t-1', to)

      expect(updated.status).toBe(to)
    })
  }

  test('rejects illegal transitions', () => {
    const engine = new DagEngine()
    engine.submitTask(task('t-1', { status: 'pending' }))

    expectSchedulerCode(() => engine.transitionTask('t-1', 'succeeded'), 'INVALID_STATE_TRANSITION')
  })

  test('protects terminal states', () => {
    for (const status of ['succeeded', 'cancelled', 'blocked'] as const) {
      const engine = new DagEngine()
      engine.submitTask(task('t-1', { status }))

      expectSchedulerCode(() => engine.transitionTask('t-1', 'running'), 'INVALID_STATE_TRANSITION')
    }
  })
})

describe('DagEngine dependency validation', () => {
  test('rejects self-dependency on submitTask', () => {
    const engine = new DagEngine()

    expectSchedulerCode(() => engine.submitTask(task('t-1', { dependsOn: ['t-1'] })), 'SELF_DEPENDENCY')
  })

  test('rejects missing dependency on submitTask', () => {
    const engine = new DagEngine()

    expectSchedulerCode(() => engine.submitTask(task('t-1', { dependsOn: ['missing'] })), 'DEPENDENCY_NOT_FOUND')
  })

  test('detects direct cycles when adding a dependency', () => {
    const engine = new DagEngine()
    engine.submitTask(task('a'))
    engine.submitTask(task('b', { dependsOn: ['a'] }))

    expectSchedulerCode(() => engine.addDependency('a', 'b'), 'CYCLE_DETECTED')
  })

  test('detects indirect cycles when adding a dependency', () => {
    const engine = new DagEngine()
    engine.submitTask(task('a'))
    engine.submitTask(task('b', { dependsOn: ['a'] }))
    engine.submitTask(task('c', { dependsOn: ['b'] }))

    expectSchedulerCode(() => engine.addDependency('a', 'c'), 'CYCLE_DETECTED')
  })
})

describe('DagEngine dependency propagation and retry', () => {
  test('propagates dependency failure to un-run downstream tasks as blocked', () => {
    const engine = new DagEngine()
    engine.submitTask(task('root', { status: 'running' }))
    engine.submitTask(task('child', { dependsOn: ['root'] }))
    engine.submitTask(task('grandchild', { dependsOn: ['child'] }))

    engine.transitionTask('root', 'failed')

    expect(engine.getTask('child').status).toBe('blocked')
    expect(engine.getTask('grandchild').status).toBe('blocked')
  })

  test('propagates dependency cancellation to un-run downstream tasks as blocked', () => {
    const engine = new DagEngine()
    engine.submitTask(task('root', { status: 'running' }))
    engine.submitTask(task('child', { status: 'ready', dependsOn: ['root'] }))

    engine.transitionTask('root', 'cancelled')

    expect(engine.getTask('child').status).toBe('blocked')
  })

  test('does not block already running downstream tasks', () => {
    const engine = new DagEngine()
    engine.submitTask(task('root', { status: 'running' }))
    engine.submitTask(task('child', { status: 'running', dependsOn: ['root'] }))

    engine.transitionTask('root', 'failed')

    expect(engine.getTask('child').status).toBe('running')
  })

  test('retryTask resets failed task to pending, increments attempts, and clears old error', () => {
    const engine = new DagEngine()
    engine.submitTask(
      task('root', {
        status: 'failed',
        attemptCount: 2,
        error: { code: 'EXECUTOR_FAILED', message: 'old failure', taskId: 'root' },
      }),
    )
    engine.submitTask(task('child', { status: 'blocked', dependsOn: ['root'] }))

    const retried = engine.retryTask('root')

    expect(retried.status).toBe('pending')
    expect(retried.attemptCount).toBe(3)
    expect(retried.error).toBeUndefined()
    expect(engine.getTask('child').status).toBe('blocked')
  })
})

describe('DagEngine ready selection', () => {
  test('keeps runAfter tasks pending until due', () => {
    const engine = new DagEngine()
    engine.submitTask(task('future', { runAfter: 200 }))

    expect(engine.getReadyTasks(100)).toEqual([])
    expect(engine.getTask('future').status).toBe('pending')

    expect(engine.getReadyTasks(200).map((ready) => ready.id)).toEqual(['future'])
    expect(engine.getTask('future').status).toBe('ready')
  })

  test('returns ready tasks deterministically by createdAt then id', () => {
    const engine = new DagEngine()
    engine.submitTask(task('b', { createdAt: 100 }))
    engine.submitTask(task('a', { createdAt: 100 }))
    engine.submitTask(task('old', { createdAt: 50 }))
    engine.submitTask(task('future', { createdAt: 1, runAfter: 999 }))

    expect(engine.getReadyTasks(100).map((ready) => ready.id)).toEqual(['old', 'a', 'b'])
  })

  test('only readies tasks whose dependencies succeeded', () => {
    const engine = new DagEngine()
    engine.submitTask(task('dep', { status: 'running' }))
    engine.submitTask(task('child', { dependsOn: ['dep'] }))

    expect(engine.getReadyTasks(100)).toEqual([])
    expect(engine.getTask('child').status).toBe('pending')

    engine.transitionTask('dep', 'succeeded')
    expect(engine.getReadyTasks(100).map((ready) => ready.id)).toEqual(['child'])
  })
})
