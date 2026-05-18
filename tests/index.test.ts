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

function createChatOutput(text: string, sessionID = 'session-1') {
  return {
    message: {
      id: 'message-1',
      sessionID,
      role: 'user' as const,
      time: { created: Date.now() },
      agent: 'test-agent',
      model: { providerID: 'test-provider', modelID: 'test-model' },
    },
    parts: [{ id: 'part-1', sessionID, messageID: 'message-1', type: 'text' as const, text }],
  } as never
}

function firstOutputText(output: ReturnType<typeof createChatOutput>): string {
  return ((output.parts[0] as { text?: string }).text) ?? ''
}

describe('OpenFlowPlugin', () => {
  test('initializes plugin and registers hooks', async () => {
    const root = join(process.cwd(), '.test-plugin-init')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    if (!plugin.tool) {
      throw new Error('Expected plugin.tool to be defined')
    }

    expect(Object.keys(plugin.tool).sort()).toEqual([
          'openflow-archive',
          'openflow-feature',
           'openflow-init',
           'openflow-issue',
          'openflow-migrate-docs',
           'openflow-quality-gate',
           'openflow-writing-plan',
        ].sort())
    // Negative-scope: openflow-reflect must NOT be registered as a plugin tool
    expect(Object.keys(plugin.tool)).not.toContain('openflow-reflect')
    expect(plugin['chat.message']).toBeFunction()
    expect(plugin['tool.execute.before']).toBeFunction()
    expect(plugin['tool.execute.after']).toBeFunction()
    expect(plugin.config).toBeFunction()

    await rm(root, { recursive: true, force: true })
  })

  test('dispatches explicit slash commands through chat.message and applies config reload', async () => {
    const root = join(process.cwd(), '.test-plugin-tool')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)

    const statusBefore = createChatOutput('/openflow-status')
    await plugin['chat.message']?.({ sessionID: 'session-status-before' } as never, statusBefore)
    expect(firstOutputText(statusBefore)).toContain('mode: smart')

    const configOutput = createChatOutput('/openflow-config')
    await plugin['chat.message']?.({ sessionID: 'session-config' } as never, configOutput)
    expect(firstOutputText(configOutput)).toContain('OpenFlow Configuration')

    const verifyOutput = createChatOutput('/openflow-verify')
    await plugin['chat.message']?.({ sessionID: 'session-verify' } as never, verifyOutput)
    expect(firstOutputText(verifyOutput)).toContain('deprecated')
    expect(firstOutputText(verifyOutput)).toContain('openflow-quality-gate')

    const hardenOutput = createChatOutput('/openflow-harden')
    await plugin['chat.message']?.({ sessionID: 'session-harden' } as never, hardenOutput)
    expect(firstOutputText(hardenOutput)).toContain('deprecated')
    expect(firstOutputText(hardenOutput)).toContain('openflow-quality-gate')

    const featureOutput = createChatOutput('/openflow-feature user-login', 'session-feature')
    await plugin['chat.message']?.({ sessionID: 'session-feature' } as never, featureOutput)
    expect(firstOutputText(featureOutput)).toContain('Feature Question')

    const nextConfig = {
      openflow: {
        feature: {
          trigger_mode: 'always',
        },
      },
    } as unknown as Parameters<NonNullable<typeof plugin.config>>[0]

    await plugin.config?.(nextConfig)

    const statusAfter = createChatOutput('/openflow-status')
    await plugin['chat.message']?.({ sessionID: 'session-status-after' } as never, statusAfter)
    expect(firstOutputText(statusAfter)).toContain('mode: always')

    await rm(root, { recursive: true, force: true })
  })

  test('dispatches command-file expanded openflow slash commands through chat.message', async () => {
    const root = join(process.cwd(), '.test-plugin-command-file-dispatch')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)

    const featureOutput = createChatOutput('OpenFlow command: /openflow-feature user-login', 'session-command-file')
    await plugin['chat.message']?.({ sessionID: 'session-command-file' } as never, featureOutput)
    expect(firstOutputText(featureOutput)).toContain('Feature Question')

    await rm(root, { recursive: true, force: true })
  })

  test('progresses brainstorm across explicit slash command flow and completes with final document', async () => {
    const root = join(process.cwd(), '.test-plugin-brainstorm-resume')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)

    const first = createChatOutput('/openflow-feature user-login', 'plugin-session')
    await plugin['chat.message']?.({ sessionID: 'plugin-session' } as never, first)
    expect(firstOutputText(first)).toContain('这个功能主要要解决什么问题？')

    const second = createChatOutput('支持新场景', 'plugin-session')
    await plugin['chat.message']?.({ sessionID: 'plugin-session' } as never, second)
    expect(firstOutputText(second)).toContain('这次需求更接近哪一种范围？')

    for (const answer of ['new-feature']) {
      const step = createChatOutput(answer, 'plugin-session')
      await plugin['chat.message']?.({ sessionID: 'plugin-session' } as never, step)
    }

    const final = createChatOutput('兼容现有系统', 'plugin-session')
    await plugin['chat.message']?.({ sessionID: 'plugin-session' } as never, final)

    expect(firstOutputText(final)).toContain('Feature Design Complete')
    expect(firstOutputText(final)).toContain('design.md')
    expect(firstOutputText(final)).toContain('behavior.md')

    const changeDirs = await readdir(join(root, 'docs', 'changes'))
    const generatedFile = join(root, 'docs', 'changes', changeDirs[0]!, 'design.md')
    await expect(access(generatedFile)).resolves.toBeNull()
    const content = await readFile(generatedFile, 'utf-8')
    expect(content).toContain('支持新场景')
    expect(content).toContain('兼容现有系统')

    await rm(root, { recursive: true, force: true })
  })

  test('resolves active brainstorm by session from plain follow-up replies', async () => {
    const root = join(process.cwd(), '.test-plugin-brainstorm-session-resume')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    const start = createChatOutput('/openflow-feature user-login', 'plugin-session-resume')
    await plugin['chat.message']?.({ sessionID: 'plugin-session-resume' } as never, start)

    const resumed = createChatOutput('支持新场景', 'plugin-session-resume')
    await plugin['chat.message']?.({ sessionID: 'plugin-session-resume' } as never, resumed)
    expect(firstOutputText(resumed)).toContain('这次需求更接近哪一种范围？')

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

    expect(Object.keys(plugin.tool).sort()).toEqual([
          'openflow-archive',
          'openflow-feature',
           'openflow-init',
           'openflow-issue',
          'openflow-migrate-docs',
           'openflow-quality-gate',
           'openflow-writing-plan',
        ].sort())
    // Negative-scope: openflow-reflect must NOT be registered as a plugin tool
    expect(Object.keys(plugin.tool)).not.toContain('openflow-reflect')
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

  test('executes /openflow-init through chat.message and creates AGENTS.md', async () => {
    const root = join(process.cwd(), '.test-plugin-init-command')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)

    const output = createChatOutput('/openflow-init')
    await plugin['chat.message']?.({ sessionID: 'session-init-command' } as never, output)
    expect(firstOutputText(output)).toBe('initialized AGENTS.md and added OpenFlow docs guide')

    // Verify AGENTS.md was created
    const agentsPath = join(root, 'AGENTS.md')
    await expect(access(agentsPath)).resolves.toBeNull()

    const content = await readFile(agentsPath, 'utf-8')
    expect(content).toContain('# OpenFlow')
    expect(content).toContain('<!-- OPENFLOW DOCS GUIDE:BEGIN -->')
    expect(content).toContain('<!-- OPENFLOW DOCS GUIDE:END -->')

    await rm(root, { recursive: true, force: true })
  })

  test('executes openflow-feature tool with natural-language feature input', async () => {
    const root = join(process.cwd(), '.test-plugin-feature-tool-natural-language')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    const featureTool = plugin.tool?.['openflow-feature']
    if (!featureTool) {
      throw new Error('Expected openflow-feature tool to be registered')
    }

    const result = await featureTool.execute({ feature: '帮我写一个登录功能' }, { sessionID: 'session-feature-tool-natural-language' } as never)

    expect(result).toContain('Feature Question')
    expect(result).not.toContain('Feature name is required')
    expect(result).not.toContain('/openflow-feature feature-')

    await rm(root, { recursive: true, force: true })
  })

  test('executes openflow-feature tool with no argument when session has active feature', async () => {
    const root = join(process.cwd(), '.test-plugin-feature-tool-noarg')
    await rm(root, { recursive: true, force: true })

    const plugin = await OpenFlowPlugin(createPluginInput(root) as never)
    if (!plugin.tool?.['openflow-feature']) {
      throw new Error('Expected openflow-feature tool to be registered')
    }

    const start = createChatOutput('/openflow-feature user-login', 'session-feature-tool-noarg')
    await plugin['chat.message']?.({ sessionID: 'session-feature-tool-noarg' } as never, start)

    const result = await plugin.tool['openflow-feature'].execute({}, { sessionID: 'session-feature-tool-noarg' } as never)

    expect(result).toContain('Feature Question')
    expect(result).not.toContain('Feature name is required')
    expect(result).not.toContain('/openflow-feature feature-')

    await rm(root, { recursive: true, force: true })
  })
})
