import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createToolAfterHook } from '../../src/hooks/tool-after.js'
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
    const designDir = join(root, 'docs', 'current', 'design', feature)
    await mkdir(designDir, { recursive: true })
    const designPath = join(designDir, '20260325-design.md')
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

    const requirementsDir = join(root, 'docs', 'current', 'requirements', feature)
    const requirementFiles = await readdir(requirementsDir)
    expect(requirementFiles.some(file => /^\d{8}-prd\.md$/.test(file))).toBe(true)

    const designFiles = await readdir(designDir)
    expect(designFiles.some(file => /^\d{8}-decisions\.md$/.test(file))).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  test('extracts feature from docs/changes/{feature}/design path and writes requirements in change workspace', async () => {
    const root = join(process.cwd(), '.test-tool-after-change-workspace')
    await rm(root, { recursive: true, force: true })

    const feature = 'change-workspace-feature'
    const designDir = join(root, 'docs', 'changes', feature, 'design')
    await mkdir(designDir, { recursive: true })
    const designPath = join(designDir, '20260325-design.md')
    await writeFile(designPath, '# Design\n\n## Overview\n\nUser value and architecture trade-off', 'utf-8')

    const ctx = createContext(root)
    const hook = createToolAfterHook(ctx)

    await hook(
      { tool: 'write', sessionID: 'session-change-workspace', callID: 'call-change-workspace', args: { filePath: designPath } },
      { title: '', output: '', metadata: {} }
    )

    const requirementsDir = join(root, 'docs', 'changes', feature, 'requirements')
    const requirementFiles = await readdir(requirementsDir)
    expect(requirementFiles.some(file => /^\d{8}-prd\.md$/.test(file))).toBe(true)

    await rm(root, { recursive: true, force: true })
  })
})
