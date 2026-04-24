/**
 * Trae Adapter Tests
 *
 * Tests for traeAdapter including:
 * - Detection with .trae/ directory containing docs/rules (0.9 confidence)
 * - Detection with only .trae/ directory (0.5 confidence)
 * - Scanning .trae/ directory for markdown files
 * - Classification of rules → current/workflow (0.6)
 * - Classification of config → references/raw (0.4)
 * - Default classification → references/raw (0.3)
 * - Warning for non-Markdown files
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { traeAdapter } from '../../../../src/phases/migrate-docs/adapters/trae.js'
import type { FileInventory } from '../../../../src/phases/migrate-docs/types.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = join(process.cwd(), 'tests', 'fixtures', 'trae-test-' + Date.now())
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await cleanupDir(tmpDir)
})

async function cleanupDir(dir: string): Promise<void> {
  try {
    const entries = await (await import('node:fs/promises')).readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await cleanupDir(fullPath)
        await rmdir(fullPath)
      } else {
        await unlink(fullPath)
      }
    }
    await rmdir(dir)
  } catch {
    // ignore cleanup errors
  }
}

describe('traeAdapter.detect', () => {
  it('should detect 0.9 confidence when .trae/ has docs or rules subdirectory', async () => {
    await mkdir(join(tmpDir, '.trae', 'docs'), { recursive: true })

    const result = await traeAdapter.detect(tmpDir)

    expect(result.adapter).toBe('trae')
    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.9)
    expect(result.metadata?.hasTraeDocs).toBe('true')
  })

  it('should detect 0.9 confidence when .trae/ has rules subdirectory', async () => {
    await mkdir(join(tmpDir, '.trae', 'rules'), { recursive: true })

    const result = await traeAdapter.detect(tmpDir)

    expect(result.adapter).toBe('trae')
    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.9)
    expect(result.metadata?.hasTraeRules).toBe('true')
  })

  it('should detect 0.5 confidence when only .trae/ directory exists', async () => {
    await mkdir(join(tmpDir, '.trae'), { recursive: true })

    const result = await traeAdapter.detect(tmpDir)

    expect(result.adapter).toBe('trae')
    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.5)
  })

  it('should prefer 0.9 over 0.5 when both docs and empty .trae exist', async () => {
    await mkdir(join(tmpDir, '.trae', 'docs'), { recursive: true })
    await mkdir(join(tmpDir, '.trae', 'rules'), { recursive: true })

    const result = await traeAdapter.detect(tmpDir)

    expect(result.confidence).toBe(0.9)
    expect(result.metadata?.hasTraeDocs).toBe('true')
    expect(result.metadata?.hasTraeRules).toBe('true')
  })

  it('should return detected false with 0 confidence when no .trae directory exists', async () => {
    const result = await traeAdapter.detect(tmpDir)

    expect(result.adapter).toBe('trae')
    expect(result.detected).toBe(false)
    expect(result.confidence).toBe(0)
  })
})

describe('traeAdapter.scan', () => {
  it('should scan markdown files in .trae/ directory', async () => {
    await mkdir(join(tmpDir, '.trae', 'docs'), { recursive: true })
    await writeFile(join(tmpDir, '.trae', 'docs', 'guide.md'), '# Guide\n')
    await writeFile(join(tmpDir, '.trae', 'docs', 'api.md'), '# API\n')

    const results = await traeAdapter.scan(tmpDir)

    expect(results).toHaveLength(2)
    const paths = results.map(r => r.relativePath.replace(/\\/g, '/'))
    expect(paths).toContain('.trae/docs/guide.md')
    expect(paths).toContain('.trae/docs/api.md')
  })

  it('should scan recursively in .trae/ directory', async () => {
    await mkdir(join(tmpDir, '.trae', 'rules', 'nested'), { recursive: true })
    await writeFile(join(tmpDir, '.trae', 'rules', 'main.md'), '# Rules\n')
    await writeFile(join(tmpDir, '.trae', 'rules', 'nested', 'sub.md'), '# Sub Rules\n')

    const results = await traeAdapter.scan(tmpDir)

    expect(results).toHaveLength(2)
    const paths = results.map(r => r.relativePath.replace(/\\/g, '/'))
    expect(paths).toContain('.trae/rules/main.md')
    expect(paths).toContain('.trae/rules/nested/sub.md')
  })

  it('should skip non-markdown files with warning', async () => {
    await mkdir(join(tmpDir, '.trae'), { recursive: true })
    await writeFile(join(tmpDir, '.trae', 'config.json'), '{}')

    const results = await traeAdapter.scan(tmpDir)

    expect(results).toHaveLength(0)
  })

  it('should skip symlinks', async () => {
    await mkdir(join(tmpDir, '.trae'), { recursive: true })
    await writeFile(join(tmpDir, '.trae', 'real.md'), '# Real\n')
    try {
      const { symlink } = await import('node:fs/promises')
      await symlink(
        join(tmpDir, '.trae', 'real.md'),
        join(tmpDir, '.trae', 'link.md')
      )
    } catch {
      // symlinks may not be supported on all platforms
    }

    const results = await traeAdapter.scan(tmpDir)

    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => !r.relativePath.includes('link.md'))).toBe(true)
  })

  it('should return empty array when no .trae directory exists', async () => {
    const results = await traeAdapter.scan(tmpDir)
    expect(results).toHaveLength(0)
  })
})

describe('traeAdapter.classify', () => {
  it('should classify rules files to current/workflow with confidence 0.6', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.trae', 'rules', 'coding.md'),
        relativePath: '.trae/rules/coding.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: 'rules',
      },
    ]

    const results = await traeAdapter.classify(inventory)

    expect(results).toHaveLength(1)
    expect(results[0].targetType).toBe('current/workflow')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.6)
    expect(results[0].proposedTargetPath).toBe('docs/current/workflow/coding.md')
  })

  it('should classify files with "rule" in name to current/workflow with confidence 0.6', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.trae', 'js-rules.md'),
        relativePath: '.trae/js-rules.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.trae',
      },
    ]

    const results = await traeAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/workflow')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.6)
  })

  it('should classify files with "guideline" in name to current/workflow with confidence 0.6', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.trae', 'guidelines.md'),
        relativePath: '.trae/guidelines.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.trae',
      },
    ]

    const results = await traeAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/workflow')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.6)
  })

  it('should classify config files to references/raw with confidence 0.4', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.trae', 'config.md'),
        relativePath: '.trae/config.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.trae',
      },
    ]

    const results = await traeAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.4)
    expect(results[0].proposedTargetPath).toBe('docs/references/raw/trae/config.md')
  })

  it('should classify files with "setting" in name to references/raw with confidence 0.4', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.trae', 'settings.md'),
        relativePath: '.trae/settings.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.trae',
      },
    ]

    const results = await traeAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.4)
  })

  it('should classify files with "preference" in name to references/raw with confidence 0.4', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.trae', 'preferences.md'),
        relativePath: '.trae/preferences.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.trae',
      },
    ]

    const results = await traeAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.4)
  })

  it('should default unrecognized files to references/raw with confidence 0.3', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.trae', 'notes.md'),
        relativePath: '.trae/notes.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.trae',
      },
    ]

    const results = await traeAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.3)
    expect(results[0].proposedTargetPath).toBe('docs/references/raw/trae/notes.md')
  })
})
