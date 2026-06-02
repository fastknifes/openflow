import { describe, test, expect } from 'bun:test'
import { DagEngine } from '../../src/orchestrator/drg-engine.js'
import { SchedulerError } from '../../src/orchestrator/errors.js'
import type { SchedulerTask } from '../../src/orchestrator/types.js'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeTask(id: string, overrides: Partial<SchedulerTask> = {}): SchedulerTask {
  return {
    id,
    type: 'test',
    status: 'pending',
    attemptCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// submitTask
// ---------------------------------------------------------------------------

describe('DagEngine — submitTask', () => {
  test('submits a simple task and stores it', () => {
    const engine = new DagEngine()
    const task = makeTask('t1')
    const result = engine.submitTask(task)
    expect(result.id).toBe('t1')
    expect(result.status).toBe('pending')
    expect(engine.getTask('t1').id).toBe('t1')
  })
})

// ---------------------------------------------------------------------------
// addDependency
// ---------------------------------------------------------------------------

describe('DagEngine — addDependency', () => {
  test('adds a valid dependency', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('a'))
    engine.submitTask(makeTask('b'))
    const updated = engine.addDependency('b', 'a')
    expect(updated.dependsOn).toContain('a')
  })

  test('throws for self-dependency', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('a'))
    expect(() => engine.addDependency('a', 'a')).toThrow()
    try {
      engine.addDependency('a', 'a')
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulerError)
      expect((err as SchedulerError).code).toBe('SELF_DEPENDENCY')
    }
  })

  test('throws for missing dependency', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('a'))
    expect(() => engine.addDependency('a', 'nonexistent')).toThrow()
    try {
      engine.addDependency('a', 'nonexistent')
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulerError)
      expect((err as SchedulerError).code).toBe('DEPENDENCY_NOT_FOUND')
    }
  })

  test('throws for cycle detection (A→B→C→A)', () => {
    const engine = new DagEngine()
    // Build A → B → C
    engine.submitTask(makeTask('a'))
    engine.submitTask(makeTask('b', { dependsOn: ['a'] }))
    engine.submitTask(makeTask('c', { dependsOn: ['b'] }))
    // Trying to make C a dependency of A would create cycle A→B→C→A
    expect(() => engine.addDependency('a', 'c')).toThrow()
    try {
      engine.addDependency('a', 'c')
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulerError)
      expect((err as SchedulerError).code).toBe('CYCLE_DETECTED')
    }
  })
})

// ---------------------------------------------------------------------------
// transitionTask
// ---------------------------------------------------------------------------

describe('DagEngine — transitionTask', () => {
  test('valid transition: pending → ready', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { status: 'pending' }))
    const updated = engine.transitionTask('t1', 'ready')
    expect(updated.status).toBe('ready')
  })

  test('valid transition: ready → running', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { status: 'ready' }))
    const updated = engine.transitionTask('t1', 'running')
    expect(updated.status).toBe('running')
  })

  test('valid transition: running → succeeded', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { status: 'running' }))
    const updated = engine.transitionTask('t1', 'succeeded')
    expect(updated.status).toBe('succeeded')
  })

  test('valid transition: failed → pending', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { status: 'failed' }))
    const updated = engine.transitionTask('t1', 'pending')
    expect(updated.status).toBe('pending')
  })

  test('throws for invalid transition: succeeded → running', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { status: 'succeeded' }))
    expect(() => engine.transitionTask('t1', 'running')).toThrow()
    try {
      engine.transitionTask('t1', 'running')
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulerError)
      expect((err as SchedulerError).code).toBe('INVALID_STATE_TRANSITION')
    }
  })

  test('throws for invalid transition: cancelled → pending', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { status: 'cancelled' }))
    expect(() => engine.transitionTask('t1', 'pending')).toThrow()
    try {
      engine.transitionTask('t1', 'pending')
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulerError)
      expect((err as SchedulerError).code).toBe('INVALID_STATE_TRANSITION')
    }
  })
})

// ---------------------------------------------------------------------------
// retryTask
// ---------------------------------------------------------------------------

