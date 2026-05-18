import { describe, expect, test } from 'bun:test'
import {
  createMinimalRequirementModel,
  RequirementModelSchema,
  resetIdCounter,
} from '../../../src/phases/feature/requirement-model.js'
import {
  createInitialFeatureSession,
  normalizeFeatureSession,
  type FeatureSession,
} from '../../../src/phases/feature/state-machine.js'

describe('brainstorm session migration', () => {
  test('migrates a v2 session with answers into a v3 session with requirementModel', () => {
    const answers = {
      problem: 'Reduce repeated login prompts',
      'target-users': '内部开发者',
      scope: 'new-feature',
      priority: '风险最小',
      constraints: '兼容现有系统',
    } satisfies FeatureSession['answers']

    const session = normalizeFeatureSession('user-login', {
      version: 2,
      feature: 'user-login',
      workflowState: 'ready_to_generate',
      pendingQuestionId: null,
      askedQuestionIds: ['problem', 'target-users', 'scope', 'priority', 'constraints'],
      answers,
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(session.version).toBe(3)
    expect(session.answers).toEqual(answers)
    expect(session.requirementModel).toBeDefined()
    expect(RequirementModelSchema.parse(session.requirementModel)).toEqual(session.requirementModel)
    expect(session.requirementModel?.feature).toBe('user-login')
    expect(session.requirementModel?.constraints.length).toBeGreaterThan(0)
  })

  test('preserves an existing v3 requirementModel without re-deriving it', () => {
    resetIdCounter()
    const existingModel = createMinimalRequirementModel('user-login')

    const session = normalizeFeatureSession('user-login', {
      version: 3,
      feature: 'user-login',
      workflowState: 'collecting',
      pendingQuestionId: 'priority',
      askedQuestionIds: ['problem'],
      answers: {
        problem: 'Reduce repeated login prompts',
      },
      requirementModel: existingModel,
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(session.version).toBe(3)
    expect(session.requirementModel).toBe(existingModel)
    expect(session.requirementModel?.constraints[0]?.id).toBe('c-0001')
    expect(session.requirementModel?.acceptanceCriteria[0]?.id).toBe('ac-0002')
  })

  test('creates new v3 sessions without a requirementModel yet', () => {
    const session = createInitialFeatureSession('user-login')

    expect(session.version).toBe(3)
    expect(session.requirementModel).toBeUndefined()
    expect(session.pendingQuestionId).toBe('problem')
    expect(session.workflowState).toBe('collecting')
  })

  test('derives a requirementModel for v3 sessions when it is missing', () => {
    const answers = {
      problem: 'Reduce repeated login prompts',
      'target-users': '内部开发者',
    } satisfies FeatureSession['answers']

    const session = normalizeFeatureSession('user-login', {
      version: 3,
      feature: 'user-login',
      workflowState: 'collecting',
      pendingQuestionId: 'scope',
      askedQuestionIds: ['problem', 'target-users'],
      answers,
      generatedDocs: [],
      generationAttemptCount: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(session.version).toBe(3)
    expect(session.answers).toEqual(answers)
    expect(session.requirementModel).toBeDefined()
    expect(session.requirementModel?.problemStatement).toBe('Reduce repeated login prompts')
    expect(session.requirementModel?.targetUsers).toBe('内部开发者')
  })
})
