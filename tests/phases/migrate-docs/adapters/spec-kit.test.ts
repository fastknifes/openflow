/**
 * Spec Kit Adapter Tests
 *
 * Tests for spec-kit adapter including:
 * - Detection with full, partial, and minimal structure
 * - Scanning for Markdown files under .specify/
 * - Classification of all Spec Kit file types
 * - ADR candidate handling (constitution.md, plan.md)
 * - Fallback behavior
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { specKitAdapter } from '../../../../src/phases/migrate-docs/adapters/spec-kit.js'
import type { ClassificationResult } from '../../../../src/phases/migrate-docs/types.js'

async function createFixture(structure: Record<string, string>): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-kit-test-'))
  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(tempDir, filePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
  }
  return tempDir
}

describe('spec-kit adapter', () => {
  let tempDir: string

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  describe('detect', () => {
    it('detects with 0.95 confidence when constitution.md and specs exist', async () => {
      tempDir = await createFixture({
        '.specify/memory/constitution.md': '# Constitution',
        '.specify/specs/auth/spec.md': '# Auth Spec',
      })

      const result = await specKitAdapter.detect(tempDir)
      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.95)
      expect(result.adapter).toBe('spec-kit')
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.hasConstitution).toBe('true')
      expect(result.metadata?.hasSpecs).toBe('true')
    })

    it('detects with 0.8 confidence when only specs exist', async () => {
      tempDir = await createFixture({
        '.specify/specs/auth/spec.md': '# Auth Spec',
      })

      const result = await specKitAdapter.detect(tempDir)
      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.8)
      expect(result.metadata?.hasSpecs).toBe('true')
    })

    it('detects with 0.5 confidence when only .specify/ exists', async () => {
      tempDir = await createFixture({
        '.specify/scripts/build.sh': '#!/bin/bash',
      })

      const result = await specKitAdapter.detect(tempDir)
      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.5)
    })

    it('returns not detected with 0 confidence when no .specify/', async () => {
      tempDir = await createFixture({
        'README.md': '# Hello',
      })

      const result = await specKitAdapter.detect(tempDir)
      expect(result.detected).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('includes scripts and templates in metadata when present', async () => {
      tempDir = await createFixture({
        '.specify/memory/constitution.md': '# Constitution',
        '.specify/specs/auth/spec.md': '# Auth Spec',
        '.specify/scripts/generate.ts': '// script',
        '.specify/templates/spec.md': '# Template',
      })

      const result = await specKitAdapter.detect(tempDir)
      expect(result.metadata?.hasScripts).toBe('true')
      expect(result.metadata?.hasTemplates).toBe('true')
    })
  })

  describe('scan', () => {
    it('lists all .md files under .specify/', async () => {
      tempDir = await createFixture({
        '.specify/memory/constitution.md': '# Constitution',
        '.specify/specs/auth/spec.md': '# Auth Spec',
        '.specify/specs/auth/plan.md': '# Auth Plan',
        '.specify/specs/auth/tasks.md': '# Auth Tasks',
        '.specify/research/notes.md': '# Research',
        'README.md': '# Hello',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const relativePaths = inventory.map(i => i.relativePath.replace(/\\/g, '/'))

      expect(relativePaths).toContain('.specify/memory/constitution.md')
      expect(relativePaths).toContain('.specify/specs/auth/spec.md')
      expect(relativePaths).toContain('.specify/specs/auth/plan.md')
      expect(relativePaths).toContain('.specify/specs/auth/tasks.md')
      expect(relativePaths).toContain('.specify/research/notes.md')
      expect(relativePaths).not.toContain('README.md')
    })

    it('returns empty array when .specify/ does not exist', async () => {
      tempDir = await createFixture({
        'README.md': '# Hello',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      expect(inventory).toEqual([])
    })

    it('skips non-Markdown files with warning', async () => {
      tempDir = await createFixture({
        '.specify/specs/auth/spec.md': '# Auth Spec',
        '.specify/scripts/build.sh': '#!/bin/bash',
        '.specify/config.json': '{}',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const relativePaths = inventory.map(i => i.relativePath.replace(/\\/g, '/'))

      expect(relativePaths).toContain('.specify/specs/auth/spec.md')
      expect(relativePaths).not.toContain('.specify/scripts/build.sh')
      expect(relativePaths).not.toContain('.specify/config.json')
    })

    it('does not follow symlinks', async () => {
      tempDir = await createFixture({
        '.specify/specs/auth/spec.md': '# Auth Spec',
      })

      const linkPath = path.join(tempDir, '.specify', 'link')
      const targetPath = path.join(tempDir, 'README.md')
      await fs.writeFile(targetPath, '# Hello', 'utf-8')
      try {
        await fs.symlink(targetPath, linkPath)
      } catch {
        // Skip test if symlinks not supported on this platform
        return
      }

      const inventory = await specKitAdapter.scan(tempDir)
      const relativePaths = inventory.map(i => i.relativePath.replace(/\\/g, '/'))
      expect(relativePaths).not.toContain('.specify/link')
    })

    it('collects correct file metadata', async () => {
      tempDir = await createFixture({
        '.specify/specs/auth/spec.md': '# Auth Spec',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      expect(inventory).toHaveLength(1)

      const item = inventory[0]!
      expect(item.sourcePath).toBe(path.join(tempDir, '.specify', 'specs', 'auth', 'spec.md'))
      expect(item.relativePath.replace(/\\/g, '/')).toBe('.specify/specs/auth/spec.md')
      expect(item.extension).toBe('.md')
      expect(item.directoryContext).toBe('auth')
      expect(typeof item.size).toBe('number')
      expect(typeof item.modifiedAt).toBe('string')
    })
  })

  describe('classify', () => {
    it('classifies spec.md to current/spec with 0.85', async () => {
      tempDir = await createFixture({
        '.specify/specs/auth/spec.md': '# Auth Spec',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const results = await specKitAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      const result = results[0]!
      expect(result.targetType).toBe('current/spec')
      expect(result.confidenceScore).toBe(0.85)
      expect(result.confidence).toBe('high')
      expect(result.adapterUsed).toBe('spec-kit')
      expect(result.proposedTargetPath).toBe('docs/current/spec/auth/spec.md')
    })

    it('classifies plan.md as ADR candidate to decisions with 0.6', async () => {
      tempDir = await createFixture({
        '.specify/specs/auth/plan.md': '# Auth Plan',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const results = await specKitAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      const result = results[0]!
      expect(result.targetType).toBe('decisions')
      expect(result.confidenceScore).toBe(0.6)
      expect(result.confidence).toBe('medium')
      expect(result.proposedTargetPath).toBe('docs/decisions/auth/plan.md')
      expect(result.reasoning).toContain('ADR candidate')
    })

    it('classifies tasks.md to changes with 0.7', async () => {
      tempDir = await createFixture({
        '.specify/specs/auth/tasks.md': '# Auth Tasks',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const results = await specKitAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      const result = results[0]!
      expect(result.targetType).toBe('changes')
      expect(result.confidenceScore).toBe(0.7)
      expect(result.confidence).toBe('high')
      expect(result.proposedTargetPath).toBe('docs/changes/auth/tasks.md')
    })

    it('classifies constitution.md as ADR candidate to decisions with 0.6', async () => {
      tempDir = await createFixture({
        '.specify/memory/constitution.md': '# Constitution',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const results = await specKitAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      const result = results[0]!
      expect(result.targetType).toBe('decisions')
      expect(result.confidenceScore).toBe(0.6)
      expect(result.confidence).toBe('medium')
      expect(result.proposedTargetPath).toBe('docs/decisions/constitution.md')
      expect(result.reasoning).toContain('ADR candidate')
    })

    it('classifies research files to references/research with 0.8', async () => {
      tempDir = await createFixture({
        '.specify/research/notes.md': '# Research Notes',
        '.specify/research/deep-dive.md': '# Deep Dive',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const results = await specKitAdapter.classify(inventory)

      expect(results).toHaveLength(2)
      for (const result of results) {
        expect(result.targetType).toBe('references/research')
        expect(result.confidenceScore).toBe(0.8)
        expect(result.confidence).toBe('high')
        expect(result.adapterUsed).toBe('spec-kit')
      }

      const paths = results.map(r => r.proposedTargetPath)
      expect(paths).toContain('docs/references/research/notes.md')
      expect(paths).toContain('docs/references/research/deep-dive.md')
    })

    it('falls back unrecognized files to references/raw with 0.3', async () => {
      tempDir = await createFixture({
        '.specify/templates/spec.md': '# Template',
        '.specify/scripts/guide.md': '# Guide',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const results = await specKitAdapter.classify(inventory)

      expect(results).toHaveLength(2)
      for (const result of results) {
        expect(result.targetType).toBe('references/raw')
        expect(result.confidenceScore).toBe(0.3)
        expect(result.confidence).toBe('low')
      }
    })

    it('handles multiple files in full Spec Kit structure', async () => {
      tempDir = await createFixture({
        '.specify/memory/constitution.md': '# Constitution',
        '.specify/specs/auth/spec.md': '# Auth Spec',
        '.specify/specs/auth/plan.md': '# Auth Plan',
        '.specify/specs/auth/tasks.md': '# Auth Tasks',
        '.specify/specs/payment/spec.md': '# Payment Spec',
        '.specify/research/notes.md': '# Research',
        '.specify/templates/default.md': '# Template',
      })

      const inventory = await specKitAdapter.scan(tempDir)
      const results = await specKitAdapter.classify(inventory)

      expect(results).toHaveLength(7)

      const byPath: Record<string, ClassificationResult> = {}
      for (const r of results) {
        byPath[r.inventoryItem.relativePath.replace(/\\/g, '/')] = r
      }

      expect(byPath['.specify/memory/constitution.md']?.targetType).toBe('decisions')
      expect(byPath['.specify/memory/constitution.md']?.confidenceScore).toBe(0.6)

      expect(byPath['.specify/specs/auth/spec.md']?.targetType).toBe('current/spec')
      expect(byPath['.specify/specs/auth/spec.md']?.confidenceScore).toBe(0.85)

      expect(byPath['.specify/specs/auth/plan.md']?.targetType).toBe('decisions')
      expect(byPath['.specify/specs/auth/plan.md']?.confidenceScore).toBe(0.6)

      expect(byPath['.specify/specs/auth/tasks.md']?.targetType).toBe('changes')
      expect(byPath['.specify/specs/auth/tasks.md']?.confidenceScore).toBe(0.7)

      expect(byPath['.specify/specs/payment/spec.md']?.targetType).toBe('current/spec')
      expect(byPath['.specify/specs/payment/spec.md']?.confidenceScore).toBe(0.85)

      expect(byPath['.specify/research/notes.md']?.targetType).toBe('references/research')
      expect(byPath['.specify/research/notes.md']?.confidenceScore).toBe(0.8)

      expect(byPath['.specify/templates/default.md']?.targetType).toBe('references/raw')
      expect(byPath['.specify/templates/default.md']?.confidenceScore).toBe(0.3)
    })

    it('returns empty array for empty inventory', async () => {
      const results = await specKitAdapter.classify([])
      expect(results).toEqual([])
    })
  })
})
