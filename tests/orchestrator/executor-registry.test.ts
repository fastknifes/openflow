import { describe, test, expect } from 'bun:test'
import { ExecutorRegistry } from '../../src/orchestrator/executor-registry.js'
import { SchedulerError } from '../../src/orchestrator/errors.js'

const noopExecutor = async () => {}

describe('ExecutorRegistry', () => {
  test('registers and retrieves an executor', () => {
    const registry = new ExecutorRegistry()
    registry.registerExecutor('build', noopExecutor)
    const retrieved = registry.getExecutor('build')
    expect(retrieved).toBe(noopExecutor)
  })

  test('hasExecutor returns true for registered type', () => {
    const registry = new ExecutorRegistry()
    registry.registerExecutor('build', noopExecutor)
    expect(registry.hasExecutor('build')).toBe(true)
  })

  test('hasExecutor returns false for unknown type', () => {
    const registry = new ExecutorRegistry()
    expect(registry.hasExecutor('unknown')).toBe(false)
  })

  test('registering duplicate type throws SchedulerError with code DUPLICATE_EXECUTOR', () => {
    const registry = new ExecutorRegistry()
    registry.registerExecutor('build', noopExecutor)
    expect(() => registry.registerExecutor('build', noopExecutor)).toThrow()
    try {
      registry.registerExecutor('build', noopExecutor)
    } catch (err) {
      expect(err).toBeInstanceOf(SchedulerError)
      expect((err as SchedulerError).code).toBe('DUPLICATE_EXECUTOR')
    }
  })

  test('getExecutor returns undefined for unknown type', () => {
    const registry = new ExecutorRegistry()
    expect(registry.getExecutor('unknown')).toBeUndefined()
  })
})
