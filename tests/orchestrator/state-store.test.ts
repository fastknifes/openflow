import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { SchedulerError } from '../../src/orchestrator/errors'
import { StateStore } from '../../src/orchestrator/state-store'
import type { HistoryEvent, SchedulerTask } from '../../src/orchestrator/types'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openflow-state-store-'))
  tempRoots.push(root)
  return root
}

function makeTask(overrides: Partial<SchedulerTask> = {}): SchedulerTask {
  return {
    id: 'task-1',
    type: 'example',
    status: 'pending',
    attemptCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('StateStore', () => {
  test('saves and loads tasks successfully', () => {
    const store = new StateStore(makeTempRoot())
    const tasks = [makeTask({ payload: { message: 'hello' } })]

    store.save(tasks)

    expect(store.load()).toEqual({ tasks, corrupted: false })
  })

  test('round-trips versioned state', () => {
    const store = new StateStore(makeTempRoot())
    const tasks = [makeTask()]

    store.save(tasks)

    const persisted = readJson(store.tasksPath)

    expect(persisted).toEqual({ version: 1, tasks })
    expect(store.load()).toEqual({ tasks, corrupted: false })
  })

  test('uses atomic write and rename without leaving temp files', () => {
    const store = new StateStore(makeTempRoot())

    store.save([makeTask()])

    const files = fs.readdirSync(store.stateDir)

    expect(files).toContain('tasks.json')
    expect(files).toContain('tasks.json.bak')
    expect(files.some((file) => file.includes('.tmp.'))).toBe(false)
  })

  test('loads backup when primary state is corrupted', () => {
    const store = new StateStore(makeTempRoot())
    const tasks = [makeTask({ id: 'from-bak' })]

    store.save(tasks)
    fs.writeFileSync(store.tasksPath, '{not json', 'utf8')

    expect(store.load()).toEqual({ tasks, corrupted: true })
  })

  test('returns empty state with corrupted flag when primary and backup are corrupted', () => {
    const store = new StateStore(makeTempRoot())
    fs.mkdirSync(store.stateDir, { recursive: true })
    fs.writeFileSync(store.tasksPath, '{not json', 'utf8')
    fs.writeFileSync(store.backupPath, '{also not json', 'utf8')

    expect(store.load()).toEqual({ tasks: [], corrupted: true })
  })

  test('redacts sensitive keys in payload, result, and error before saving', () => {
    const store = new StateStore(makeTempRoot())
    const tasks = [
      makeTask({
        payload: {
          secret: 'hidden',
          apiToken: 'hidden',
          nested: { PasswordValue: 'hidden', visible: 'shown' },
        },
        result: { access_token: 'hidden', ok: true },
        error: { code: 'FAILED', message: 'nope', taskId: 'task-1', passwordHint: 'hidden' } as SchedulerTask['error'],
      }),
    ]

    store.save(tasks)
    const loaded = store.load().tasks[0]

    expect(loaded.payload).toEqual({
      secret: '[REDACTED]',
      apiToken: '[REDACTED]',
      nested: { PasswordValue: '[REDACTED]', visible: 'shown' },
    })
    expect(loaded.result).toEqual({ access_token: '[REDACTED]', ok: true })
    expect(loaded.error).toEqual({ code: 'FAILED', message: 'nope', taskId: 'task-1', passwordHint: '[REDACTED]' })
  })

  test('appends history events as JSON lines', () => {
    const store = new StateStore(makeTempRoot())
    const first: HistoryEvent = { timestamp: 1, taskId: 'task-1', event: 'created' }
    const second: HistoryEvent = { timestamp: 2, taskId: 'task-1', event: 'updated', reason: 'ready' }

    store.appendHistory(first)
    store.appendHistory(second)
    const lines = fs.readFileSync(store.historyPath, 'utf8').trim().split('\n')

    expect(lines.map((line) => JSON.parse(line))).toEqual([first, second])
  })

  test('rejects invalid payload serialization', () => {
    const store = new StateStore(makeTempRoot())
    const payload: Record<string, unknown> = {}
    payload.self = payload

    expect(() => store.save([makeTask({ payload })])).toThrow(SchedulerError)
    try {
      store.save([makeTask({ payload })])
    } catch (err) {
      expect((err as SchedulerError).code).toBe('PAYLOAD_NOT_SERIALIZABLE')
    }
  })

  test('rejects payload values that JSON would silently drop', () => {
    const store = new StateStore(makeTempRoot())
    const payload: Record<string, unknown> = { callback: () => 'not json' }

    try {
      store.save([makeTask({ payload })])
      throw new Error('Expected save to reject non-JSON payload')
    } catch (err) {
      expect((err as SchedulerError).code).toBe('PAYLOAD_NOT_SERIALIZABLE')
    }
  })

  test('rejects invalid result serialization', () => {
    const store = new StateStore(makeTempRoot())
    const result: Record<string, unknown> = { count: 1n }

    expect(() => store.save([makeTask({ result })])).toThrow(SchedulerError)
    try {
      store.save([makeTask({ result })])
    } catch (err) {
      expect((err as SchedulerError).code).toBe('RESULT_NOT_SERIALIZABLE')
    }
  })

  test('uses only temporary project roots in tests', () => {
    const root = makeTempRoot()
    const store = new StateStore(root)

    expect(store.stateDir).toBe(path.resolve(root, '.sisyphus/openflow/scheduler'))
    expect(store.stateDir.startsWith(os.tmpdir())).toBe(true)
    expect(fs.existsSync(path.resolve(process.cwd(), '.sisyphus/openflow/scheduler'))).toBe(false)
  })
})
