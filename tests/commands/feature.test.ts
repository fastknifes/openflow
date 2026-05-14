import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { handleFeature } from '../../src/commands/feature.js'
import { defaultSynthesizer } from '../../src/phases/feature/llm-adapter.js'
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

function createToolContext(directory: string, sessionID = 'session-1', messageID = 'message-1') {
  return {
    sessionID,
    messageID,
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

describe('feature command', () => {
  test('throws when feature is missing and no active session exists', async () => {
    const root = join(process.cwd(), '.test-feature-missing-feature')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await expect(handleFeature(createContext(root), undefined, undefined, createToolContext(root))).rejects.toThrow(
      'Feature name is required'
    )

    await rm(root, { recursive: true, force: true })
  })

  test('starts feature in collecting state and persists first pending question', async () => {
    const root = join(process.cwd(), '.test-feature-first-question')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root))

    expect(result).toContain('Feature Question')
    expect(result).toContain('这个功能主要要解决什么问题？')
    expect(result).toContain('answered 0/5')

    const sessionPath = join(root, '.sisyphus', 'feature', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as {
      workflowState: string
      pendingQuestionId: string
      generatedDocs: string[]
    }

    expect(session.workflowState).toBe('collecting')
    expect(session.pendingQuestionId).toBe('problem')
    expect(session.generatedDocs).toHaveLength(0)

    const activePath = join(root, '.sisyphus', 'feature', 'active.json')
    const active = JSON.parse(await readFile(activePath, 'utf-8')) as { bySessionID: Record<string, { feature: string }> }
    expect(active.bySessionID['session-1']?.feature).toBe('user-login')

    await rm(root, { recursive: true, force: true })
  })

  test('advances one step per fresh invocation and keeps pending state durable', async () => {
    const root = join(process.cwd(), '.test-feature-next-question')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-a'))
    const result = await handleFeature(createContext(root), 'user-login', '提升效率', createToolContext(root, 'session-a'))

    expect(result).toContain('这个功能的主要使用者是谁？')
    expect(result).toContain('answered 1/5')

    const sessionPath = join(root, '.sisyphus', 'feature', 'user-login.json')
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
    const root = join(process.cwd(), '.test-feature-resume-by-session')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-resume'))
    const result = await handleFeature(createContext(root), undefined, '提升效率', createToolContext(root, 'session-resume'))

    expect(result).toContain('这个功能的主要使用者是谁？')

    const sessionPath = join(root, '.sisyphus', 'feature', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as { answers: Record<string, string> }
    expect(session.answers.problem).toBe('提升效率')

    await rm(root, { recursive: true, force: true })
  })

  test('returns current pending question when resumed without a new answer', async () => {
    const root = join(process.cwd(), '.test-feature-repeat-pending')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-repeat'))
    const result = await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-repeat'))

    expect(result).toContain('这个功能主要要解决什么问题？')
    expect(result).toContain('answered 0/5')

    await rm(root, { recursive: true, force: true })
  })

  test('prefers question tool for formal pending question when host supports it', async () => {
    const root = join(process.cwd(), '.test-feature-question-tool')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const questionContext = createQuestionToolContext(root, ['支持新场景'])
    const result = await handleFeature(createContext(root), 'user-login', undefined, questionContext.context)

    expect(questionContext.asked).toHaveLength(1)
    expect(questionContext.asked[0]?.question).toBe('这个功能主要要解决什么问题？')
    expect(result).toContain('这个功能的主要使用者是谁？')

    await rm(root, { recursive: true, force: true })
  })

  test('does not advance on low-signal formal answer', async () => {
    const root = join(process.cwd(), '.test-feature-low-signal')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-low-signal'))
    const result = await handleFeature(createContext(root), 'user-login', '好', createToolContext(root, 'session-low-signal'))

    expect(result).toContain('too short to record')
    expect(result).toContain('这个功能主要要解决什么问题？')

    const sessionPath = join(root, '.sisyphus', 'feature', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as {
      answers: Record<string, string>
      pendingQuestionId: string
    }
    expect(session.answers.problem).toBeUndefined()
    expect(session.pendingQuestionId).toBe('problem')

    await rm(root, { recursive: true, force: true })
  })

  test('generates design doc after answers are collected across multiple invocations', async () => {
    const root = join(process.cwd(), '.test-feature-generate-design')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const toolContext = createToolContext(root, 'session-generate')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-generate', 'message-1'))
    await handleFeature(createContext(root), 'user-login', '内部开发者', createToolContext(root, 'session-generate', 'message-2'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-generate', 'message-3'))
    await handleFeature(createContext(root), 'user-login', '快速上线', createToolContext(root, 'session-generate', 'message-4'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-generate', 'message-5'))

    expect(result).toContain('Generated documents:')
    expect(result).toContain('design.md')
    expect(result).toContain('behavior.md')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const generatedFile = join(root, 'docs', 'changes', changeDirs[0]!, 'design.md')
    const sidecarFile = join(root, 'docs', 'changes', changeDirs[0]!, 'design.meta.json')
    await expect(access(generatedFile)).resolves.toBeNull()
    await expect(access(sidecarFile)).resolves.toBeNull()
    const content = await readFile(generatedFile, 'utf-8')
    const sidecar = JSON.parse(await readFile(sidecarFile, 'utf-8')) as {
      feature: string
      problemStatement?: string
      targetUsers?: string
      constraints: Array<{ description: string }>
    }

    expect(content).toContain('# user-login - Design')
    expect(content).toContain('## Overview')
    expect(content).toContain('## Problem')
    expect(content).toContain('## Goals')
    expect(content).toContain('## Design Constraints')
    expect(content).toContain('## Success Criteria')
    expect(content).toContain('## Proposed Design')
    expect(content).toContain('减少重复登录操作')
    expect(content).toContain('内部开发者')
    expect(content).toContain('必须兼容现有认证')
    expect(sidecar.feature).toBe('user-login')
    expect(sidecar.problemStatement).toBe('减少重复登录操作')
    expect(sidecar.targetUsers).toBe('内部开发者')
    expect(sidecar.constraints.some((constraint) => constraint.description === '必须兼容现有认证')).toBe(true)

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      workflowState: string
      pendingQuestionId: string | null
      generatedDocs: string[]
    }
    expect(session.workflowState).toBe('completed')
    expect(session.pendingQuestionId).toBeNull()
    expect(session.generatedDocs).toHaveLength(2)

    const active = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'active.json'), 'utf-8')) as {
      bySessionID: Record<string, unknown>
    }
    expect(active.bySessionID['session-generate']).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('does not consume the same message twice across hook and direct handler paths', async () => {
    const root = join(process.cwd(), '.test-feature-duplicate-message')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const firstMessage = createToolContext(root, 'session-duplicate', 'message-target-users')
    await handleFeature(createContext(root), 'user-login', undefined, firstMessage)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-duplicate', 'message-problem'))

    const hookResult = await handleFeature(createContext(root), 'user-login', '内部开发者', firstMessage)
    const directResult = await handleFeature(createContext(root), 'user-login', '内部开发者', firstMessage)

    expect(hookResult).toContain('这次需求更接近哪一种范围？')
    expect(directResult).toContain('这次需求更接近哪一种范围？')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      answers: Record<string, string | undefined>
      pendingQuestionId: string
      generatedDocs: string[]
    }

    expect(session.answers.problem).toBe('减少重复登录操作')
    expect(session.answers['target-users']).toBe('内部开发者')
    expect(session.answers.scope).toBeUndefined()
    expect(session.pendingQuestionId).toBe('scope')
    expect(session.generatedDocs).toHaveLength(0)

    await rm(root, { recursive: true, force: true })
  })

  test('retries generation from failed state on next invocation', async () => {
    const root = join(process.cwd(), '.test-feature-retry-generation')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'feature', 'user-login.json'),
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

    const result = await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-retry'))
    expect(result).toContain('Generated documents:')
    expect(result).toContain('design.md')
    expect(result).toContain('behavior.md')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      workflowState: string
      generationAttemptCount: number
      generatedDocs: string[]
    }
    expect(session.workflowState).toBe('completed')
    expect(session.generationAttemptCount).toBe(2)
    expect(session.generatedDocs).toHaveLength(2)

    await rm(root, { recursive: true, force: true })
  })

  test('marks feature failed when requirement model validation fails', async () => {
    const root = join(process.cwd(), '.test-feature-validation-failure')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const originalSynthesize = defaultSynthesizer.synthesize.bind(defaultSynthesizer)

    defaultSynthesizer.synthesize = async (model) => ({
      ...model,
      constraints: [
        {
          id: 'broken-constraint',
          category: 'scope',
          severity: 'must',
          description: '',
          rationale: 'Invalid for test',
          verificationMethod: 'Observe validation failure',
          sourceQuestionId: 'constraints',
        },
      ],
    })

    try {
      const toolContext = createToolContext(root, 'session-invalid')
      await handleFeature(createContext(root), 'user-login', undefined, toolContext)
      await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-invalid', 'message-1'))
      await handleFeature(createContext(root), 'user-login', '内部开发者', createToolContext(root, 'session-invalid', 'message-2'))
      await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-invalid', 'message-3'))
      await handleFeature(createContext(root), 'user-login', '快速上线', createToolContext(root, 'session-invalid', 'message-4'))

      const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-invalid', 'message-5'))

      expect(result).toContain('Feature Design Pending')
      expect(result).toContain('String must contain at least 1 character')

      const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
        workflowState: string
        lastError?: string
        generatedDocs: string[]
      }

      expect(session.workflowState).toBe('failed')
      expect(session.generatedDocs).toHaveLength(0)
      expect(session.lastError).toContain('String must contain at least 1 character')
    } finally {
      defaultSynthesizer.synthesize = originalSynthesize
      await rm(root, { recursive: true, force: true })
    }
  })
})
