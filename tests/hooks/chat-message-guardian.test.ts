import { describe, expect, mock, test, beforeEach, afterAll } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { createChatMessageHook } from '../../src/hooks/chat-message.js'
import { ContractRuntime, getContractRuntime } from '../../src/contracts/runtime.js'
import type { OpenFlowContext } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

function createContext(directory: string, overrides?: Partial<OpenFlowContext['config']>): OpenFlowContext {
  return {
    config: {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        closure: {
          ...defaultConfig.feature.closure,
          strong_signals: [...defaultConfig.feature.closure.strong_signals],
          weak_signals: [...defaultConfig.feature.closure.weak_signals],
        },
      },
      tdd: { ...defaultConfig.tdd },
      verification: {
        ...defaultConfig.verification,
        security: [...defaultConfig.verification.security],
        quality: [...defaultConfig.verification.quality],
      },
      acceptance: {
        ...defaultConfig.acceptance,
        trigger_words_zh: [...defaultConfig.acceptance.trigger_words_zh],
        trigger_words_en: [...defaultConfig.acceptance.trigger_words_en],
      },
      archive: { ...defaultConfig.archive },
      ...overrides,
    },
    directory,
    worktree: directory,
    client: {},
    $: {},
    enhancedPlans: new Set(),
  }
}

function createOutput(text: string, metadata?: Record<string, unknown>) {
  return {
    message: {
      id: 'm1',
      sessionID: 's1',
      role: 'user' as const,
      time: { created: Date.now() },
      agent: 'test',
      model: { providerID: 'p', modelID: 'm' },
      ...(metadata ? { metadata } : {}),
    },
    parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text' as const, text }],
  }
}

function createInput(sessionID: string, extras?: Record<string, unknown>) {
  return {
    sessionID,
    ...(extras ?? {}),
  } as unknown as Parameters<ReturnType<typeof createChatMessageHook>>[0]
}

function resetSingleton(): ContractRuntime {
  ContractRuntime.resetInstance()
  return getContractRuntime()
}

describe('chat-message hook — Guardian session events', () => {
  let root: string
  let runtime: ContractRuntime

  beforeEach(async () => {
    root = join(process.cwd(), '.test-chat-guardian')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    runtime = resetSingleton()
  })

  afterAll(async () => {
    await rm(join(process.cwd(), '.test-chat-guardian'), { recursive: true, force: true })
  })

  test('completion message with guardian enabled dispatches session_end event', async () => {
    await runtime.start(root)
    const dispatchSpy = mock(async (_event: { type: string; sessionId?: string }) => {})
    runtime.dispatchSessionEvent = dispatchSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createChatMessageHook(ctx)

    await hook(
      createInput('session-g1'),
      createOutput('任务完成了，可以收尾')
    )

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    const callArg = (dispatchSpy as ReturnType<typeof mock>).mock.calls[0]?.[0] as { type: string; sessionId?: string } | undefined
    expect(callArg?.type).toBe('session_end')
    expect(callArg?.sessionId).toBe('session-g1')

    await runtime.stop()
  })

  test('completion message "done" with guardian enabled dispatches session_end event', async () => {
    await runtime.start(root)
    const dispatchSpy = mock(async (_event: { type: string; sessionId?: string }) => {})
    runtime.dispatchSessionEvent = dispatchSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createChatMessageHook(ctx)

    await hook(
      createInput('session-g2'),
      createOutput('All done, ready to archive')
    )

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    const callArg = (dispatchSpy as ReturnType<typeof mock>).mock.calls[0]?.[0] as { type: string; sessionId?: string } | undefined
    expect(callArg?.type).toBe('session_end')
    expect(callArg?.sessionId).toBe('session-g2')

    await runtime.stop()
  })

  test('regular message with guardian enabled does not dispatch session event', async () => {
    await runtime.start(root)
    const dispatchSpy = mock(async (_event: { type: string; sessionId?: string }) => {})
    runtime.dispatchSessionEvent = dispatchSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createChatMessageHook(ctx)

    await hook(
      createInput('session-g3'),
      createOutput('帮我实现登录功能')
    )

    expect(dispatchSpy).toHaveBeenCalledTimes(0)

    await runtime.stop()
  })

  test('completion message with guardian disabled does not dispatch session event', async () => {
    await runtime.start(root)
    const dispatchSpy = mock(async (_event: { type: string; sessionId?: string }) => {})
    runtime.dispatchSessionEvent = dispatchSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: false } })
    const hook = createChatMessageHook(ctx)

    await hook(
      createInput('session-g4'),
      createOutput('任务完成了，可以收尾')
    )

    expect(dispatchSpy).toHaveBeenCalledTimes(0)

    await runtime.stop()
  })

  test('completion message when runtime not started does not throw', async () => {
    // Runtime NOT started (fresh reset)
    const dispatchSpy = mock(async (_event: { type: string; sessionId?: string }) => {})
    runtime.dispatchSessionEvent = dispatchSpy

    const ctx = createContext(root, { guardian: { ...defaultConfig.guardian, enabled: true } })
    const hook = createChatMessageHook(ctx)

    // Should not throw
    await hook(
      createInput('session-g5'),
      createOutput('好了，全部完成了')
    )

    expect(dispatchSpy).toHaveBeenCalledTimes(0)
  })
})
