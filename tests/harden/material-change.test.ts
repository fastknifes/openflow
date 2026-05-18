import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleHarden } from '../../src/commands/harden.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import { computeChangedFilesSet, computeDiffHash, hasMaterialChange } from '../../src/utils/harden-diff.js'

function createContext(directory: string, client: unknown = {}): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client,
    $: {},
    config: defaultConfig,
    enhancedPlans: new Set<string>(),
  }
}

async function createGitFixture(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `openflow-harden-material-${name}-`))
  const feature = 'feature-a'
  await mkdir(join(directory, '.sisyphus', 'plans'), { recursive: true })
  await mkdir(join(directory, 'docs', 'changes', feature), { recursive: true })
  await mkdir(join(directory, 'src'), { recursive: true })

  await writeFile(join(directory, '.sisyphus', 'plans', `${feature}.md`), '# Plan\n- Implement harden fixture in `src/fixture.ts`.\n', 'utf-8')
  await writeFile(join(directory, 'docs', 'changes', feature, 'design.md'), '# Design\n- Harden should review implementation changes\n', 'utf-8')
  await writeFile(join(directory, 'src', 'fixture.ts'), 'export const value = 1\n', 'utf-8')

  runGit(directory, 'init')
  runGit(directory, 'add', '.')
  runGit(directory, '-c', 'user.name=OpenFlow Test', '-c', 'user.email=openflow@example.test', 'commit', '-m', 'fixture base')

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

describe('harden diff material change utilities', () => {
  test('computeDiffHash is deterministic and changes with diff content', () => {
    const diffA = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n+export const a = 1\n'
    const sameDiffA = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n+export const a = 1\n'
    const diffB = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n+export const a = 2\n'

    expect(computeDiffHash(diffA)).toBe(computeDiffHash(sameDiffA))
    expect(computeDiffHash(diffA)).not.toBe(computeDiffHash(diffB))
    expect(computeDiffHash('')).toBe(computeDiffHash(''))
  })

  test('computeChangedFilesSet extracts all changed file paths', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      'diff --git a/tests/a.test.ts b/tests/a.test.ts',
      '--- a/tests/a.test.ts',
      '+++ b/tests/a.test.ts',
      'diff --git a/docs/guide.md b/docs/guide.md',
      '--- a/docs/guide.md',
      '+++ b/docs/guide.md',
    ].join('\n')

    expect([...computeChangedFilesSet(diff)]).toEqual([
      'src/a.ts',
      'tests/a.test.ts',
      'docs/guide.md',
    ])
    expect(computeChangedFilesSet('').size).toBe(0)
  })

  test('hasMaterialChange detects hash and file set changes', () => {
    expect(hasMaterialChange('same', 'same', new Set(['src/a.ts']), new Set(['src/b.ts']))).toBe(true)
    expect(hasMaterialChange('before', 'after', new Set(['src/a.ts']), new Set(['src/a.ts']))).toBe(true)
    expect(hasMaterialChange('same', 'same', new Set(['src/a.ts']), new Set(['src/a.ts']))).toBe(false)
    expect(hasMaterialChange(computeDiffHash(''), computeDiffHash(''), computeChangedFilesSet(''), computeChangedFilesSet(''))).toBe(false)
  })
})

describe('handleHarden material change orchestration', () => {
  test('repeated finding without material change returns review_inconclusive', async () => {
    const directory = await createGitFixture('no-material-fix')
    try {
      let promptIndex = 0
      const responses = [
        'Level: blocking_bug\nDescription: Value logic is still broken\nEvidence: src/fixture.ts returns stale value\nFiles: src/fixture.ts',
        'Root cause: implementation scope stayed the same\nDiff: no file edits emitted\nVerify: rerun review',
        'Level: blocking_bug\nDescription: Value logic is still broken\nEvidence: src/fixture.ts returns stale value\nFiles: src/fixture.ts',
        'Root cause: implementation scope stayed the same again\nDiff: no file edits emitted\nVerify: rerun review',
      ]
      const client = {
        session: {
          create: async () => ({ id: 'harden-session-1' }),
          prompt: async () => ({
            data: {
              parts: [{ type: 'text', text: responses[promptIndex++] ?? 'NO_FINDINGS' }],
              info: {
                tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            },
          }),
        },
      }

      const result = await handleHarden(createContext(directory, client), 'feature-a')

      expect(result).toContain('Status: review_inconclusive')
      expect(result).toContain('Stop reason: repeated_finding_no_material_fix')
    } finally {
      await removeFixture(directory)
    }
  })

  test('executor failure without material change returns executor_blocked', async () => {
    const directory = await createGitFixture('executor-blocked')
    try {
      let promptIndex = 0
      const responses = [
        'Level: blocking_bug\nDescription: Value logic is still broken\nEvidence: src/fixture.ts returns stale value\nFiles: src/fixture.ts',
        'Blocked: unable to edit files because fix failed',
      ]
      const client = {
        session: {
          create: async () => ({ id: 'harden-session-1' }),
          prompt: async () => ({
            data: {
              parts: [{ type: 'text', text: responses[promptIndex++] ?? 'NO_FINDINGS' }],
              info: {
                tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            },
          }),
        },
      }

      const result = await handleHarden(createContext(directory, client), 'feature-a')

      expect(result).toContain('Status: executor_blocked')
      expect(result).toContain('Stop reason: executor_blocked')
    } finally {
      await removeFixture(directory)
    }
  })

  test('reviewer prompt refreshes scoped diff from git between rounds', async () => {
    const directory = await createGitFixture('fresh-scoped-diff')
    try {
      const reviewerPrompts: string[] = []
      let promptIndex = 0
      const client = {
        session: {
          create: async () => ({ id: 'harden-session-1' }),
          prompt: async (options: unknown) => {
            const payload = options as { body?: { agent?: string; parts?: Array<{ text?: string }> } }
            const agent = payload.body?.agent
            const promptText = payload.body?.parts?.[0]?.text ?? ''

            if (agent === 'oracle') reviewerPrompts.push(promptText)
            if (agent === 'deep') {
              await writeFile(join(directory, 'src', 'fixture.ts'), [
                'export const value = 3',
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

            const text = [
              'Level: blocking_bug\nDescription: Value logic is still broken\nEvidence: src/fixture.ts returns stale value\nFiles: src/fixture.ts',
              'Root cause: updated fixture implementation\nDiff: changed exported value\nVerify: rerun review',
              'NO_FINDINGS',
            ][promptIndex++] ?? 'NO_FINDINGS'

            return {
              data: {
                parts: [{ type: 'text', text }],
                info: {
                  tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                },
              },
            }
          },
        },
      }

      const result = await handleHarden(createContext(directory, client), 'feature-a')

      expect(result).toContain('Status: pass')
      expect(reviewerPrompts).toHaveLength(2)
      expect(reviewerPrompts[0]).toContain('export const value = 2')
      expect(reviewerPrompts[1]).toContain('export const value = 3')
    } finally {
      await removeFixture(directory)
    }
  })
})
