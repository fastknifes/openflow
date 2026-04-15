import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { classifyVerificationFailure, enhancePlan } from '../../src/plan/enhancer.js'
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
      brainstorming: {
        ...defaultConfig.brainstorming,
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
})
