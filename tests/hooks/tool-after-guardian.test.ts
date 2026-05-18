import { describe, expect, mock, test, beforeEach, afterAll } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { createToolAfterHook } from '../../src/hooks/tool-after.js'
import { ContractRuntime, getContractRuntime } from '../../src/contracts/runtime.js'
import type { OpenFlowContext, FileChangedEvent } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

function createContext(directory: string, overrides?: Partial<OpenFlowContext['config']>): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig, ...overrides },
    enhancedPlans: new Set(),
  }
}

function resetSingleton(): ContractRuntime {
  ContractRuntime.resetInstance()
  return getContractRuntime()
}

describe('tool-after hook — Guardian event dispatch', () => {
  let root: string
  let runtime: ContractRuntime

  beforeEach(async () => {
    root = join(process.cwd(), '.test-tool-after-guardian')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    runtime = resetSingleton()
  })

  afterAll(async () => {
    await rm(join(process.cwd(), '.test-tool-after-guardian'), { recursive: true, force: true })
  })

  test('file write with guardian enabled dispatches FileChangedEvent to runtime', async () => {
    await runtime.start(root)
    const processSpy = mock(async (_event: FileChangedEvent) => {})
    runtime.processFileChange = processSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createToolAfterHook(ctx)

    await hook(
      { tool: 'write', sessionID: 'session-g1', callID: 'call-g1', args: { filePath: 'src/demo.ts' } },
      { title: '', output: '', metadata: {} }
    )

    expect(processSpy).toHaveBeenCalledTimes(1)
    const callArg = (processSpy as ReturnType<typeof mock>).mock.calls[0]?.[0] as FileChangedEvent | undefined
    expect(callArg?.type).toBe('file_changed')
    expect(callArg?.filePath).toBe('src/demo.ts')
    expect(callArg?.tool).toBe('write')
    expect(callArg?.sessionId).toBe('session-g1')
    expect(typeof callArg?.timestamp).toBe('number')

    await runtime.stop()
  })

  test('file edit with guardian enabled dispatches FileChangedEvent to runtime', async () => {
    await runtime.start(root)
    const processSpy = mock(async (_event: FileChangedEvent) => {})
    runtime.processFileChange = processSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createToolAfterHook(ctx)

    await hook(
      { tool: 'edit', sessionID: 'session-g2', callID: 'call-g2', args: { filePath: 'src/lib.ts' } },
      { title: '', output: '', metadata: {} }
    )

    expect(processSpy).toHaveBeenCalledTimes(1)
    const callArg = (processSpy as ReturnType<typeof mock>).mock.calls[0]?.[0] as FileChangedEvent | undefined
    expect(callArg?.type).toBe('file_changed')
    expect(callArg?.filePath).toBe('src/lib.ts')
    expect(callArg?.tool).toBe('edit')

    await runtime.stop()
  })

  test('file write with guardian disabled does not dispatch event', async () => {
    await runtime.start(root)
    const processSpy = mock(async (_event: FileChangedEvent) => {})
    runtime.processFileChange = processSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: false } })
    const hook = createToolAfterHook(ctx)

    await hook(
      { tool: 'write', sessionID: 'session-g3', callID: 'call-g3', args: { filePath: 'src/demo.ts' } },
      { title: '', output: '', metadata: {} }
    )

    expect(processSpy).toHaveBeenCalledTimes(0)

    await runtime.stop()
  })

  test('file write when runtime not started does not throw', async () => {
    // Runtime is NOT started (fresh reset)
    const processSpy = mock(async (_event: FileChangedEvent) => {})
    runtime.processFileChange = processSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createToolAfterHook(ctx)

    // Should not throw
    await hook(
      { tool: 'write', sessionID: 'session-g4', callID: 'call-g4', args: { filePath: 'src/demo.ts' } },
      { title: '', output: '', metadata: {} }
    )

    expect(processSpy).toHaveBeenCalledTimes(0)
  })

  test('plan file write does not dispatch guardian event', async () => {
    await runtime.start(root)
    const planDir = join(root, '.sisyphus', 'plans')
    await mkdir(planDir, { recursive: true })

    const processSpy = mock(async (_event: FileChangedEvent) => {})
    runtime.processFileChange = processSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createToolAfterHook(ctx)

    const planPath = join(planDir, 'my-feature.md')
    await hook(
      { tool: 'write', sessionID: 'session-g5', callID: 'call-g5', args: { filePath: planPath } },
      { title: '', output: '', metadata: {} }
    )

    expect(processSpy).toHaveBeenCalledTimes(0)

    await runtime.stop()
  })

  test('.sisyphus/ file write does not dispatch guardian event', async () => {
    await runtime.start(root)
    const stateDir = join(root, '.sisyphus', 'openflow')
    await mkdir(stateDir, { recursive: true })

    const processSpy = mock(async (_event: FileChangedEvent) => {})
    runtime.processFileChange = processSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createToolAfterHook(ctx)

    const statePath = join(stateDir, 'state.json')
    await hook(
      { tool: 'write', sessionID: 'session-g6', callID: 'call-g6', args: { filePath: statePath } },
      { title: '', output: '', metadata: {} }
    )

    expect(processSpy).toHaveBeenCalledTimes(0)

    await runtime.stop()
  })
})
