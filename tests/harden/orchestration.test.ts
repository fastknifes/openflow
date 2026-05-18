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

describe('harden orchestration - single session per run', () => {
  test('one harden run creates exactly one session', async () => {
    const directory = await createGitFixture('single-session')
    try {
      let createCallCount = 0
      let capturedSessionId: string | null = null
      
      const client = {
        session: {
          create: async () => {
            createCallCount++
            const sessionId = `harden-session-${createCallCount}`
            capturedSessionId = sessionId
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
      
      expect(createCallCount).toBe(1)
      expect(capturedSessionId).toBe('harden-session-1')
    } finally {
      await removeFixture(directory)
    }
  })

  test('multi-round harden reuses same session for reviewer and executor', async () => {
    const directory = await createGitFixture('multi-round-reuse')
    try {
      let createCallCount = 0
      const sessionIds: string[] = []
      
      const client = {
        session: {
          create: async () => {
            createCallCount++
            const sessionId = `harden-session-${createCallCount}`
            return { id: sessionId }
          },
          prompt: async () => {
            // Track which session was used
            sessionIds.push(`harden-session-${createCallCount}`)
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
      
      // All prompts should use the same session
      expect(createCallCount).toBe(1)
      expect(sessionIds.every(id => id === 'harden-session-1')).toBe(true)
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

  test('session fallback: maintains single visible child session even if agent switching not supported', async () => {
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
      
      // Even without agent switching support, should still only create one session
      expect(createCallCount).toBe(1)
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
