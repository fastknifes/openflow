import { describe, expect, test } from 'bun:test'
import { buildRequirementModel } from '../../../src/phases/feature/constraint-derivation.js'
import { renderDesignDocument } from '../../../src/phases/feature/design-renderer.js'
import { defaultSynthesizer } from '../../../src/phases/feature/llm-adapter.js'
import { RequirementModelSchema, type RequirementModel } from '../../../src/phases/feature/requirement-model.js'

const FEATURE = 'user-dashboard'
const ANSWERS = {
  problem: '用户需要实时聚合数据看板以便快速决策',
  'target-users': '内部开发者',
  scope: 'new-feature',
  priority: '快速上线',
  constraints: '兼容现有系统, 需要支持导出PDF功能',
} as const

const REQUIRED_SECTIONS = [
  '## Human Consensus Summary',
  '## Identity And Assumptions',
  '## Overview',
  '## Problem',
  '## Goals',
  '## Non-Goals',
  '## Behavior Alignment',
  '## Design Constraints',
  '## Success Criteria',
  '## Risks And Mitigations',
  '## Testing Strategy',
]

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('brainstorm integration — constraint-centric pipeline', () => {
  test('complete flow: answers → model derivation → synthesis → validation → render → sidecar roundtrip', async () => {
    // Phase 1: build the requirement model from raw answers
    const seedModel = buildRequirementModel(FEATURE, ANSWERS)

    // Phase 2: LLM synthesis (default no-op synthesizer, model unchanged)
    const synthesizedModel = await defaultSynthesizer.synthesize(seedModel)

    // Phase 3: validate with schema
    const validatedModel = RequirementModelSchema.parse(synthesizedModel)

    // Phase 4: render design.md
    const markdown = renderDesignDocument(validatedModel)

    // ---- Design.md assertions ----

    // Title and feature name
    expect(markdown).toContain(`# ${FEATURE} - Design`)

    // Every required section heading appears exactly once
    for (const heading of REQUIRED_SECTIONS) {
      expect(markdown.match(new RegExp(`^${escapeRegExp(heading)}$`, 'gm'))).toHaveLength(1)
    }

    // Problem statement flows through from answers
    expect(markdown).toContain('实时聚合数据看板')

    // Target users appear in Overview
    expect(markdown).toContain('Target users: 内部开发者')

    // Goals reflect the answers
    expect(markdown).toContain('- Solve: 用户需要实时聚合数据看板以便快速决策')
    expect(markdown).toContain('- Serve target users: 内部开发者')
    expect(markdown).toContain('- Honor priority: 快速上线')

    // Non-goals present
    expect(markdown).toContain('- Unrelated product areas or workflows')
    expect(markdown).toContain('- Reworking existing behavior beyond what the new feature needs')

    // Scope boundary in Overview
    expect(markdown).toContain(`In scope: ${FEATURE} new-feature`)
    // Overview joins out-of-scope items with semicolons on one line
    expect(markdown).toContain('Nice-to-have additions that delay first delivery')
    expect(markdown).toContain('Rewriting unrelated existing workflows')

    // ---- Constraints with severity tags ----

    // Mapped constraints from "快速上线" priority
    expect(markdown).toContain('- [must] Minimize scope so the first release can ship quickly')

    // Mapped constraints from "兼容现有系统"
    expect(markdown).toContain('- [must] Preserve compatibility guarantees with existing systems and interfaces')

    // Mapped constraints from "new-feature" scope
    expect(markdown).toContain('- [should] Keep the implementation additive and focused on the new capability')

    // Custom constraint preserved as free-text
    expect(markdown).toContain('- [should] 需要支持导出PDF功能')

    // ---- Success Criteria (acceptance criteria checklists) ----
    expect(markdown).toContain(
      `- [ ] ${FEATURE} addresses the stated problem: 用户需要实时聚合数据看板以便快速决策`
    )
    expect(markdown).toContain(`- [ ] ${FEATURE} works for the target users: 内部开发者`)
    expect(markdown).toContain(`- [ ] ${FEATURE} implementation reflects the selected priority: 快速上线`)
    expect(markdown).toContain(`- [ ] ${FEATURE} respects the stated constraint: 兼容现有系统`)
    expect(markdown).toContain(`- [ ] ${FEATURE} respects the stated constraint: 需要支持导出PDF功能`)

    // Testing strategy references priority and constraints
    expect(markdown).toContain('## Testing Strategy')
    expect(markdown).toContain('快速上线')
    expect(markdown).toContain('兼容现有系统')
    expect(markdown).toContain('需要支持导出PDF功能')

    // ---- Sidecar (design.meta.json) roundtrip ----
    // Simulate what generateDesignDocument writes to disk
    const sidecarJson = JSON.stringify(validatedModel, null, 2)
    const rehydrated = JSON.parse(sidecarJson) as unknown
    const revalidated = RequirementModelSchema.parse(rehydrated)

    // Roundtrip: model → JSON → parse → schema-validate → equals original model
    expect(revalidated).toEqual(validatedModel)

    // Confirm deep structural equality on key fields
    expect(revalidated.feature).toBe(FEATURE)
    expect(revalidated.problemStatement).toBe('用户需要实时聚合数据看板以便快速决策')
    expect(revalidated.targetUsers).toBe('内部开发者')
    expect(revalidated.constraints).toHaveLength(validatedModel.constraints.length)
    expect(revalidated.acceptanceCriteria).toHaveLength(validatedModel.acceptanceCriteria.length)
    expect(revalidated.goals).toEqual(validatedModel.goals)
    expect(revalidated.nonGoals).toEqual(validatedModel.nonGoals)
  })

  test('custom-only constraints without mapped priority produce valid design with no mapped constraints', async () => {
    const customOnlyAnswers = {
      problem: 'A custom problem',
      'target-users': '终端用户',
      scope: 'enhancement',
      priority: '易维护',
      constraints: '纯自定义约束无映射',
    } as const

    const seedModel = buildRequirementModel('custom-feature', customOnlyAnswers)
    const synthesizedModel = await defaultSynthesizer.synthesize(seedModel)
    const validatedModel = RequirementModelSchema.parse(synthesizedModel)
    const markdown = renderDesignDocument(validatedModel)

    // All sections present
    for (const heading of REQUIRED_SECTIONS) {
      expect(markdown.match(new RegExp(`^${escapeRegExp(heading)}$`, 'gm'))).toHaveLength(1)
    }

    // Custom constraint is preserved
    expect(markdown).toContain('- [should] 纯自定义约束无映射')

    // Severity tags include mapped ones from 易维护 priority
    expect(markdown).toContain('[should] Favor code clarity')

    // Sidecar roundtrip still works
    const rehydrated = JSON.parse(JSON.stringify(validatedModel)) as unknown
    const revalidated = RequirementModelSchema.parse(rehydrated)
    expect(revalidated).toEqual(validatedModel)
  })

  test('synthesizer enrichment is preserved through pipeline', async () => {
    // Simulate an LLM-powered synthesizer that adds risks and expectedSymbols
    const enrichedSynthesizer = {
      synthesize: async (model: RequirementModel): Promise<RequirementModel> => ({
        ...model,
        risks: [
          {
            description: 'Integration surfaces may change during rollout',
            mitigation: 'Version the endpoint and keep a deprecation window',
          },
        ],
        expectedSymbols: [
          { name: 'DashboardController', kind: 'class' as const, module: 'src/controllers/dashboard.ts' },
        ],
        expectedModules: [
          { path: 'src/controllers/dashboard.ts', purpose: 'Handle dashboard HTTP requests' },
        ],
        synthesis: { source: 'llm-enrichment', summary: 'Enriched by test synthesizer' },
      }),
    }

    const seedModel = buildRequirementModel('enriched-feature', ANSWERS)
    const enrichedModel = await enrichedSynthesizer.synthesize(seedModel)
    const validatedModel = RequirementModelSchema.parse(enrichedModel)
    const markdown = renderDesignDocument(validatedModel)

    // LLM-enriched risks appear
    expect(markdown).toContain('Integration surfaces may change during rollout')
    expect(markdown).toContain('Version the endpoint')

    // Implementation-oriented enrichment stays in sidecar metadata, not default design prose
    expect(markdown).not.toContain('### Component: Handle dashboard HTTP requests')
    expect(markdown).not.toContain('DashboardController')
    expect(markdown).not.toContain('Enriched by test synthesizer')

    // Sidecar roundtrip
    const rehydrated = JSON.parse(JSON.stringify(validatedModel)) as unknown
    const revalidated = RequirementModelSchema.parse(rehydrated)
    expect(revalidated).toEqual(validatedModel)
    expect(revalidated.risks).toHaveLength(1)
    expect(revalidated.expectedSymbols).toHaveLength(1)
    expect(revalidated.synthesis).toEqual({ source: 'llm-enrichment', summary: 'Enriched by test synthesizer' })
  })

  test('derived model is deterministic for the same answers', async () => {
    const model1 = await defaultSynthesizer.synthesize(buildRequirementModel('det-feature', ANSWERS))
    const model2 = await defaultSynthesizer.synthesize(buildRequirementModel('det-feature', ANSWERS))

    // Deep equality — constraint IDs must match
    expect(RequirementModelSchema.parse(model1)).toEqual(RequirementModelSchema.parse(model2))
  })
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
