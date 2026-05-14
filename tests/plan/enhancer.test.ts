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
})
