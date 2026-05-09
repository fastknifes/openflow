import { describe, expect, test } from 'bun:test'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { OpenFlowPlugin } from '../src/index.js'
import { loadAcceptanceState, saveAcceptanceState } from '../src/utils/acceptance-state.js'

function createPluginInput(directory: string) {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: {},
  }
}

function createToolContext(directory: string, sessionID = 'session-1') {
  return {
    sessionID,
    messageID: 'message-1',
    agent: 'test-agent',
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata: () => void 0,
    ask: async () => void 0,
  }
}

describe('OpenFlowPlugin', () => {
  test('initializes plugin and registers hooks', async () => {
    const root = join(process.cwd(), '.test-plugin-init')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    if (!plugin.tool) {
      throw new Error('Expected plugin.tool to be defined')
    }

    expect(plugin.tool['openflow/brainstorm']).toBeDefined()
    expect(plugin.tool['openflow/archive']).toBeDefined()
    expect(plugin.tool['openflow/init']).toBeDefined()
    expect(plugin.tool['openflow/status']).toBeDefined()
    expect(plugin.tool['openflow/config']).toBeDefined()
    expect(plugin.tool['openflow/verify']).toBeDefined()
    expect(plugin.tool['openflow/migrate-docs']).toBeDefined()
    expect(plugin['chat.message']).toBeFunction()
    expect(plugin['tool.execute.before']).toBeFunction()
    expect(plugin['tool.execute.after']).toBeFunction()
    expect(plugin.config).toBeFunction()

    await rm(root, { recursive: true, force: true })
  })

  test('dispatches tool actions and applies config reload', async () => {
    const root = join(process.cwd(), '.test-plugin-tool')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    if (!plugin.tool) {
      throw new Error('Expected plugin.tool to be defined')
    }
    const toolContext = createToolContext(root)

    const statusBefore = await plugin.tool['openflow/status'].execute({}, toolContext)
    expect(statusBefore).toContain('mode: smart')

    const configOutput = await plugin.tool['openflow/config'].execute({}, toolContext)
    expect(configOutput).toContain('OpenFlow Configuration')

    const verifyOutput = await plugin.tool['openflow/verify'].execute({}, toolContext)
    expect(verifyOutput).toContain('## Verify')
    expect(verifyOutput).toContain('### Evidence')
    expect(verifyOutput).toContain('### Readiness')

    const brainstormOutput = await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login' }, toolContext)
    expect(brainstormOutput).toContain('Brainstorm Question')

    const nextConfig = {
      openflow: {
        brainstorming: {
          trigger_mode: 'always',
        },
      },
    } as unknown as Parameters<NonNullable<typeof plugin.config>>[0]

    await plugin.config?.(nextConfig)

    const statusAfter = await plugin.tool['openflow/status'].execute({}, toolContext)
    expect(statusAfter).toContain('mode: always')

    await rm(root, { recursive: true, force: true })
  })

  test('progresses brainstorm across separate tool executions and completes with final document', async () => {
    const root = join(process.cwd(), '.test-plugin-brainstorm-resume')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    if (!plugin.tool) {
      throw new Error('Expected plugin.tool to be defined')
    }

    const toolContext = createToolContext(root, 'plugin-session')

    const first = await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login' }, toolContext)
    expect(first).toContain('这个功能主要要解决什么问题？')

    const second = await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login', answer: '支持新场景' }, toolContext)
    expect(second).toContain('这个功能的主要使用者是谁？')

    await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login', answer: '内部开发者' }, toolContext)
    await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login', answer: 'new-feature' }, toolContext)
    await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login', answer: '风险最小' }, toolContext)
    const final = await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login', answer: '兼容现有系统' }, toolContext)

    expect(final).toContain('Design document generated')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const generatedFile = join(root, 'docs', 'changes', changeDirs[0]!, 'design.md')
    await expect(access(generatedFile)).resolves.toBeNull()
    const content = await readFile(generatedFile, 'utf-8')
    expect(content).toContain('支持新场景')
    expect(content).toContain('内部开发者')

    await rm(root, { recursive: true, force: true })
  })

  test('resolves active brainstorm by session when feature is omitted', async () => {
    const root = join(process.cwd(), '.test-plugin-brainstorm-session-resume')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    if (!plugin.tool) {
      throw new Error('Expected plugin.tool to be defined')
    }

    const toolContext = createToolContext(root, 'plugin-session-resume')
    await plugin.tool['openflow/brainstorm'].execute({ feature: 'user-login' }, toolContext)

    const resumed = await plugin.tool['openflow/brainstorm'].execute({ answer: '支持新场景' } as never, toolContext)
    expect(resumed).toContain('这个功能的主要使用者是谁？')

    await rm(root, { recursive: true, force: true })
  })

  test('initializes plugin even when directory is missing', async () => {
    const plugin = await OpenFlowPlugin({
      worktree: process.cwd(),
      client: {},
      $: {},
      config: {},
    } as never)

    if (!plugin.tool) {
      throw new Error('Expected plugin.tool to be defined')
    }

    expect(plugin.tool['openflow/brainstorm']).toBeDefined()
    expect(plugin.tool['openflow/archive']).toBeDefined()
    expect(plugin.tool['openflow/init']).toBeDefined()
    expect(plugin.tool['openflow/status']).toBeDefined()
    expect(plugin.tool['openflow/config']).toBeDefined()
    expect(plugin.tool['openflow/verify']).toBeDefined()
    expect(plugin.tool['openflow/migrate-docs']).toBeDefined()
    expect(plugin['chat.message']).toBeFunction()
    expect(plugin['tool.execute.before']).toBeFunction()
    expect(plugin['tool.execute.after']).toBeFunction()
  })

  test('routes acceptance detection through plugin chat.message hook', async () => {
    const root = join(process.cwd(), '.test-plugin-acceptance-chat')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'plans', 'demo-feature.md'), '# demo', 'utf-8')

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    const output = {
      message: {
        id: 'm-acceptance',
        sessionID: 'session-acceptance-chat',
        role: 'user' as const,
      },
      parts: [{ id: 'p-1', sessionID: 'session-acceptance-chat', messageID: 'm-acceptance', type: 'text' as const, text: '测试发现这个功能还有问题，需要调整' }],
    }

    await plugin['chat.message']?.({ sessionID: 'session-acceptance-chat' } as never, output as never)

    const state = await loadAcceptanceState(root)
    expect(state?.phase).toBe('acceptance')
    expect(state?.feature).toBe('demo-feature')
    expect(state?.sessionID).toBe('session-acceptance-chat')

    await rm(root, { recursive: true, force: true })
  })

  test('routes acceptance doc-sync prompt through plugin tool.execute.after hook', async () => {
    const root = join(process.cwd(), '.test-plugin-acceptance-tool-after')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await saveAcceptanceState(root, {
      feature: 'demo-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    const output = { title: '', output: '', metadata: {} }

    await plugin['tool.execute.after']?.(
      { tool: 'write', sessionID: 'session-acceptance-tool', callID: 'call-acceptance-tool', args: { filePath: 'src/demo.ts' } } as never,
      output as never
    )

    expect(output.output).toContain('验收阶段变更已记录')
    expect(output.output).toContain('src/demo.ts')

    const state = await loadAcceptanceState(root)
    expect(state?.pendingDocUpdates).toHaveLength(1)
    expect(state?.waitingForDocUpdateConfirm).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  test('executes openflow/init command and creates AGENTS.md', async () => {
    const root = join(process.cwd(), '.test-plugin-init-command')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    if (!plugin.tool) {
      throw new Error('Expected plugin.tool to be defined')
    }

    const toolContext = createToolContext(root)

    // Execute init command
    const result = await plugin.tool['openflow/init'].execute({}, toolContext)
    expect(result).toBe('initialized AGENTS.md and added OpenFlow docs guide')

    // Verify AGENTS.md was created
    const agentsPath = join(root, 'AGENTS.md')
    await expect(access(agentsPath)).resolves.toBeNull()

    const content = await readFile(agentsPath, 'utf-8')
    expect(content).toContain('# OpenFlow')
    expect(content).toContain('<!-- OPENFLOW DOCS GUIDE:BEGIN -->')
    expect(content).toContain('<!-- OPENFLOW DOCS GUIDE:END -->')

    await rm(root, { recursive: true, force: true })
  })
})
