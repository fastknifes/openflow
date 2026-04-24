import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createChatMessageHook } from '../../src/hooks/chat-message.js'
import { loadAcceptanceState } from '../../src/utils/acceptance-state.js'
import type { OpenFlowContext } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    config: {
      ...defaultConfig,
      brainstorming: {
        ...defaultConfig.brainstorming,
        closure: {
          ...defaultConfig.brainstorming.closure,
          strong_signals: [...defaultConfig.brainstorming.closure.strong_signals],
          weak_signals: [...defaultConfig.brainstorming.closure.weak_signals],
        },
      },
      tdd: {
        ...defaultConfig.tdd,
      },
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
      archive: {
        ...defaultConfig.archive,
      },
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

function createHookOutput(text: string, metadata?: Record<string, unknown>) {
  return createOutput(text, metadata) as Parameters<ReturnType<typeof createChatMessageHook>>[1]
}

describe('chat-message hook', () => {
  test('suggests brainstorm from intent metadata in smart mode', async () => {
    const root = join(process.cwd(), '.test-chat-intent')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('帮我处理一下登录')

    await hook(
      createInput('session-intent', {
        intentGate: {
          requestType: 'open-ended',
          shouldBrainstorm: true,
          featureHint: 'user-login',
          reason: 'new feature request',
        },
      }),
      output
    )

    expect(output.parts[0]?.type).toBe('text')
    expect((output.parts[0] as { text?: string }).text).toContain('Brainstorm Suggested')
    expect((output.parts[0] as { text?: string }).text).toContain('user-login')
    expect((output.parts[0] as { text?: string }).text).toContain('does not block research')

    await rm(root, { recursive: true, force: true })
  })

  test('falls back to requirement pattern detection in smart mode', async () => {
    const root = join(process.cwd(), '.test-chat-fallback')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('帮我写一个登录功能')

    await hook(createInput('session-fallback'), output)

    expect((output.parts[0] as { text?: string }).text).toContain('Brainstorm Suggested')
    expect((output.parts[0] as { text?: string }).text).toContain('feature-')

    await rm(root, { recursive: true, force: true })
  })

  test('covers 增加 feature phrasing like 我要增加一个代理平台', async () => {
    const root = join(process.cwd(), '.test-chat-add-platform')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('我要增加一个代理平台')

    await hook(createInput('session-add-platform'), output)

    expect((output.parts[0] as { text?: string }).text).toContain('Brainstorm Suggested')
    expect((output.parts[0] as { text?: string }).text).toContain('feature-')

    await rm(root, { recursive: true, force: true })
  })

  test('treats implementation metadata as brainstorm-worthy when feature hint exists', async () => {
    const root = join(process.cwd(), '.test-chat-implementation-metadata')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('增加一个代理平台')

    await hook(
      createInput('session-implementation-metadata', {
        intentGate: {
          requestType: 'implementation',
          featureHint: 'agent-platform',
        },
      }),
      output
    )

    expect((output.parts[0] as { text?: string }).text).toContain('Brainstorm Suggested')
    expect((output.parts[0] as { text?: string }).text).toContain('agent-platform')

    await rm(root, { recursive: true, force: true })
  })

  test('suppresses suggestion when design documents already exist', async () => {
    const root = join(process.cwd(), '.test-chat-existing-design')
    const feature = 'feature-767b-5f55'
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, 'docs', 'design', feature), { recursive: true })
    await writeFile(join(root, 'docs', 'design', feature, '20260320-design.md'), '# design', 'utf-8')

    const ctx = createContext(root)
    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('帮我写一个登录功能')

    await hook(createInput('session-existing'), output)

    expect(output.parts).toHaveLength(1)

    await rm(root, { recursive: true, force: true })
  })

  test('emits closure-ready guidance when strong closure signal appears', async () => {
    const root = join(process.cwd(), '.test-chat-closure-ready')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('按这个做，生成正式文档')

    await hook(createInput('session-closure-ready'), output)

    expect((output.parts[0] as { text?: string }).text).toContain('Brainstorm Closure Ready')
    expect((output.parts[0] as { text?: string }).text).toContain('Design is generated automatically')

    await rm(root, { recursive: true, force: true })
  })

  test('emits non-blocking verification guidance on completion messages', async () => {
    const root = join(process.cwd(), '.test-chat-completion')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('这个功能完成了，可以收尾')

    await hook(createInput('session-completion'), output)

    expect((output.parts[0] as { text?: string }).text).toContain('Verification Suggested')
    expect((output.parts[0] as { text?: string }).text).toContain('non-blocking')

    await rm(root, { recursive: true, force: true })
  })

  test('runs acceptance detection even when brainstorming is disabled', async () => {
    const root = join(process.cwd(), '.test-chat-acceptance-detection')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'plans', 'demo-feature.md'), '# demo', 'utf-8')

    const ctx = createContext(root)
    ctx.config.brainstorming.enabled = false

    const hook = createChatMessageHook(ctx)
    const output = createHookOutput('测试发现这个功能还有问题，需要调整')

    await hook(createInput('session-acceptance'), output)

    const state = await loadAcceptanceState(root)
    expect(state?.phase).toBe('acceptance')
    expect(state?.feature).toBe('demo-feature')
    expect(state?.sessionID).toBe('session-acceptance')
    expect(output.parts).toHaveLength(1)

    await rm(root, { recursive: true, force: true })
  })
})