describe('DagEngine — retryTask', () => {
  test('retries from failed → pending and increments attemptCount', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { status: 'failed', attemptCount: 1 }))
    const retried = engine.retryTask('t1')
    expect(retried.status).toBe('pending')
    expect(retried.attemptCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// getReadyTasks
// ---------------------------------------------------------------------------

describe('DagEngine — getReadyTasks', () => {
  test('returns ready tasks sorted by createdAt', () => {
    const engine = new DagEngine()
    const now = Date.now()
    engine.submitTask(makeTask('t2', { createdAt: now + 1000 }))
    engine.submitTask(makeTask('t1', { createdAt: now }))
    engine.submitTask(makeTask('t3', { createdAt: now + 2000 }))

    const ready = engine.getReadyTasks()
    expect(ready.length).toBe(3)
    expect(ready[0].id).toBe('t1')
    expect(ready[1].id).toBe('t2')
    expect(ready[2].id).toBe('t3')
  })

  test('respects dependencies — only tasks with all deps succeeded become ready', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('a', { status: 'succeeded' }))
    engine.submitTask(makeTask('b', { status: 'pending' }))
    engine.submitTask(makeTask('c', { status: 'pending', dependsOn: ['a', 'b'] }))

    // getReadyTasks transitions b from pending→ready (no deps), but c still blocked by b
    const ready1 = engine.getReadyTasks()
    const ready1Ids = ready1.map((t) => t.id)
    expect(ready1Ids).toContain('b')
    expect(ready1Ids).not.toContain('c')

    // Mark b succeeded
    engine.transitionTask('b', 'running')
    engine.transitionTask('b', 'succeeded')

    // Now c should become ready
    const ready2 = engine.getReadyTasks()
    const ready2Ids = ready2.map((t) => t.id)
    expect(ready2Ids).toContain('c')
  })
})

// ---------------------------------------------------------------------------
// blockDownstream (failed / cancelled)
// ---------------------------------------------------------------------------

describe('DagEngine — blockDownstream', () => {
  test('failed task blocks downstream dependents', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('a', { status: 'running' }))
    engine.submitTask(makeTask('b', { status: 'pending', dependsOn: ['a'] }))

    engine.transitionTask('a', 'failed')
    expect(engine.getTask('b').status).toBe('blocked')
  })

  test('cancelled task blocks downstream dependents', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('a', { status: 'running' }))
    engine.submitTask(makeTask('b', { status: 'pending', dependsOn: ['a'] }))

    engine.transitionTask('a', 'cancelled')
    expect(engine.getTask('b').status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// runAfter scheduling
// ---------------------------------------------------------------------------

describe('DagEngine — runAfter', () => {
  test('task is not ready before runAfter timestamp', () => {
    const engine = new DagEngine()
    const futureTime = Date.now() + 60_000
    engine.submitTask(makeTask('t1', { runAfter: futureTime }))

    const ready = engine.getReadyTasks(Date.now())
    expect(ready.length).toBe(0)
  })

  test('task becomes ready after runAfter timestamp', () => {
    const engine = new DagEngine()
    const pastTime = Date.now() - 1
    engine.submitTask(makeTask('t1', { runAfter: pastTime }))

    const ready = engine.getReadyTasks(Date.now())
    expect(ready.length).toBe(1)
    expect(ready[0].id).toBe('t1')
  })
})

// ---------------------------------------------------------------------------
// getTask — returns cloned copy
// ---------------------------------------------------------------------------

describe('DagEngine — getTask', () => {
  test('returns a cloned task (mutations do not affect stored version)', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('t1', { payload: { key: 'value' } }))

    const retrieved = engine.getTask('t1')
    retrieved.payload!['key'] = 'mutated'

    const again = engine.getTask('t1')
    expect(again.payload!['key']).toBe('value')
  })
})

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe('DagEngine — listTasks', () => {
  test('returns all tasks', () => {
    const engine = new DagEngine()
    engine.submitTask(makeTask('a'))
    engine.submitTask(makeTask('b'))
    engine.submitTask(makeTask('c'))

    const all = engine.listTasks()
    expect(all.length).toBe(3)
    const ids = new Set(all.map((t) => t.id))
    expect(ids.has('a')).toBe(true)
    expect(ids.has('b')).toBe(true)
    expect(ids.has('c')).toBe(true)
  })
})
