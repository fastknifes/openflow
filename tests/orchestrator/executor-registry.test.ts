import { describe, expect, test } from 'bun:test'
import { ExecutorRegistry } from '../../src/orchestrator/executor-registry.js'
import { SchedulerError } from '../../src/orchestrator/errors.js'
import type { ExecutorFunction } from '../../src/orchestrator/types.js'

describe('ExecutorRegistry', () => {
  test('registers and retrieves an executor', () => {
    const registry = new ExecutorRegistry()
    const executor: ExecutorFunction = async () => ({ ok: true })

    registry.registerExecutor('example', executor)

    expect(registry.getExecutor('example')).toBe(executor)
  })

  test('rejects duplicate executor registration', () => {
    const registry = new ExecutorRegistry()
    const first: ExecutorFunction = async () => ({ ok: true })
    const second: ExecutorFunction = async () => ({ ok: false })

    registry.registerExecutor('example', first)

    expect(() => registry.registerExecutor('example', second)).toThrow(SchedulerError)
    try {
      registry.registerExecutor('example', second)
    } catch (error) {
      expect((error as SchedulerError).code).toBe('DUPLICATE_EXECUTOR')
    }
  })

  test('returns undefined for a missing executor', () => {
    const registry = new ExecutorRegistry()

    expect(registry.getExecutor('missing')).toBeUndefined()
  })

  test('reports whether an executor is registered', () => {
    const registry = new ExecutorRegistry()

    expect(registry.hasExecutor('example')).toBe(false)

    registry.registerExecutor('example', async () => ({ ok: true }))

    expect(registry.hasExecutor('example')).toBe(true)
  })
})
