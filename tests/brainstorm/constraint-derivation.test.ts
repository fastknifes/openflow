import { describe, expect, test } from 'bun:test'
import { buildRequirementModel, deriveConstraints } from '../../src/phases/brainstorm/constraint-derivation.js'
import { RequirementModelSchema } from '../../src/phases/brainstorm/requirement-model.js'

describe('deriveConstraints', () => {
  test('maps each Chinese priority and constraint label to the expected derived constraints', () => {
    const fastLaunch = deriveConstraints({ priority: '快速上线' })
    expect(fastLaunch).toHaveLength(1)
    expect(fastLaunch[0]?.description).toContain('Minimize scope')

    const maintainable = deriveConstraints({ priority: '易维护' })
    expect(maintainable).toHaveLength(1)
    expect(maintainable[0]?.description).toContain('code clarity')

    const extensible = deriveConstraints({ priority: '可扩展' })
    expect(extensible).toHaveLength(1)
    expect(extensible[0]?.description).toContain('extension points')

    const lowRisk = deriveConstraints({ priority: '风险最小' })
    expect(lowRisk.map((constraint) => constraint.description)).toEqual([
      'Keep a rollback path available for the change',
      'Keep the change scope narrow to reduce regression surface area',
      'Protect existing behavior with explicit regression coverage',
    ])

    const compatibility = deriveConstraints({ constraints: '兼容现有系统' })
    expect(compatibility).toHaveLength(1)
    expect(compatibility[0]?.description).toContain('compatibility guarantees')

    const minimalChange = deriveConstraints({ constraints: '最小改动' })
    expect(minimalChange).toHaveLength(1)
    expect(minimalChange[0]?.description).toContain('module boundary constraints')

    const performance = deriveConstraints({ constraints: '性能要求' })
    expect(performance).toHaveLength(1)
    expect(performance[0]?.description).toContain('performance thresholds')

    const deliveryTime = deriveConstraints({ constraints: '交付时间' })
    expect(deliveryTime).toHaveLength(1)
    expect(deliveryTime[0]?.category).toBe('time')
  })

  test('supports english scope labels', () => {
    const newFeature = deriveConstraints({ scope: 'new-feature' })
    expect(newFeature).toHaveLength(1)
    expect(newFeature[0]).toMatchObject({
      sourceQuestionId: 'scope',
      category: 'scope',
      description: 'Keep the implementation additive and focused on the new capability',
    })

    const enhancement = deriveConstraints({ scope: 'enhancement' })
    expect(enhancement).toHaveLength(1)
    expect(enhancement[0]?.description).toContain('targeted existing behavior')
  })

  test('preserves custom free-text constraints with source metadata', () => {
    const constraints = deriveConstraints({ constraints: '需要支持灰度发布' })
    expect(constraints).toHaveLength(1)
    expect(constraints[0]).toMatchObject({
      id: 'd-0001',
      sourceQuestionId: 'constraints',
      description: '需要支持灰度发布',
    })
  })

  test('returns an empty array for missing answers', () => {
    expect(deriveConstraints({})).toEqual([])
  })

  test('is deterministic for the same input', () => {
    const answers = {
      scope: 'enhancement',
      priority: '风险最小',
      constraints: '性能要求, 需要支持灰度发布',
    } as const

    expect(deriveConstraints(answers)).toEqual(deriveConstraints(answers))
  })
})

describe('buildRequirementModel', () => {
  test('assembles a complete RequirementModel that passes schema validation', () => {
    const answers = {
      problem: '提升效率',
      'target-users': '内部开发者',
      scope: 'new-feature',
      priority: '快速上线',
      constraints: '兼容现有系统, 需要支持灰度发布',
    } as const

    const model = buildRequirementModel('feature-60', answers)
    const parsed = RequirementModelSchema.parse(model)

    expect(parsed.feature).toBe('feature-60')
    expect(parsed.problemStatement).toBe('提升效率')
    expect(parsed.targetUsers).toBe('内部开发者')
    expect(parsed.constraints.map((constraint) => constraint.id)).toEqual([
      'd-0001',
      'd-0002',
      'd-0003',
      'd-0004',
    ])
    expect(parsed.scopeBoundary.inScope).toContain('feature-60 new-feature')
    expect(parsed.goals).toContain('Solve: 提升效率')
    expect(parsed.acceptanceCriteria.length).toBeGreaterThan(0)
  })
})
