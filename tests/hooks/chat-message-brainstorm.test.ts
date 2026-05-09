import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createChatMessageHook } from '../../src/hooks/chat-message.js'
import type { OpenFlowContext } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    config: {
      ...defaultConfig,
    },
    directory,
    worktree: directory,
    client: {},
    $: {},
    enhancedPlans: new Set(),
  }
}

function createInput(sessionID: string, extras?: Record<string, unknown>) {
  return {
    sessionID,
    ...(extras ?? {}),
  } as unknown as Parameters<ReturnType<typeof createChatMessageHook>>[0]
}

function createOutput(text: string) {
  return {
    message: {
      id: 'm1',
      sessionID: 's1',
      role: 'user' as const,
      time: { created: Date.now() },
      agent: 'test',
      model: { providerID: 'p', modelID: 'm' },
    },
    parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text' as const, text }],
  } as Parameters<ReturnType<typeof createChatMessageHook>>[1]
}

function firstOutputText(output: ReturnType<typeof createOutput>): string {
  return ((output.parts[0] as { text?: string }).text) ?? ''
}

describe('chat-message brainstorm guidance', () => {
  test('suggests brainstorm skill entrypoint for new feature requests', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-command')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('帮我写一个登录功能')

    await hook(createInput('session-command'), output)

    expect(firstOutputText(output)).toContain('/openflow-brainstorm feature-')
    expect(firstOutputText(output)).not.toContain('`/brainstorm ')

    await rm(root, { recursive: true, force: true })
  })

  test('turn-to-turn continuation bridge advances brainstorm from plain user reply', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-resume')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'active.json'),
      JSON.stringify({
        bySessionID: {
          'session-resume': {
            feature: 'user-login',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'user-login.json'),
      JSON.stringify({
        version: 2,
        feature: 'user-login',
        workflowState: 'collecting',
        pendingQuestionId: 'problem',
        askedQuestionIds: [],
        answers: {},
        generatedDocs: [],
        generationAttemptCount: 0,
        lastQuestionPromptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    )

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('我的回答是内部开发者')

    await hook(createInput('session-resume'), output)

    expect(firstOutputText(output)).toContain('这个功能的主要使用者是谁？')

    const saved = JSON.parse(await readFile(join(root, '.sisyphus', 'brainstorm', 'user-login.json'), 'utf-8')) as {
      answers: Record<string, string>
      pendingQuestionId: string
    }
    expect(saved.answers.problem).toBe('我的回答是内部开发者')
    expect(saved.pendingQuestionId).toBe('target-users')

    await rm(root, { recursive: true, force: true })
  })

  test('continuation bridge does not consume low-signal formal replies', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-low-signal')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'active.json'),
      JSON.stringify({
        bySessionID: {
          'session-low': {
            feature: 'user-login',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'user-login.json'),
      JSON.stringify({
        version: 2,
        feature: 'user-login',
        workflowState: 'collecting',
        pendingQuestionId: 'problem',
        promptMode: 'question',
        askedQuestionIds: [],
        answers: {},
        generatedDocs: [],
        generationAttemptCount: 0,
        lastQuestionPromptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    )

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('好')

    await hook(createInput('session-low'), output)

    expect(firstOutputText(output)).toContain('too short to record')
    expect(firstOutputText(output)).toContain('这个功能主要要解决什么问题？')

    await rm(root, { recursive: true, force: true })
  })

  test('continuation bridge ignores plain discussion when brainstorm is not awaiting formal answer', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-discussion-mode')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'active.json'),
      JSON.stringify({
        bySessionID: {
          'session-discussion': {
            feature: 'user-login',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'user-login.json'),
      JSON.stringify({
        version: 2,
        feature: 'user-login',
        workflowState: 'collecting',
        pendingQuestionId: 'problem',
        promptMode: 'discussion',
        askedQuestionIds: [],
        answers: {},
        generatedDocs: [],
        generationAttemptCount: 0,
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    )

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('为什么你推荐这个方向？')

    await hook(createInput('session-discussion'), output)

    expect(firstOutputText(output)).toBe('为什么你推荐这个方向？')

    await rm(root, { recursive: true, force: true })
  })

  test('completed brainstorm does not keep hijacking later implementation chat', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-post-complete')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'recent-completed.json'),
      JSON.stringify({
        bySessionID: {
          'session-done': {
            feature: 'user-login',
            completedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('开始实现这个功能')
    await hook(createInput('session-done'), output)

    expect(firstOutputText(output)).not.toContain('Brainstorm In Progress')

    await rm(root, { recursive: true, force: true })
  })

  test('active brainstorm does not hijack obvious feature switch messages', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-switch-feature')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'active.json'),
      JSON.stringify({
        bySessionID: {
          'session-switch': {
            feature: 'user-login',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'user-login.json'),
      JSON.stringify({
        version: 2,
        feature: 'user-login',
        workflowState: 'collecting',
        pendingQuestionId: 'problem',
        askedQuestionIds: [],
        answers: {},
        generatedDocs: [],
        generationAttemptCount: 0,
        lastQuestionPromptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    )

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('我想实现一个新的功能：支付功能')
    await hook(createInput('session-switch'), output)

    expect(firstOutputText(output)).toContain('/openflow-brainstorm ')
    expect(firstOutputText(output)).not.toContain('这个功能的主要使用者是谁？')

    await rm(root, { recursive: true, force: true })
  })

  test('slash-command dispatch: /openflow-brainstorm routes to handler', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-slash-dispatch')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('/openflow-brainstorm my-feature')

    await hook(createInput('session-slash-brainstorm'), output)

    // Dispatch should inject handler result — not the suggestion template
    expect(firstOutputText(output)).not.toContain('Brainstorm Suggested')
    // Handler should have produced brainstorm content (first question or session info)
    expect(firstOutputText(output)).toContain('my-feature')

    await rm(root, { recursive: true, force: true })
  })

  test('slash-command dispatch: /openflow-status routes to handler', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-slash-status')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('/openflow-status')

    await hook(createInput('session-slash-status'), output)

    expect(firstOutputText(output)).toContain('OpenFlow Status')
    expect(firstOutputText(output)).not.toContain('Brainstorm Suggested')

    await rm(root, { recursive: true, force: true })
  })

  test('slash-command dispatch: /openflow-verify without feature returns help text', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-slash-verify-noarg')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('/openflow-verify')

    await hook(createInput('session-slash-verify-noarg'), output)

    // Should contain the help/error about missing feature, not crash
    expect(firstOutputText(output)).toContain('active feature is required')

    await rm(root, { recursive: true, force: true })
  })

  test('slash-command dispatch: non-user role with slash text does not dispatch', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-slash-nonuser')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const hook = createChatMessageHook(createContext(root))

    // Create output with role='system' — dispatch should NOT trigger
    const output = {
      message: {
        id: 'm1',
        sessionID: 's1',
        role: 'system' as const,
        time: { created: Date.now() },
        agent: 'test',
        model: { providerID: 'p', modelID: 'm' },
      },
      parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text' as const, text: '## OpenFlow: Brainstorm Suggested\n\nRecommended next step before implementation:\n\n```\n/openflow-brainstorm feature-xxx\n```' }],
    } as Parameters<ReturnType<typeof createChatMessageHook>>[1]

    await hook(createInput('session-nonuser'), output)

    // System-role message should be left untouched — no dispatch, no guard message injected
    const parts = output.parts as Array<{ text?: string }>
    expect(parts.length).toBe(1)
    expect(parts[0].text).toContain('/openflow-brainstorm feature-xxx')

    await rm(root, { recursive: true, force: true })
  })

  test('non-OpenFlow slash command passes through without dispatch', async () => {
    const root = join(process.cwd(), '.test-chat-brainstorm-slash-passthrough')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const hook = createChatMessageHook(createContext(root))
    const output = createOutput('/refactor main')

    await hook(createInput('session-passthrough'), output)

    // Non-openflow slash should not trigger slash-command dispatch.
    // The original message should remain in output parts (dispatch does not consume it).
    const parts = output.parts as Array<{ text?: string }>
    const allText = parts.map(p => p.text ?? '').join('\n')
    expect(allText).toContain('/refactor main')

    await rm(root, { recursive: true, force: true })
  })
})
