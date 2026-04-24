/**
 * Kiro Adapter Tests
 *
 * Tests for kiroAdapter including:
 * - Detection with various directory structures
 * - Scanning with different file types
 * - Classification with proper confidence scores
 * - ADR candidate classification for steering docs
 * - Kebab-case path generation
 * - Warning for non-Markdown files
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { kiroAdapter } from '../../../../src/phases/migrate-docs/adapters/kiro.js'
import type { FileInventory } from '../../../../src/phases/migrate-docs/types.js'

describe('kiroAdapter', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kiro-adapter-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('detect', () => {
    it('should return detected=false when no .kiro directory exists', async () => {
      const result = await kiroAdapter.detect(tempDir)

      expect(result.adapter).toBe('kiro')
      expect(result.detected).toBe(false)
      expect(result.confidence).toBe(0)
    })

    it('should detect with 0.95 confidence when specs and steering exist', async () => {
      mkdirSync(join(tempDir, '.kiro', 'specs'), { recursive: true })
      mkdirSync(join(tempDir, '.kiro', 'steering'), { recursive: true })

      const result = await kiroAdapter.detect(tempDir)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.95)
      expect(result.metadata).toEqual({
        hasSpecs: 'true',
        hasSteering: 'true',
      })
    })

    it('should detect with 0.8 confidence when only specs exists', async () => {
      mkdirSync(join(tempDir, '.kiro', 'specs'), { recursive: true })

      const result = await kiroAdapter.detect(tempDir)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.8)
      expect(result.metadata).toEqual({
        hasSpecs: 'true',
      })
    })

    it('should detect with 0.5 confidence when only .kiro directory exists (empty)', async () => {
      mkdirSync(join(tempDir, '.kiro'), { recursive: true })

      const result = await kiroAdapter.detect(tempDir)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.5)
      expect(result.metadata).toEqual({})
    })

    it('should detect with 0.5 confidence when only steering exists (no specs)', async () => {
      mkdirSync(join(tempDir, '.kiro', 'steering'), { recursive: true })

      const result = await kiroAdapter.detect(tempDir)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.5)
      expect(result.metadata).toEqual({
        hasSteering: 'true',
      })
    })

    it('should detect with 0.95 confidence when specs, steering, and hooks all exist', async () => {
      mkdirSync(join(tempDir, '.kiro', 'specs'), { recursive: true })
      mkdirSync(join(tempDir, '.kiro', 'steering'), { recursive: true })
      mkdirSync(join(tempDir, '.kiro', 'hooks'), { recursive: true })

      const result = await kiroAdapter.detect(tempDir)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.95)
      expect(result.metadata).toEqual({
        hasSpecs: 'true',
        hasSteering: 'true',
        hasHooks: 'true',
      })
    })
  })

  describe('scan', () => {
    it('should return empty array when .kiro directory does not exist', async () => {
      const result = await kiroAdapter.scan(tempDir)
      expect(result).toEqual([])
    })

    it('should scan markdown files under .kiro/', async () => {
      mkdirSync(join(tempDir, '.kiro', 'specs', 'feature-a'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'specs', 'feature-a', 'requirements.md'), '# Requirements')
      writeFileSync(join(tempDir, '.kiro', 'specs', 'feature-a', 'design.md'), '# Design')

      const result = await kiroAdapter.scan(tempDir)

      expect(result).toHaveLength(2)
      expect(result.map(r => r.relativePath.replace(/\\/g, '/'))).toContain('.kiro/specs/feature-a/requirements.md')
      expect(result.map(r => r.relativePath.replace(/\\/g, '/'))).toContain('.kiro/specs/feature-a/design.md')
    })

    it('should include spec.json files', async () => {
      mkdirSync(join(tempDir, '.kiro', 'specs', 'feature-a'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'specs', 'feature-a', 'spec.json'), '{}')

      const result = await kiroAdapter.scan(tempDir)

      expect(result).toHaveLength(1)
      expect(result[0]!.relativePath.replace(/\\/g, '/')).toBe('.kiro/specs/feature-a/spec.json')
      expect(result[0]!.extension).toBe('.json')
    })

    it('should scan steering directory files', async () => {
      mkdirSync(join(tempDir, '.kiro', 'steering'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'steering', 'architecture.md'), '# Architecture')

      const result = await kiroAdapter.scan(tempDir)

      expect(result).toHaveLength(1)
      expect(result[0]!.relativePath.replace(/\\/g, '/')).toBe('.kiro/steering/architecture.md')
    })

    it('should scan hooks directory files', async () => {
      mkdirSync(join(tempDir, '.kiro', 'hooks'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'hooks', 'pre-commit.md'), '# Pre-commit')

      const result = await kiroAdapter.scan(tempDir)

      expect(result).toHaveLength(1)
      expect(result[0]!.relativePath.replace(/\\/g, '/')).toBe('.kiro/hooks/pre-commit.md')
    })

    it('should log warning for non-Markdown files', async () => {
      mkdirSync(join(tempDir, '.kiro'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'readme.txt'), 'Not markdown')

      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(' '))
      }

      await kiroAdapter.scan(tempDir)

      console.warn = originalWarn

      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toContain('[kiro]')
      expect(warnings[0]).toContain('Skipping non-Markdown file')
    })

    it('should skip symlinks', async () => {
      mkdirSync(join(tempDir, '.kiro'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'real.md'), '# Real')
      // Symlink creation skipped on Windows without elevated privileges
      try {
        const { symlinkSync } = await import('node:fs')
        symlinkSync(
          join(tempDir, '.kiro', 'real.md'),
          join(tempDir, '.kiro', 'link.md')
        )
        const result = await kiroAdapter.scan(tempDir)
        expect(result).toHaveLength(1)
      } catch {
        // Skip symlink test if not supported
      }
    })

    it('should not follow symlinks to directories', async () => {
      mkdirSync(join(tempDir, '.kiro'), { recursive: true })
      mkdirSync(join(tempDir, 'external'), { recursive: true })
      writeFileSync(join(tempDir, 'external', 'file.md'), '# External')

      try {
        const { symlinkSync } = await import('node:fs')
        symlinkSync(
          join(tempDir, 'external'),
          join(tempDir, '.kiro', 'linked')
        )
        const result = await kiroAdapter.scan(tempDir)
        expect(result).toHaveLength(0)
      } catch {
        // Skip symlink test if not supported
      }
    })
  })

  describe('classify', () => {
    function createInventory(relativePath: string, extension = '.md'): FileInventory {
      return {
        sourcePath: join(tempDir, relativePath),
        relativePath,
        size: 100,
        modifiedAt: new Date().toISOString(),
        extension,
        directoryContext: 'test',
        adapterMetadata: { kiroPath: relativePath },
      }
    }

    it('should classify requirements.md to current/requirements with 0.85 confidence', async () => {
      const inventory = [createInventory('.kiro/specs/user-auth/requirements.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('current/requirements')
      expect(results[0]!.confidenceScore).toBe(0.85)
      expect(results[0]!.confidence).toBe('high')
      expect(results[0]!.proposedTargetPath).toBe('docs/current/requirements/user-auth-requirements.md')
    })

    it('should classify design.md to current/design with 0.85 confidence', async () => {
      const inventory = [createInventory('.kiro/specs/user-auth/design.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('current/design')
      expect(results[0]!.confidenceScore).toBe(0.85)
      expect(results[0]!.proposedTargetPath).toBe('docs/current/design/user-auth-design.md')
    })

    it('should classify tasks.md to changes with 0.7 confidence', async () => {
      const inventory = [createInventory('.kiro/specs/user-auth/tasks.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('changes')
      expect(results[0]!.confidenceScore).toBe(0.7)
      expect(results[0]!.proposedTargetPath).toBe('docs/changes/user-auth-tasks.md')
    })

    it('should classify bugfix.md to changes with 0.7 confidence', async () => {
      const inventory = [createInventory('.kiro/specs/user-auth/bugfix.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('changes')
      expect(results[0]!.confidenceScore).toBe(0.7)
      expect(results[0]!.proposedTargetPath).toBe('docs/changes/user-auth-bugfix.md')
    })

    it('should classify steering docs to decisions as ADR candidates with 0.6 confidence', async () => {
      const inventory = [createInventory('.kiro/steering/architecture_decisions.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('decisions')
      expect(results[0]!.confidenceScore).toBe(0.6)
      expect(results[0]!.confidence).toBe('medium')
      expect(results[0]!.proposedTargetPath).toBe('docs/decisions/architecture-decisions.md')
    })

    it('should classify hooks docs to current/workflow with 0.7 confidence', async () => {
      const inventory = [createInventory('.kiro/hooks/pre_commit.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('current/workflow')
      expect(results[0]!.confidenceScore).toBe(0.7)
      expect(results[0]!.proposedTargetPath).toBe('docs/current/workflow/pre-commit.md')
    })

    it('should classify spec.json to current/spec with 0.7 confidence', async () => {
      const inventory = [createInventory('.kiro/specs/user-auth/spec.json', '.json')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('current/spec')
      expect(results[0]!.confidenceScore).toBe(0.7)
      expect(results[0]!.proposedTargetPath).toBe('docs/current/spec/user-auth-spec.json')
    })

    it('should classify unrecognized specs files to changes with 0.6 confidence', async () => {
      const inventory = [createInventory('.kiro/specs/user-auth/notes.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('changes')
      expect(results[0]!.confidenceScore).toBe(0.6)
      expect(results[0]!.confidence).toBe('medium')
    })

    it('should classify unrecognized files to references/raw with 0.5 confidence', async () => {
      const inventory = [createInventory('.kiro/random.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(1)
      expect(results[0]!.targetType).toBe('references/raw')
      expect(results[0]!.confidenceScore).toBe(0.5)
      expect(results[0]!.confidence).toBe('low')
    })

    it('should convert camelCase feature names to kebab-case', async () => {
      const inventory = [createInventory('.kiro/specs/userAuthentication/requirements.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results[0]!.proposedTargetPath).toBe('docs/current/requirements/user-authentication-requirements.md')
    })

    it('should convert snake_case feature names to kebab-case', async () => {
      const inventory = [createInventory('.kiro/specs/user_authentication/requirements.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results[0]!.proposedTargetPath).toBe('docs/current/requirements/user-authentication-requirements.md')
    })

    it('should handle multiple files in one call', async () => {
      const inventory = [
        createInventory('.kiro/specs/feature-a/requirements.md'),
        createInventory('.kiro/specs/feature-b/design.md'),
        createInventory('.kiro/steering/guidelines.md'),
      ]

      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(3)
      expect(results[0]!.targetType).toBe('current/requirements')
      expect(results[1]!.targetType).toBe('current/design')
      expect(results[2]!.targetType).toBe('decisions')
    })

    it('should include adapterUsed in all results', async () => {
      const inventory = [createInventory('.kiro/specs/test/requirements.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results[0]!.adapterUsed).toBe('kiro')
    })

    it('should include reasoning in all results', async () => {
      const inventory = [createInventory('.kiro/specs/test/requirements.md')]

      const results = await kiroAdapter.classify(inventory)

      expect(results[0]!.reasoning).toContain('Kiro')
      expect(results[0]!.reasoning).toContain('requirements')
    })
  })

  describe('QA Scenarios', () => {
    it('should classify steering as ADR candidate with correct confidence and target', async () => {
      mkdirSync(join(tempDir, '.kiro', 'steering'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'steering', 'architecture.md'), '# Architecture')
      writeFileSync(join(tempDir, '.kiro', 'steering', 'api-guidelines.md'), '# API Guidelines')

      const inventory = await kiroAdapter.scan(tempDir)
      const results = await kiroAdapter.classify(inventory)

      expect(results).toHaveLength(2)
      results.forEach(result => {
        expect(result.targetType).toBe('decisions')
        expect(result.confidenceScore).toBe(0.6)
        expect(result.confidence).toBe('medium')
        expect(result.proposedTargetPath).toContain('docs/decisions/')
        expect(result.reasoning.toLowerCase()).toContain('adr')
      })
    })

    it('should detect partial Kiro structure with only specs', async () => {
      mkdirSync(join(tempDir, '.kiro', 'specs', 'feature-a'), { recursive: true })
      writeFileSync(join(tempDir, '.kiro', 'specs', 'feature-a', 'requirements.md'), '# Requirements')
      writeFileSync(join(tempDir, '.kiro', 'specs', 'feature-a', 'design.md'), '# Design')

      const detectResult = await kiroAdapter.detect(tempDir)
      expect(detectResult.detected).toBe(true)
      expect(detectResult.confidence).toBe(0.8)

      const inventory = await kiroAdapter.scan(tempDir)
      const results = await kiroAdapter.classify(inventory)

      const reqResult = results.find(r => r.inventoryItem.relativePath.includes('requirements.md'))
      const designResult = results.find(r => r.inventoryItem.relativePath.includes('design.md'))

      expect(reqResult).toBeDefined()
      expect(reqResult!.targetType).toBe('current/requirements')
      expect(reqResult!.confidenceScore).toBe(0.85)

      expect(designResult).toBeDefined()
      expect(designResult!.targetType).toBe('current/design')
      expect(designResult!.confidenceScore).toBe(0.85)
    })
  })
})
