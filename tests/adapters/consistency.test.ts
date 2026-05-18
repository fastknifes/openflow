import { afterEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { AdapterCache } from '../../src/adapters/cache.js'
import { CurrentConstraintsAdapter } from '../../src/adapters/consistency/current-constraints.js'
import { DesignDriftAdapter } from '../../src/adapters/consistency/design-drift.js'

const cleanupDirs: string[] = []

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('DesignDriftAdapter', () => {
  it('passes when acceptance-phase drift detector finds no drift', async () => {
    const projectDir = await createProject()
    await write(path.join(projectDir, '.sisyphus', 'change-units.json'), JSON.stringify({
      version: 1,
      byFeature: { consistency: { changeDir: '2026-05-11-consistency' } },
    }, null, 2))
    await write(path.join(projectDir, 'docs', 'changes', '2026-05-11-consistency', 'design.md'), [
      '# design',
      '- module `src/allowed`',
      '- symbol `keepMe`',
    ].join('\n'))
    await write(path.join(projectDir, 'src', 'allowed', 'keep.ts'), 'export function keepMe() { return true }\n')

    const adapter = new DesignDriftAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'consistency',
      config: {},
      cache: new AdapterCache(),
      phasedChanges: {
        implementation: [],
        acceptance: [{ filePath: 'src/allowed/keep.ts', tool: 'write' }],
      },
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.passed).toBe(true)
  })

  it('fails when fallback keyword drift finds changed files outside design scope', async () => {
    const projectDir = await createProject()
    await write(path.join(projectDir, '.sisyphus', 'change-units.json'), JSON.stringify({
      version: 1,
      byFeature: { consistency: { changeDir: '2026-05-11-consistency' } },
    }, null, 2))
    await write(path.join(projectDir, 'docs', 'changes', '2026-05-11-consistency', 'design.md'), [
      '# design',
      '- expected module `src/allowed`',
      '- expected symbol `keepMe`',
    ].join('\n'))
    await write(path.join(projectDir, 'src', 'other', 'drift.ts'), 'export function driftedThing() { return true }\n')

    const adapter = new DesignDriftAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'consistency',
      config: {},
      cache: new AdapterCache(),
      changedFiles: ['src/other/drift.ts'],
    })

    expect(results.some((result) => !result.passed)).toBe(true)
    expect(results.map((result) => result.detail).join('\n')).toContain('src/other/drift.ts')
    expect(results.map((result) => result.detail).join('\n')).toContain('driftedThing')
  })
})

describe('CurrentConstraintsAdapter', () => {
  it('fails on forbidden dependency and locked file violations', async () => {
    const projectDir = await createProject()
    await write(path.join(projectDir, 'docs', 'current', 'design', 'rules.md'), [
      '## Constraints',
      '- `src/locked.ts` must not change.',
      '- forbidden dependency: `left-pad`',
    ].join('\n'))
    await write(path.join(projectDir, 'src', 'locked.ts'), 'export const locked = true\n')
    await write(path.join(projectDir, 'src', 'uses-left-pad.ts'), 'import leftPad from "left-pad"\nexport const value = leftPad("a", 2)\n')

    const adapter = new CurrentConstraintsAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'consistency',
      config: {},
      cache: new AdapterCache(),
      changedFiles: ['src/locked.ts', 'src/uses-left-pad.ts'],
    })

    expect(results.some((result) => result.detail?.includes('locked'))).toBe(true)
    expect(results.some((result) => result.detail?.includes('left-pad'))).toBe(true)
  })

  it('returns non-passing result for ambiguous current constraint', async () => {
    const projectDir = await createProject()
    await write(path.join(projectDir, 'docs', 'current', 'spec', 'ambiguous.md'), [
      '## Constraints',
      '- @stable must preserve public API shape',
    ].join('\n'))
    await write(path.join(projectDir, 'src', 'api.ts'), 'export const api = 1\n')

    const adapter = new CurrentConstraintsAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'consistency',
      config: {},
      cache: new AdapterCache(),
      changedFiles: ['src/api.ts'],
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.passed).toBe(false)
    expect(results[0]?.detail).toContain('ambiguous constraint; human decision required')
  })
})

async function createProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-consistency-test-'))
  cleanupDirs.push(dir)
  return dir
}

async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}
