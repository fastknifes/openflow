import { describe, test, expect, afterAll, beforeEach } from 'bun:test'
import { ContractRuntime, getContractRuntime } from '../../src/contracts/runtime.js'
import type {
  OpenFlowContract,
  AlignmentItem,
} from '../../src/contracts/openflow-contract.js'
import type { FileChangedEvent, ContractConsumer, EvidenceSinkEntry } from '../../src/types.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

// --- Helpers ---

function makeContract(
  feature: string,
  overrides: Partial<OpenFlowContract> = {},
): OpenFlowContract {
  return {
    feature,
    sourceFiles: [],
    behaviorScenarios: [],
    alignmentItems: [],
    currentConstraints: [],
    decisionConstraints: [],
    extractedAt: new Date().toISOString(),
    sourceHashes: {},
    ...overrides,
  }
}

function makeAlignmentItem(overrides: Partial<AlignmentItem> = {}): AlignmentItem {
  return {
    behaviorId: 'bs-1',
    designResponse: 'Test alignment',
    files: [],
    modules: [],
    expectedSymbols: [],
    risk: 'low',
    ...overrides,
  }
}

function makeFileChangedEvent(overrides: Partial<FileChangedEvent> = {}): FileChangedEvent {
  return {
    type: 'file_changed',
    filePath: 'src/foo.ts',
    tool: 'write',
    timestamp: Date.now(),
    ...overrides,
  }
}

// ContractRuntime singleton holds state across tests — use a helper to get a fresh instance.
function resetSingleton(): ContractRuntime {
  ContractRuntime.resetInstance()
  return getContractRuntime()
}

let tmpDir: string

async function setupTempDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), 'openflow-runtime-test-' + Date.now())
  await fs.mkdir(dir, { recursive: true })
  return dir
}

beforeEach(async () => {
  // Reset singleton state before each test that uses it
  resetSingleton()
})

// --- Actual test runs in describe blocks ---

describe('ContractRuntime singleton', () => {
  test('getContractRuntime() returns same instance on two calls', () => {
    const a = getContractRuntime()
    const b = getContractRuntime()
    expect(a).toBe(b)
  })

  test('ContractRuntime.getInstance() returns same instance as getContractRuntime()', () => {
    const a = ContractRuntime.getInstance()
    const b = getContractRuntime()
    expect(a).toBe(b)
  })
})

describe('ContractRuntime lifecycle', () => {
  let runtime: ContractRuntime
  let dir: string

  beforeEach(async () => {
    dir = await setupTempDir()
    runtime = resetSingleton()
  })

  afterAll(async () => {
    // Cleanup temp dirs
    if (tmpDir) {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
    }
  })

  test('start() sets isStarted to true', async () => {
    await runtime.start(dir)
    expect(runtime.isStarted).toBe(true)
    await runtime.stop()
  })

  test('start() is idempotent — calling twice does not throw', async () => {
    await runtime.start(dir)
    // Second call should be a no-op
    await runtime.start(dir)
    expect(runtime.isStarted).toBe(true)
    await runtime.stop()
  })

  test('stop() sets isStarted to false', async () => {
    await runtime.start(dir)
    await runtime.stop()
    expect(runtime.isStarted).toBe(false)
  })

  test('stop() is idempotent — calling on unstarted runtime does not throw', async () => {
    // Should not throw
    await runtime.stop()
    expect(runtime.isStarted).toBe(false)
  })

  test('start/stop/start cycle works', async () => {
    await runtime.start(dir)
    expect(runtime.isStarted).toBe(true)
    await runtime.stop()
    expect(runtime.isStarted).toBe(false)
    await runtime.start(dir)
    expect(runtime.isStarted).toBe(true)
    await runtime.stop()
  })
})

