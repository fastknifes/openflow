import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { handleFeature } from '../../src/commands/feature.js'
import { deriveFeatureIdentity } from '../../src/utils/feature-resolver.js'
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

function createToolContext(directory: string, sessionID: string, messageID = 'message-1') {
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

const CONCRETE_UI_INTENT = '在退出菜单上面增加一个"关于系统"的菜单，弹窗展示一段系统介绍的内容'
const UNDERIVABLE_INTENT = '把首页的字体调大一些'
const GENERIC_WORKFLOW_INSTRUCTION = '请收集约束条件，生成相关文档。'

describe('feature resolver confidence classification', () => {
  test('concrete request without a dictionary match is underivable, not a generic instruction', () => {
    const identity = deriveFeatureIdentity(UNDERIVABLE_INTENT)
    expect(identity.lowConfidenceReason).toBe('underivable_slug')
    expect(identity.lowConfidenceReason).not.toBe('generic_instruction')
    expect(identity.sourceIntent).toBe(UNDERIVABLE_INTENT)
  })

  test('vague workflow instruction keeps the generic_instruction classification', () => {
    const identity = deriveFeatureIdentity(GENERIC_WORKFLOW_INSTRUCTION)
    expect(identity.lowConfidenceReason).toBe('generic_instruction')
  })

  test('session_switch is never produced by plain text derivation', () => {
    for (const input of [CONCRETE_UI_INTENT, UNDERIVABLE_INTENT, GENERIC_WORKFLOW_INSTRUCTION, 'user-login']) {
      expect(deriveFeatureIdentity(input).lowConfidenceReason).not.toBe('session_switch')
    }
  })
})

describe('same-session feature switch guard', () => {
  test('concrete UI request derives a durable slug and starts design instead of being rejected', async () => {
    const root = join(process.cwd(), '.test-feature-concrete-ui-intent')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleFeature(
      createContext(root),
      CONCRETE_UI_INTENT,
      undefined,
      createToolContext(root, 'session-concrete-ui'),
    )

    expect(result).not.toContain('Same-Session Feature Switch Rejected')
    expect(result).not.toContain('already has an active feature')
    expect(result).not.toContain('Feature Identity Needed')
    expect(result).toContain('Feature Question')
    expect(result).toContain('menu-dialog-logout-about-intro-display')

    await rm(root, { recursive: true, force: true })
  })

  test('underivable request without an active feature is not reported as a feature switch', async () => {
    const root = join(process.cwd(), '.test-feature-underivable-no-active')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleFeature(
      createContext(root),
      UNDERIVABLE_INTENT,
      undefined,
      createToolContext(root, 'session-underivable-no-active'),
    )

    expect(result).not.toContain('Same-Session Feature Switch Rejected')
    expect(result).not.toContain('already has an active feature')
    expect(result).toContain('Feature Identity Needed')
    expect(result).toContain('concrete')

    await rm(root, { recursive: true, force: true })
  })

  test('vague instruction without an active feature is not reported as a feature switch', async () => {
    const root = join(process.cwd(), '.test-feature-vague-no-active-switch')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleFeature(
      createContext(root),
      GENERIC_WORKFLOW_INSTRUCTION,
      undefined,
      createToolContext(root, 'session-vague-no-active'),
    )

    expect(result).not.toContain('Same-Session Feature Switch Rejected')
    expect(result).toContain('Feature Identity Needed')

    await rm(root, { recursive: true, force: true })
  })

  test('a genuine switch away from an active feature is still rejected', async () => {
    const root = join(process.cwd(), '.test-feature-real-switch')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'feature', 'active.json'),
      JSON.stringify({
        bySessionID: {
          'session-real-switch': { feature: 'user-login', updatedAt: new Date().toISOString() },
        },
      }),
      'utf-8',
    )
    await writeFile(
      join(root, '.sisyphus', 'feature', 'user-login.json'),
      JSON.stringify({
        version: 3,
        feature: 'user-login',
        featureTitle: 'user login',
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
      }, null, 2),
      'utf-8',
    )

    const result = await handleFeature(
      createContext(root),
      '我想实现一个新的功能：支付功能',
      undefined,
      createToolContext(root, 'session-real-switch'),
    )

    expect(result).toContain('Same-Session Feature Switch Rejected')
    expect(result).toContain('already has an active feature')
    expect(result).toContain('user-login')

    await rm(root, { recursive: true, force: true })
  })
})
