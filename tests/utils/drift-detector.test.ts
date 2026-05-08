import { describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { detectDrift } from '../../src/utils/drift-detector.js'
import type { PhasedChanges } from '../../src/types.js'

describe('drift-detector', () => {
  test('detectDrift should prefer design.meta.json expected modules and symbols', async () => {
    const testDir = join(process.cwd(), '.test-drift-detector-sidecar')
    const designDir = join(testDir, 'docs', 'changes', 'sidecar-drift')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(designDir, { recursive: true })
    await mkdir(join(testDir, 'src'), { recursive: true })

    await writeFile(join(designDir, 'design.md'), '# Design\n\n`LegacyName`\n', 'utf-8')
    await writeFile(
      join(designDir, 'design.meta.json'),
      JSON.stringify({
        feature: 'sidecar-drift',
        constraints: [],
        scopeBoundary: {
          inScope: ['drift detection'],
          outOfScope: ['legacy parsing removal'],
        },
        acceptanceCriteria: [],
        goals: ['Use structured sidecar expectations for drift detection'],
        nonGoals: [],
        expectedSymbols: [
          { name: 'ExpectedArchiveSymbol', kind: 'function', module: 'src/expected.ts' },
        ],
        expectedModules: [
          { path: 'src/expected.ts', purpose: 'Expected archive implementation module' },
        ],
      }),
      'utf-8'
    )

    await writeFile(join(testDir, 'src', 'expected.ts'), 'export function ExpectedArchiveSymbol() {}\n', 'utf-8')
    await writeFile(join(testDir, 'src', 'unexpected.ts'), 'export function SurpriseArchiveSymbol() {}\n', 'utf-8')

    const phasedChanges: PhasedChanges = {
      implementation: [],
      acceptance: [
        { filePath: 'src/expected.ts', tool: 'edit' },
        { filePath: 'src/unexpected.ts', tool: 'edit' },
      ],
    }

    const drifts = await detectDrift(testDir, designDir, phasedChanges)

    expect(drifts.some(item => item.item === 'ExpectedArchiveSymbol')).toBe(false)
    expect(drifts.some(item => item.item === 'SurpriseArchiveSymbol')).toBe(true)
    expect(drifts.some(item => item.item === 'src/unexpected.ts')).toBe(true)

    await rm(testDir, { recursive: true, force: true })
  })

  test('detectDrift should fall back to markdown keyword extraction when no sidecar exists', async () => {
    const testDir = join(process.cwd(), '.test-drift-detector-markdown-fallback')
    const designDir = join(testDir, 'docs', 'changes', 'markdown-drift')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(designDir, { recursive: true })
    await mkdir(join(testDir, 'src'), { recursive: true })

    await writeFile(join(designDir, 'design.md'), '# Design\n\n`ExpectedArchiveSymbol`\n', 'utf-8')
    await writeFile(join(testDir, 'src', 'markdown.ts'), 'export function SurpriseArchiveSymbol() {}\n', 'utf-8')

    const phasedChanges: PhasedChanges = {
      implementation: [],
      acceptance: [{ filePath: 'src/markdown.ts', tool: 'edit' }],
    }

    const drifts = await detectDrift(testDir, designDir, phasedChanges)

    expect(drifts).toHaveLength(1)
    expect(drifts[0]?.item).toBe('SurpriseArchiveSymbol')
    expect(drifts[0]?.actualCode).toContain('src/markdown.ts')

    await rm(testDir, { recursive: true, force: true })
  })
})
