import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { handleBrainstorm } from '../../src/commands/brainstorm.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

function createToolContext(directory: string, sessionID = 'session-1') {
  return {
    sessionID,
    messageID: 'message-1',
    agent: 'test-agent',
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => void 0,
    ask: async () => void 0,
  }
}

function createQuestionToolContext(directory: string, answers: string[], sessionID = 'session-question') {
  const asked: Array<{ question: string; header: string }> = []

  return {
    asked,
    context: {
      ...createToolContext(directory, sessionID),
      askQuestion: async (input: {
        questions: Array<{
          question: string
          header: string
        }>
      }) => {
        const question = input.questions[0]
        if (question) {
          asked.push({ question: question.question, header: question.header })
        }
        return [[answers.shift() ?? '']]
      },
    },
  }
}

describe('brainstorm command', () => {
  test('throws when feature is missing and no active session exists', async () => {
    const root = join(process.cwd(), '.test-brainstorm-missing-feature')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await expect(handleBrainstorm(createContext(root), undefined, undefined, createToolContext(root))).rejects.toThrow(
      'Feature name is required'
    )

    await rm(root, { recursive: true, force: true })
  })

  test('starts brainstorm in collecting state and persists first pending question', async () => {
    const root = join(process.cwd(), '.test-brainstorm-first-question')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleBrainstorm(createContext(root), 'user-login', undefined, createToolContext(root))

    expect(result).toContain('Brainstorm Question')
    expect(result).toContain('这个功能主要要解决什么问题？')
    expect(result).toContain('answered 0/5')

    const sessionPath = join(root, '.sisyphus', 'brainstorm', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as {
      workflowState: string
      pendingQuestionId: string
      generatedDocs: string[]
    }

    expect(session.workflowState).toBe('collecting')
    expect(session.pendingQuestionId).toBe('problem')
    expect(session.generatedDocs).toHaveLength(0)

    const activePath = join(root, '.sisyphus', 'brainstorm', 'active.json')
    const active = JSON.parse(await readFile(activePath, 'utf-8')) as { bySessionID: Record<string, { feature: string }> }
    expect(active.bySessionID['session-1']?.feature).toBe('user-login')

    await rm(root, { recursive: true, force: true })
  })

  test('advances one step per fresh invocation and keeps pending state durable', async () => {
    const root = join(process.cwd(), '.test-brainstorm-next-question')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleBrainstorm(createContext(root), 'user-login', undefined, createToolContext(root, 'session-a'))
    const result = await handleBrainstorm(createContext(root), 'user-login', '提升效率', createToolContext(root, 'session-a'))

    expect(result).toContain('这个功能的主要使用者是谁？')
    expect(result).toContain('answered 1/5')

    const sessionPath = join(root, '.sisyphus', 'brainstorm', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as {
      answers: Record<string, string>
      pendingQuestionId: string
      workflowState: string
    }

    expect(session.answers.problem).toBe('提升效率')
    expect(session.pendingQuestionId).toBe('target-users')
    expect(session.workflowState).toBe('collecting')

    await rm(root, { recursive: true, force: true })
  })

  test('resumes by session when feature is omitted', async () => {
    const root = join(process.cwd(), '.test-brainstorm-resume-by-session')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleBrainstorm(createContext(root), 'user-login', undefined, createToolContext(root, 'session-resume'))
    const result = await handleBrainstorm(createContext(root), undefined, '提升效率', createToolContext(root, 'session-resume'))

    expect(result).toContain('这个功能的主要使用者是谁？')

    const sessionPath = join(root, '.sisyphus', 'brainstorm', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as { answers: Record<string, string> }
    expect(session.answers.problem).toBe('提升效率')

    await rm(root, { recursive: true, force: true })
  })

  test('returns current pending question when resumed without a new answer', async () => {
    const root = join(process.cwd(), '.test-brainstorm-repeat-pending')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleBrainstorm(createContext(root), 'user-login', undefined, createToolContext(root, 'session-repeat'))
    const result = await handleBrainstorm(createContext(root), 'user-login', undefined, createToolContext(root, 'session-repeat'))

    expect(result).toContain('这个功能主要要解决什么问题？')
    expect(result).toContain('answered 0/5')

    await rm(root, { recursive: true, force: true })
  })

  test('prefers question tool for formal pending question when host supports it', async () => {
    const root = join(process.cwd(), '.test-brainstorm-question-tool')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const questionContext = createQuestionToolContext(root, ['支持新场景'])
    const result = await handleBrainstorm(createContext(root), 'user-login', undefined, questionContext.context)

    expect(questionContext.asked).toHaveLength(1)
    expect(questionContext.asked[0]?.question).toBe('这个功能主要要解决什么问题？')
    expect(result).toContain('这个功能的主要使用者是谁？')

    await rm(root, { recursive: true, force: true })
  })

  test('does not advance on low-signal formal answer', async () => {
    const root = join(process.cwd(), '.test-brainstorm-low-signal')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleBrainstorm(createContext(root), 'user-login', undefined, createToolContext(root, 'session-low-signal'))
    const result = await handleBrainstorm(createContext(root), 'user-login', '好', createToolContext(root, 'session-low-signal'))

    expect(result).toContain('too short to record')
    expect(result).toContain('这个功能主要要解决什么问题？')

    const sessionPath = join(root, '.sisyphus', 'brainstorm', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as {
      answers: Record<string, string>
      pendingQuestionId: string
    }
    expect(session.answers.problem).toBeUndefined()
    expect(session.pendingQuestionId).toBe('problem')

    await rm(root, { recursive: true, force: true })
  })

  test('generates design doc after answers are collected across multiple invocations', async () => {
    const root = join(process.cwd(), '.test-brainstorm-generate-design')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const toolContext = createToolContext(root, 'session-generate')
    await handleBrainstorm(createContext(root), 'user-login', undefined, toolContext)
    await handleBrainstorm(createContext(root), 'user-login', '减少重复登录操作', toolContext)
    await handleBrainstorm(createContext(root), 'user-login', '内部开发者', toolContext)
    await handleBrainstorm(createContext(root), 'user-login', 'new-feature', toolContext)
    await handleBrainstorm(createContext(root), 'user-login', '快速上线', toolContext)
    const result = await handleBrainstorm(createContext(root), 'user-login', '必须兼容现有认证', toolContext)

    expect(result).toContain('Design document generated')

    const designDir = join(root, 'docs', 'changes', 'user-login', 'design')
    await expect(access(designDir)).resolves.toBeNull()

    const generatedFile = join(designDir, `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-design.md`)
    const content = await readFile(generatedFile, 'utf-8')
    expect(content).toContain('减少重复登录操作')
    expect(content).toContain('内部开发者')
    expect(content).toContain('必须兼容现有认证')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'brainstorm', 'user-login.json'), 'utf-8')) as {
      workflowState: string
      pendingQuestionId: string | null
      generatedDocs: string[]
    }
    expect(session.workflowState).toBe('completed')
    expect(session.pendingQuestionId).toBeNull()
    expect(session.generatedDocs).toHaveLength(1)

    const active = JSON.parse(await readFile(join(root, '.sisyphus', 'brainstorm', 'active.json'), 'utf-8')) as {
      bySessionID: Record<string, unknown>
    }
    expect(active.bySessionID['session-generate']).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('retries generation from failed state on next invocation', async () => {
    const root = join(process.cwd(), '.test-brainstorm-retry-generation')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'user-login.json'),
      JSON.stringify(
        {
          version: 2,
          feature: 'user-login',
          workflowState: 'failed',
          pendingQuestionId: null,
          askedQuestionIds: ['problem', 'target-users', 'scope', 'priority', 'constraints'],
          answers: {
            problem: '减少重复登录操作',
            'target-users': '内部开发者',
            scope: 'new-feature',
            priority: '快速上线',
            constraints: '必须兼容现有认证',
          },
          generatedDocs: [],
          generationAttemptCount: 1,
          lastError: 'temporary failure',
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf-8'
    )

    const result = await handleBrainstorm(createContext(root), 'user-login', undefined, createToolContext(root, 'session-retry'))
    expect(result).toContain('Design document generated')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'brainstorm', 'user-login.json'), 'utf-8')) as {
      workflowState: string
      generationAttemptCount: number
      generatedDocs: string[]
    }
    expect(session.workflowState).toBe('completed')
    expect(session.generationAttemptCount).toBe(2)
    expect(session.generatedDocs).toHaveLength(1)

    await rm(root, { recursive: true, force: true })
  })
})
