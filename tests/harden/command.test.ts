import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
  const directory = await mkdtemp(join(tmpdir(), `openflow-harden-command-${name}-`))
  const feature = 'feature-a'
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

async function removeFixture(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) throw error
      await Bun.sleep(50 * (attempt + 1))
    }
  }
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

  test('simple feature runs reviewer and executor once with disposition', async () => {
    const directory = await createGitFixture('simple-pass', 'simple')
    try {
      const client = createMockClient(['NO_FINDINGS'])
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      expect(result).toContain('Status: pass')
      expect(result).toContain('Rounds: 1')
      // Simple mode now creates Reviewer + Executor sessions (2 prompts)
      expect(client.promptCount).toBe(2)
    } finally {
      await removeFixture(directory)
    }
  })

  test('complex feature loop passes when reviewer reports no findings', async () => {
    const directory = await createGitFixture('complex-pass', 'complex')
    try {
      const client = createMockClient(['NO_FINDINGS'])
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      expect(result).toContain('Status: pass')
      expect(result).toContain('Rounds: 1')
      expect(client.promptCount).toBe(1)
    } finally {
      await removeFixture(directory)
    }
  })

  test('complex feature completes rounds normally without token budget hard-stop', async () => {
    const directory = await createGitFixture('budget', 'complex')
    try {
      const client = createMockClient([
        'Level: blocking_bug\nDescription: Bug found\nEvidence: src/fixture.ts proves the bug\nFiles: src/fixture.ts',
        'Root cause: value changed\nDiff: minimal patch applied\nVerify: rerun tests',
      ], 2)
      // New behavior: no tokenBudgetTotal; only maxRounds limits execution.
      // Token consumption is reported, not used as a hard-stop.
      const ctx = createContext(directory, {
        harden: { ...defaultConfig.harden, maxRounds: 3 },
      }, client)

      const result = await handleHarden(ctx, 'feature-a')

      // Should NOT contain budget_exhausted — tokens are reported, not a hard-stop
      expect(result).not.toContain('budget_exhausted')
      // Should contain token consumption report instead
      expect(result).toContain('Total tokens consumed')
      // Status should be one of the normal terminal states
      expect(result).toMatch(/Status: (pass|needs_human|review_inconclusive|executor_blocked|max_rounds_reached)/)
    } finally {
      await removeFixture(directory)
    }
  })

  test('per-round reviewer overage completes normally without budget_exhausted', async () => {
    const directory = await createGitFixture('per-round-reviewer', 'complex')
    try {
      const client = createMockClient([
        'Level: blocking_bug\nDescription: Bug found\nEvidence: src/fixture.ts proves the bug\nFiles: src/fixture.ts',
      ], 200)
      // New behavior: no tokenBudgetPerRound; rounds complete normally regardless of token count.
      // Token consumption is reported, not used as a hard-stop.
      const ctx = createContext(directory, {
        harden: { ...defaultConfig.harden },
      }, client)

      const result = await handleHarden(ctx, 'feature-a')

      // Should NOT contain budget_exhausted — tokens are reported, not a hard-stop
      expect(result).not.toContain('budget_exhausted')
      // Should contain token consumption report
      expect(result).toContain('Total tokens consumed')
    } finally {
      await removeFixture(directory)
    }
  })

  test('per-round executor overage completes normally without budget_exhausted', async () => {
    const directory = await createGitFixture('per-round-executor', 'complex')
    try {
      // Use per-call token counts: reviewer under 200 budget, executor over 200 budget
      const perCallTokens = [150, 250]
      let createCount = 0
      let promptIndex = 0
      const responses = [
        'Level: blocking_bug\nDescription: Bug found\nEvidence: src/fixture.ts proves the bug\nFiles: src/fixture.ts',
        'Root cause: value changed\nDiff: minimal patch applied\nVerify: rerun tests',
      ]
      const client = {
        get promptCount() { return promptIndex },
        session: {
          create: async () => ({ id: `harden-session-${++createCount}` }),
          prompt: async () => {
            const idx = promptIndex++
            const text = responses[idx] ?? 'NO_FINDINGS'
            return {
              data: {
                parts: [{ type: 'text', text }],
                info: {
                  tokens: {
                    input: perCallTokens[idx] ?? 100,
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
      // New behavior: no tokenBudgetPerRound; rounds complete normally regardless of token count.
      const ctx = createContext(directory, {
        harden: { ...defaultConfig.harden },
      }, client)

      const result = await handleHarden(ctx, 'feature-a')

      // Should NOT contain budget_exhausted — tokens are reported, not a hard-stop
      expect(result).not.toContain('budget_exhausted')
      // Should contain token consumption report
      expect(result).toContain('Total tokens consumed')
    } finally {
      await removeFixture(directory)
    }
  })

  test('loop continues up to maxRounds without token budget constraints', async () => {
    const directory = await createGitFixture('per-round-under', 'complex')
    try {
      const client = createMockClient([
        'Level: blocking_bug\nDescription: Bug found\nEvidence: src/fixture.ts proves the bug\nFiles: src/fixture.ts',
        'Root cause: value changed\nDiff: minimal patch applied\nVerify: rerun tests',
        'NO_FINDINGS',
      ], 100)
      // New behavior: no token budget config; only maxRounds controls loop.
      const ctx = createContext(directory, {
        harden: { ...defaultConfig.harden },
      }, client)

      const result = await handleHarden(ctx, 'feature-a')

      expect(result).toContain('Status: pass')
      expect(result).toContain('Rounds: 2')
      // Should contain token consumption report
      expect(result).toContain('Total tokens consumed')
    } finally {
      await removeFixture(directory)
    }
  })

  test('agent prompt payload is direct reviewer content without task invocation wrapper', async () => {
    const directory = await createGitFixture('prompt-dedup', 'complex')
    try {
      const capturedTexts: string[] = []
      let createCount = 0
      let promptCount = 0
      const client = {
        session: {
          create: async () => ({ id: `harden-session-${++createCount}` }),
          prompt: async (options: unknown) => {
            const payload = options && typeof options === 'object' ? options as { body?: { parts?: Array<{ text?: string }> } } : {}
            const text = payload.body?.parts?.[0]?.text
            if (text) capturedTexts.push(text)
            promptCount += 1
            return {
              data: {
                parts: [{ type: 'text', text: 'NO_FINDINGS' }],
                info: {
                  tokens: {
                    input: 100,
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
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      expect(result).toContain('Status: pass')
      expect(promptCount).toBe(1)
      expect(capturedTexts[0]).not.toContain('task(')
      expect(capturedTexts[0]).not.toContain('prompt="See detailed prompt below."')
      expect(capturedTexts[0]).toContain('You are the OpenFlow harden reviewer.')
      expect(capturedTexts[0].match(/## Git Diff/g)?.length).toBe(1)
    } finally {
      await removeFixture(directory)
    }
  })

  test('default harden scopes reviewer diff to files referenced by the feature plan', async () => {
    const directory = await createGitFixture('scoped-diff', 'complex')
    try {
      await writeFile(join(directory, '.sisyphus', 'plans', 'feature-a.md'), [
        '# Plan',
        '- Implement harden fixture in `src/fixture.ts`.',
      ].join('\n'), 'utf-8')
      await writeFile(join(directory, 'src', 'unrelated.ts'), 'export const unrelated = "base"\n', 'utf-8')
      runGit(directory, 'add', '.')
      runGit(directory, '-c', 'user.name=OpenFlow Test', '-c', 'user.email=openflow@example.test', 'commit', '-m', 'add unrelated base')
      await writeFile(join(directory, 'src', 'fixture.ts'), 'export const value = 3\nexport function scopedChange() { return value }\n', 'utf-8')
      await writeFile(join(directory, 'src', 'unrelated.ts'), 'export const unrelated = "changed"\nexport function unrelatedChange() { return unrelated }\n', 'utf-8')

      const capturedTexts: string[] = []
      let createCount = 0
      const client = {
        session: {
          create: async () => ({ id: `harden-session-${++createCount}` }),
          prompt: async (options: unknown) => {
            const payload = options && typeof options === 'object' ? options as { body?: { parts?: Array<{ text?: string }> } } : {}
            const text = payload.body?.parts?.[0]?.text
            if (text) capturedTexts.push(text)
            return {
              data: {
                parts: [{ type: 'text', text: 'NO_FINDINGS' }],
                info: {
                  tokens: {
                    input: 100,
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
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      expect(result).toContain('Status: pass')
      expect(capturedTexts[0]).toContain('src/fixture.ts')
      expect(capturedTexts[0]).toContain('# omitted: src/unrelated.ts')
      expect(capturedTexts[0]).not.toContain('unrelatedChange')
    } finally {
      await removeFixture(directory)
    }
  })

  test('full harden keeps unrelated diff blocks for explicit full review', async () => {
    const directory = await createGitFixture('full-diff', 'complex')
    try {
      await writeFile(join(directory, '.sisyphus', 'plans', 'feature-a.md'), [
        '# Plan',
        '- Implement harden fixture in `src/fixture.ts`.',
      ].join('\n'), 'utf-8')
      await writeFile(join(directory, 'src', 'unrelated.ts'), 'export const unrelated = "base"\n', 'utf-8')
      runGit(directory, 'add', '.')
      runGit(directory, '-c', 'user.name=OpenFlow Test', '-c', 'user.email=openflow@example.test', 'commit', '-m', 'add unrelated base')
      await writeFile(join(directory, 'src', 'fixture.ts'), 'export const value = 3\nexport function scopedChange() { return value }\n', 'utf-8')
      await writeFile(join(directory, 'src', 'unrelated.ts'), 'export const unrelated = "changed"\nexport function unrelatedChange() { return unrelated }\n', 'utf-8')

      const capturedTexts: string[] = []
      let createCount = 0
      const client = {
        session: {
          create: async () => ({ id: `harden-session-${++createCount}` }),
          prompt: async (options: unknown) => {
            const payload = options && typeof options === 'object' ? options as { body?: { parts?: Array<{ text?: string }> } } : {}
            const text = payload.body?.parts?.[0]?.text
            if (text) capturedTexts.push(text)
            return {
              data: {
                parts: [{ type: 'text', text: 'NO_FINDINGS' }],
                info: {
                  tokens: {
                    input: 100,
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
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a', { full: true })

      expect(result).toContain('Status: pass')
      expect(capturedTexts[0]).toContain('src/fixture.ts')
      expect(capturedTexts[0]).toContain('src/unrelated.ts')
      expect(capturedTexts[0]).toContain('unrelatedChange')
    } finally {
      await removeFixture(directory)
    }
  })

  test('design ambiguity returns needs_human', async () => {
    const directory = await createGitFixture('ambiguity', 'complex')
    try {
      const client = createMockClient([
        'Level: design_ambiguity\nDescription: Design does not specify retry behavior\nEvidence: docs/changes/feature-a/design.md has no retry section\nFiles: docs/changes/feature-a/design.md',
      ])
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      expect(result).toContain('Status: needs_human')
      expect(result).toContain('design ambiguity')
    } finally {
      await removeFixture(directory)
    }
  })

  test('complex feature with rejected finding and accepted rebuttal', async () => {
    const directory = await createGitFixture('reject-accept', 'complex')
    try {
      // Mock multi-round responses: Reviewer finds issue → Executor rejects → Reviewer accepts rejection → Next round no findings
      const client = createMockClient([
        // Round 1 Reviewer: reports a blocking_bug
        'Level: blocking_bug\nDescription: Missing validation\nEvidence: src/fixture.ts does not validate input\nFiles: src/fixture.ts',
        // Round 1 Executor: rejects the finding with verdict
        'verdict: reject\nrationale: Design doc does not require validation for this endpoint',
        // Round 1 Reviewer rebuttal: accepts the rejection
        'accept',
        // Round 2 Reviewer: no more findings
        'NO_FINDINGS',
      ], 100)
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      // Should pass (with risks or clean) since the rejection was accepted
      expect(result).toMatch(/Status: (pass|pass_with_risks)/)
      // Should contain rejected_findings section in final report
      expect(result).toContain('rejected_findings')
      // Should contain the Executor's rejection rationale
      expect(result).toContain('Design doc does not require validation')
    } finally {
      await removeFixture(directory)
    }
  })

  test('complex feature with rejected finding and unresolved rebuttal', async () => {
    const directory = await createGitFixture('reject-unresolved', 'complex')
    try {
      // Mock multi-round responses: Reviewer finds issue → Executor rejects → Reviewer challenges → Executor final rejects → unresolved
      const client = createMockClient([
        // Round 1 Reviewer: reports a spec_violation
        'Level: spec_violation\nDescription: Wrong return type\nEvidence: src/fixture.ts returns number instead of string\nFiles: src/fixture.ts',
        // Round 1 Executor: rejects the finding
        'verdict: reject\nrationale: Return type matches current design v1.2',
        // Round 1 Reviewer rebuttal: challenges the rejection
        'challenge: Design v2.0 explicitly requires string return type\nevidence: docs/changes/feature-a/design.md line 45',
        // Round 1 Executor rebuttal: final rejection
        'final_verdict: reject\nrationale: v2.0 is not yet approved',
      ], 100)
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      // Should indicate needs_human since the rebuttal is unresolved
      expect(result).toContain('Status: needs_human')
      // Should contain unresolved section
      expect(result).toContain('unresolved_needs_decision')
      // Should contain both rebuttal references (reviewer challenge and executor response)
      expect(result).toContain('challenge')
      expect(result).toContain('final_verdict')
    } finally {
      await removeFixture(directory)
    }
  })

  test('complex feature runs reviewer and executor once with disposition', async () => {
    const directory = await createGitFixture('complex-disposition', 'complex')
    try {
      // Complex diff fixture with one actionable finding and Executor partial fix
      const client = createMockClient([
        // Reviewer: one actionable finding
        'Level: blocking_bug\nDescription: Value should be validated\nEvidence: src/fixture.ts does not check value range\nFiles: src/fixture.ts',
        // Executor: partial fix applied with verdict
        'verdict: partial\nrationale: Partial fix applied — added range check but not full validation',
        // Round 2 Reviewer: no more findings
        'NO_FINDINGS',
      ], 100)
      const ctx = createContext(directory, undefined, client)

      const result = await handleHarden(ctx, 'feature-a')

      // Should contain structured verdict in the findings section (not just in the fix text)
      // The new format groups findings by disposition in a dedicated section
      expect(result).toContain('disposition=partial')
      // Should contain the rationale in the structured findings
      expect(result).toContain('rationale: Partial fix applied')
      // Should NOT have more than 2 rounds
      expect(result).not.toContain('Rounds: 3')
      // Should contain a "Findings Final State" section with grouped findings
      expect(result).toContain('### Findings Final State')
    } finally {
      await removeFixture(directory)
    }
  })
})
