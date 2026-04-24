/**
 * Tests for detect stage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { runDetectStage } from '../../../../src/phases/migrate-docs/stages/detect'
import { createInitialMigrationState } from '../../../../src/phases/migrate-docs/state-machine'
import { AdapterRegistry } from '../../../../src/phases/migrate-docs/adapters/index'
import type { DocAdapter, AdapterDetectResult, FileInventory, ClassificationResult } from '../../../../src/phases/migrate-docs/types'
import type { SourceType } from '../../../../src/phases/migrate-docs/types'
import { ErrorCode, OpenFlowError } from '../../../../src/utils/errors'

describe('runDetectStage', () => {
  let tempDir: string
  let testDir: string

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'detect-test-' + Date.now())
    testDir = path.join(tempDir, 'test-project')
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    // Cleanup temp directory recursively
    try {
      const entries = await fs.readdir(tempDir, { withFileTypes: true, recursive: true })
      // Sort by depth (deepest first) to delete children before parents
      const sorted = entries
        .map(e => ({
          path: path.join(tempDir, e.parentPath ? path.relative(tempDir, e.parentPath) : '', e.name),
          dirent: e,
        }))
        .sort((a, b) => b.path.split(path.sep).length - a.path.split(path.sep).length)

      for (const { path: p, dirent } of sorted) {
        if (dirent.isDirectory()) {
          await fs.rmdir(p).catch(() => {})
        } else {
          await fs.unlink(p).catch(() => {})
        }
      }
      await fs.rmdir(tempDir).catch(() => {})
    } catch {
      // Ignore cleanup errors
    }
  })

  function createMockAdapter(
    name: SourceType,
    detectResult: AdapterDetectResult
  ): DocAdapter {
    return {
      name,
      detect: async () => detectResult,
      scan: async () => [] as FileInventory[],
      classify: async () => [] as ClassificationResult[],
    }
  }

  it('should throw SECURITY_VIOLATION for path traversal', async () => {
    const state = createInitialMigrationState(
      '../traversal-attempt',
      testDir
    )
    const registry = new AdapterRegistry()

    await expect(runDetectStage(state, registry)).rejects.toThrow(OpenFlowError)
    await expect(runDetectStage(state, registry)).rejects.toMatchObject({
      code: ErrorCode.SECURITY_VIOLATION,
    })
  })

  it('should throw SECURITY_VIOLATION for source directory containing ".."', async () => {
    const rawPath = testDir + path.sep + '..' + path.sep + 'other'
    const state = createInitialMigrationState(
      rawPath,
      testDir
    )
    const registry = new AdapterRegistry()

    await expect(runDetectStage(state, registry)).rejects.toThrow(OpenFlowError)
    await expect(runDetectStage(state, registry)).rejects.toMatchObject({
      code: ErrorCode.SECURITY_VIOLATION,
    })
  })

  it('should throw SECURITY_VIOLATION for symlink source directory', async () => {
    const realDir = path.join(tempDir, 'real-source')
    const linkDir = path.join(tempDir, 'link-source')
    await fs.mkdir(realDir, { recursive: true })

    // Create symlink (may fail on some Windows configurations without admin rights)
    try {
      await fs.symlink(realDir, linkDir, 'dir')
    } catch {
      // Skip test if symlinks not supported
      return
    }

    const state = createInitialMigrationState(linkDir, testDir)
    const registry = new AdapterRegistry()

    await expect(runDetectStage(state, registry)).rejects.toThrow(OpenFlowError)
    await expect(runDetectStage(state, registry)).rejects.toMatchObject({
      code: ErrorCode.SECURITY_VIOLATION,
    })
  })

  it('should throw FILE_NOT_FOUND for non-existent directory', async () => {
    const state = createInitialMigrationState(
      path.join(testDir, 'non-existent-dir'),
      testDir
    )
    const registry = new AdapterRegistry()

    await expect(runDetectStage(state, registry)).rejects.toThrow(OpenFlowError)
    await expect(runDetectStage(state, registry)).rejects.toMatchObject({
      code: ErrorCode.FILE_NOT_FOUND,
    })
  })

  it('should throw FILE_NOT_FOUND for file instead of directory', async () => {
    const filePath = path.join(testDir, 'not-a-directory.txt')
    await fs.writeFile(filePath, 'content')

    const state = createInitialMigrationState(filePath, testDir)
    const registry = new AdapterRegistry()

    await expect(runDetectStage(state, registry)).rejects.toThrow(OpenFlowError)
    await expect(runDetectStage(state, registry)).rejects.toMatchObject({
      code: ErrorCode.FILE_NOT_FOUND,
    })
  })

  it('should auto-select single adapter with high confidence', async () => {
    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('cursor', {
      adapter: 'cursor',
      detected: true,
      confidence: 0.9,
    }))

    const state = createInitialMigrationState(testDir, testDir)
    const result = await runDetectStage(state, registry)

    expect(result.sourceType).toBe('cursor')
    expect(result.selectedAdapter).toBe('cursor')
    expect(result.detectedAdapters).toHaveLength(1)
    expect(result.detectedAdapters![0]!.confidence).toBe(0.9)
    expect(result.stage).toBe('scan')
  })

  it('should add pending question when multiple adapters detected with high confidence', async () => {
    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('cursor', {
      adapter: 'cursor',
      detected: true,
      confidence: 0.9,
    }))
    registry.register(createMockAdapter('trae', {
      adapter: 'trae',
      detected: true,
      confidence: 0.8,
    }))

    const state = createInitialMigrationState(testDir, testDir)
    const result = await runDetectStage(state, registry)

    expect(result.detectedAdapters).toHaveLength(2)
    expect(result.selectedAdapter).toBe('cursor') // Highest confidence selected as default
    expect(result.pendingQuestions).toHaveLength(2) // adapter selection + OpenFlow init

    const adapterQuestion = result.pendingQuestions.find(q => q.batchTopic === 'adapter-selection')
    expect(adapterQuestion).toBeDefined()
    expect(adapterQuestion!.options).toHaveLength(2)
  })

  it('should use generic adapter when no adapter detects with sufficient confidence', async () => {
    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('cursor', {
      adapter: 'cursor',
      detected: true,
      confidence: 0.2, // Below threshold
    }))

    const state = createInitialMigrationState(testDir, testDir)
    const result = await runDetectStage(state, registry)

    expect(result.sourceType).toBe('generic')
    expect(result.selectedAdapter).toBe('generic')
  })

  it('should use generic adapter when no adapters detect at all', async () => {
    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('cursor', {
      adapter: 'cursor',
      detected: false,
      confidence: 0,
    }))

    const state = createInitialMigrationState(testDir, testDir)
    const result = await runDetectStage(state, registry)

    expect(result.sourceType).toBe('generic')
    expect(result.selectedAdapter).toBe('generic')
  })

  it('should detect existing OpenFlow init (AGENTS.md with marker)', async () => {
    const agentsContent = `# Project\n\n<!-- OPENFLOW DOCS GUIDE:BEGIN -->\nSome guide\n<!-- OPENFLOW DOCS GUIDE:END -->`
    await fs.writeFile(path.join(testDir, 'AGENTS.md'), agentsContent)

    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('generic', {
      adapter: 'generic',
      detected: true,
      confidence: 0.3,
    }))

    const state = createInitialMigrationState(testDir, testDir)
    const result = await runDetectStage(state, registry)

    expect(result.needsOpenFlowInit).toBe(false)
    expect(result.openFlowInitConfirmed).toBeUndefined()
  })

  it('should add pending question when OpenFlow not initialized', async () => {
    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('generic', {
      adapter: 'generic',
      detected: true,
      confidence: 0.3,
    }))

    const state = createInitialMigrationState(testDir, testDir)
    const result = await runDetectStage(state, registry)

    expect(result.needsOpenFlowInit).toBe(true)

    const initQuestion = result.pendingQuestions.find(q => q.batchTopic === 'openflow-init')
    expect(initQuestion).toBeDefined()
    expect(initQuestion!.question).toContain('initialize OpenFlow')
  })

  it('should use provided targetRoot when different from sourcePath', async () => {
    const customTarget = path.join(tempDir, 'custom-target')
    await fs.mkdir(customTarget, { recursive: true })

    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('generic', {
      adapter: 'generic',
      detected: true,
      confidence: 0.3,
    }))

    const state = createInitialMigrationState(testDir, customTarget)
    const result = await runDetectStage(state, registry)

    expect(result.targetRoot).toBe(customTarget)
  })

  it('should default targetRoot to sourcePath parent when not provided', async () => {
    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('generic', {
      adapter: 'generic',
      detected: true,
      confidence: 0.3,
    }))

    const state = createInitialMigrationState(testDir, '')
    const result = await runDetectStage(state, registry)

    expect(result.targetRoot).toBe(tempDir) // Parent of testDir
  })

  it('should store detection results in stageResults', async () => {
    const registry = new AdapterRegistry()
    registry.register(createMockAdapter('cursor', {
      adapter: 'cursor',
      detected: true,
      confidence: 0.9,
      metadata: { rulesDir: 'found' },
    }))

    const state = createInitialMigrationState(testDir, testDir)
    const result = await runDetectStage(state, registry)

    expect(result.stageResults).toHaveLength(1)
    expect(result.stageResults[0]!.stage).toBe('detect')
    expect(result.stageResults[0]!.metadata).toMatchObject({
      detectedAdapters: ['cursor'],
      selectedAdapter: 'cursor',
    })
  })
})