describe('ContractRegistry', () => {
  let runtime: ContractRuntime

  beforeEach(() => {
    runtime = resetSingleton()
  })

  test('get/set/delete works', () => {
    const contract = makeContract('feature-a')
    runtime.registry.set('feature-a', contract)
    expect(runtime.registry.get('feature-a')).toBe(contract)
    expect(runtime.registry.delete('feature-a')).toBe(true)
    expect(runtime.registry.get('feature-a')).toBeUndefined()
  })

  test('delete returns false for unknown feature', () => {
    expect(runtime.registry.delete('nonexistent')).toBe(false)
  })

  test('features returns all registered feature names', () => {
    runtime.registry.set('a', makeContract('a'))
    runtime.registry.set('b', makeContract('b'))
    const features = runtime.registry.features
    expect(features).toContain('a')
    expect(features).toContain('b')
    expect(features).toHaveLength(2)
  })

  test('findByFile returns matching contract by file path', () => {
    const contract = makeContract('feature-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/login.ts'], modules: ['auth'] }),
      ],
    })
    runtime.registry.set('feature-x', contract)

    const hits = runtime.registry.findByFile('src/login.ts')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.feature).toBe('feature-x')
    expect(hits[0]!.contract).toBe(contract)
  })

  test('findByFile returns matching contract by module path', () => {
    const contract = makeContract('feature-x', {
      alignmentItems: [
        makeAlignmentItem({ files: [], modules: ['auth'] }),
      ],
    })
    runtime.registry.set('feature-x', contract)

    const hits = runtime.registry.findByFile('src/auth/index.ts')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.feature).toBe('feature-x')
  })

  test('findByFile returns empty for no match', () => {
    const contract = makeContract('feature-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/login.ts'], modules: ['auth'] }),
      ],
    })
    runtime.registry.set('feature-x', contract)

    const hits = runtime.registry.findByFile('src/unrelated.ts')
    expect(hits).toHaveLength(0)
  })

  test('findByFile matches on normalized paths (backslash → forward slash)', () => {
    const contract = makeContract('feature-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/login.ts'], modules: [] }),
      ],
    })
    runtime.registry.set('feature-x', contract)

    // Backslash path should match forward-slash alignment item
    const hits = runtime.registry.findByFile('src\\login.ts')
    expect(hits).toHaveLength(1)
  })

  test('findByFile returns empty when registry is empty', () => {
    const hits = runtime.registry.findByFile('anything.ts')
    expect(hits).toHaveLength(0)
  })

  test('findByFile only matches once per contract even with multiple alignment items', () => {
    const contract = makeContract('feature-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/a.ts'] }),
        makeAlignmentItem({ files: ['src/b.ts'] }),
      ],
    })
    runtime.registry.set('feature-x', contract)

    // Both alignment items contain matching substrings
    const hits = runtime.registry.findByFile('src')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.feature).toBe('feature-x')
  })
})

describe('EventQueue', () => {
  let runtime: ContractRuntime

  beforeEach(() => {
    runtime = resetSingleton()
  })

  test('enqueue/dequeue works (FIFO)', () => {
    const e1 = makeFileChangedEvent({ filePath: 'a.ts' })
    const e2 = makeFileChangedEvent({ filePath: 'b.ts' })
    runtime.events.enqueue(e1)
    runtime.events.enqueue(e2)

    expect(runtime.events.dequeue()).toBe(e1)
    expect(runtime.events.dequeue()).toBe(e2)
    expect(runtime.events.dequeue()).toBeUndefined()
  })

  test('drain returns all and clears', () => {
    const e1 = makeFileChangedEvent({ filePath: 'a.ts' })
    const e2 = makeFileChangedEvent({ filePath: 'b.ts' })
    runtime.events.enqueue(e1)
    runtime.events.enqueue(e2)

    const drained = runtime.events.drain()
    expect(drained).toEqual([e1, e2])
    expect(runtime.events.length).toBe(0)
  })

  test('length tracks correctly', () => {
    expect(runtime.events.length).toBe(0)
    runtime.events.enqueue(makeFileChangedEvent())
    expect(runtime.events.length).toBe(1)
    runtime.events.enqueue(makeFileChangedEvent())
    expect(runtime.events.length).toBe(2)
    runtime.events.dequeue()
    expect(runtime.events.length).toBe(1)
  })
})

describe('ConsumerRegistry', () => {
  let runtime: ContractRuntime

  beforeEach(() => {
    runtime = resetSingleton()
  })

  test('register/getAll works', () => {
    const consumer1: ContractConsumer = {
      onEvent: async () => {},
      onSessionEvent: async () => {},
    }
    const consumer2: ContractConsumer = {
      onEvent: async () => {},
      onSessionEvent: async () => {},
    }

    runtime.consumers.register(consumer1)
    runtime.consumers.register(consumer2)

    const all = runtime.consumers.getAll()
    expect(all).toHaveLength(2)
    expect(all[0]).toBe(consumer1)
    expect(all[1]).toBe(consumer2)
  })

  test('getAll returns empty when no consumers registered', () => {
    expect(runtime.consumers.getAll()).toEqual([])
  })
})

