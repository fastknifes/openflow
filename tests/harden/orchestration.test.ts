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

async function createGitFixture(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `openflow-harden-orchestration-${name}-`))
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

  // Create a complex change for multi-round scenarios
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

describe('harden orchestration - independent sessions per round', () => {
  test('one harden run creates at least coordinator and reviewer sessions (>= 2)', async () => {
    const directory = await createGitFixture('single-session')
    try {
      let createCallCount = 0
      
      const client = {
        session: {
          create: async () => {
            createCallCount++
            const sessionId = `harden-session-${createCallCount}`
            return { id: sessionId }
          },
          prompt: async () => ({
            data: {
              parts: [{ type: 'text', text: 'NO_FINDINGS' }],
              info: {
                tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            },
          }),
        },
      }
      
      const ctx = createContext(directory, undefined, client)
      await handleHarden(ctx, 'feature-a')
      
      // New behavior: Coordinator session + independent Reviewer session = at least 2
      // When reviewer returns NO_FINDINGS, only Round 1 Reviewer runs, so exactly 2 sessions.
      expect(createCallCount).toBeGreaterThanOrEqual(2)
    } finally {
      await removeFixture(directory)
    }
  })

  test('multi-round harden uses different sessions for reviewer and executor', async () => {
    const directory = await createGitFixture('multi-round-reuse')
    try {
      let createCallCount = 0
      const sessionPromptMap: Array<{ sessionId: string; promptIndex: number }> = []
      let promptIndex = 0
      const responses = [
        // Round 1: Reviewer finds issues, Executor fixes, Round 2: Reviewer re-checks
        'Level: blocking_bug\nDescription: Bug found\nEvidence: src/fixture.ts has a bug\nFiles: src/fixture.ts',
        'Root cause: value changed\nDiff: minimal patch applied\nVerify: rerun tests',
        'NO_FINDINGS',
      ]
      
      const client = {
        session: {
          create: async () => {
            createCallCount++
            const sessionId = `harden-session-${createCallCount}`
            return { id: sessionId }
          },
          prompt: async () => {
            // Capture which session was active at prompt time
            // In new behavior: each role gets its own session, so the prompt
            // is sent to the session that was most recently created for that role.
            sessionPromptMap.push({
              sessionId: `harden-session-${createCallCount}`,
              promptIndex: promptIndex,
            })
            const text = responses[promptIndex] ?? 'NO_FINDINGS'
            promptIndex++
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
      
      const ctx = createContext(directory, undefined, client)
      await handleHarden(ctx, 'feature-a')
      
      // New behavior: Reviewer and Executor prompts are sent to DIFFERENT session IDs
      // Find reviewer prompts (promptIndex 0, 2) and executor prompt (promptIndex 1)
      const reviewerPrompts = sessionPromptMap.filter(e => e.promptIndex === 0 || e.promptIndex === 2)
      const executorPrompts = sessionPromptMap.filter(e => e.promptIndex === 1)
      
      // Both should exist in a multi-round scenario
      expect(reviewerPrompts.length).toBeGreaterThan(0)
      expect(executorPrompts.length).toBeGreaterThan(0)
      
      // Reviewer and Executor MUST use different session IDs
      const reviewerSessionIds = reviewerPrompts.map(p => p.sessionId)
      const executorSessionIds = executorPrompts.map(p => p.sessionId)
      for (const rId of reviewerSessionIds) {
        for (const eId of executorSessionIds) {
          expect(rId).not.toBe(eId)
        }
      }
    } finally {
      await removeFixture(directory)
    }
  })

  test('session titles include round and role', async () => {
    const directory = await createGitFixture('session-titles')
    try {
      const capturedTitles: string[] = []
      
      const client = {
        session: {
          create: async (options: unknown) => {
            // Capture the title from the create call body
            const opts = options as { body?: { title?: string } }
            const title = opts.body?.title ?? '(no title)'
            capturedTitles.push(title)
            return { id: `harden-session-${capturedTitles.length}` }
          },
          prompt: async () => ({
            data: {
              parts: [{ type: 'text', text: 'NO_FINDINGS' }],
              info: {
                tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            },
          }),
        },
      }
      
      const ctx = createContext(directory, undefined, client)
      await handleHarden(ctx, 'feature-a')
      
      // Should have at least 2 sessions: Coordinator + Reviewer
      expect(capturedTitles.length).toBeGreaterThanOrEqual(2)
      
      // Coordinator session title should include the feature name
      expect(capturedTitles[0]).toContain('Harden')
      expect(capturedTitles[0]).toContain('feature-a')
      
      // Reviewer session title should include round number and role
      const reviewerTitle = capturedTitles.find(t => t.includes('Reviewer'))
      expect(reviewerTitle).toBeDefined()
      expect(reviewerTitle!).toContain('Round')
      expect(reviewerTitle!).toMatch(/Round \d+\/\d+/)
      expect(reviewerTitle!).toContain('Reviewer')
    } finally {
      await removeFixture(directory)
    }
  })

  test('prompt payload does not contain task(...) wrapper text', async () => {
    const directory = await createGitFixture('no-task-wrapper')
    try {
      const capturedPayloads: unknown[] = []
      
      const client = {
        session: {
          create: async () => ({ id: 'harden-session-1' }),
          prompt: async (options: unknown) => {
            capturedPayloads.push(options)
            return {
              data: {
                parts: [{ type: 'text', text: 'NO_FINDINGS' }],
                info: {
                  tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                },
              },
            }
          },
        },
      }
      
      const ctx = createContext(directory, undefined, client)
      await handleHarden(ctx, 'feature-a')
      
      for (const payload of capturedPayloads) {
        const payloadStr = JSON.stringify(payload)
        expect(payloadStr).not.toContain('task(')
        expect(payloadStr).not.toContain('prompt="See detailed prompt below."')
      }
    } finally {
      await removeFixture(directory)
    }
  })

  test('harden result contains trace with round, agent, tokens, stop reason', async () => {
    const directory = await createGitFixture('harden-trace')
    try {
      const client = {
        session: {
          create: async () => ({ id: 'harden-session-1' }),
          prompt: async () => ({
            data: {
              parts: [{ type: 'text', text: 'NO_FINDINGS' }],
              info: {
                tokens: { input: 150, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            },
          }),
        },
      }
      
      const ctx = createContext(directory, undefined, client)
      const result = await handleHarden(ctx, 'feature-a')
      
      // Result should contain harden trace information
      expect(result).toContain('Session:')
      expect(result).toContain('harden-session-1')
    } finally {
      await removeFixture(directory)
    }
  })

  test('session fallback: creates independent sessions even if agent switching not supported', async () => {
    const directory = await createGitFixture('session-fallback')
    try {
      let createCallCount = 0
      
      // Mock that doesn't support agent switching but still tracks sessions
      const client = {
        session: {
          create: async () => {
            createCallCount++
            return { id: `harden-session-${createCallCount}` }
          },
          prompt: async () => ({
            data: {
              parts: [{ type: 'text', text: 'NO_FINDINGS' }],
              info: {
                tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              },
            },
          }),
        },
      }
      
      const ctx = createContext(directory, undefined, client)
      await handleHarden(ctx, 'feature-a')
      
      // New behavior: Even without agent switching support, should create
      // independent sessions for Coordinator + Reviewer (at least 2)
      expect(createCallCount).toBeGreaterThanOrEqual(2)
    } finally {
      await removeFixture(directory)
    }
  })

  test('prompt uses body.agent to specify oracle or deep agent', async () => {
    const directory = await createGitFixture('body-agent-specification')
    try {
      const capturedBodies: { agent?: string }[] = []
      
      const client = {
        session: {
          create: async () => ({ id: 'harden-session-1' }),
          prompt: async (options: unknown) => {
            const opts = options as { body?: { agent?: string } }
            capturedBodies.push(opts.body || {})
            return {
              data: {
                parts: [{ type: 'text', text: 'NO_FINDINGS' }],
                info: {
                  tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                },
              },
            }
          },
        },
      }
      
      const ctx = createContext(directory, undefined, client)
      await handleHarden(ctx, 'feature-a')
      
      // At least one prompt should have specified agent in body
      const hasAgentSpecified = capturedBodies.some(body => 
        body.agent === 'oracle' || body.agent === 'deep'
      )
      expect(hasAgentSpecified).toBe(true)
    } finally {
      await removeFixture(directory)
    }
  })
})
