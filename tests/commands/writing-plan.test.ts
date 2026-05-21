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

  test('forbids automatic invocation from stuck feature or ultrawork flows', () => {
    const skill = getWritingPlanSkill()

    expect(skill.description).toContain('Use only when the user explicitly requests')
    expect(skill.content).toContain('Do NOT invoke this skill merely because `/openflow-feature` is active, stuck, incomplete, or has just generated design documents')
    expect(skill.content).toContain('Do NOT invoke this skill from brainstorm, ULW/ultrawork, or continuation flow unless the user explicitly asked for plan generation')
    expect(skill.content).toContain('do not create `plan.md` or `.sisyphus/plans/*.md`')
  })
})

describe('writing-plan dual-path contract', () => {
  test('command packet reports dual output paths: docs/changes/ primary and .sisyphus/plans/ OMO copy', async () => {
    const root = join(process.cwd(), '.test-wp-dual-path')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'test-contract-feature')

    expect(result).toContain('## OpenFlow Writing Plan Packet')
    expect(result).toContain('test-contract-feature')

    // Both paths present in the Plan Output Paths section
    const planPathsSection = result.substring(
      result.indexOf('### Plan Output Paths'),
      result.indexOf('### Plan Format Rules'),
    )

    // Primary path uses docs/changes/ pattern (may be within absolute path)
    expect(planPathsSection).toContain('Primary')
    expect(planPathsSection).toContain('docs')
    expect(planPathsSection).toContain('changes')
    expect(planPathsSection).toContain('test-contract-feature')
    expect(planPathsSection).toContain('plan.md')

    // OMO copy uses .sisyphus/plans/ pattern (may be within absolute path)
    expect(planPathsSection).toContain('OMO')
    expect(planPathsSection).toContain('.sisyphus')
    expect(planPathsSection).toContain('plans')
    expect(planPathsSection).toContain('test-contract-feature.md')

    // Both paths mention initial content identity between copies and execution-state divergence.
    expect(planPathsSection).toContain('identical')
    expect(planPathsSection).toContain('initial saved content')
    expect(planPathsSection).toContain('may diverge')

    await rm(root, { recursive: true, force: true })
  })

  test('command packet uses ## Tasks in format examples, not ## TODOs', async () => {
    const root = join(process.cwd(), '.test-wp-tasks-header')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'contract-tasks')

    // ## Tasks must appear in the format example
    expect(result).toContain('## Tasks')
    // ## TODOs must not be promoted
    expect(result).not.toContain('## TODOs')

    await rm(root, { recursive: true, force: true })
  })

  test('command packet does not contain forbidden subagent-dispatch wording', async () => {
    const root = join(process.cwd(), '.test-wp-no-forbidden')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'forbidden-check')

    // These phrases must not appear in the command packet
    const forbidden = [
      'maximum parallel execution',
      'one file per task',
      'dispatch each same-wave task as a subagent',
    ]
    for (const phrase of forbidden) {
      expect(result).not.toContain(phrase)
    }

    await rm(root, { recursive: true, force: true })
  })

  test('command packet includes openflow-quality-gate final verification instruction', async () => {
    const root = join(process.cwd(), '.test-wp-quality-gate')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'quality-gate-check')

    // The quality gate must be referenced as the final verification authority
    // This may be in the skill content, command packet, or both
    // For the command packet contract: the handoff note asserts execution handoff,
    // and the enhancer/verification path includes quality-gate.
    // At minimum, the packet must not instruct bypassing the quality gate.
    const lowerResult = result.toLowerCase()
    expect(lowerResult).not.toContain('skip quality gate')
    expect(lowerResult).not.toContain('/openflow-harden')
    expect(lowerResult).not.toContain('/openflow-verify')
    // Packet should reference that quality gate handles verification
    // (This assertion may be RED if the packet doesn't yet include quality-gate reference)
    expect(lowerResult).toContain('quality')

    await rm(root, { recursive: true, force: true })
  })

  test('skill clarifies dual-save identity only applies before execution state diverges', () => {
    const skill = getWritingPlanSkill()

    expect(skill.content).toContain('identical at initial save time')
    expect(skill.content).toContain('may diverge')
    expect(skill.content).toContain('execution-state copy')
    expect(skill.content).toContain('checked tasks or progress notes')
  })
})

describe('writing-plan config-based paths', () => {
  test('uses custom paths.changes and paths.plans from config', async () => {
    const root = join(process.cwd(), '.test-wp-custom-paths')
    await rm(root, { recursive: true, force: true })

    const customChanges = 'custom/changes'
    const customPlans = 'custom/plans'
    const ctx = createCtx(root, {
      paths: { changes: customChanges, plans: customPlans },
    } as Partial<OpenFlowConfig>)

    const result = await handleWritingPlan(ctx, 'custom-path-feature')

    // Verify the actual resolved paths contain the custom directories (escapeMarkdown doubles backslashes in output)
    expect(result).toContain('.test-wp-custom-paths\\\\custom\\\\changes\\\\custom-path-feature\\\\plan.md')
    expect(result).toContain('.test-wp-custom-paths\\\\custom\\\\plans\\\\custom-path-feature.md')

    await rm(root, { recursive: true, force: true })
  })
})

describe('writing-plan packet content contracts', () => {
  test('packet contains blocking clarification instruction', async () => {
    const root = join(process.cwd(), '.test-wp-blocking')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'blocking-check')

    expect(result).toContain('Blocking Clarification')
    expect(result).toContain('stop and ask clarifying questions')

    await rm(root, { recursive: true, force: true })
  })

  test('packet contains agent target section', async () => {
    const root = join(process.cwd(), '.test-wp-agent-target')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'agent-target-check')

    expect(result).toContain('Agent Target')
    expect(result).toContain('Prometheus')
    expect(result).toContain('OpenCode native')
    expect(result).toContain('plan')

    await rm(root, { recursive: true, force: true })
  })

  test('packet references openflow-quality-gate and not /openflow-verify', async () => {
    const root = join(process.cwd(), '.test-wp-quality-gate-ref')
    await rm(root, { recursive: true, force: true })

    const result = await handleWritingPlan(createCtx(root), 'quality-gate-ref')

    expect(result).toContain('openflow-quality-gate')
    expect(result).not.toContain('/openflow-verify')
    expect(result).toContain('Do not claim completion until the quality gate reports readiness')

    await rm(root, { recursive: true, force: true })
  })
})
