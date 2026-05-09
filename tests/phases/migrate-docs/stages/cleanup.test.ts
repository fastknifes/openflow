import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { runCleanupStage } from '../../../../src/phases/migrate-docs/stages/cleanup'
import { createInitialMigrationState } from '../../../../src/phases/migrate-docs/state-machine'
import type {
  FileInventory,
  MigrationPlan,
  MigrationState,
  PlanSummary,
} from '../../../../src/phases/migrate-docs/types'
import { DELETE_CONFIRMATION_PHRASE } from '../../../../src/phases/migrate-docs/types'
import { OpenFlowError, ErrorCode } from '../../../../src/utils/errors'

function makeInventory(baseDir: string, relativePath: string): FileInventory {
  return {
    sourcePath: path.join(baseDir, relativePath),
    relativePath,
    size: 100,
    modifiedAt: new Date().toISOString(),
    extension: '.md',
    directoryContext: path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath),
  }
}

function makePlan(summary?: Partial<PlanSummary>): MigrationPlan {
  return {
    operations: [],
    directoryCreations: [],
    conflictResolutions: [],
    summary: {
      totalFiles: 2,
      byCategory: { 'current/design': 1, 'current/spec': 1 },
      confidenceDistribution: { high: 2, medium: 0, low: 0 },
      wouldOverwrite: [],
      ...summary,
    },
  }
}

