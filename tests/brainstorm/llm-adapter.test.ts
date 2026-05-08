import { describe, expect, test } from 'bun:test'
import { RequirementModelSchema, createMinimalRequirementModel, resetIdCounter } from '../../src/phases/brainstorm/requirement-model.js'
import type { RequirementModel } from '../../src/phases/brainstorm/requirement-model.js'
import { NoOpSynthesizer, defaultSynthesizer } from '../../src/phases/brainstorm/llm-adapter.js'
import type { DesignSynthesizer } from '../../src/phases/brainstorm/llm-adapter.js'

describe('NoOpSynthesizer', () => {
  test('returns the same model object reference', async () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('test-feature')
    const synthesizer = new NoOpSynthesizer()
    const result = await synthesizer.synthesize(model)
    expect(result).toBe(model)
  })
})

describe('defaultSynthesizer', () => {
  test('is a NoOpSynthesizer instance', () => {
    expect(defaultSynthesizer).toBeInstanceOf(NoOpSynthesizer)
  })

  test('returns model unchanged', async () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('test-feature')
    const result = await defaultSynthesizer.synthesize(model)
    expect(result).toBe(model)
  })
})

describe('DesignSynthesizer interface', () => {
  test('can be implemented by a mock synthesizer', async () => {
    resetIdCounter()
    const original = createMinimalRequirementModel('test-feature')

    const mockSynthesizer: DesignSynthesizer = {
      async synthesize(model: RequirementModel): Promise<RequirementModel> {
        return { ...model, goals: [...model.goals, 'mock-enriched goal'] }
      },
    }

    const result = await mockSynthesizer.synthesize(original)
    expect(result.goals).toContain('mock-enriched goal')
    expect(result.feature).toBe('test-feature')
  })
})

describe('RequirementModelSchema validation on synthesizer output', () => {
  test('valid output passes schema parse', async () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('valid-feature')

    const mockSynthesizer: DesignSynthesizer = {
      async synthesize(model: RequirementModel): Promise<RequirementModel> {
        return { ...model, nonGoals: [...model.nonGoals, 'extra non-goal'] }
      },
    }

    const result = await mockSynthesizer.synthesize(model)
    const parsed = RequirementModelSchema.parse(result)
    expect(parsed.nonGoals).toContain('extra non-goal')
  })

  test('invalid output fails schema parse with Zod errors', async () => {
    resetIdCounter()
    const model = createMinimalRequirementModel('bad-feature')

    // This mock returns a model with empty feature string (violates .min(1))
    const badSynthesizer: DesignSynthesizer = {
      async synthesize(_model: RequirementModel): Promise<RequirementModel> {
        return { ...model, feature: '' }
      },
    }

    const result = await badSynthesizer.synthesize(model)
    expect(() => RequirementModelSchema.parse(result)).toThrow()
  })
})
