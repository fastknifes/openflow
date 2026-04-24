/**
 * Cursor Adapter Tests
 *
 * Tests for cursorAdapter including:
 * - Detection with .cursor/rules directory (0.9 confidence)
 * - Detection with cursor.md/cursor-rules.md files (0.6 confidence)
 * - Scanning .cursor/ directory and root-level cursor files
 * - Classification of rules → current/workflow (0.6)
 * - Classification of conversation history → references/raw (0.4)
 * - Classification of cursor.md → references/raw (0.4)
 * - Default classification → references/raw (0.3)
 * - Warning for non-Markdown files
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { cursorAdapter } from '../../../../src/phases/migrate-docs/adapters/cursor.js'
import type { FileInventory } from '../../../../src/phases/migrate-docs/types.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = join(process.cwd(), 'tests', 'fixtures', 'cursor-test-' + Date.now())
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  // Clean up fixture directory recursively
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

describe('cursorAdapter.detect', () => {
  it('should detect 0.9 confidence when .cursor/rules/ directory exists', async () => {
    await mkdir(join(tmpDir, '.cursor', 'rules'), { recursive: true })

    const result = await cursorAdapter.detect(tmpDir)

    expect(result.adapter).toBe('cursor')
    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.9)
    expect(result.metadata?.hasCursorRulesDir).toBe('true')
  })

  it('should detect 0.6 confidence when cursor.md exists', async () => {
    await writeFile(join(tmpDir, 'cursor.md'), '# Cursor Rules\n')

    const result = await cursorAdapter.detect(tmpDir)

    expect(result.adapter).toBe('cursor')
    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.6)
    expect(result.metadata?.hasCursorMd).toBe('true')
  })

  it('should detect 0.6 confidence when cursor-rules.md exists', async () => {
    await writeFile(join(tmpDir, 'cursor-rules.md'), '# Cursor Rules\n')

    const result = await cursorAdapter.detect(tmpDir)

    expect(result.adapter).toBe('cursor')
    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.6)
    expect(result.metadata?.hasCursorRulesMd).toBe('true')
  })

  it('should prefer 0.9 over 0.6 when both exist', async () => {
    await mkdir(join(tmpDir, '.cursor', 'rules'), { recursive: true })
    await writeFile(join(tmpDir, 'cursor.md'), '# Cursor Rules\n')

    const result = await cursorAdapter.detect(tmpDir)

    expect(result.confidence).toBe(0.9)
    expect(result.metadata?.hasCursorRulesDir).toBe('true')
    expect(result.metadata?.hasCursorMd).toBe('true')
  })

  it('should return detected false with 0 confidence when no cursor files exist', async () => {
    const result = await cursorAdapter.detect(tmpDir)

    expect(result.adapter).toBe('cursor')
    expect(result.detected).toBe(false)
    expect(result.confidence).toBe(0)
  })
})

describe('cursorAdapter.scan', () => {
  it('should scan markdown files in .cursor/ directory', async () => {
    await mkdir(join(tmpDir, '.cursor', 'rules'), { recursive: true })
    await writeFile(join(tmpDir, '.cursor', 'rules', 'js.md'), '# JS Rules\n')
    await writeFile(join(tmpDir, '.cursor', 'rules', 'ts.md'), '# TS Rules\n')

    const results = await cursorAdapter.scan(tmpDir)

    expect(results).toHaveLength(2)
    const paths = results.map(r => r.relativePath.replace(/\\/g, '/'))
    expect(paths).toContain('.cursor/rules/js.md')
    expect(paths).toContain('.cursor/rules/ts.md')
  })

  it('should scan root-level cursor.md and cursor-rules.md', async () => {
    await writeFile(join(tmpDir, 'cursor.md'), '# Cursor\n')
    await writeFile(join(tmpDir, 'cursor-rules.md'), '# Rules\n')

    const results = await cursorAdapter.scan(tmpDir)

    expect(results).toHaveLength(2)
    const paths = results.map(r => r.relativePath.replace(/\\/g, '/'))
    expect(paths).toContain('cursor.md')
    expect(paths).toContain('cursor-rules.md')
  })

  it('should skip non-markdown files with warning', async () => {
    await mkdir(join(tmpDir, '.cursor'), { recursive: true })
    await writeFile(join(tmpDir, '.cursor', 'config.json'), '{}')

    const results = await cursorAdapter.scan(tmpDir)

    expect(results).toHaveLength(0)
  })

  it('should skip symlinks', async () => {
    await mkdir(join(tmpDir, '.cursor'), { recursive: true })
    await writeFile(join(tmpDir, '.cursor', 'real.md'), '# Real\n')
    // Create symlink
    try {
      const { symlink } = await import('node:fs/promises')
      await symlink(
        join(tmpDir, '.cursor', 'real.md'),
        join(tmpDir, '.cursor', 'link.md')
      )
    } catch {
      // symlinks may not be supported on all platforms
    }

    const results = await cursorAdapter.scan(tmpDir)

    // Should only have the real file, not the symlink
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => !r.relativePath.includes('link.md'))).toBe(true)
  })

  it('should return empty array when no cursor files exist', async () => {
    const results = await cursorAdapter.scan(tmpDir)
    expect(results).toHaveLength(0)
  })
})

describe('cursorAdapter.classify', () => {
  it('should classify .cursor/rules files to current/workflow with confidence 0.6', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.cursor', 'rules', 'js.md'),
        relativePath: '.cursor/rules/js.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: 'rules',
      },
    ]

    const results = await cursorAdapter.classify(inventory)

    expect(results).toHaveLength(1)
    expect(results[0].targetType).toBe('current/workflow')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.6)
    expect(results[0].proposedTargetPath).toBe('docs/current/workflow/cursor-rules.md')
  })

  it('should classify conversation history files to references/raw with confidence 0.4', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.cursor', 'history.md'),
        relativePath: '.cursor/history.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.cursor',
      },
      {
        sourcePath: join(tmpDir, '.cursor', 'chat.md'),
        relativePath: '.cursor/chat.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.cursor',
      },
      {
        sourcePath: join(tmpDir, '.cursor', 'conversation.md'),
        relativePath: '.cursor/conversation.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.cursor',
      },
    ]

    const results = await cursorAdapter.classify(inventory)

    expect(results).toHaveLength(3)
    for (const result of results) {
      expect(result.targetType).toBe('references/raw')
      expect(result.confidence).toBe('low')
      expect(result.confidenceScore).toBe(0.4)
      expect(result.proposedTargetPath).toMatch(/^docs\/references\/raw\/cursor-conversations\//)
    }
  })

  it('should classify cursor.md to references/raw with confidence 0.4', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, 'cursor.md'),
        relativePath: 'cursor.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: 'test',
      },
    ]

    const results = await cursorAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.4)
    expect(results[0].proposedTargetPath).toBe('docs/references/raw/cursor.md')
  })

  it('should classify cursor-rules.md to references/raw with confidence 0.4', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, 'cursor-rules.md'),
        relativePath: 'cursor-rules.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: 'test',
      },
    ]

    const results = await cursorAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.4)
    expect(results[0].proposedTargetPath).toBe('docs/references/raw/cursor-rules.md')
  })

  it('should default unrecognized files to references/raw with confidence 0.3', async () => {
    const inventory: FileInventory[] = [
      {
        sourcePath: join(tmpDir, '.cursor', 'notes.md'),
        relativePath: '.cursor/notes.md',
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension: '.md',
        directoryContext: '.cursor',
      },
    ]

    const results = await cursorAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.3)
    expect(results[0].proposedTargetPath).toBe('docs/references/raw/cursor/notes.md')
  })
})
