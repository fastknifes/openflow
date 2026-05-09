import { describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleWritingPlan } from '../../src/commands/writing-plan.js'
import { getWritingPlanSkill } from '../../src/skills/writing-plan-skill.js'
import { loadConfig } from '../../src/config.js'
import { parsePlanTasks } from '../../src/plan/parser.js'
import { defaultConfig, type OpenFlowConfig, type OpenFlowContext } from '../../src/types.js'

function createCtx(dir: string, overrides?: Partial<OpenFlowConfig>): OpenFlowContext {
  return {
    directory: dir,
    worktree: dir,
    client: {},
    $: {},
    config: overrides
      ? { ...defaultConfig, ...overrides, writingPlan: { ...defaultConfig.writingPlan, ...overrides.writingPlan } }
      : { ...defaultConfig },
    enhancedPlans: new Set(),
  }
}

describe('writing-plan command', () => {
  test('existing-design: returns packet with design context', async () => {
    const root = join(process.cwd(), '.test-wp-existing')
    await rm(root, { recursive: true, force: true })

    const designDir = join(root, 'docs', 'changes', '2026-05-07-user-login')
    await mkdir(designDir, { recursive: true })
    await writeFile(
      join(designDir, 'design.md'),
      '# user-login Design\n\n## Overview\n\nAllow users to log in with email and password.\n\n## Architecture\n\nJWT-based authentication with refresh tokens.\n',
      'utf-8',
    )

    const result = await handleWritingPlan(createCtx(root), 'user-login')

    expect(result).toContain('### design.md')
    expect(result).toContain('JWT-based authentication')
    expect(result).toContain('.sisyphus')
    expect(result).toContain('user-login.md')
    expect(result).toContain('## Tasks')
    expect(result).toContain('- [ ]')
    expect(result).toContain('Do NOT execute')

    await rm(root, { recursive: true, force: true })
  })

  test('missing-design: returns warning but still valid packet', async () => {
    const root = join(process.cwd(), '.test-wp-missing')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'no-design-feature')

    expect(result).toContain('No design documents found')
    expect(result).toContain('.sisyphus')
    expect(result).toContain('no-design-feature.md')
    expect(result).toContain('## Tasks')

    await rm(root, { recursive: true, force: true })
  })

  test('sanitizes-feature: capital letters and symbols become lowercase-dashed', async () => {
    const root = join(process.cwd(), '.test-wp-sanitize')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'User Login!!')

    expect(result).toContain('user-login.md')
    // The raw "User Login!!" should not appear in a path context
    const pathLines = result.split('\n').filter((l) => l.includes('.sisyphus'))
    expect(pathLines.some((l) => l.includes('User Login'))).toBe(false)

    await rm(root, { recursive: true, force: true })
  })

  test('disabled-config: returns disabled message', async () => {
    const root = join(process.cwd(), '.test-wp-disabled')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(
      createCtx(root, { writingPlan: { enabled: false } } as Partial<OpenFlowConfig>),
      'some-feature',
    )

    expect(result).toContain('Writing Plan Disabled')
    expect(result).not.toContain('.sisyphus')

    await rm(root, { recursive: true, force: true })
  })
})

describe('writing-plan config loading', () => {
  test('accepts valid writingPlan.enabled', () => {
    const cfg = loadConfig({ openflow: { writingPlan: { enabled: false } } })
    expect(cfg.writingPlan.enabled).toBe(false)
  })

  test('rejects invalid writingPlan.enabled and falls back to default', () => {
    // Passing an invalid type should trigger the validation path
    // loadConfig will warn and return defaults if validateConfigValue fails
    const cfg = loadConfig({ openflow: { writingPlan: { enabled: 123 } } })
    expect(cfg.writingPlan.enabled).toBe(true) // default
  })
})

describe('writing-plan skill content', () => {
  test('has correct name and required workflow instructions', () => {
    const skill = getWritingPlanSkill()

    expect(skill.name).toBe('openflow-writing-plan')
    expect(skill.description).toContain('development plan')
    expect(skill.content).toContain('Step 1')
    expect(skill.content).toContain('Step 7')
    expect(skill.content).toContain('self-check')
    expect(skill.content).toContain('overwrite')
    expect(skill.content).toContain('Do not execute')
    expect(skill.content).toContain('Do not create or suggest')
    expect(skill.content).toContain('parallel')
  })
})

describe('writing-plan format contract', () => {
  test('parsePlanTasks recognizes ## Tasks with checkbox items', () => {
    const fixture = [
      '## Tasks',
      '',
      '- [ ] Create src/foo.ts with foo function',
      '- [ ] Add test for foo in tests/foo.test.ts',
      '- [ ] Wire foo into main export',
    ].join('\n')

    const tasks = parsePlanTasks(fixture)
    expect(tasks.length).toBeGreaterThan(0)
  })
})