describe('EvidenceSink', () => {
  let runtime: ContractRuntime

  beforeEach(() => {
    runtime = resetSingleton()
  })

  test('append/getAll/clear works', () => {
    const entry: EvidenceSinkEntry = {
      source: 'guardian',
      feature: 'feat-x',
      timestamp: new Date().toISOString(),
      data: { key: 'val' },
    }

    runtime.evidence.append(entry)
    expect(runtime.evidence.getAll()).toHaveLength(1)
    expect(runtime.evidence.getAll()[0]).toBe(entry)

    runtime.evidence.clear()
    expect(runtime.evidence.getAll()).toEqual([])
  })

  test('append multiple entries preserves order', () => {
    const e1: EvidenceSinkEntry = { source: 'guardian', feature: 'a', timestamp: 't1', data: 1 }
    const e2: EvidenceSinkEntry = { source: 'verify', feature: 'b', timestamp: 't2', data: 2 }
    runtime.evidence.append(e1)
    runtime.evidence.append(e2)
    expect(runtime.evidence.getAll()).toEqual([e1, e2])
  })
})

describe('processFileChange', () => {
  let runtime: ContractRuntime

  beforeEach(() => {
    runtime = resetSingleton()
  })

  test('dispatches event to registered consumers when contract matches file', async () => {
    let receivedEvent: FileChangedEvent | null = null
    const consumer: ContractConsumer = {
      onEvent: async (event) => { receivedEvent = event },
      onSessionEvent: async () => {},
    }
    runtime.consumers.register(consumer)

    const contract = makeContract('feat-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/foo.ts'], modules: [] }),
      ],
    })
    runtime.registry.set('feat-x', contract)

    const event = makeFileChangedEvent({ filePath: 'src/foo.ts' })
    await runtime.processFileChange(event)

    expect(receivedEvent).toBe(event)
  })

  test('dispatches to all registered consumers', async () => {
    let count = 0
    const consumer: ContractConsumer = {
      onEvent: async () => { count++ },
      onSessionEvent: async () => {},
    }
    runtime.consumers.register(consumer)
    runtime.consumers.register(consumer)

    const contract = makeContract('feat-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/foo.ts'], modules: [] }),
      ],
    })
    runtime.registry.set('feat-x', contract)

    await runtime.processFileChange(makeFileChangedEvent({ filePath: 'src/foo.ts' }))
    expect(count).toBe(2)
  })

  test('does NOT throw when no consumers registered', async () => {
    const contract = makeContract('feat-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/foo.ts'], modules: [] }),
      ],
    })
    runtime.registry.set('feat-x', contract)

    // Should not throw
    await runtime.processFileChange(makeFileChangedEvent({ filePath: 'src/foo.ts' }))
  })

  test('does NOT dispatch when no contract matches file', async () => {
    let dispatched = false
    const consumer: ContractConsumer = {
      onEvent: async () => { dispatched = true },
      onSessionEvent: async () => {},
    }
    runtime.consumers.register(consumer)

    await runtime.processFileChange(makeFileChangedEvent({ filePath: 'unknown.ts' }))
    expect(dispatched).toBe(false)
  })

  test('continues to next consumer when one throws', async () => {
    let secondCalled = false
    const badConsumer: ContractConsumer = {
      onEvent: async () => { throw new Error('boom') },
      onSessionEvent: async () => {},
    }
    const goodConsumer: ContractConsumer = {
      onEvent: async () => { secondCalled = true },
      onSessionEvent: async () => {},
    }

    runtime.consumers.register(badConsumer)
    runtime.consumers.register(goodConsumer)

    const contract = makeContract('feat-x', {
      alignmentItems: [
        makeAlignmentItem({ files: ['src/foo.ts'], modules: [] }),
      ],
    })
    runtime.registry.set('feat-x', contract)

    await runtime.processFileChange(makeFileChangedEvent({ filePath: 'src/foo.ts' }))
    expect(secondCalled).toBe(true)
  })

  test('events are enqueued regardless of contract match', async () => {
    const event = makeFileChangedEvent({ filePath: 'unknown.ts' })
    await runtime.processFileChange(event)
    expect(runtime.events.length).toBe(1)
    expect(runtime.events.dequeue()).toBe(event)
  })
})

