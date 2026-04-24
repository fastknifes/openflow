/**
 * Generic Adapter Tests
 *
 * Tests for genericAdapter including:
 * - Always detects with confidence 0.3
 * - Keyword-based filename classification
 * - README → references/raw (0.3)
 * - DESIGN → current/design (0.5)
 * - SPEC → current/spec (0.5)
 * - REQUIREMENT/需求 → current/requirements (0.5)
 * - TODO/CHANGELOG → changes (0.4)
 * - DEPRECATED/legacy/old/旧 → archive (0.6)
 * - ADR/decision/决策 → decisions (0.4)
 * - First-heading extraction from first 50 lines
 * - Default fallback → references/raw (0.3)
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdir, writeFile, rmdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { genericAdapter } from '../../../../src/phases/migrate-docs/adapters/generic.js'
import type { FileInventory } from '../../../../src/phases/migrate-docs/types.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = join(process.cwd(), 'tests', 'fixtures', 'generic-test-' + Date.now())
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

async function createInventory(filename: string, content: string): Promise<FileInventory[]> {
  const filepath = join(tmpDir, filename)
  await writeFile(filepath, content)
  return [{
    sourcePath: filepath,
    relativePath: filename,
    size: content.length,
    modifiedAt: new Date().toISOString(),
    extension: '.md',
    directoryContext: 'test',
  }]
}

describe('genericAdapter.detect', () => {
  it('should always detect with confidence 0.3', async () => {
    const result = await genericAdapter.detect(tmpDir)

    expect(result.adapter).toBe('generic')
    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.3)
  })

  it('should detect even on empty directory', async () => {
    const result = await genericAdapter.detect(tmpDir)

    expect(result.detected).toBe(true)
    expect(result.confidence).toBe(0.3)
  })
})

describe('genericAdapter.scan', () => {
  it('should scan all markdown files in source directory', async () => {
    await writeFile(join(tmpDir, 'a.md'), '# A\n')
    await writeFile(join(tmpDir, 'b.md'), '# B\n')
    await mkdir(join(tmpDir, 'sub'), { recursive: true })
    await writeFile(join(tmpDir, 'sub', 'c.md'), '# C\n')

    const results = await genericAdapter.scan(tmpDir)

    expect(results).toHaveLength(3)
    const paths = results.map(r => r.relativePath.replace(/\\/g, '/'))
    expect(paths).toContain('a.md')
    expect(paths).toContain('b.md')
    expect(paths).toContain('sub/c.md')
  })

  it('should skip non-markdown files', async () => {
    await writeFile(join(tmpDir, 'doc.md'), '# Doc\n')
    await writeFile(join(tmpDir, 'script.js'), 'console.log()')

    const results = await genericAdapter.scan(tmpDir)

    expect(results).toHaveLength(1)
    expect(results[0].relativePath.replace(/\\/g, '/')).toBe('doc.md')
  })

  it('should skip symlinks', async () => {
    await writeFile(join(tmpDir, 'real.md'), '# Real\n')
    try {
      const { symlink } = await import('node:fs/promises')
      await symlink(join(tmpDir, 'real.md'), join(tmpDir, 'link.md'))
    } catch {
      // symlinks may not be supported
    }

    const results = await genericAdapter.scan(tmpDir)

    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.relativePath !== 'link.md')).toBe(true)
  })

  it('should return empty array for empty directory', async () => {
    const results = await genericAdapter.scan(tmpDir)
    expect(results).toHaveLength(0)
  })
})

describe('genericAdapter.classify by filename keywords', () => {
  it('should classify README.md to references/raw with confidence 0.3', async () => {
    const inventory = await createInventory('README.md', '# README\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.3)
    expect(results[0].proposedTargetPath).toBe('docs/references/raw/README.md')
  })

  it('should classify DESIGN.md to current/design with confidence 0.5', async () => {
    const inventory = await createInventory('DESIGN.md', '# Design\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/design')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.5)
    expect(results[0].proposedTargetPath).toBe('docs/current/design/DESIGN.md')
  })

  it('should classify design.md (lowercase) to current/design with confidence 0.5', async () => {
    const inventory = await createInventory('design.md', '# Design\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/design')
    expect(results[0].confidenceScore).toBe(0.5)
  })

  it('should classify SPEC.md to current/spec with confidence 0.5', async () => {
    const inventory = await createInventory('SPEC.md', '# Spec\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/spec')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.5)
    expect(results[0].proposedTargetPath).toBe('docs/current/spec/SPEC.md')
  })

  it('should classify spec.md (lowercase) to current/spec with confidence 0.5', async () => {
    const inventory = await createInventory('spec.md', '# Spec\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/spec')
    expect(results[0].confidenceScore).toBe(0.5)
  })

  it('should classify REQUIREMENT.md to current/requirements with confidence 0.5', async () => {
    const inventory = await createInventory('REQUIREMENT.md', '# Requirements\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/requirements')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.5)
    expect(results[0].proposedTargetPath).toBe('docs/current/requirements/REQUIREMENT.md')
  })

  it('should classify requirement.md to current/requirements with confidence 0.5', async () => {
    const inventory = await createInventory('requirement.md', '# Requirements\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/requirements')
    expect(results[0].confidenceScore).toBe(0.5)
  })

  it('should classify TODO.md to changes with confidence 0.4', async () => {
    const inventory = await createInventory('TODO.md', '# TODO\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('changes')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.4)
    expect(results[0].proposedTargetPath).toBe('docs/changes/TODO.md')
  })

  it('should classify CHANGELOG.md to changes with confidence 0.4', async () => {
    const inventory = await createInventory('CHANGELOG.md', '# Changelog\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('changes')
    expect(results[0].confidenceScore).toBe(0.4)
  })

  it('should classify DEPRECATED.md to archive with confidence 0.6', async () => {
    const inventory = await createInventory('DEPRECATED.md', '# Deprecated\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('archive')
    expect(results[0].confidence).toBe('medium')
    expect(results[0].confidenceScore).toBe(0.6)
    expect(results[0].proposedTargetPath).toBe('docs/archive/DEPRECATED.md')
  })

  it('should classify legacy.md to archive with confidence 0.6', async () => {
    const inventory = await createInventory('legacy.md', '# Legacy\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('archive')
    expect(results[0].confidenceScore).toBe(0.6)
  })

  it('should classify old.md to archive with confidence 0.6', async () => {
    const inventory = await createInventory('old.md', '# Old\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('archive')
    expect(results[0].confidenceScore).toBe(0.6)
  })

  it('should classify ADR.md to decisions with confidence 0.4', async () => {
    const inventory = await createInventory('ADR.md', '# ADR\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('decisions')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.4)
    expect(results[0].proposedTargetPath).toBe('docs/decisions/ADR.md')
  })

  it('should classify decision.md to decisions with confidence 0.4', async () => {
    const inventory = await createInventory('decision.md', '# Decision\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('decisions')
    expect(results[0].confidenceScore).toBe(0.4)
  })

  it('should default unrecognized files to references/raw with confidence 0.3', async () => {
    const inventory = await createInventory('notes.md', '# Notes\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidence).toBe('low')
    expect(results[0].confidenceScore).toBe(0.3)
    expect(results[0].proposedTargetPath).toBe('docs/references/raw/notes.md')
  })
})

describe('genericAdapter.classify by heading extraction', () => {
  it('should use first heading for design classification', async () => {
    const inventory = await createInventory('doc.md', '# Design Architecture\n\nSome content\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/design')
    expect(results[0].confidenceScore).toBe(0.5)
  })

  it('should use first heading for spec classification', async () => {
    const inventory = await createInventory('doc.md', '# API Specification\n\nSome content\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/spec')
    expect(results[0].confidenceScore).toBe(0.5)
  })

  it('should use first heading for requirements classification', async () => {
    const inventory = await createInventory('doc.md', '# Product Requirements\n\nSome content\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('current/requirements')
    expect(results[0].confidenceScore).toBe(0.5)
  })

  it('should fallback to references/raw when no heading match', async () => {
    const inventory = await createInventory('doc.md', '# Random Title\n\nSome content\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidenceScore).toBe(0.3)
  })

  it('should handle files without headings', async () => {
    const inventory = await createInventory('doc.md', 'Just some text\nwithout any heading\n')
    const results = await genericAdapter.classify(inventory)

    expect(results[0].targetType).toBe('references/raw')
    expect(results[0].confidenceScore).toBe(0.3)
  })
})
