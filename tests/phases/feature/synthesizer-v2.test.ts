import { describe, test, expect } from 'bun:test'
import { RuleBasedSynthesizer } from '../../../src/phases/feature/synthesizer-v2.js'
import type { RequirementEvidence, EvidenceItem } from '../../../src/phases/feature/requirement-evidence.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(
  overrides: Partial<EvidenceItem> & { id: string; content: string },
): EvidenceItem {
  return {
    type: 'constraint',
    source: 'brainstorm-packet-v2',
    confidence: 'high',
    ...overrides,
  }
}

function makeEvidence(
  overrides: Partial<RequirementEvidence> & { feature: string },
): RequirementEvidence {
  return {
    sourceIntent: undefined,
    problems: [],
    goals: [],
    decisions: [],
    constraints: [],
    nonGoals: [],
    examples: [],
    risks: [],
    openQuestions: [],
    architectureNotes: [],
    integrationNotes: [],
    dataContractNotes: [],
    rawSources: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Empty / missing evidence — synthesizer must not fabricate
// ---------------------------------------------------------------------------

describe('RuleBasedSynthesizer — empty evidence', () => {
  const synthesizer = new RuleBasedSynthesizer()

  test('does not fabricate when evidence is empty', async () => {
    const evidence = makeEvidence({ feature: 'empty-feature' })
    const model = await synthesizer.synthesize(evidence)

    expect(model.goals).toEqual([])
    expect(model.successCriteria).toEqual([])
    expect(model.behaviorScenarios).toEqual([])
    expect(model.problem.desiredChange).toBe('Not specified')
    expect(model.testingStrategy).toBeUndefined()
    expect(model.architecture).toBeUndefined()
    expect(model.completeness).toBe('missing_goals')
  })

  test('does not inject harden DRG architecture from unrelated quality-gate format evidence', async () => {
    const evidence = makeEvidence({
      feature: 'generic-format-review',
      constraints: [
        makeItem({
          id: 'con-format-only',
          content: 'quality-gate must confirm output format compatibility before release',
        }),
      ],
    })

    const model = await synthesizer.synthesize(evidence)

    expect(model.architecture).toBeUndefined()
    expect(model.testingStrategy).toBeDefined()
    expect(model.testingStrategy!.integrationTests).not.toContain('DRG')
    expect(model.testingStrategy!.endToEndTests).not.toContain('harden')
  })

  test('does not generate reviewer/executor harden flow without reviewer and executor evidence', async () => {
    const evidence = makeEvidence({
      feature: 'harden-dag-gate-only',
      constraints: [
        makeItem({
          id: 'con-harden-gate-only',
          content: 'quality-gate creates a harden DAG and consumes readiness output',
        }),
      ],
    })

    const model = await synthesizer.synthesize(evidence)

    expect(model.architecture).toBeUndefined()
    expect(model.testingStrategy).toBeDefined()
    expect(model.testingStrategy!.integrationTests).not.toContain('DRG task chaining')
  })
})

// ---------------------------------------------------------------------------
// Harden DRG evidence — derived from constraints/decisions
// ---------------------------------------------------------------------------

describe('RuleBasedSynthesizer — harden DRG evidence', () => {
  const synthesizer = new RuleBasedSynthesizer()

  function buildHardenEvidence(): RequirementEvidence {
    return makeEvidence({
      feature: 'harden-drg',
      sourceIntent: 'Harden DRG workflow',
      constraints: [
        makeItem({
          id: 'con-001',
          content: 'reviewer 和 executor 通过对抗消息交换报告和修复',
        }),
        makeItem({
          id: 'con-002',
          content: '每个 harden 运行使用独立 DAG，通过 harden-uuid 隔离',
        }),
        makeItem({
          id: 'con-003',
          content: 'quality-gate 触发 harden DAG 创建并消费 harden_result',
        }),
        makeItem({
          id: 'con-004',
          content: '确保自动执行 harden 由 quality-gate 确认门控，超时 abort 保护',
        }),
        makeItem({
          id: 'con-005',
          content: 'harden 输出格式必须与现有格式兼容',
        }),
      ],
    })
  }

  test('derives goals covering adversarial flow, DAG isolation, quality-gate guard, and compatibility', async () => {
    const model = await synthesizer.synthesize(buildHardenEvidence())

    expect(model.goals.length).toBeGreaterThan(0)

    const goalText = model.goals.map((g) => g.description).join(' ')

    // reviewer/executor adversarial message flow
    expect(goalText).toMatch(/reviewer.*executor|executor.*reviewer|对抗|消息/iu)

    // isolated DAG
    expect(goalText).toMatch(/隔离|DAG|harden-uuid|独立/iu)

    // quality-gate / safety guard
    expect(goalText).toMatch(/quality-gate|门控|安全|防止|确保/iu)

    // output compatibility
    expect(goalText).toMatch(/兼容|输出格式|format/iu)
  })

  test('success criteria contain quality-gate trigger and format compatibility', async () => {
    const model = await synthesizer.synthesize(buildHardenEvidence())

    expect(model.successCriteria.length).toBeGreaterThan(0)

    const criteriaText = model.successCriteria.map((c) => c.outcome).join(' ')

    expect(criteriaText).toContain('quality-gate 触发 harden DAG 创建')
    expect(criteriaText).toContain('harden 输出格式必须与现有格式兼容')
  })

  test('behavior scenarios have all four expected titles', async () => {
    const model = await synthesizer.synthesize(buildHardenEvidence())

    expect(model.behaviorScenarios.length).toBeGreaterThan(0)

    const titles = model.behaviorScenarios.map((s) => s.title)

    expect(titles).toContain('reviewer and executor exchange adversarial findings')
    expect(titles).toContain('each harden run uses an isolated DAG')
    expect(titles).toContain('quality-gate starts and consumes the harden DAG')
    expect(titles).toContain('automatic harden execution is gated by quality-gate')
  })

  test('testing strategy exists', async () => {
    const model = await synthesizer.synthesize(buildHardenEvidence())

    expect(model.testingStrategy).toBeDefined()
    expect(model.testingStrategy!.unitTests).toBeTruthy()
  })

  test('architecture describes harden DRG components and boundaries only when full context exists', async () => {
    const model = await synthesizer.synthesize(buildHardenEvidence())

    expect(model.architecture).toBeDefined()

    const architecture = model.architecture!
    expect(architecture.components.map((component) => component.name)).toContain('quality-gate')
    expect(architecture.components.map((component) => component.name)).toContain('DRG harden DAG')
    expect(architecture.components.map((component) => component.name)).toContain('reviewer session')
    expect(architecture.components.map((component) => component.name)).toContain('executor session')
    expect(architecture.taskFlows.map((flow) => flow.title)).toContain('quality-gate harden DRG flow')
    expect(architecture.payloadSchemas.map((schema) => schema.name)).toContain('harden_result')

    const boundaryContracts = architecture.integrationBoundaries
      .map((boundary) => boundary.contract)
      .join(' ')

    expect(boundaryContracts).toMatch(/quality-gate owns start\/stop\/readiness/iu)
    expect(boundaryContracts).toMatch(/preserving DRG engine boundaries/iu)
  })

  test('completeness is complete', async () => {
    const model = await synthesizer.synthesize(buildHardenEvidence())

    expect(model.completeness).toBe('complete')
  })
})
