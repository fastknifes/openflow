import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createToolBeforeHook, isImplementationTask, isVerificationTask } from '../../src/hooks/tool-before.js'
import type { OpenFlowContext } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

function createContext(): OpenFlowContext {
  return {
    directory: '/test/project',
    worktree: '/test/project',
    client: {},
    $: {},
    config: {
      ...defaultConfig,
    },
    enhancedPlans: new Set(),
  }
}

describe('isVerificationTask', () => {
  test('should detect verification by category', () => {
    expect(isVerificationTask({ category: 'test' })).toBe(true)
    expect(isVerificationTask({ category: 'verification' })).toBe(true)
    expect(isVerificationTask({ category: 'quality' })).toBe(true)
    expect(isVerificationTask({ category: 'review' })).toBe(true)
    expect(isVerificationTask({ category: 'implementation' })).toBe(false)
  })

  test('should require verification intent for oracle/momus subagent_type', () => {
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Design the architecture' })).toBe(false)
    expect(isVerificationTask({ subagent_type: 'momus', prompt: 'Review the plan structure' })).toBe(false)
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Assess architecture options' })).toBe(false)
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Evaluate the design' })).toBe(false)
    expect(isVerificationTask({ subagent_type: 'oracle' })).toBe(false)

    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Verify the implementation is correct' })).toBe(true)
    expect(isVerificationTask({ subagent_type: 'momus', prompt: 'Check the code quality' })).toBe(true)
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Run tests after implementation' })).toBe(true)
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Assess if work is complete' })).toBe(true)
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Evaluate whether tests pass' })).toBe(true)
    expect(isVerificationTask({ subagent_type: 'oracle', prompt: 'Check the build' })).toBe(true)

    expect(isVerificationTask({ subagent_type: 'sisyphus' })).toBe(false)
    expect(isVerificationTask({ subagent_type: 'prometheus' })).toBe(false)
  })

  test('should require keyword AND context for prompt-based detection', () => {
    expect(isVerificationTask({ prompt: 'verify the code' })).toBe(false)
    expect(isVerificationTask({ prompt: 'run tests before completion' })).toBe(true)
    expect(isVerificationTask({ prompt: 'check code after implementation' })).toBe(true)
    expect(isVerificationTask({ prompt: 'type check the code' })).toBe(true)
    expect(isVerificationTask({ prompt: 'run lint' })).toBe(false)
    expect(isVerificationTask({ prompt: 'implement feature' })).toBe(false)
  })

  test('should support expanded context patterns', () => {
    expect(isVerificationTask({ prompt: 'verify that the function works' })).toBe(true)
    expect(isVerificationTask({ prompt: 'check that all tests pass' })).toBe(true)
    expect(isVerificationTask({ prompt: 'confirm that build succeeds' })).toBe(true)
    expect(isVerificationTask({ prompt: 'run tests lsp_diagnostics on changed files' })).toBe(true)
    expect(isVerificationTask({ prompt: 'ensure passing tests' })).toBe(true)
  })

  test('should recognize build as verification keyword', () => {
    expect(isVerificationTask({ prompt: 'run build before completion' })).toBe(true)
    expect(isVerificationTask({ prompt: 'build command should pass' })).toBe(true)
    expect(isVerificationTask({ prompt: 'build the project' })).toBe(false)
  })

  test('should return false for undefined or null args', () => {
    expect(isVerificationTask(undefined)).toBe(false)
    expect(isVerificationTask({})).toBe(false)
  })

  test('should not trigger on general sisyphus tasks', () => {
    expect(isVerificationTask({
      prompt: 'Implement the user authentication feature according to plan',
      category: 'implementation',
    })).toBe(false)
  })
})

describe('isImplementationTask', () => {
  test('detects implementation prompts and categories', () => {
    expect(isImplementationTask({ prompt: 'Implement the user authentication feature' })).toBe(true)
    expect(isImplementationTask({ prompt: 'Fix the payment bug in src/payments.ts' })).toBe(true)
    expect(isImplementationTask({ category: 'deep', prompt: 'Refactor the auth module' })).toBe(true)
    expect(isImplementationTask({ category: 'quality', prompt: 'Check the build' })).toBe(false)
    expect(isImplementationTask({ prompt: 'Run tests before completion' })).toBe(false)
  })
})

describe('tool-before hook', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  test('does not block ordinary tools when soft brainstorm guidance is enabled', async () => {
    const ctx = createContext()
    const hook = createToolBeforeHook(ctx)

    await expect(hook(
      { tool: 'bash', sessionID: 'session-1', callID: 'call-1' },
      { args: { command: 'npm test' } }
    )).resolves.toBeUndefined()
  })

  test('injects implementation context requirements into implementation tasks', async () => {
    const testDir = join(process.cwd(), '.test-tool-before-handoff')
    tempDirs.push(testDir)

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'current', 'design', 'demo-feature'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'current', 'requirements', 'demo-feature'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'demo-feature.md'), '# plan', 'utf-8')

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
    }
    const hook = createToolBeforeHook(ctx)
    const output = {
      args: {
        category: 'deep',
        prompt: 'Implement feature using .sisyphus/plans/demo-feature.md and update code',
      },
    }

    await hook({ tool: 'task', sessionID: 'session-1', callID: 'call-1' }, output)

    const prompt = (output.args as { prompt: string }).prompt
    expect(prompt).toContain('## OpenFlow Implementation Context')
    expect(prompt).toContain('.sisyphus/plans/demo-feature.md')
    expect(prompt).toContain('skill(name="openflow-quality-gate", user_message="demo-feature")')
  })

  test('injects verification requirements into verification tasks', async () => {
    const ctx = createContext()
    const hook = createToolBeforeHook(ctx)
    const output = {
      args: {
        subagent_type: 'oracle',
        prompt: 'Verify the implementation is correct before completion',
      },
    }

    await hook({ tool: 'task', sessionID: 'session-2', callID: 'call-2' }, output)

    const prompt = (output.args as { prompt: string }).prompt
    expect(prompt).toContain('## OpenFlow Verification Requirements')
    expect(prompt).not.toContain('## OpenFlow Implementation Context')
  })

  test('injects archive verification reminder for archive prompts', async () => {
    const ctx = createContext()
    const hook = createToolBeforeHook(ctx)
    const output = {
      args: {
        category: 'deep',
        prompt: 'Prepare to archive the feature with final checks',
      },
    }

    await hook({ tool: 'task', sessionID: 'session-archive', callID: 'call-archive' }, output)

    const prompt = (output.args as { prompt: string }).prompt
    expect(prompt).toContain('OpenFlow Archive Verification Reminder')
  })
})
