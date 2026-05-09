/**
 * Tests for scan stage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { runScanStage } from '../../../../src/phases/migrate-docs/stages/scan'
import { createInitialMigrationState } from '../../../../src/phases/migrate-docs/state-machine'
import type { DocAdapter, FileInventory, ClassificationResult, AdapterDetectResult } from '../../../../src/phases/migrate-docs/types'
import type { SourceType } from '../../../../src/phases/migrate-docs/types'
import { ErrorCode, OpenFlowError } from '../../../../src/utils/errors'

describe('runScanStage', () => {
  let tempDir: string
  let sourceDir: string

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'scan-test-' + Date.now())
    sourceDir = path.join(tempDir, 'source-docs')
    await fs.mkdir(sourceDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  function createMockAdapter(scanResult: FileInventory[]): DocAdapter {
    return {
      name: 'generic' as SourceType,
      detect: async (): Promise<AdapterDetectResult> => ({
        adapter: 'generic',
        detected: true,
        confidence: 0.3,
      }),
      scan: async () => scanResult,
      classify: async (): Promise<ClassificationResult[]> => [],
    }
  }

  function makeInventoryItem(relPath: string): FileInventory {
    const fullPath = path.join(sourceDir, relPath)
    const ext = path.extname(relPath)
    const dirContext = path.dirname(relPath)
    return {
      sourcePath: fullPath,
      relativePath: relPath,
      size: 100,
      modifiedAt: new Date().toISOString(),
      extension: ext,
      directoryContext: dirContext === '.' ? '' : dirContext,
    }
  }

  /**
   * Helper to create files on disk matching the inventory items
   */
  async function createFilesForInventory(items: FileInventory[]): Promise<void> {
    for (const item of items) {
      const dir = path.dirname(item.sourcePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(item.sourcePath, `# ${path.basename(item.sourcePath)}`)
    }
  }

  it('should throw INVALID_INPUT for empty source (0 Markdown files)', async () => {
    const adapter = createMockAdapter([])
    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'

    await expect(runScanStage(state, adapter)).rejects.toThrow(OpenFlowError)
    await expect(runScanStage(state, adapter)).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    })
  })

  it('should filter out non-Markdown files with warning', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const items = [
      makeInventoryItem('doc1.md'),
      makeInventoryItem('readme.txt'),
      makeInventoryItem('image.png'),
      makeInventoryItem('notes.md'),
    ]
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)

    expect(result.inventory).toHaveLength(2)
    expect(result.inventory.map(i => i.relativePath)).toContain('doc1.md')
    expect(result.inventory.map(i => i.relativePath)).toContain('notes.md')
    expect(result.inventory.map(i => i.relativePath)).not.toContain('readme.txt')
    expect(result.inventory.map(i => i.relativePath)).not.toContain('image.png')

    const warnings = consoleWarnSpy.mock.calls.filter(c =>
      String(c[0]).includes('non-Markdown')
    )
    expect(warnings.length).toBeGreaterThanOrEqual(1)

    consoleWarnSpy.mockRestore()
  })

  it('should skip symlinked files within source', async () => {
    const realFile = path.join(sourceDir, 'real.md')
    const linkFile = path.join(sourceDir, 'link.md')
    await fs.writeFile(realFile, '# Real')

    try {
      await fs.symlink(realFile, linkFile)
    } catch {
      // Skip test if symlinks not supported
      return
    }

    const adapter = createMockAdapter([
      makeInventoryItem('real.md'),
      makeInventoryItem('link.md'),
    ])

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)

    expect(result.inventory).toHaveLength(1)
    expect(result.inventory[0]!.relativePath).toBe('real.md')
  })

  it('should enforce MAX_SCAN_DEPTH and skip deeper files', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Create a path with depth > 10 (11 slashes = depth 11)
    const reallyDeepPath = 'a/b/c/d/e/f/g/h/i/j/k/too-deep.md'
    const items = [
      makeInventoryItem('root.md'),
      makeInventoryItem(reallyDeepPath),
    ]
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)
    expect(result.inventory).toHaveLength(1)
    expect(result.inventory[0]!.relativePath).toBe('root.md')

    const depthWarnings = consoleWarnSpy.mock.calls.filter(c =>
      String(c[0]).includes('max depth')
    )
    expect(depthWarnings.length).toBeGreaterThanOrEqual(1)

    consoleWarnSpy.mockRestore()
  })

  it('should enforce MAX_SCAN_FILES limit', { timeout: 120000 }, async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const items: FileInventory[] = []
    for (let i = 0; i < 5002; i++) {
      items.push(makeInventoryItem(`doc-${i}.md`))
    }
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)

    expect(result.inventory).toHaveLength(5000)

    const limitWarnings = consoleWarnSpy.mock.calls.filter(c =>
      String(c[0]).includes('max files limit')
    )
    expect(limitWarnings.length).toBeGreaterThanOrEqual(1)

    consoleWarnSpy.mockRestore()
  })

  it('should sort inventory by relative path', async () => {
    const items = [
      makeInventoryItem('zebra.md'),
      makeInventoryItem('alpha.md'),
      makeInventoryItem('beta/gamma.md'),
      makeInventoryItem('beta/alpha.md'),
    ]
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)

    const paths = result.inventory.map(i => i.relativePath)
    expect(paths).toEqual([
      'alpha.md',
      'beta/alpha.md',
      'beta/gamma.md',
      'zebra.md',
    ])
  })

  it('should update state with inventory and advance to classify', async () => {
    const items = [
      makeInventoryItem('doc1.md'),
      makeInventoryItem('doc2.md'),
    ]
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)

    expect(result.stage).toBe('classify')
    expect(result.inventory).toHaveLength(2)
    expect(result.stageResults).toHaveLength(1)
    expect(result.stageResults[0]!.stage).toBe('scan')
    expect(result.stageResults[0]!.metadata).toMatchObject({
      totalFiles: 2,
    })
  })

  it('should include .markdown extension files', async () => {
    const items = [
      makeInventoryItem('readme.md'),
      makeInventoryItem('guide.markdown'),
    ]
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)

    expect(result.inventory).toHaveLength(2)
    expect(result.inventory.map(i => i.relativePath)).toContain('readme.md')
    expect(result.inventory.map(i => i.relativePath)).toContain('guide.markdown')
  })

  it('should validate paths and throw SECURITY_VIOLATION for traversal in scanned paths', async () => {
    const items = [
      {
        ...makeInventoryItem('valid.md'),
      },
      {
        ...makeInventoryItem('../outside.md'),
        sourcePath: path.join(tempDir, 'outside.md'),
      },
    ]
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'

    await expect(runScanStage(state, adapter)).rejects.toThrow(OpenFlowError)
    await expect(runScanStage(state, adapter)).rejects.toMatchObject({
      code: ErrorCode.SECURITY_VIOLATION,
    })
  })

  it('should handle mixed valid and invalid files gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const items = [
      makeInventoryItem('valid.md'),
      makeInventoryItem('script.js'),
      makeInventoryItem('another.md'),
      makeInventoryItem('style.css'),
    ]
    await createFilesForInventory(items)

    const adapter = createMockAdapter(items)

    const state = createInitialMigrationState(sourceDir, tempDir)
    state.sourceType = 'generic'
    state.stage = 'scan'

    const result = await runScanStage(state, adapter)

    expect(result.inventory).toHaveLength(2)
    expect(result.inventory.map(i => i.relativePath)).toEqual([
      'another.md',
      'valid.md',
    ])

    consoleWarnSpy.mockRestore()
  })
})
