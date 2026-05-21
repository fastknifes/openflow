import * as fs from 'node:fs'
import * as path from 'node:path'
import { payloadNotSerializable, resultNotSerializable } from './errors.js'
import type { HistoryEvent, SchedulerTask } from './types.js'

const CURRENT_VERSION = 1
const SENSITIVE_KEY_PATTERN = /secret|token|password/i

interface PersistedState {
  version: number
  tasks: SchedulerTask[]
}

export interface LoadResult {
  tasks: SchedulerTask[]
  corrupted: boolean
}

export class StateStore {
  readonly stateDir: string
  readonly tasksPath: string
  readonly backupPath: string
  readonly historyPath: string

  constructor(projectRoot: string) {
    this.stateDir = path.resolve(projectRoot, '.sisyphus/openflow/scheduler')
    this.tasksPath = path.resolve(this.stateDir, 'tasks.json')
    this.backupPath = path.resolve(this.stateDir, 'tasks.json.bak')
    this.historyPath = path.resolve(this.stateDir, 'history.jsonl')
  }

  load(): LoadResult {
    const primary = this.readStateFile(this.tasksPath)
    if (primary.ok) {
      return { tasks: primary.state.tasks, corrupted: false }
    }

    const backup = this.readStateFile(this.backupPath)
    if (backup.ok) {
      return { tasks: backup.state.tasks, corrupted: primary.corrupted }
    }

    return { tasks: [], corrupted: primary.corrupted || backup.corrupted }
  }

  save(tasks: SchedulerTask[]): void {
    const sanitizedTasks = this.prepareTasksForSave(tasks)
    const state: PersistedState = { version: CURRENT_VERSION, tasks: sanitizedTasks }
    const json = `${JSON.stringify(state, null, 2)}\n`

    this.ensureStateDir()
    this.atomicWrite(this.backupPath, json)
    this.atomicWrite(this.tasksPath, json)
  }

  appendHistory(event: HistoryEvent): void {
    const json = this.stringifyJsonLine(event)

    this.ensureStateDir()
    fs.appendFileSync(this.historyPath, `${json}\n`, 'utf8')
  }

  private prepareTasksForSave(tasks: SchedulerTask[]): SchedulerTask[] {
    for (const task of tasks) {
      if (task.payload !== undefined) {
        this.assertSerializable(task.id, 'payload', task.payload)
      }
      if (task.result !== undefined) {
        this.assertSerializable(task.id, 'result', task.result)
      }
    }

    return this.redactSensitiveValues(tasks) as SchedulerTask[]
  }

  private assertSerializable(taskId: string, field: 'payload' | 'result', value: unknown): void {
    try {
      this.validateJsonSerializable(value)
      JSON.stringify(value)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw field === 'payload' ? payloadNotSerializable(taskId, reason) : resultNotSerializable(taskId, reason)
    }
  }

  private validateJsonSerializable(value: unknown, location = '$', seen = new WeakSet<object>()): void {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      return
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error(`${location} must be a finite number`)
      }
      return
    }

    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
      throw new Error(`${location} contains non-JSON value: ${typeof value}`)
    }

    if (Array.isArray(value)) {
      if (seen.has(value)) {
        throw new Error(`${location} contains a circular reference`)
      }
      seen.add(value)
      value.forEach((item, index) => this.validateJsonSerializable(item, `${location}[${index}]`, seen))
      seen.delete(value)
      return
    }

    if (typeof value === 'object') {
      if (seen.has(value)) {
        throw new Error(`${location} contains a circular reference`)
      }
      seen.add(value)
      for (const [key, child] of Object.entries(value)) {
        this.validateJsonSerializable(child, `${location}.${key}`, seen)
      }
      seen.delete(value)
    }
  }

  private redactSensitiveValues(value: unknown, seen = new WeakSet<object>()): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitiveValues(item, seen))
    }

    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        return value
      }
      seen.add(value)

      const redacted: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(value)) {
        redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : this.redactSensitiveValues(child, seen)
      }
      return redacted
    }

    return value
  }

  private stringifyJsonLine(value: unknown): string {
    return JSON.stringify(this.redactSensitiveValues(value))
  }

  private readStateFile(filePath: string): { ok: true; state: PersistedState } | { ok: false; corrupted: boolean } {
    if (!fs.existsSync(filePath)) {
      return { ok: false, corrupted: false }
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
      if (!this.isPersistedState(parsed)) {
        return { ok: false, corrupted: true }
      }
      return { ok: true, state: parsed }
    } catch {
      return { ok: false, corrupted: true }
    }
  }

  private isPersistedState(value: unknown): value is PersistedState {
    if (value === null || typeof value !== 'object') {
      return false
    }

    const state = value as Partial<PersistedState>
    return state.version === CURRENT_VERSION && Array.isArray(state.tasks)
  }

  private ensureStateDir(): void {
    fs.mkdirSync(this.stateDir, { recursive: true })
  }

  private atomicWrite(filePath: string, contents: string): void {
    const tempPath = `${filePath}.tmp.${process.pid}`
    fs.writeFileSync(tempPath, contents, 'utf8')
    fs.renameSync(tempPath, filePath)
  }
}
