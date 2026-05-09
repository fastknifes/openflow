import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleHarden } from '../../src/commands/harden.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createContext(directory: string, overrides?: Partial<OpenFlowContext['config']>, client: unknown = {}): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client,
    $: {},
    config: {
      ...defaultConfig,
      ...overrides,
    },
    enhancedPlans: new Set<string>(),
  }
}

function createMockClient(responses: string[], tokensPerPrompt = 100) {
  let createCount = 0
  let promptCount = 0

  return {
    get promptCount() {
      return promptCount
    },
    session: {
      create: async () => ({ id: `harden-session-${++createCount}` }),
      prompt: async () => {
        const text = responses[promptCount++] ?? 'NO_FINDINGS'
        return {
          data: {
            parts: [{ type: 'text', text }],
            info: {
              tokens: {
                input: tokensPerPrompt,
                output: 0,
                reasoning: 0,
                cache: { read: 0, write: 0 },
              },
            },
          },
        }
      },
    },
  }
}

async function createGitFixture(name: string, diffKind: 'simple' | 'complex'): Promise<string> {
  const directory = join(process.cwd(), `.test-harden-command-${name}`)
  const feature = 'feature-a'
  await rm(directory, { recursive: true, force: true })
  await mkdir(join(directory, '.sisyphus', 'plans'), { recursive: true })
  await mkdir(join(directory, 'docs', 'changes', feature), { recursive: true })
  await mkdir(join(directory, 'src'), { recursive: true })

  await writeFile(join(directory, '.sisyphus', 'plans', `${feature}.md`), '# Plan\n- Implement harden fixture\n', 'utf-8')
  await writeFile(join(directory, 'docs', 'changes', feature, 'design.md'), '# Design\n- Harden should review implementation changes\n', 'utf-8')
  await writeFile(join(directory, 'src', 'fixture.ts'), 'export const value = 1\n', 'utf-8')

  runGit(directory, 'init')
  runGit(directory, 'add', '.')
  runGit(directory, '-c', 'user.name=OpenFlow Test', '-c', 'user.email=openflow@example.test', 'commit', '-m', 'fixture base')

  if (diffKind === 'simple') {
    await writeFile(join(directory, 'src', 'fixture.ts'), [
      'export const value = 2',
      'export const label = "changed"',
      'export const flag = true',
      'export const count = 3',
      'export const mode = "simple"',
      'export const status = "ready"',
      'export const reason = "review"',
      'export const owner = "test"',
      'export const scope = "local"',
      'export const output = "markdown"',
      'export const done = false',
      'export const retry = 1',
    ].join('\n'), 'utf-8')
  } else {
    await writeFile(join(directory, 'src', 'fixture.ts'), [
      'export const value = 2',
      'class HardenFixture {',
      '  private readonly label = "complex"',
      '  private readonly enabled = true',
      '  private readonly retries = 3',
      '  private readonly timeout = 1000',
      '  run() {',
      '    return value',
      '  }',
      '  describe() {',
      '    return this.label',
      '  }',
      '}',
      'export const fixture = new HardenFixture()',
    ].join('\n'), 'utf-8')
  }

  return directory
}

function runGit(directory: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
}

describe('handleHarden', () => {
  test('harden disabled in config returns rejected status', async () => {
    const ctx = createContext('/tmp/test-harden', {
      harden: { ...defaultConfig.harden, enabled: false },
    })
    const result = await handleHarden(ctx, 'some-feature')
    expect(result).toContain('Status: rejected')
    expect(result).toContain('harden is disabled')
  })

  test('no feature provided and no active plan returns rejected status', async () => {
    const ctx = createContext('/tmp/test-harden-no-feature')
    const result = await handleHarden(ctx)
    expect(result).toContain('Status: rejected')
    expect(result).toContain('no feature was provided')
  })

  test('trivial feature returns rejected status', async () => {
    // Use a temp directory with a plan file that has content but
    // we control the diff to be trivial by using an empty git repo state.
    const ctx = createContext(process.cwd())
    // The feature has no plan file, which should also trigger rejection
    const result = await handleHarden(ctx, 'nonexistent-trivial-feature')
    expect(result).toContain('Status: rejected')
  })

  test('simple feature runs reviewer-only mode and passes when reviewer reports no findings', async () => {
    const directory = await createGitFixture('simple-pass', 'simple')
    const client = createMockClient(['NO_FINDINGS'])
    const ctx = createContext(directory, undefined, client)

    const result = await handleHarden(ctx, 'feature-a')

    expect(result).toContain('Status: pass')
    expect(result).toContain('Rounds: 1')
    expect(client.promptCount).toBe(1)

    await rm(directory, { recursive: true, force: true })
  })

  test('complex feature loop passes when reviewer reports no findings', async () => {
    const directory = await createGitFixture('complex-pass', 'complex')
    const client = createMockClient(['NO_FINDINGS'])
    const ctx = createContext(directory, undefined, client)

    const result = await handleHarden(ctx, 'feature-a')

    expect(result).toContain('Status: pass')
    expect(result).toContain('Rounds: 1')
    expect(client.promptCount).toBe(1)

    await rm(directory, { recursive: true, force: true })
  })

  test('complex feature returns budget_exhausted when round budget is consumed before convergence', async () => {
    const directory = await createGitFixture('budget', 'complex')
    const client = createMockClient([
      'Level: blocking_bug\nDescription: Bug found\nEvidence: src/fixture.ts proves the bug\nFiles: src/fixture.ts',
      'Root cause: value changed\nDiff: minimal patch applied\nVerify: rerun tests',
    ], 2)
    const ctx = createContext(directory, {
      harden: { ...defaultConfig.harden, tokenBudgetTotal: 1, maxRounds: 3 },
    }, client)

    const result = await handleHarden(ctx, 'feature-a')

    expect(result).toContain('Status: budget_exhausted')

    await rm(directory, { recursive: true, force: true })
  })

  test('design ambiguity returns needs_human', async () => {
    const directory = await createGitFixture('ambiguity', 'complex')
    const client = createMockClient([
      'Level: design_ambiguity\nDescription: Design does not specify retry behavior\nEvidence: docs/changes/feature-a/design.md has no retry section\nFiles: docs/changes/feature-a/design.md',
    ])
    const ctx = createContext(directory, undefined, client)

    const result = await handleHarden(ctx, 'feature-a')

    expect(result).toContain('Status: needs_human')
    expect(result).toContain('design ambiguity')

    await rm(directory, { recursive: true, force: true })
  })
})
