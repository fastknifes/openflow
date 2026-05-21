import { describe, expect, test } from 'bun:test'

import { SchedulerError } from '../../src/orchestrator/errors.js'
import { ResourceLockManager } from '../../src/orchestrator/resource-lock-manager.js'
import type { ResourceLock } from '../../src/orchestrator/types.js'

describe('ResourceLockManager', () => {
  test('acquires valid resource locks and releases them', () => {
    const manager = new ResourceLockManager()
    const resource: ResourceLock = { kind: 'record', id: 'alpha', mode: 'write' }

    expect(manager.acquireLocks('t-1', [resource])).toBe(true)
    expect(manager.acquireLocks('t-2', [resource])).toBe(false)

    manager.releaseLocks('t-1')

    expect(manager.acquireLocks('t-2', [resource])).toBe(true)
  })

  test('allows two tasks to read the same resource', () => {
    const manager = new ResourceLockManager()
    const resource: ResourceLock = { kind: 'record', id: 'shared', mode: 'read' }

    expect(manager.acquireLocks('t-1', [resource])).toBe(true)
    expect(manager.acquireLocks('t-2', [resource])).toBe(true)
  })

  test('prevents write acquisition while another task holds a read lock', () => {
    const manager = new ResourceLockManager()

    expect(manager.acquireLocks('reader', [{ kind: 'record', id: 'shared', mode: 'read' }])).toBe(true)
    expect(manager.acquireLocks('writer', [{ kind: 'record', id: 'shared', mode: 'write' }])).toBe(false)
  })

  test('prevents read acquisition while another task holds a write lock', () => {
    const manager = new ResourceLockManager()

    expect(manager.acquireLocks('writer', [{ kind: 'record', id: 'shared', mode: 'write' }])).toBe(true)
    expect(manager.acquireLocks('reader', [{ kind: 'record', id: 'shared', mode: 'read' }])).toBe(false)
  })

  test('prevents two tasks from writing the same resource', () => {
    const manager = new ResourceLockManager()
    const resource: ResourceLock = { kind: 'record', id: 'shared', mode: 'write' }

    expect(manager.acquireLocks('t-1', [resource])).toBe(true)
    expect(manager.acquireLocks('t-2', [resource])).toBe(false)
  })

  test('does not acquire any locks when one requested lock conflicts', () => {
    const manager = new ResourceLockManager()

    expect(manager.acquireLocks('holder', [{ kind: 'record', id: 'busy', mode: 'write' }])).toBe(true)

    expect(
      manager.acquireLocks('candidate', [
        { kind: 'record', id: 'free', mode: 'write' },
        { kind: 'record', id: 'busy', mode: 'read' },
      ]),
    ).toBe(false)

    expect(manager.acquireLocks('other', [{ kind: 'record', id: 'free', mode: 'write' }])).toBe(true)
  })

  test('releases all locks for a task ID', () => {
    const manager = new ResourceLockManager()

    expect(
      manager.acquireLocks('t-1', [
        { kind: 'record', id: 'one', mode: 'write' },
        { kind: 'record', id: 'two', mode: 'write' },
      ]),
    ).toBe(true)

    manager.releaseLocks('t-1')

    expect(manager.acquireLocks('t-2', [{ kind: 'record', id: 'one', mode: 'write' }])).toBe(true)
    expect(manager.acquireLocks('t-3', [{ kind: 'record', id: 'two', mode: 'write' }])).toBe(true)
  })

  test('cleans up locks for task IDs that are not running', () => {
    const manager = new ResourceLockManager()

    expect(manager.acquireLocks('running', [{ kind: 'record', id: 'kept', mode: 'write' }])).toBe(true)
    expect(manager.acquireLocks('orphan', [{ kind: 'record', id: 'released', mode: 'write' }])).toBe(true)

    manager.cleanupOrphans(new Set(['running']))

    expect(manager.acquireLocks('next-1', [{ kind: 'record', id: 'kept', mode: 'write' }])).toBe(false)
    expect(manager.acquireLocks('next-2', [{ kind: 'record', id: 'released', mode: 'write' }])).toBe(true)
  })

  test('rejects resources with an empty kind', () => {
    const manager = new ResourceLockManager()

    expect(() => manager.acquireLocks('t-1', [{ kind: '', id: 'x', mode: 'read' }])).toThrow(SchedulerError)
    expect(() => manager.acquireLocks('t-1', [{ kind: '', id: 'x', mode: 'read' }])).toThrow('kind')
  })

  test('rejects resources with an empty id', () => {
    const manager = new ResourceLockManager()

    expect(() => manager.acquireLocks('t-1', [{ kind: 'record', id: '', mode: 'read' }])).toThrow(SchedulerError)
    expect(() => manager.acquireLocks('t-1', [{ kind: 'record', id: '', mode: 'read' }])).toThrow('id')
  })

  test('rejects resources with an invalid mode', () => {
    const manager = new ResourceLockManager()
    const resource = { kind: 'record', id: 'x', mode: 'exclusive' } as unknown as ResourceLock

    expect(() => manager.acquireLocks('t-1', [resource])).toThrow(SchedulerError)
    expect(() => manager.acquireLocks('t-1', [resource])).toThrow('mode')
  })

  test('normalizes file paths before conflict checking', () => {
    const manager = new ResourceLockManager()

    expect(manager.acquireLocks('t-1', [{ kind: 'file', id: './a', mode: 'write' }])).toBe(true)
    expect(manager.acquireLocks('t-2', [{ kind: 'file', id: 'a', mode: 'read' }])).toBe(false)
  })
})
