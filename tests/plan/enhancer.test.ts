import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { classifyVerificationFailure, enhancePlan } from '../../src/plan/enhancer.js'
import { createMinimalRequirementModel } from '../../src/phases/feature/requirement-model.js'
import { defaultConfig } from '../../src/types.js'

const TEST_ROOT = join(process.cwd(), '.test-enhancer')
const PLAN_DIR = join(TEST_ROOT, '.sisyphus', 'plans')
const PLAN_PATH = join(PLAN_DIR, 'demo-feature.md')

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1
}

describe('plan enhancer', () => {
  test('classifies verification failure categories', () => {
    expect(classifyVerificationFailure('secret leaked in test output')).toBe('security')
    expect(classifyVerificationFailure('design drift detected between code and docs')).toBe('consistency')
    expect(classifyVerificationFailure('test failed with assertion error')).toBe('quality')
  })

  test('enhancement is idempotent for verification section', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    const plan = `# Demo Plan

## TODOs

- [ ] Implement demo feature
`

    await writeFile(PLAN_PATH, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: true,
      },
    }

    const firstResult = await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const secondResult = await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    expect(firstResult).toBe(true)
    expect(secondResult).toBe(false)
    expect(countOccurrences(enhanced, '## Verification Phase')).toBe(1)

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('TDD expansion is no longer added to plans', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    const plan = `# Demo Plan With Implementation Tasks

## TODOs

- [ ] Implement demo feature
- [ ] Create authentication module
- [ ] Add API endpoint
`

    await writeFile(PLAN_PATH, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        enabled: true,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: false,
      },
    }

    await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    // TDD expansion has been removed; plans should NOT contain TDD sections
    expect(enhanced).not.toContain('## TDD Expanded Tasks')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('Verification Phase guidance section does not add - [ ] checkbox items', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    const plan = `# Demo Plan With Tasks
## TODOs

- [ ] Implement demo feature
- [ ] Add tests
`

    await writeFile(PLAN_PATH, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: true,
      },
    }

    await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    // Verify Verification Phase section was added
    expect(enhanced).toContain('## Verification Phase')

    // Extract just the Verification Phase section
    const verifyStart = enhanced.indexOf('## Verification Phase')
    const verifySection = enhanced.substring(verifyStart)

    // Contract: Verification guidance is procedural, not actionable plan tasks.
    // Security/Quality checks must NOT use - [ ] checkbox items.
    const checkboxCount = countOccurrences(verifySection, '- [ ]')
    expect(checkboxCount).toBe(0)

    // Contract: Verification Phase must reference openflow-quality-gate
    // as the final verification authority (may be RED until implementation)
    expect(verifySection).toContain('openflow-quality-gate')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('prefers structured sidecar design context when available', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    const designDir = join(TEST_ROOT, 'docs', 'changes', 'demo-feature')
    await mkdir(designDir, { recursive: true })

    await writeFile(PLAN_PATH, '# Demo Plan\n\n## TODOs\n\n- [ ] Implement demo feature\n', 'utf-8')
    await writeFile(join(designDir, 'design.md'), '# Design\n\n## Overview\n\nLegacy markdown should not win.\n', 'utf-8')

    const model = createMinimalRequirementModel('demo-feature')
    model.problemStatement = 'Use structured feature output to enrich the plan.'
    model.goals = ['Explain the problem clearly to the implementation agent']
    model.constraints = [
      {
        id: 'c-enhancer-sidecar',
        category: 'compatibility',
        severity: 'must',
        description: 'Keep markdown extraction as a fallback path',
        rationale: 'Legacy workspaces do not have sidecars',
        verificationMethod: 'Fallback tests still pass',
        sourceQuestionId: 'constraints',
      },
    ]
    model.acceptanceCriteria = [
      { id: 'ac-enhancer-sidecar', description: 'The plan includes acceptance criteria from the sidecar' },
    ]

    await writeFile(join(designDir, 'design.meta.json'), JSON.stringify(model, null, 2), 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: true,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: false,
      },
    }

    const result = await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    expect(result).toBe(true)
    expect(enhanced).toContain('## Design Context')
    expect(enhanced).toContain('Use structured feature output to enrich the plan.')
    expect(enhanced).toContain('Explain the problem clearly to the implementation agent')
    expect(enhanced).toContain('[MUST / compatibility] Keep markdown extraction as a fallback path')
    expect(enhanced).toContain('The plan includes acceptance criteria from the sidecar')
    expect(enhanced).not.toContain('Legacy markdown should not win.')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('enhances docs/changes plan.md with same behavior as .sisyphus/plans', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    const changePlanDir = join(TEST_ROOT, 'docs', 'changes', 'demo-feature')
    await mkdir(changePlanDir, { recursive: true })
    const changePlanPath = join(changePlanDir, 'plan.md')

    const plan = `# Demo Change Workspace Plan
## TODOs

- [ ] Implement demo feature
- [ ] Add tests
`

    await writeFile(changePlanPath, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: true,
      },
    }

    const result = await enhancePlan({
      planPath: changePlanPath,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(changePlanPath, 'utf-8')

    expect(result).toBe(true)
    expect(enhanced).toContain('## Verification Phase')
    expect(enhanced).toContain('openflow-quality-gate')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('adds budget warning when tasks exceed same-wave threshold', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    const plan = `# Large Plan
## TODOs

- [ ] Implement feature A
- [ ] Implement feature B
- [ ] Implement feature C
- [ ] Implement feature D
- [ ] Implement feature E
`

    await writeFile(PLAN_PATH, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: false,
      },
    }

    await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    expect(enhanced).toContain('## Plan Budget Warning')
    expect(enhanced).toContain('Same-wave tasks')
    expect(enhanced).toContain('Estimated execution units')
    // Budget warning section must NOT use checkbox syntax
    const warningStart = enhanced.indexOf('## Plan Budget Warning')
    const warningSection = enhanced.substring(warningStart)
    expect(countOccurrences(warningSection, '- [ ]')).toBe(0)

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('does not add budget warning when under thresholds', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    const plan = `# Small Plan
## TODOs

- [ ] Implement feature A
- [ ] Add tests for feature A
`

    await writeFile(PLAN_PATH, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: false,
      },
    }

    await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    expect(enhanced).not.toContain('## Plan Budget Warning')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('budget warning is idempotent and does not duplicate', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    const plan = `# Large Plan
## TODOs

- [ ] Implement feature A
- [ ] Implement feature B
- [ ] Implement feature C
- [ ] Implement feature D
- [ ] Implement feature E
`

    await writeFile(PLAN_PATH, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: false,
      },
    }

    const firstResult = await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const secondResult = await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    expect(firstResult).toBe(true)
    // Second call: warning already exists, no new enhancement
    expect(secondResult).toBe(false)
    expect(countOccurrences(enhanced, '## Plan Budget Warning')).toBe(1)

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('budget warning triggered by estimated execution units even when task count is low', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })
    await mkdir(PLAN_DIR, { recursive: true })

    // 7 implementation tasks = 21 estimated units (exceeds 20)
    const plan = `# High Effort Plan
## TODOs

- [ ] Implement feature A
- [ ] Implement feature B
- [ ] Implement feature C
- [ ] Implement feature D
- [ ] Implement feature E
- [ ] Implement feature F
- [ ] Implement feature G
`

    await writeFile(PLAN_PATH, plan, 'utf-8')

    const config = {
      ...defaultConfig,
      feature: {
        ...defaultConfig.feature,
        enabled: false,
      },
      tdd: {
        ...defaultConfig.tdd,
        enabled: false,
      },
      verification: {
        ...defaultConfig.verification,
        in_plan: false,
      },
    }

    await enhancePlan({
      planPath: PLAN_PATH,
      config,
      baseDir: TEST_ROOT,
    })

    const enhanced = await readFile(PLAN_PATH, 'utf-8')

    expect(enhanced).toContain('## Plan Budget Warning')

    await rm(TEST_ROOT, { recursive: true, force: true })
  })
})
