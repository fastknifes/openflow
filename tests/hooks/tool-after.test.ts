import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createToolAfterHook } from '../../src/hooks/tool-after.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'
import type { OpenFlowContext } from '../../src/types.js'
import { defaultConfig } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set(),
  }
}

describe('tool-after hook', () => {
  test('tracks file changes for write operations without brainstorm unlock flow', async () => {
    const root = join(process.cwd(), '.test-tool-after-track')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const hook = createToolAfterHook(ctx)

    await hook(
      { tool: 'write', sessionID: 'session-track', callID: 'call-1', args: { filePath: 'src/demo.ts' } },
      { title: '', output: '', metadata: {} }
    )

    const changesPath = join(root, '.sisyphus', 'builds')
    const buildDirs = await readFile(join(changesPath, await (async () => {
      const fs = await import('node:fs/promises')
      const entries = await fs.readdir(changesPath)
      return entries[0]!
    })(), 'changes.json'), 'utf-8')

    expect(buildDirs).toContain('src/demo.ts')

    await rm(root, { recursive: true, force: true })
  })

  test('generates PRD and decisions by semantic bundle decision', async () => {
    const root = join(process.cwd(), '.test-tool-after-bundle')
    await rm(root, { recursive: true, force: true })

    const feature = 'bundle-feature'
    const designDir = join(root, 'docs', 'changes', feature)
    await mkdir(designDir, { recursive: true })
    const designPath = join(designDir, 'design.md')
    await writeFile(
      designPath,
      '# Design\n\n## Overview\n\nArchitecture trade-off and user value\n\n### A\n### B\n### C\n',
      'utf-8'
    )

    const ctx = createContext(root)
    const hook = createToolAfterHook(ctx)

    await hook(
      { tool: 'write', sessionID: 'session-bundle', callID: 'call-bundle', args: { filePath: designPath } },
      { title: '', output: '', metadata: {} }
    )

    const requirementContent = await readFile(join(root, 'docs', 'changes', feature, 'prd.md'), 'utf-8')
    expect(requirementContent).toContain('Product Requirements Document')

    const decisionsContent = await readFile(join(root, 'docs', 'changes', feature, 'decisions.md'), 'utf-8')
    expect(decisionsContent).toContain('Decision Summary')

    await rm(root, { recursive: true, force: true })
  })

  test('extracts feature from a dated change-workspace design.md path and writes requirements in the same workspace', async () => {
    const root = join(process.cwd(), '.test-tool-after-change-workspace')
    await rm(root, { recursive: true, force: true })

    const feature = 'change-workspace-feature'
    const designDir = join(root, 'docs', 'changes', feature)
    await mkdir(designDir, { recursive: true })
    const designPath = join(designDir, 'design.md')
    await writeFile(designPath, '# Design\n\n## Overview\n\nUser value and architecture trade-off', 'utf-8')

    const ctx = createContext(root)
    const hook = createToolAfterHook(ctx)

    await hook(
      { tool: 'write', sessionID: 'session-change-workspace', callID: 'call-change-workspace', args: { filePath: designPath } },
      { title: '', output: '', metadata: {} }
    )

    const requirementContent = await readFile(join(root, 'docs', 'changes', feature, 'prd.md'), 'utf-8')
    expect(requirementContent).toContain('Product Requirements Document')

    await rm(root, { recursive: true, force: true })
  })

  test('appends acceptance doc-sync prompt and records pending update for code changes', async () => {
    const root = join(process.cwd(), '.test-tool-after-acceptance-prompt')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await saveAcceptanceState(root, {
      feature: 'demo-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    const ctx = createContext(root)
    const hook = createToolAfterHook(ctx)
    const output = { title: '', output: '', metadata: {} }

    await hook(
      { tool: 'write', sessionID: 'session-acceptance', callID: 'call-acceptance', args: { filePath: 'src/demo.ts' } },
      output
    )

    expect(output.output).toContain('验收阶段变更已记录')
    expect(output.output).toContain('src/demo.ts')

    const state = await loadAcceptanceState(root)
    expect(state?.pendingDocUpdates).toHaveLength(1)
    expect(state?.pendingDocUpdates[0]?.file).toBe('src/demo.ts')
    expect(state?.waitingForDocUpdateConfirm).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  test('does not prompt again when updating docs during acceptance', async () => {
    const root = join(process.cwd(), '.test-tool-after-acceptance-docs-skip')
    await rm(root, { recursive: true, force: true })

    const feature = 'demo-feature'
    const designDir = join(root, 'docs', 'changes', feature)
    await mkdir(designDir, { recursive: true })
    const designPath = join(designDir, 'design.md')
    await writeFile(designPath, '# Design', 'utf-8')

    await saveAcceptanceState(root, {
      feature,
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    const ctx = createContext(root)
    const hook = createToolAfterHook(ctx)
    const output = { title: '', output: '', metadata: {} }

    await hook(
      { tool: 'write', sessionID: 'session-docs', callID: 'call-docs', args: { filePath: designPath } },
      output
    )

    expect(output.output).toBe('')

    const state = await loadAcceptanceState(root)
    expect(state?.pendingDocUpdates).toHaveLength(0)

    await rm(root, { recursive: true, force: true })
  })
})
