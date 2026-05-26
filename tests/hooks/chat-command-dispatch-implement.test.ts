import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

const handleImplementMock = mock(async () => 'implement result')

mock.module('../../src/commands/implement.js', () => ({
  handleImplement: handleImplementMock,
}))

type DispatchModule = typeof import('../../src/hooks/chat-command-dispatch.js')
type DispatchInput = Parameters<DispatchModule['dispatchOpenFlowCommand']>[1]
type DispatchOutput = Parameters<DispatchModule['dispatchOpenFlowCommand']>[2]

function createContext(): OpenFlowContext {
  return {
    config: defaultConfig,
    directory: process.cwd(),
    worktree: process.cwd(),
    client: {},
    $: {},
    enhancedPlans: new Set(),
  }
}

function createInput(sessionID = 'session-1'): DispatchInput {
  return { sessionID } as DispatchInput
}

function createOutput(text: string): DispatchOutput {
  return {
    message: {
      id: 'message-1',
      sessionID: 'session-1',
      role: 'user' as const,
      time: { created: Date.now() },
      agent: 'test',
      model: { providerID: 'test', modelID: 'test' },
    },
    parts: [{ id: 'part-1', sessionID: 'session-1', messageID: 'message-1', type: 'text' as const, text }],
  } as DispatchOutput
}

async function loadDispatchModule(): Promise<DispatchModule> {
  return await import('../../src/hooks/chat-command-dispatch.js')
}

describe('parseOpenFlowImplementCommand', () => {
  test('parses feature with default worktree mode', async () => {
    const { parseOpenFlowImplementCommand } = await loadDispatchModule()

    expect(parseOpenFlowImplementCommand('/openflow-implement foo')).toEqual({ feature: 'foo', useWorktree: true })
  })

  test('parses trailing no-worktree flag', async () => {
    const { parseOpenFlowImplementCommand } = await loadDispatchModule()

    expect(parseOpenFlowImplementCommand('/openflow-implement foo --no-worktree')).toEqual({ feature: 'foo', useWorktree: false })
  })

  test('parses leading no-worktree flag', async () => {
    const { parseOpenFlowImplementCommand } = await loadDispatchModule()

    expect(parseOpenFlowImplementCommand('/openflow-implement --no-worktree foo')).toEqual({ feature: 'foo', useWorktree: false })
  })

  test('returns an error when feature is missing', async () => {
    const { parseOpenFlowImplementCommand } = await loadDispatchModule()
    const result = parseOpenFlowImplementCommand('/openflow-implement')

    expect(result).toHaveProperty('error')
    expect(result && 'error' in result ? result.error : '').toContain('Feature name is required')
  })

  test('returns an error for unknown flags', async () => {
    const { parseOpenFlowImplementCommand } = await loadDispatchModule()
    const result = parseOpenFlowImplementCommand('/openflow-implement foo --unknown')

    expect(result).toHaveProperty('error')
    expect(result && 'error' in result ? result.error : '').toContain('Unsupported flag: --unknown')
    expect(result && 'error' in result ? result.error : '').toContain('--no-worktree')
  })
})

describe('dispatchOpenFlowCommand /openflow-implement', () => {
  beforeEach(() => {
    handleImplementMock.mockClear()
    handleImplementMock.mockResolvedValue('implement result')
  })

  test('dispatches extracted implement command and appends result', async () => {
    const { dispatchOpenFlowCommand } = await loadDispatchModule()
    const ctx = createContext()
    const output = createOutput('OpenFlow command: /openflow-implement foo')
    const observer = { setActiveRun: mock(() => undefined) }

    const handled = await dispatchOpenFlowCommand(
      ctx,
      createInput('session-dispatch'),
      output,
      'OpenFlow command: /openflow-implement foo',
      observer,
    )

    expect(handled).toBe(true)
    expect(handleImplementMock).toHaveBeenCalledTimes(1)
    expect(handleImplementMock.mock.calls[0]?.[0]).toBe(ctx)
    expect(handleImplementMock.mock.calls[0]?.[1]).toBe('foo')
    expect(handleImplementMock.mock.calls[0]?.[2]).toBe(true)
    expect(handleImplementMock.mock.calls[0]?.[3]).toMatchObject({ sessionID: 'session-dispatch', messageID: '', agent: '' })
    expect(handleImplementMock.mock.calls[0]?.[4]).toBe(observer)
    expect((output.parts[0] as { text?: string }).text).toContain('implement result')
  })

  test('dispatches no-worktree mode to handleImplement', async () => {
    const { dispatchOpenFlowCommand } = await loadDispatchModule()
    const ctx = createContext()
    const output = createOutput('/openflow-implement foo --no-worktree')
    const observer = { setActiveRun: mock(() => undefined) }

    const handled = await dispatchOpenFlowCommand(ctx, createInput(), output, '/openflow-implement foo --no-worktree', observer)

    expect(handled).toBe(true)
    expect(handleImplementMock).toHaveBeenCalledTimes(1)
    expect(handleImplementMock.mock.calls[0]?.[1]).toBe('foo')
    expect(handleImplementMock.mock.calls[0]?.[2]).toBe(false)
    expect(handleImplementMock.mock.calls[0]?.[4]).toBe(observer)
  })
})
