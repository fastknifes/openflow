import { describe, expect, test } from 'bun:test'
import { access, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleVerify } from '../../src/commands/verify.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

describe('verify command', () => {
  test('resolves active feature from latest plan and returns stable evidence/readiness structure', async () => {
    const testDir = join(process.cwd(), '.test-verify-active-feature')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'older-feature.md'), '# older', 'utf-8')
    await writeFile(join(plansDir, 'latest-feature.md'), '# latest', 'utf-8')

    const result = await handleVerify(createContext(testDir))

    expect(result).toContain('## Verify')
    expect(result).toContain('Feature: latest-feature')
    expect(result).toContain('### Evidence')
    expect(result).toContain('checks_run:')
    expect(result).toContain('### Readiness')
    expect(result).toContain('- status: ready')

    await rm(testDir, { recursive: true, force: true })
  })

  test('keeps verify read-only and does not create current or archive artifacts', async () => {
    const testDir = join(process.cwd(), '.test-verify-read-only')
    await rm(testDir, { recursive: true, force: true })

    const plansDir = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansDir, { recursive: true })
    await writeFile(join(plansDir, 'demo-feature.md'), '# demo', 'utf-8')

    const docsDir = join(testDir, 'docs')
    await mkdir(docsDir, { recursive: true })
    const docsBefore = await stat(docsDir)

    await handleVerify(createContext(testDir), 'demo-feature')

    const docsAfter = await stat(docsDir)
    expect(docsAfter.mtimeMs).toBe(docsBefore.mtimeMs)
    await expect(access(join(testDir, 'docs', 'current'))).rejects.toBeDefined()
    await expect(access(join(testDir, 'docs', 'archive'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })
})