describe('runCleanupStage', () => {
  let projectDir: string
  let sourceDir: string
  let targetDir: string

  beforeEach(async () => {
    projectDir = path.join(process.cwd(), 'tests', 'fixtures', `cleanup-stage-${Date.now()}`)
    sourceDir = path.join(projectDir, 'source')
    targetDir = path.join(projectDir, 'target')
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.mkdir(targetDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
  })

  function makeCleanupState(
    disposalMode: 'keep' | 'move-to-references' | 'delete',
    options: { dryRun?: boolean; inventory?: FileInventory[] } = {}
  ): MigrationState {
    const inventory = options.inventory ?? [
      makeInventory(sourceDir, 'docs/design.md'),
      makeInventory(sourceDir, 'docs/spec.md'),
    ]
    return {
      ...createInitialMigrationState(sourceDir, targetDir, 'generic', { disposalMode, dryRun: options.dryRun }),
      stage: 'cleanup',
      inventory,
      applyResult: {
        createdFiles: ['docs/current/design/design.md', 'docs/current/spec/spec.md'],
        modifiedFiles: [],
        deletedFiles: [],
        skippedFiles: [],
        failedOps: [],
      },
      plan: makePlan(),
    }
  }

  async function createSourceFile(relPath: string, content: string): Promise<string> {
    const fullPath = path.join(sourceDir, relPath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
    return fullPath
  }

  // ==========================================================================
  // Keep mode
  // ==========================================================================

  describe('keep mode', () => {
    it('generates migration-report.md at targetRoot', async () => {
      await createSourceFile('docs/design.md', '# Design')
      await createSourceFile('docs/spec.md', '# Spec')
      const state = makeCleanupState('keep')

      await runCleanupStage(state, '', projectDir)

      const reportPath = path.join(targetDir, 'migration-report.md')
      const content = await fs.readFile(reportPath, 'utf-8')
      expect(content).toContain('# Migration Report')
      expect(content).toContain('**Disposal Mode:** keep')
    })

    it('generates migration-manifest.json at targetRoot', async () => {
      await createSourceFile('docs/design.md', '# Design')
      await createSourceFile('docs/spec.md', '# Spec')
      const state = makeCleanupState('keep')

      await runCleanupStage(state, '', projectDir)

      const manifestPath = path.join(targetDir, 'migration-manifest.json')
      const content = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(content)
      expect(manifest.disposalMode).toBe('keep')
      expect(manifest.result.createdCount).toBe(2)
    })

    it('does NOT delete source files', async () => {
      await createSourceFile('docs/design.md', '# Design')
      await createSourceFile('docs/spec.md', '# Spec')
      const state = makeCleanupState('keep')

      await runCleanupStage(state, '', projectDir)

      expect(existsSync(path.join(sourceDir, 'docs/design.md'))).toBe(true)
      expect(existsSync(path.join(sourceDir, 'docs/spec.md'))).toBe(true)
    })

    it('returns state advanced to completed', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('keep')

      const result = await runCleanupStage(state, '', projectDir)

      expect(result.state.stage).toBe('completed')
    })

    it('output mentions "keep" and "report"', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('keep')

      const result = await runCleanupStage(state, '', projectDir)

      expect(result.output).toContain('keep')
      expect(result.output).toContain('report')
    })
  })

  // ==========================================================================
  // Delete mode
  // ==========================================================================

  describe('delete mode', () => {
    it('deletes source files with exact confirmation phrase', async () => {
      await createSourceFile('docs/design.md', '# Design')
      await createSourceFile('docs/spec.md', '# Spec')
      const state = makeCleanupState('delete')

      await runCleanupStage(state, DELETE_CONFIRMATION_PHRASE, projectDir)

      await expect(fs.access(path.join(sourceDir, 'docs/design.md'))).rejects.toThrow()
      await expect(fs.access(path.join(sourceDir, 'docs/spec.md'))).rejects.toThrow()
    })

    it('does NOT generate report in delete mode', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('delete', { inventory: [makeInventory(sourceDir, 'docs/design.md')] })

      await runCleanupStage(state, DELETE_CONFIRMATION_PHRASE, projectDir)

      await expect(fs.access(path.join(targetDir, 'migration-report.md'))).rejects.toThrow()
      await expect(fs.access(path.join(targetDir, 'migration-manifest.json'))).rejects.toThrow()
    })

    it('throws error with wrong confirmation phrase', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('delete')

      await expect(
        runCleanupStage(state, 'wrong phrase', projectDir)
      ).rejects.toThrow(OpenFlowError)

      await expect(
        runCleanupStage(state, 'wrong phrase', projectDir)
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT })
    })

    it('returns state advanced to completed', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('delete', { inventory: [makeInventory(sourceDir, 'docs/design.md')] })

      const result = await runCleanupStage(state, DELETE_CONFIRMATION_PHRASE, projectDir)

      expect(result.state.stage).toBe('completed')
    })

    it('does not delete source files when confirmation is wrong', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('delete')

      await expect(
        runCleanupStage(state, 'wrong', projectDir)
      ).rejects.toThrow()

      // File should still exist
      expect(existsSync(path.join(sourceDir, 'docs/design.md'))).toBe(true)
    })
  })

  // ==========================================================================
  // Move-to-references mode
  // ==========================================================================

  describe('move-to-references mode', () => {
    it('moves source files to docs/references/raw/ in target', async () => {
      await createSourceFile('docs/design.md', '# Design')
      await createSourceFile('docs/spec.md', '# Spec')
      const state = makeCleanupState('move-to-references')

      await runCleanupStage(state, '', projectDir)

      // Files should be moved to target/docs/references/raw/
      const movedDesign = path.join(targetDir, 'docs', 'references', 'raw', 'design.md')
      const movedSpec = path.join(targetDir, 'docs', 'references', 'raw', 'spec.md')
      const designContent = await fs.readFile(movedDesign, 'utf-8')
      const specContent = await fs.readFile(movedSpec, 'utf-8')
      expect(designContent).toBe('# Design')
      expect(specContent).toBe('# Spec')
    })

    it('removes source files after move', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('move-to-references', { inventory: [makeInventory(sourceDir, 'docs/design.md')] })

      await runCleanupStage(state, '', projectDir)

      await expect(fs.access(path.join(sourceDir, 'docs/design.md'))).rejects.toThrow()
    })

    it('generates report and manifest', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('move-to-references', { inventory: [makeInventory(sourceDir, 'docs/design.md')] })

      await runCleanupStage(state, '', projectDir)

      expect(existsSync(path.join(targetDir, 'migration-report.md'))).toBe(true)
      expect(existsSync(path.join(targetDir, 'migration-manifest.json'))).toBe(true)
    })

    it('returns state advanced to completed', async () => {
      await createSourceFile('docs/design.md', '# Design')
      const state = makeCleanupState('move-to-references', { inventory: [makeInventory(sourceDir, 'docs/design.md')] })

      const result = await runCleanupStage(state, '', projectDir)

      expect(result.state.stage).toBe('completed')
    })

    it('output mentions moved files count', async () => {
      await createSourceFile('docs/design.md', '# Design')
      await createSourceFile('docs/spec.md', '# Spec')
      const state = makeCleanupState('move-to-references')

      const result = await runCleanupStage(state, '', projectDir)

      expect(result.output).toContain('2')
      expect(result.output).toContain('move-to-references')
    })
  })

  // ==========================================================================
  // Dry-run mode
  // ==========================================================================

  describe('dry-run mode', () => {
    it('returns early with dry-run message', async () => {
      const state = makeCleanupState('keep', { dryRun: true })

      const result = await runCleanupStage(state, '', projectDir)

      expect(result.output.toLowerCase()).toContain('dry-run')
      expect(result.output.toLowerCase()).toContain('skipped')
    })

    it('does not modify any files in dry-run', async () => {
      await createSourceFile('docs/design.md', '# Design')
      await createSourceFile('docs/spec.md', '# Spec')
      const state = makeCleanupState('keep', { dryRun: true })

      await runCleanupStage(state, '', projectDir)

      // No report generated
      await expect(fs.access(path.join(targetDir, 'migration-report.md'))).rejects.toThrow()
      // Source still exists
      expect(existsSync(path.join(sourceDir, 'docs/design.md'))).toBe(true)
    })

    it('advances state to completed in dry-run', async () => {
      const state = makeCleanupState('delete', { dryRun: true })

      const result = await runCleanupStage(state, '', projectDir)

      expect(result.state.stage).toBe('completed')
    })
  })
})
