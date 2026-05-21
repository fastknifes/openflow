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
      feature: {
        ...defaultConfig.feature,
        closure: {
          ...defaultConfig.feature.closure,
          strong_signals: [...defaultConfig.feature.closure.strong_signals],
          weak_signals: [...defaultConfig.feature.closure.weak_signals],
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

/**
 * Sets up real acceptance state files so the chat-message hook reads actual
 * implementation state, WITHOUT using mock.module (which pollutes the global
 * module cache and breaks other test files).
 *
 * - dirty/stale/blocked: saves state then marks implementation dirty
 * - verified: saves state with ready readiness and verified implementation state
 * - null: no acceptance state file created
 */
async function setupAcceptanceStateForTest(
  root: string,
  options: {
    implementationState: { state: 'clean' | 'dirty' | 'verified' | 'stale' | 'blocked' } | null
  },
): Promise<void> {
  const { saveAcceptanceState, markImplementationDirty, markImplementationVerified, markImplementationStale, markImplementationBlocked } = await import('../../src/utils/acceptance-state.js')
  const { VerifyReadinessStatus } = await import('../../src/types.js')

  if (!options.implementationState) {
    // No acceptance state — getImplementationState will return null
    return
  }

  const baseState = {
    feature: `test-${options.implementationState.state}`,
    phase: 'acceptance' as const,
    phaseStartedAt: '2026-05-19T00:00:00.000Z',
    pendingDocUpdates: [],
  }

  if (options.implementationState.state === 'dirty') {
    await saveAcceptanceState(root, { ...baseState, readiness: VerifyReadinessStatus.Ready })
    await markImplementationDirty(root, { changedFiles: ['src/test.ts'] })
  } else if (options.implementationState.state === 'verified') {
    await saveAcceptanceState(root, { ...baseState, readiness: VerifyReadinessStatus.Ready })
    await markImplementationVerified(root, { changedFiles: ['src/test.ts'] })
  } else if (options.implementationState.state === 'stale') {
    await saveAcceptanceState(root, { ...baseState, readiness: VerifyReadinessStatus.Ready })
    await markImplementationVerified(root, { changedFiles: ['src/test.ts'] })
    await markImplementationStale(root, { changedFiles: ['src/test.ts', 'src/more.ts'] })
  } else if (options.implementationState.state === 'blocked') {
    await saveAcceptanceState(root, { ...baseState, readiness: VerifyReadinessStatus.NotReady })
    await markImplementationBlocked(root)
  } else {
    // clean — just save without implementation state
    await saveAcceptanceState(root, { ...baseState, readiness: VerifyReadinessStatus.Ready })
  }
}

describe('chat-message hook', () => {
  test('suggests feature from intent metadata in smart mode', async () => {
    const root = join(process.cwd(), '.test-chat-intent')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('帮我处理一下登录')

      await hook(
        createInput('session-intent', {
          intentGate: {
            requestType: 'open-ended',
            shouldFeature: true,
            featureHint: 'user-login',
            reason: 'new feature request',
          },
        }),
        output
      )

      expect(output.parts[0]?.type).toBe('text')
      expect((output.parts[0] as { text?: string }).text).toContain('Feature Design Suggested')
      expect((output.parts[0] as { text?: string }).text).not.toContain('/openflow-feature user-login')
      expect((output.parts[0] as { text?: string }).text).toContain('/openflow-feature')
      expect((output.parts[0] as { text?: string }).text).toContain('does not block research')
      expect((output.parts[0] as { text?: string }).text).toContain('assistant must not invoke "/openflow-feature" automatically')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('falls back to requirement pattern detection in smart mode', async () => {
    const root = join(process.cwd(), '.test-chat-fallback')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('帮我写一个登录功能')

      await hook(createInput('session-fallback'), output)

      expect((output.parts[0] as { text?: string }).text).toContain('Feature Design Suggested')
      expect((output.parts[0] as { text?: string }).text).toContain('/openflow-feature')
      expect((output.parts[0] as { text?: string }).text).not.toContain('/openflow-feature feature-')
      expect((output.parts[0] as { text?: string }).text).toContain('manually run "/openflow-feature"')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('covers 增加 feature phrasing like 我要增加一个代理平台', async () => {
    const root = join(process.cwd(), '.test-chat-add-platform')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('我要增加一个代理平台')

      await hook(createInput('session-add-platform'), output)

      expect((output.parts[0] as { text?: string }).text).toContain('Feature Design Suggested')
      expect((output.parts[0] as { text?: string }).text).toContain('/openflow-feature')
      expect((output.parts[0] as { text?: string }).text).not.toContain('/openflow-feature feature-')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('treats implementation metadata as feature-worthy when feature hint exists', async () => {
    const root = join(process.cwd(), '.test-chat-implementation-metadata')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
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

      expect((output.parts[0] as { text?: string }).text).toContain('Feature Design Suggested')
      expect((output.parts[0] as { text?: string }).text).not.toContain('/openflow-feature agent-platform')
      expect((output.parts[0] as { text?: string }).text).toContain('/openflow-feature')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('suppresses suggestion when design documents already exist', async () => {
    const root = join(process.cwd(), '.test-chat-existing-design')
    const feature = 'user-login'
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, 'docs', 'changes', feature), { recursive: true })
    await writeFile(join(root, 'docs', 'changes', feature, 'design.md'), '# design', 'utf-8')
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('帮我写一个登录功能')

      await hook(createInput('session-existing'), output)

      expect(output.parts).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('emits closure-ready guidance when strong closure signal appears', async () => {
    const root = join(process.cwd(), '.test-chat-closure-ready')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('按这个做，生成正式文档')

      await hook(createInput('session-closure-ready'), output)

      expect((output.parts[0] as { text?: string }).text).toContain('Feature Design Closure Ready')
      expect((output.parts[0] as { text?: string }).text).toContain('derive the internal feature name')
      expect((output.parts[0] as { text?: string }).text).toContain('one useful clarification')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('emits non-blocking verification guidance on completion messages', async () => {
    const root = join(process.cwd(), '.test-chat-completion')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('这个功能完成了，可以收尾')

      await hook(createInput('session-completion'), output)

      expect((output.parts[0] as { text?: string }).text).toContain('Verification Suggested')
      expect((output.parts[0] as { text?: string }).text).toContain('non-blocking')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('blocks completion claims when implementation state is dirty', async () => {
    const root = join(process.cwd(), '.test-chat-completion-dirty')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      await setupAcceptanceStateForTest(root, { implementationState: { state: 'dirty' } })
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('这个功能完成了，可以收尾')

      await hook(createInput('session-completion-dirty'), output)

      expect((output.parts[0] as { text?: string }).text).toContain('Completion Blocked Until Quality Gate')
      expect((output.parts[0] as { text?: string }).text).toContain('openflow-quality-gate')
      expect((output.parts[0] as { text?: string }).text).toContain('`dirty`')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('keeps completion guidance non-blocking when implementation state is verified', async () => {
    const root = join(process.cwd(), '.test-chat-completion-verified')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      await setupAcceptanceStateForTest(root, { implementationState: { state: 'verified' } })
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('这个功能完成了，可以收尾')

      await hook(createInput('session-completion-verified'), output)

      expect((output.parts[0] as { text?: string }).text).toContain('Verification Suggested')
      expect((output.parts[0] as { text?: string }).text).toContain('non-blocking')
      expect((output.parts[0] as { text?: string }).text).not.toContain('Completion Blocked Until Quality Gate')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('keeps completion guidance non-blocking without active acceptance state', async () => {
    const root = join(process.cwd(), '.test-chat-completion-no-acceptance')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      // No acceptance state file — getImplementationState returns null
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('这个功能完成了，可以收尾')

      await hook(createInput('session-completion-no-acceptance'), output)

      expect((output.parts[0] as { text?: string }).text).toContain('Verification Suggested')
      expect((output.parts[0] as { text?: string }).text).toContain('non-blocking')
      expect((output.parts[0] as { text?: string }).text).not.toContain('Completion Blocked Until Quality Gate')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('dispatches /openflow-issue command and returns early', async () => {
    const root = join(process.cwd(), '.test-chat-issue-dispatch')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('/openflow-issue some-problem')

      await hook(createInput('session-issue'), output)

      // Should dispatch to handleIssue and return compact issue report
      expect((output.parts[0] as { text?: string }).text).toContain('## OpenFlow Issue')
      expect((output.parts[0] as { text?: string }).text).toContain('some-problem')
      expect((output.parts[0] as { text?: string }).text).toContain('### Issue')
      // Should not contain feature suggestion
      expect((output.parts[0] as { text?: string }).text).not.toContain('Feature Design Suggested')
      // Should not contain the old placeholder
      expect((output.parts[0] as { text?: string }).text).not.toContain('not yet implemented')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('runs acceptance detection even when feature phase is disabled', async () => {
    const root = join(process.cwd(), '.test-chat-acceptance-detection')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'plans', 'demo-feature.md'), '# demo', 'utf-8')
    try {
      const ctx = createContext(root)
      ctx.config.feature.enabled = false

      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('测试发现这个功能还有问题，需要调整')

      await hook(createInput('session-acceptance'), output)

      const state = await loadAcceptanceState(root)
      expect(state?.phase).toBe('acceptance')
      expect(state?.feature).toBe('demo-feature')
      expect(state?.sessionID).toBe('session-acceptance')
      // Acceptance hook runs but no longer emits harden suggestion or quality-mode prompt
      expect(output.parts.length).toBe(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('does not emit quality mode prompt for start-work/OMO-like message with active plan', async () => {
    const root = join(process.cwd(), '.test-chat-omo-quality-mode')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'plans', 'demo-feature.md'), '# demo plan', 'utf-8')
    try {
      const ctx = createContext(root)
      const hook = createChatMessageHook(ctx)
      const output = createHookOutput('start-work with plan')

      await hook(createInput('session-omo'), output)

      const allText = output.parts.map((p: unknown) => (p as { text?: string }).text ?? '').join('\n')
      // Old quality-policy prompts must NOT appear
      expect(allText).not.toContain('Quality Mode Selection')
      expect(allText).not.toContain('Quality Mode Selected')
      expect(allText).not.toContain('fast')
      expect(allText).not.toContain('balanced')
      expect(allText).not.toContain('strict')
      expect(allText).not.toContain('OpenFlow: Harden Suggested')
      expect(allText).not.toContain('OpenFlow: Harden Required')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
