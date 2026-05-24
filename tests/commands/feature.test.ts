import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { handleFeature } from '../../src/commands/feature.js'
import { defaultSynthesizer } from '../../src/phases/feature/llm-adapter.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import type { BrainstormContextPacket } from '../../src/phases/feature/context-packet.js'

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

function createContextWithSessionMessages(directory: string, text: string): OpenFlowContext {
  return {
    ...createContext(directory),
    client: {
      session: {
        messages: async () => ({
          messages: [
            {
              role: 'assistant',
              parts: [{ type: 'text', text }],
            },
          ],
        }),
      },
    },
  } as unknown as OpenFlowContext
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
  test('asks for natural-language description when feature is missing and no active session exists', async () => {
    const root = join(process.cwd(), '.test-feature-missing-feature')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await expect(handleFeature(createContext(root), undefined, undefined, createToolContext(root))).rejects.toThrow(
      'Describe the feature idea in natural language'
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
    expect(result).toContain('known facts 0')

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

  test('does not invoke question picker twice for the same pending question', async () => {
    const root = join(process.cwd(), '.test-feature-question-picker-dedupe')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const tool = createQuestionToolContext(root, ['', ''], 'session-dedupe')

    const first = await handleFeature(createContext(root), 'user-login', undefined, tool.context)
    const second = await handleFeature(createContext(root), 'user-login', undefined, tool.context)

    expect(first).toContain('这个功能主要要解决什么问题？')
    expect(second).toContain('这个功能主要要解决什么问题？')
    expect(tool.asked).toHaveLength(1)

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      questionPickerPromptedIds: string[]
      pendingQuestionId: string
    }
    expect(session.questionPickerPromptedIds).toContain('problem')
    expect(session.pendingQuestionId).toBe('problem')

    await rm(root, { recursive: true, force: true })
  })

  test('accepts Chinese natural-language feature intent without sanitization failure', async () => {
    const root = join(process.cwd(), '.test-feature-natural-language')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const description = '为 quality gate 引入 evidence-ledger 机制'
    const result = await handleFeature(createContext(root), description, undefined, createToolContext(root, 'session-natural'))

    expect(result).toContain('Feature Question')
    expect(result).toContain(description)
    expect(result).toContain('这次需求更接近哪一种范围？')
    expect(result).not.toContain('Feature name is too short after sanitization')

    const files = await readdir(join(root, '.sisyphus', 'feature'))
    const sessionFile = files.find((file) => file.startsWith('quality-gate-evidence-ledger') && file.endsWith('.json'))
    expect(sessionFile).toBeDefined()

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', sessionFile!), 'utf-8')) as {
      featureTitle?: string
      sourceIntent?: string
      generatedDocs: string[]
    }
    expect(session.featureTitle).toBe(description)
    expect(session.sourceIntent).toBe(description)
    expect(session.generatedDocs).toHaveLength(0)

    await rm(root, { recursive: true, force: true })
  })

  test('rejects generic future placeholder names before creating a feature session', async () => {
    const root = join(process.cwd(), '.test-feature-generic-future-name')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleFeature(createContext(root), 'future', undefined, createToolContext(root, 'session-generic-future'))

    expect(result).toContain('Feature Identity Needed')
    expect(result).toContain('too generic')
    expect(result).toContain('will not create a `feature-*`, `future-*`')
    await expect(readdir(join(root, '.sisyphus', 'feature'))).rejects.toThrow()

    await rm(root, { recursive: true, force: true })
  })

  test('rejects generic document-generation instructions before deriving feature-hash names', async () => {
    const root = join(process.cwd(), '.test-feature-generic-doc-instruction')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleFeature(createContext(root), '请收集约束条件，生成相关文档。', undefined, createToolContext(root, 'session-generic-doc'))

    expect(result).toContain('Feature Identity Needed')
    expect(result).toContain('workflow action')
    expect(result).not.toMatch(/feature-[0-9a-f]{8}/u)
    await expect(readdir(join(root, '.sisyphus', 'feature'))).rejects.toThrow()

    await rm(root, { recursive: true, force: true })
  })

  test('continues from session context when user agrees to generate related documents', async () => {
    const root = join(process.cwd(), '.test-feature-contextual-approval')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const priorAssistantText = [
      'P0：把 quality-gate 从 AI 自律调用升级为完成声明拦截。',
      '下一步应把 quality-gate、readiness freshness、实现期状态从提示型建议升级为状态化硬约束。',
    ].join('\n')

    const result = await handleFeature(
      createContextWithSessionMessages(root, priorAssistantText),
      '同意你的方案，生成相关文档',
      undefined,
      createToolContext(root, 'session-contextual-approval'),
    )

    expect(result).toContain('Feature Design Complete')
    expect(result).toContain('stateful-quality-guardrails')
    expect(result).not.toContain('Feature Identity Needed')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const generatedDir = changeDirs.find((dir) => dir.endsWith('stateful-quality-guardrails'))
    expect(generatedDir).toBeDefined()
    await expect(readFile(join(root, 'docs', 'changes', generatedDir!, 'design.md'), 'utf-8')).resolves.toContain('状态化质量门护栏')
    await expect(readFile(join(root, 'docs', 'changes', generatedDir!, 'behavior.md'), 'utf-8')).resolves.toContain('stateful-quality-guardrails')

    await rm(root, { recursive: true, force: true })
  })

  test('asks natural-language disambiguation when no-arg feature identity is ambiguous', async () => {
    const root = join(process.cwd(), '.test-feature-ambiguous-identity')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    for (const feature of ['first-feature', 'second-feature']) {
      await writeFile(join(root, '.sisyphus', 'feature', `${feature}.json`), JSON.stringify({
        version: 3,
        feature,
        featureTitle: feature.replace('-', ' '),
        workflowState: 'collecting',
        pendingQuestionId: 'problem',
        askedQuestionIds: [],
        answers: {},
        assumptions: [],
        pendingConfirmations: [],
        skippedQuestionIds: [],
        draftStatus: 'final',
        generatedDocs: [],
        generationAttemptCount: 0,
        updatedAt: new Date().toISOString(),
      }, null, 2), 'utf-8')
    }

    const result = await handleFeature(createContext(root), undefined, undefined, createToolContext(root, 'session-ambiguous'))

    expect(result).toContain('Feature Selection Needed')
    expect(result).toContain('first feature')
    expect(result).toContain('second feature')
    expect(result).toContain('you do not need to type a slug')

    await rm(root, { recursive: true, force: true })
  })

  test('advances one step per fresh invocation and keeps pending state durable', async () => {
    const root = join(process.cwd(), '.test-feature-next-question')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-a'))
    const result = await handleFeature(createContext(root), 'user-login', '提升效率', createToolContext(root, 'session-a'))

    expect(result).toContain('这次需求更接近哪一种范围？')
    expect(result).toContain('known facts 1')

    const sessionPath = join(root, '.sisyphus', 'feature', 'user-login.json')
    const session = JSON.parse(await readFile(sessionPath, 'utf-8')) as {
      answers: Record<string, string>
      pendingQuestionId: string
      workflowState: string
    }

    expect(session.answers.problem).toBe('提升效率')
    expect(session.pendingQuestionId).toBe('scope')
    expect(session.workflowState).toBe('collecting')

    await rm(root, { recursive: true, force: true })
  })

  test('resumes by session when feature is omitted', async () => {
    const root = join(process.cwd(), '.test-feature-resume-by-session')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-resume'))
    const result = await handleFeature(createContext(root), undefined, '提升效率', createToolContext(root, 'session-resume'))

    expect(result).toContain('这次需求更接近哪一种范围？')

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
    expect(result).toContain('known facts 0')

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
    expect(result).toContain('这次需求更接近哪一种范围？')

    await rm(root, { recursive: true, force: true })
  })

  test('invokes question picker for the next pending question after an answer advances state', async () => {
    const root = join(process.cwd(), '.test-feature-question-picker-next-pending')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const questionContext = createQuestionToolContext(root, ['支持新场景', 'workflow'], 'session-next-question')
    const first = await handleFeature(createContext(root), 'user-login', undefined, questionContext.context)
    questionContext.context.messageID = 'message-2'
    const second = await handleFeature(createContext(root), 'user-login', undefined, questionContext.context)

    expect(first).toContain('这次需求更接近哪一种范围？')
    expect(second).toContain('这次设计最需要考虑的一个约束是什么？')
    expect(questionContext.asked.map(item => item.question)).toEqual([
      '这个功能主要要解决什么问题？',
      '这次需求更接近哪一种范围？',
    ])

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
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-generate', 'message-2'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-generate', 'message-3'))

    expect(result).toContain('Generated documents:')
    expect(result).toContain('design.md')
    expect(result).toContain('behavior.md')
    expect(result).toContain('Consensus:')
    expect(result).toContain('Assumptions:')
    expect(result).toContain('Pending confirmations:')
    expect(result).toContain('Constraints:')
    expect(result).toContain('## Next Step Options')
    expect(result).toContain('进入开发计划')
    expect(result).toContain('检查约束充分性')
    expect(result).toContain('查看文档')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const generatedFile = join(root, 'docs', 'changes', changeDirs[0]!, 'design.md')
    const sidecarFile = join(root, 'docs', 'changes', changeDirs[0]!, 'design.meta.json')
    await expect(access(generatedFile)).resolves.toBeNull()
    await expect(access(sidecarFile)).resolves.toBeNull()
    const content = await readFile(generatedFile, 'utf-8')
    const sidecar = JSON.parse(await readFile(sidecarFile, 'utf-8')) as {
      feature: string
      problemStatement?: string
      constraints: Array<{ description: string }>
    }

    expect(content).toContain('# user-login - Design')
    expect(content).toContain('## Overview')
    expect(content).toContain('## Problem')
    expect(content).toContain('## Goals')
    expect(content).toContain('## Design Constraints')
    expect(content).toContain('## Success Criteria')
    expect(content).not.toContain('## Architecture')
    expect(content).not.toContain('## Proposed Design')
    expect(content).toContain('减少重复登录操作')
    expect(content).toContain('必须兼容现有认证')
    expect(sidecar.feature).toBe('user-login')
    expect(sidecar.problemStatement).toBe('减少重复登录操作')
    expect(sidecar.constraints.some((constraint) => constraint.description === '必须兼容现有认证')).toBe(true)

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      workflowState: string
      pendingQuestionId: string | null
      generatedDocs: string[]
    }
    expect(session.workflowState).toBe('completed')
    expect(session.pendingQuestionId).toBeNull()
    expect(session.generatedDocs).toHaveLength(2)
    expect(session.generatedDocs.some((doc) => doc.endsWith('design.md'))).toBe(true)
    expect(session.generatedDocs.some((doc) => doc.endsWith('behavior.md'))).toBe(true)

    const active = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'active.json'), 'utf-8')) as {
      bySessionID: Record<string, unknown>
    }
    expect(active.bySessionID['session-generate']).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('post-design confirmation: interactive "进入开发计划" proceeds to plan', async () => {
    const root = join(process.cwd(), '.test-feature-post-design-proceed')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-post-proceed', 'message-0'))
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-post-proceed', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-post-proceed', 'message-2'))
    const { asked, context } = createQuestionToolContext(root, ['进入开发计划'], 'session-post-proceed')

    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', {
      ...context,
      messageID: 'message-3',
    })

    expect(asked.some((item) => item.header === '下一步行动')).toBe(true)
    expect(result).toContain('Feature Design Complete')
    expect(result).toContain('Post-Design Confirmation')
    expect(result).toContain('/openflow-writing-plan user-login')
    expect(result).not.toContain('### Next Step (Advisory)')
    expect(result).not.toContain('## Next Step Options')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      postDesignDecision?: string
    }
    expect(session.postDesignDecision).toBe('proceed_to_plan')

    await rm(root, { recursive: true, force: true })
  })

  test('post-design confirmation: interactive "检查约束充分性" triggers document review', async () => {
    const root = join(process.cwd(), '.test-feature-post-design-review')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-post-review', 'message-0'))
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-post-review', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-post-review', 'message-2'))
    const { asked, context } = createQuestionToolContext(root, ['检查约束充分性'], 'session-post-review')

    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', {
      ...context,
      messageID: 'message-3',
    })

    expect(asked.some((item) => item.header === '下一步行动')).toBe(true)
    expect(result).toContain('Design Document Review')
    expect(result).toContain('design.md')
    expect(result).toContain('behavior.md')
    expect(result).not.toContain('### Next Step (Advisory)')
    expect(result).not.toContain('## Next Step Options')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      postDesignDecision?: string
    }
    expect(session.postDesignDecision).toBe('review_docs')

    await rm(root, { recursive: true, force: true })
  })

  test('post-design confirmation: interactive "查看文档" returns document paths', async () => {
    const root = join(process.cwd(), '.test-feature-post-design-inspect')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-post-inspect', 'message-0'))
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-post-inspect', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-post-inspect', 'message-2'))
    const { asked, context } = createQuestionToolContext(root, ['查看文档'], 'session-post-inspect')

    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', {
      ...context,
      messageID: 'message-3',
    })

    expect(asked.some((item) => item.header === '下一步行动')).toBe(true)
    expect(result).toContain('Documents Ready')
    expect(result).not.toContain('### Next Step (Advisory)')
    expect(result).not.toContain('## Next Step Options')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      postDesignDecision?: string
    }
    expect(session.postDesignDecision).toBe('inspect')

    await rm(root, { recursive: true, force: true })
  })

  test('post-design confirmation: non-interactive fallback shows next step options', async () => {
    const root = join(process.cwd(), '.test-feature-post-design-non-interactive')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const toolContext = createToolContext(root, 'session-post-non-interactive')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-post-non-interactive', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-post-non-interactive', 'message-2'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-post-non-interactive', 'message-3'))

    expect(result).toContain('## Next Step Options')
    expect(result).toContain('Proceed to implementation plan')
    expect(result).toContain('Review design documents')
    expect(result).toContain('Ignore')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      postDesignDecision?: string
    }
    expect(session.postDesignDecision).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('post-design confirmation: re-display of completed session does not ask again', async () => {
    const root = join(process.cwd(), '.test-feature-post-design-redisplay')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    // Generate with interactive context and pick "进入开发计划"
    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-post-redisplay', 'message-0'))
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-post-redisplay', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-post-redisplay', 'message-2'))
    const { asked: firstAsked, context: firstContext } = createQuestionToolContext(root, ['进入开发计划'], 'session-post-redisplay')
    const firstResult = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', {
      ...firstContext,
      messageID: 'message-3',
    })
    expect(firstAsked.some((item) => item.header === '下一步行动')).toBe(true)
    expect(firstResult).toContain('Post-Design Confirmation')

    // Re-display with a fresh question context — should NOT ask again
    const { asked: secondAsked, context: secondContext } = createQuestionToolContext(root, [], 'session-post-redisplay')
    const secondResult = await handleFeature(createContext(root), 'user-login', undefined, {
      ...secondContext,
      messageID: 'message-4',
    })

    expect(secondAsked).toHaveLength(0)
    expect(secondResult).toContain('Feature Design Complete')
    expect(secondResult).not.toContain('下一步行动')

    await rm(root, { recursive: true, force: true })
  })

  test('natural-language feature description derives identity but asks one key question before final generation', async () => {
    const root = join(process.cwd(), '.test-feature-natural-language-asks')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const description = '为 quality gate 引入 evidence-ledger 机制'
    const result = await handleFeature(createContext(root), description, undefined, createToolContext(root, 'session-natural'))

    expect(result).toContain('Feature Question')
    expect(result).toContain(description)
    expect(result).toContain('这次需求更接近哪一种范围？')
    expect(result).not.toContain('Feature name is too short after sanitization')

    const files = await readdir(join(root, '.sisyphus', 'feature'))
    const sessionFile = files.find((file) => file.startsWith('quality-gate-evidence-ledger') && file.endsWith('.json'))
    expect(sessionFile).toBeDefined()

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', sessionFile!), 'utf-8')) as {
      featureTitle?: string
      sourceIntent?: string
      generatedDocs: string[]
    }
    expect(session.featureTitle).toBe(description)
    expect(session.sourceIntent).toBe(description)
    expect(session.generatedDocs).toHaveLength(0)

    await rm(root, { recursive: true, force: true })
  })

  test('natural-language feature generates after the one key scope answer with outcome as assumption', async () => {
    const root = join(process.cwd(), '.test-feature-natural-language-one-key-question')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const description = '为 quality gate 引入 evidence-ledger 机制'
    await handleFeature(createContext(root), description, undefined, createToolContext(root, 'session-one-key', 'message-1'))
    const result = await handleFeature(createContext(root), undefined, 'workflow', createToolContext(root, 'session-one-key', 'message-2'))

    expect(result).toContain('Feature Design Complete')
    expect(result).toContain('Assumptions:')
    expect(result).toContain('Expected outcome is inferred from the source intent')
    expect(result).not.toContain('这次设计最需要考虑的一个约束是什么？')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const design = await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'design.md'), 'utf-8')
    expect(design).toContain('Expected outcome is inferred from the source intent')

    await rm(root, { recursive: true, force: true })
  })

  test('similar natural-language descriptions with same extracted words map to the same feature', async () => {
    const root = join(process.cwd(), '.test-feature-slug-collision-safety')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), '为 quality gate 引入 evidence-ledger 机制', undefined, createToolContext(root, 'session-slug-a'))
    await handleFeature(createContext(root), '为 quality gate 引入 evidence-ledger 审计机制', undefined, createToolContext(root, 'session-slug-b'))

    const files = (await readdir(join(root, '.sisyphus', 'feature')))
      .filter((file) => file.startsWith('quality-gate-evidence-ledger') && file.endsWith('.json'))

    // Same extracted words → same slug → single session file
    expect(files).toHaveLength(1)

    await rm(root, { recursive: true, force: true })
  })

  test('ambiguous no-argument feature identity asks natural-language disambiguation', async () => {
    const root = join(process.cwd(), '.test-feature-ambiguous-identity')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(join(root, '.sisyphus', 'feature', 'first-feature.json'), JSON.stringify({
      version: 3,
      feature: 'first-feature',
      featureTitle: 'First feature idea',
      workflowState: 'collecting',
      pendingQuestionId: 'problem',
      askedQuestionIds: [],
      answers: {},
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-05-18T00:00:00.000Z',
    }, null, 2), 'utf-8')
    await writeFile(join(root, '.sisyphus', 'feature', 'second-feature.json'), JSON.stringify({
      version: 3,
      feature: 'second-feature',
      featureTitle: 'Second feature idea',
      workflowState: 'collecting',
      pendingQuestionId: 'problem',
      askedQuestionIds: [],
      answers: {},
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-05-18T00:01:00.000Z',
    }, null, 2), 'utf-8')

    const result = await handleFeature(createContext(root), undefined, undefined, createToolContext(root, 'session-ambiguous'))

    expect(result).toContain('Feature Selection Needed')
    expect(result).toContain('First feature idea')
    expect(result).toContain('Second feature idea')
    expect(result).toContain('you do not need to type a slug')

    await rm(root, { recursive: true, force: true })
  })

  test('natural-language disambiguation reply selects existing candidate instead of creating a new feature', async () => {
    const root = join(process.cwd(), '.test-feature-natural-selection')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(join(root, '.sisyphus', 'feature', 'first-feature.json'), JSON.stringify({
      version: 3,
      feature: 'first-feature',
      featureTitle: 'First feature idea',
      workflowState: 'collecting',
      pendingQuestionId: 'problem',
      askedQuestionIds: [],
      answers: {},
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-05-18T00:00:00.000Z',
    }, null, 2), 'utf-8')
    await writeFile(join(root, '.sisyphus', 'feature', 'second-feature.json'), JSON.stringify({
      version: 3,
      feature: 'second-feature',
      featureTitle: 'Second feature idea',
      workflowState: 'collecting',
      pendingQuestionId: 'problem',
      askedQuestionIds: [],
      answers: {},
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-05-18T00:01:00.000Z',
    }, null, 2), 'utf-8')

    const result = await handleFeature(createContext(root), 'First feature idea', 'Improve the first idea', createToolContext(root, 'session-natural-selection'))

    expect(result).toContain('这次需求更接近哪一种范围？')

    const first = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'first-feature.json'), 'utf-8')) as {
      answers: Record<string, string>
    }
    const files = await readdir(join(root, '.sisyphus', 'feature'))
    expect(first.answers.problem).toBe('Improve the first idea')
    expect(files).not.toContain('first-feature-idea.json')

    await rm(root, { recursive: true, force: true })
  })

  test('natural-language disambiguation reply selects an existing unfinished feature', async () => {
    const root = join(process.cwd(), '.test-feature-ambiguous-natural-selection')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(join(root, '.sisyphus', 'feature', 'first-feature.json'), JSON.stringify({
      version: 3,
      feature: 'first-feature',
      featureTitle: 'First feature idea',
      workflowState: 'collecting',
      pendingQuestionId: 'problem',
      askedQuestionIds: [],
      answers: {},
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-05-18T00:00:00.000Z',
    }, null, 2), 'utf-8')
    await writeFile(join(root, '.sisyphus', 'feature', 'second-feature.json'), JSON.stringify({
      version: 3,
      feature: 'second-feature',
      featureTitle: 'Second feature idea',
      workflowState: 'collecting',
      pendingQuestionId: 'problem',
      askedQuestionIds: [],
      answers: {},
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-05-18T00:01:00.000Z',
    }, null, 2), 'utf-8')

    const result = await handleFeature(createContext(root), 'First feature idea', undefined, createToolContext(root, 'session-select'))

    expect(result).toContain('First feature idea')
    expect(result).toContain('Internal slug: `first-feature`')

    const files = await readdir(join(root, '.sisyphus', 'feature'))
    expect(files).not.toContain('first-feature-idea.json')

    await rm(root, { recursive: true, force: true })
  })

  test('skip/proceed response generates draft with assumptions and marks documents', async () => {
    const root = join(process.cwd(), '.test-feature-draft-assumptions')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-draft'))
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-draft', 'message-1'))
    const result = await handleFeature(createContext(root), 'user-login', '先生成草稿', createToolContext(root, 'session-draft', 'message-2'))

    expect(result).toContain('Feature Design Complete')
    expect(result).toContain('Assumptions:')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const design = await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'design.md'), 'utf-8')
    const behavior = await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'behavior.md'), 'utf-8')

    expect(design).toContain('Draft with Assumptions')
    expect(behavior).toContain('Draft with Assumptions')
    expect(design).toContain('The user asked OpenFlow to proceed using current context and assumptions.')

    await rm(root, { recursive: true, force: true })
  })

  test('generates draft with assumptions when user asks to proceed before convergence', async () => {
    const root = join(process.cwd(), '.test-feature-draft-with-assumptions')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-draft'))
    const result = await handleFeature(createContext(root), 'user-login', '先生成草稿', createToolContext(root, 'session-draft', 'message-draft'))

    expect(result).toContain('Feature Design Complete')
    expect(result).toContain('Assumptions:')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const design = await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'design.md'), 'utf-8')
    expect(design).toContain('Draft with Assumptions')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      draftStatus: string
      assumptions: string[]
      skippedQuestionIds: string[]
    }
    expect(session.draftStatus).toBe('draft_with_assumptions')
    expect(session.assumptions.length).toBeGreaterThan(0)
    expect(session.skippedQuestionIds).toContain('problem')

    await rm(root, { recursive: true, force: true })
  })

  test('persists product-level preference when user rejects code-level discussion', async () => {
    const root = join(process.cwd(), '.test-feature-product-level')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleFeature(createContext(root), 'user-login', '我不跟你讨论代码层面的设计', createToolContext(root, 'session-product'))

    expect(result).toContain('这次需求更接近哪一种范围？')
    expect(result).not.toContain('function')
    expect(result).not.toContain('interface')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      abstractionPreference?: string
    }
    expect(session.abstractionPreference).toBe('product')

    await rm(root, { recursive: true, force: true })
  })

  test('does not consume the same message twice across hook and direct handler paths', async () => {
    const root = join(process.cwd(), '.test-feature-duplicate-message')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const firstMessage = createToolContext(root, 'session-duplicate', 'message-scope')
    await handleFeature(createContext(root), 'user-login', undefined, firstMessage)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-duplicate', 'message-problem'))

    const hookResult = await handleFeature(createContext(root), 'user-login', 'new-feature', firstMessage)
    const directResult = await handleFeature(createContext(root), 'user-login', 'new-feature', firstMessage)

    expect(hookResult).toContain('这次设计最需要考虑的一个约束是什么？')
    expect(directResult).toContain('这次设计最需要考虑的一个约束是什么？')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      answers: Record<string, string | undefined>
      pendingQuestionId: string
      generatedDocs: string[]
    }

    expect(session.answers.problem).toBe('减少重复登录操作')
    expect(session.answers.scope).toBe('new-feature')
    expect(session.answers.constraints).toBeUndefined()
    expect(session.pendingQuestionId).toBe('constraints')
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
      await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-invalid', 'message-2'))

      const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-invalid', 'message-3'))

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

  // --- Context Harvest tests ---

  async function writeContextPacket(root: string, packet: BrainstormContextPacket): Promise<void> {
    const dir = join(root, '.sisyphus', 'brainstorm', 'context-packets')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${packet.id}.json`), JSON.stringify(packet, null, 2), 'utf-8')
  }

  function makePacket(overrides: Partial<BrainstormContextPacket> & { id: string; featureHint: string }): BrainstormContextPacket {
    const now = new Date().toISOString()
    return {
      id: overrides.id,
      version: 1,
      featureHint: overrides.featureHint,
      sourceSessionID: overrides.sourceSessionID ?? 'session-packet',
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      items: overrides.items ?? [],
    }
  }

  test('context harvest: no packet → normal generation flow', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-none')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const toolContext = createToolContext(root, 'session-harvest-none')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-none', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-none', 'message-2'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-none', 'message-3'))

    expect(result).toContain('Feature Design Complete')
    expect(result).not.toContain('Context Harvest')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: non-interactive single packet returns summary prompt', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-prompt')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-1',
      featureHint: 'user-login',
      items: [
        { type: 'problem', content: 'Users forget passwords often', confidence: 'high', source: 'user' },
        { type: 'constraint', content: 'Must keep SSO integration', confidence: 'high', source: 'assistant' },
      ],
    }))

    const toolContext = createToolContext(root, 'session-harvest-prompt')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-prompt', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-prompt', 'message-2'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-prompt', 'message-3'))

    expect(result).toContain('Context Harvest')
    expect(result).toContain('user-login')
    expect(result).toContain('Users forget passwords often')
    expect(result).toContain('Must keep SSO integration')
    expect(result).toContain('use')
    expect(result).toContain('ignore')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      pendingContextHarvest?: { awaitingPacketId?: string }
    }
    expect(session.pendingContextHarvest?.awaitingPacketId).toBe('pkt-1')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: non-interactive confirm use on next call injects items', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-use-next')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-use',
      featureHint: 'user-login',
      items: [
        { type: 'problem', content: 'Users forget passwords often', confidence: 'high', source: 'user' },
        { type: 'constraint', content: 'Must keep SSO integration', confidence: 'high', source: 'assistant' },
      ],
    }))

    const toolContext = createToolContext(root, 'session-harvest-use')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-use', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-use', 'message-2'))

    // First generation attempt returns harvest prompt
    const first = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-use', 'message-3'))
    expect(first).toContain('Context Harvest')

    // Second call with "use" proceeds to generation
    const second = await handleFeature(createContext(root), 'user-login', 'use', createToolContext(root, 'session-harvest-use', 'message-4'))
    expect(second).toContain('Feature Design Complete')
    expect(second).toContain('Must keep SSO integration')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      pendingContextHarvest?: { confirmedPacketId?: string; confirmedItems?: Array<{ content: string }> }
      assumptions: string[]
      requirementModel?: {
        problemStatement?: string
        constraints: Array<{ description: string }>
      }
    }
    expect(session.pendingContextHarvest?.confirmedPacketId).toBe('pkt-use')
    expect(session.pendingContextHarvest?.confirmedItems?.some((item) => item.content === 'Must keep SSO integration')).toBe(true)
    expect(session.assumptions.some((a) => a.includes('Users forget passwords often'))).toBe(true)
    expect(session.requirementModel?.problemStatement).toBe('减少重复登录操作')
    expect(session.requirementModel?.constraints.some((constraint) => constraint.description.includes('Must keep SSO integration'))).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: confirmed packet fields appear in generated design docs', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-model-fields')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-model-fields',
      featureHint: 'user-login',
      items: [
        { type: 'constraint', content: 'Keep SSO integration stable', confidence: 'high', source: 'assistant' },
        { type: 'decision', content: 'Reuse active session binding', confidence: 'medium', source: 'user', confirmedBy: 'alice' },
        { type: 'nonGoal', content: 'Do not redesign password reset', confidence: 'high', source: 'user' },
        { type: 'risk', content: 'Token migration may regress existing users', confidence: 'high', source: 'assistant' },
        { type: 'example', content: 'User opens login and the system returns an SSO challenge', confidence: 'high', source: 'user' },
        { type: 'constraint', content: 'Medium item confirmed by packet use', confidence: 'medium', source: 'assistant' },
      ],
    }))

    const toolContext = createToolContext(root, 'session-harvest-model')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-model', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-model', 'message-2'))
    await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-model', 'message-3'))
    const result = await handleFeature(createContext(root), 'user-login', 'use', createToolContext(root, 'session-harvest-model', 'message-4'))

    expect(result).toContain('Feature Design Complete')
    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const design = await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'design.md'), 'utf-8')
    const behavior = await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'behavior.md'), 'utf-8')
    const sidecar = JSON.parse(await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'design.meta.json'), 'utf-8')) as {
      constraints: Array<{ description: string }>
      nonGoals: string[]
      risks?: Array<{ description: string }>
      acceptanceCriteria: Array<{ description: string }>
    }

    expect(design).toContain('Keep SSO integration stable')
    expect(design).toContain('Decision from brainstorm: Reuse active session binding')
    expect(design).toContain('Do not redesign password reset')
    expect(design).toContain('Token migration may regress existing users')
    expect(behavior).toContain('system returns an SSO challenge')
    expect(design).toContain('Medium item confirmed by packet use')
    expect(design).not.toContain('Target users: use')
    expect(sidecar.constraints.some((constraint) => constraint.description.includes('Keep SSO integration stable'))).toBe(true)
    expect(sidecar.constraints.some((constraint) => constraint.description.includes('Decision from brainstorm: Reuse active session binding'))).toBe(true)
    expect(sidecar.constraints.some((constraint) => constraint.description.includes('Medium item confirmed by packet use'))).toBe(true)
    expect(sidecar.nonGoals.some((nonGoal) => nonGoal.includes('Do not redesign password reset'))).toBe(true)
    expect(sidecar.risks?.some((risk) => risk.description.includes('Token migration may regress existing users'))).toBe(true)
    expect(sidecar.acceptanceCriteria.some((criterion) => criterion.description.includes('system returns an SSO challenge'))).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: blocking open question prevents final design until draft is requested', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-open-question')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-open-question',
      featureHint: 'user-login',
      items: [
        { type: 'openQuestion', content: 'Should SAML be supported on day one?', confidence: 'high', source: 'user' },
      ],
    }))

    const toolContext = createToolContext(root, 'session-harvest-open-question')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-open-question', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-open-question', 'message-2'))
    await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-open-question', 'message-3'))
    const blocked = await handleFeature(createContext(root), 'user-login', 'use', createToolContext(root, 'session-harvest-open-question', 'message-4'))

    expect(blocked).toContain('Feature Design Pending')
    expect(blocked).toContain('blocking open questions')
    expect(blocked).toContain('Should SAML be supported on day one?')
    await expect(readdir(join(root, 'docs', 'changes'))).rejects.toThrow()

    const draft = await handleFeature(createContext(root), 'user-login', '先生成草稿', createToolContext(root, 'session-harvest-open-question', 'message-5'))
    expect(draft).toContain('Feature Design Complete')
    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const design = await readFile(join(root, 'docs', 'changes', changeDirs[0]!, 'design.md'), 'utf-8')
    expect(design).toContain('Draft with Assumptions')
    expect(design).toContain('Should SAML be supported on day one?')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: non-interactive ignore on next call falls back', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-ignore')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-ignore',
      featureHint: 'user-login',
      items: [
        { type: 'problem', content: 'Users forget passwords often', confidence: 'high', source: 'user' },
      ],
    }))

    const toolContext = createToolContext(root, 'session-harvest-ignore')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-ignore', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-ignore', 'message-2'))

    const first = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-ignore', 'message-3'))
    expect(first).toContain('Context Harvest')

    const second = await handleFeature(createContext(root), 'user-login', 'ignore', createToolContext(root, 'session-harvest-ignore', 'message-4'))
    expect(second).toContain('Feature Design Complete')
    expect(second).not.toContain('Users forget passwords often')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      pendingContextHarvest?: { ignoredPacketIds?: string[] }
    }
    expect(session.pendingContextHarvest?.ignoredPacketIds).toContain('pkt-ignore')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: interactive use injects items into design', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-interactive-use')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-int-use',
      featureHint: 'user-login',
      items: [
        { type: 'problem', content: 'Users forget passwords often', confidence: 'high', source: 'user' },
      ],
    }))

    // Pre-seed a ready-to-generate session so we go straight to finalizeFeature
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'feature', 'user-login.json'), JSON.stringify({
      version: 3,
      feature: 'user-login',
      workflowState: 'ready_to_generate',
      pendingQuestionId: null,
      askedQuestionIds: ['problem', 'target-users', 'scope', 'priority', 'constraints'],
      questionPickerPromptedIds: [],
      answers: {
        problem: '减少重复登录操作',
        'target-users': '内部开发者',
        scope: 'new-feature',
        priority: '快速上线',
        constraints: '必须兼容现有认证',
      },
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf-8')

    const { asked, context } = createQuestionToolContext(root, ['Use as-is'], 'session-harvest-int-use')
    const result = await handleFeature(createContext(root), 'user-login', undefined, context)

    expect(asked.some((a) => a.header === 'Context Harvest')).toBe(true)
    expect(result).toContain('Feature Design Complete')
    expect(result).toContain('\\[high\\] Problem: Users forget passwords often')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: interactive ignore skips packet', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-interactive-ignore')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-int-ignore',
      featureHint: 'user-login',
      items: [
        { type: 'problem', content: 'Users forget passwords often', confidence: 'high', source: 'user' },
      ],
    }))

    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'feature', 'user-login.json'), JSON.stringify({
      version: 3,
      feature: 'user-login',
      workflowState: 'ready_to_generate',
      pendingQuestionId: null,
      askedQuestionIds: ['problem', 'target-users', 'scope', 'priority', 'constraints'],
      questionPickerPromptedIds: [],
      answers: {
        problem: '减少重复登录操作',
        'target-users': '内部开发者',
        scope: 'new-feature',
        priority: '快速上线',
        constraints: '必须兼容现有认证',
      },
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf-8')

    const { asked, context } = createQuestionToolContext(root, ['Ignore'], 'session-harvest-int-ignore')
    const result = await handleFeature(createContext(root), 'user-login', undefined, context)

    expect(asked.some((a) => a.header === 'Context Harvest')).toBe(true)
    expect(result).toContain('Feature Design Complete')
    expect(result).not.toContain('Users forget passwords often')

    const session = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'user-login.json'), 'utf-8')) as {
      pendingContextHarvest?: { ignoredPacketIds?: string[] }
    }
    expect(session.pendingContextHarvest?.ignoredPacketIds).toContain('pkt-int-ignore')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: stale packet falls back to normal flow', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-stale')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    await writeContextPacket(root, makePacket({
      id: 'pkt-stale',
      featureHint: 'user-login',
      updatedAt: oldDate,
      items: [
        { type: 'problem', content: 'Users forget passwords often', confidence: 'high', source: 'user' },
      ],
    }))

    const toolContext = createToolContext(root, 'session-harvest-stale')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-stale', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-stale', 'message-2'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-stale', 'message-3'))

    expect(result).toContain('Feature Design Complete')
    expect(result).not.toContain('Context Harvest')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: multiple packets in non-interactive shows multi-candidate summary', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-multi')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-a',
      featureHint: 'user-login',
      items: [
        { type: 'problem', content: 'Problem A', confidence: 'high', source: 'user' },
      ],
    }))
    await writeContextPacket(root, makePacket({
      id: 'pkt-b',
      featureHint: 'user-login-sso',
      items: [
        { type: 'problem', content: 'Problem B', confidence: 'medium', source: 'assistant' },
      ],
    }))

    const toolContext = createToolContext(root, 'session-harvest-multi')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-multi', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-multi', 'message-2'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-multi', 'message-3'))

    expect(result).toContain('Context Harvest')
    expect(result).toContain('Multiple brainstorm context packets were found')
    expect(result).toContain('pkt-a')
    expect(result).toContain('pkt-b')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: session-local ignore does not suggest packet again', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-session-ignore')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeContextPacket(root, makePacket({
      id: 'pkt-session-ignore',
      featureHint: 'user-login',
      items: [
        { type: 'problem', content: 'Users forget passwords often', confidence: 'high', source: 'user' },
      ],
    }))

    // Pre-seed session with ignored packet ID
    const sessionPath = join(root, '.sisyphus', 'feature', 'user-login.json')
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })
    await writeFile(sessionPath, JSON.stringify({
      version: 3,
      feature: 'user-login',
      workflowState: 'ready_to_generate',
      pendingQuestionId: null,
      askedQuestionIds: ['problem', 'target-users', 'scope', 'priority', 'constraints'],
      questionPickerPromptedIds: [],
      answers: {
        problem: '减少重复登录操作',
        'target-users': '内部开发者',
        scope: 'new-feature',
        priority: '快速上线',
        constraints: '必须兼容现有认证',
      },
      assumptions: [],
      pendingConfirmations: [],
      skippedQuestionIds: [],
      draftStatus: 'final',
      generatedDocs: [],
      generationAttemptCount: 0,
      pendingContextHarvest: { ignoredPacketIds: ['pkt-session-ignore'] },
      updatedAt: new Date().toISOString(),
    }, null, 2), 'utf-8')

    const result = await handleFeature(createContext(root), 'user-login', undefined, createToolContext(root, 'session-harvest-si'))

    expect(result).toContain('Feature Design Complete')
    expect(result).not.toContain('Context Harvest')

    await rm(root, { recursive: true, force: true })
  })

  test('context harvest: malformed packet file falls back to normal flow', async () => {
    const root = join(process.cwd(), '.test-feature-harvest-malformed')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const dir = join(root, '.sisyphus', 'brainstorm', 'context-packets')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'bad-packet.json'), 'not-json', 'utf-8')

    const toolContext = createToolContext(root, 'session-harvest-malformed')
    await handleFeature(createContext(root), 'user-login', undefined, toolContext)
    await handleFeature(createContext(root), 'user-login', '减少重复登录操作', createToolContext(root, 'session-harvest-malformed', 'message-1'))
    await handleFeature(createContext(root), 'user-login', 'new-feature', createToolContext(root, 'session-harvest-malformed', 'message-2'))
    const result = await handleFeature(createContext(root), 'user-login', '必须兼容现有认证', createToolContext(root, 'session-harvest-malformed', 'message-3'))

    expect(result).toContain('Feature Design Complete')
    expect(result).not.toContain('Context Harvest')

    await rm(root, { recursive: true, force: true })
  })
})
