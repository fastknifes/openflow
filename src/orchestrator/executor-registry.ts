import { duplicateExecutor } from './errors.js'
import type { ExecutorFunction } from './types.js'

export class ExecutorRegistry {
  private readonly executors = new Map<string, ExecutorFunction>()

  registerExecutor(type: string, executor: ExecutorFunction): void {
    if (this.executors.has(type)) {
      throw duplicateExecutor(type)
    }

    this.executors.set(type, executor)
  }

  getExecutor(type: string): ExecutorFunction | undefined {
    return this.executors.get(type)
  }

  hasExecutor(type: string): boolean {
    return this.executors.has(type)
  }
}