describe('dispatchSessionEvent', () => {
  let runtime: ContractRuntime

  beforeEach(() => {
    runtime = resetSingleton()
  })

  test('dispatches session event to all consumers', async () => {
    const received: Array<{ type: string; sessionId?: string }> = []
    const consumer: ContractConsumer = {
      onEvent: async () => {},
      onSessionEvent: async (event) => { received.push(event) },
    }
    runtime.consumers.register(consumer)
    runtime.consumers.register(consumer)

    await runtime.dispatchSessionEvent({ type: 'session_start', sessionId: 'ses-1' })
    expect(received).toHaveLength(2)
    expect(received[0]).toEqual({ type: 'session_start', sessionId: 'ses-1' })
  })

  test('does not throw when no consumers', async () => {
    await runtime.dispatchSessionEvent({ type: 'session_start' })
  })

  test('continues to next consumer when one throws', async () => {
    let secondCalled = false
    const badConsumer: ContractConsumer = {
      onEvent: async () => {},
      onSessionEvent: async () => { throw new Error('boom') },
    }
    const goodConsumer: ContractConsumer = {
      onEvent: async () => {},
      onSessionEvent: async () => { secondCalled = true },
    }
    runtime.consumers.register(badConsumer)
    runtime.consumers.register(goodConsumer)

    await runtime.dispatchSessionEvent({ type: 'test' })
    expect(secondCalled).toBe(true)
  })
})

describe('getOrExtractContract', () => {
  let runtime: ContractRuntime
  let dir: string

  beforeEach(async () => {
    dir = await setupTempDir()
    runtime = resetSingleton()
  })

  afterAll(async () => {
    if (tmpDir) {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
    }
  })

  test('returns cached contract when already in registry', async () => {
    const contract = makeContract('feat-a')
    runtime.registry.set('feat-a', contract)

    // Should return cached without calling extractor
    const result = await runtime.getOrExtractContract('feat-a')
    expect(result).toBe(contract)
  })

  test('returns null when no design docs exist and not cached', async () => {
    await runtime.start(dir)
    // No docs/changes directory exists, so extractor returns null
    const result = await runtime.getOrExtractContract('unknown-feature')
    expect(result).toBeNull()
  })
})

describe('Contract cache persistence', () => {
  let runtime: ContractRuntime
  let dir: string

  beforeEach(async () => {
    dir = await setupTempDir()
    runtime = resetSingleton()
  })

  afterAll(async () => {
    if (tmpDir) {
      try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch { /* ok */ }
    }
  })

  test('cache is written on stop and loaded on next start', async () => {
    // Start, add a contract, stop
    await runtime.start(dir)
    const contract = makeContract('feat-persist', {
      sourceFiles: ['design.md'],
      extractedAt: '2026-01-01T00:00:00Z',
    })
    runtime.registry.set('feat-persist', contract)
    await runtime.stop()

    // Verify cache file exists
    const cachePath = path.join(dir, '.sisyphus', 'openflow', 'contracts.json')
    const raw = await fs.readFile(cachePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, OpenFlowContract>
    expect(parsed['feat-persist']).toBeDefined()
    expect(parsed['feat-persist']!.feature).toBe('feat-persist')

    // Start again — contract should be loaded from cache
    resetSingleton()
    const runtime2 = resetSingleton()
    await runtime2.start(dir)
    const loaded = runtime2.registry.get('feat-persist')
    expect(loaded).toBeDefined()
    expect(loaded!.feature).toBe('feat-persist')
    expect(loaded!.extractedAt).toBe('2026-01-01T00:00:00Z')
    await runtime2.stop()
  })

  test('start does not throw when cache file is missing', async () => {
    await runtime.start(dir)
    expect(runtime.isStarted).toBe(true)
    await runtime.stop()
  })

  test('stop writes empty cache when registry is empty', async () => {
    await runtime.start(dir)
    await runtime.stop()

    const cachePath = path.join(dir, '.sisyphus', 'openflow', 'contracts.json')
    const raw = await fs.readFile(cachePath, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed).toEqual({})
  })
})
