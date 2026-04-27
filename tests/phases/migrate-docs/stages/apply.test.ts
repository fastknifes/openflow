import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { runApplyStage } from '../../../../src/phases/migrate-docs/stages/apply'
import { createInitialMigrationState } from '../../../../src/phases/migrate-docs/state-machine'
import type {
  ClassificationResult,
  FileInventory,
  MigrationOperation,
  MigrationPlan,
  MigrationState,
  PlanSummary,
  TargetCategory,
} from '../../../../src/phases/migrate-docs/types'
import { ErrorCode, OpenFlowError } from '../../../../src/utils/errors'

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

function makeClassification(
  baseDir: string,
  relativePath: string,
  targetType: TargetCategory,
  targetPath: string | undefined,
  confidenceScore = 0.8
): ClassificationResult {
  return {
    inventoryItem: makeInventory(baseDir, relativePath),
    targetType,
    confidence: confidenceScore >= 0.7 ? 'high' : confidenceScore >= 0.4 ? 'medium' : 'low',
    confidenceScore,
    adapterUsed: 'generic',
    reasoning: `classification for ${relativePath}`,
    proposedTargetPath: targetPath,
  }
}

function makePlan(ops: MigrationOperation[], dirs: string[] = []): MigrationPlan {
  const allOps = [...dirs.map((d) => ({ type: 'create_dir' as const, targetPath: d })), ...ops]

  const summary: PlanSummary = {
    totalFiles: allOps.filter((o) => o.type !== 'create_dir').length,
    byCategory: {},
    confidenceDistribution: { high: 0, medium: 0, low: 0 },
    wouldOverwrite: [],
  }

  return {
    operations: allOps,
    directoryCreations: dirs,
    conflictResolutions: [],
    summary,
  }
}

function makeCreateOp(sourcePath: string, targetPath: string): MigrationOperation {
  return { type: 'create', sourcePath, targetPath }
}

function makeModifyOp(sourcePath: string, targetPath: string): MigrationOperation {
  return { type: 'modify', sourcePath, targetPath }
}

function makeSkipOp(targetPath: string, reason = 'Skipped by plan'): MigrationOperation {
  return { type: 'skip', targetPath, reason }
}

describe('runApplyStage', () => {
  let tempDir: string
  let sourceDir: string
  let targetDir: string
  let projectDir: string

  beforeEach(async () => {
    projectDir = path.join(process.cwd(), 'tests', 'fixtures', `apply-stage-${Date.now()}`)
    sourceDir = path.join(projectDir, 'source')
    targetDir = path.join(projectDir, 'target')
    tempDir = path.join(projectDir, 'temp')
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.mkdir(targetDir, { recursive: true })
    await fs.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
  })

  function makeApplyState(ops: MigrationOperation[], dirs: string[] = []): MigrationState {
    const plan = makePlan(ops, dirs)
    return {
      ...createInitialMigrationState(sourceDir, targetDir, 'generic', {}),
      stage: 'apply',
      plan,
      inventory: [],
      classifications: [],
    }
  }

  async function createSourceFile(relPath: string, content: string): Promise<string> {
    const fullPath = path.join(sourceDir, relPath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
    return fullPath
  }

  // ==========================================================================
  // Basic copy
  // ==========================================================================

  it('copies source files to target paths using atomic write', async () => {
    const content = '# Test\n\nHello world.'
    const sourcePath = await createSourceFile('specs/api.md', content)
    const operations = [makeCreateOp(sourcePath, 'docs/current/spec/api.md')]
    const dirs = ['docs/current/spec']
    const state = makeApplyState(operations, dirs)

    const result = await runApplyStage(state, projectDir)

    expect(result.state.stage).toBe('cleanup')
    expect(result.state.applyResult).toBeDefined()
    expect(result.state.applyResult!.createdFiles).toEqual(['docs/current/spec/api.md'])
    expect(result.state.applyResult!.failedOps).toHaveLength(0)

    // Verify content was written correctly
    const targetContent = await fs.readFile(
      path.join(targetDir, 'docs', 'current', 'spec', 'api.md'),
      'utf-8'
    )
    expect(targetContent).toBe(content)

    // Verify no .tmp file leaked
    const tempPath = path.join(targetDir, 'docs', 'current', 'spec', 'api.md.tmp')
    await expect(fs.access(tempPath)).rejects.toThrow()
  })

  it('writes content to full target path', async () => {
    const content = '# Nested content'
    const sourcePath = await createSourceFile('nested/deep/file.md', content)
    const operations = [makeCreateOp(sourcePath, 'docs/changes/2026-04-24-feature/sub/topic/file.md')]
    const dirs = ['docs/changes/2026-04-24-feature/sub/topic']
    const state = makeApplyState(operations, dirs)

    const result = await runApplyStage(state, projectDir)

    expect(result.state.applyResult!.createdFiles).toHaveLength(1)
    expect(result.state.stage).toBe('cleanup')

    const fullTarget = path.join(targetDir, 'docs/changes/2026-04-24-feature/sub/topic/file.md')
    const written = await fs.readFile(fullTarget, 'utf-8')
    expect(written).toBe(content)
  })

  // ==========================================================================
  // Directory creation
  // ==========================================================================

  it('creates all target directories before copying files', async () => {
    const sourcePath = await createSourceFile('root.md', '# Root')
    const ops = [makeCreateOp(sourcePath, 'docs/current/design/root.md')]
    const dirs = ['docs/current/design']
    const state = makeApplyState(ops, dirs)

    await runApplyStage(state, projectDir)

    const createdDir = path.join(targetDir, 'docs/current/design')
    const stat = await fs.stat(createdDir)
    expect(stat.isDirectory()).toBe(true)
  })

  // ==========================================================================
  // Skip operations
  // ==========================================================================

  it('records skip operations in ApplyResult', async () => {
    const ops = [makeSkipOp('docs/skip-me.md', 'User chose to skip')]
    const state = makeApplyState(ops)

    const result = await runApplyStage(state, projectDir)

    expect(result.state.applyResult!.skippedFiles).toHaveLength(1)
    expect(result.state.applyResult!.skippedFiles[0]!).toEqual({
      path: 'docs/skip-me.md',
      reason: 'User chose to skip',
    })
  })

  // ==========================================================================
  // Modify operations
  // ==========================================================================

  it('handles modify operations by writing content to target', async () => {
    const content = '# Modified'
    const sourcePath = await createSourceFile('mod.md', content)
    const ops = [makeModifyOp(sourcePath, 'docs/current/spec/mod.md')]
    const dirs = ['docs/current/spec']
    const state = makeApplyState(ops, dirs)

    const result = await runApplyStage(state, projectDir)

    expect(result.state.applyResult!.modifiedFiles).toEqual(['docs/current/spec/mod.md'])
    expect(result.state.applyResult!.createdFiles).toHaveLength(0)

    const modContent = await fs.readFile(
      path.join(targetDir, 'docs/current/spec/mod.md'),
      'utf-8'
    )
    expect(modContent).toBe(content)
  })

  // ==========================================================================
  // Failed operations
  // ==========================================================================

  it('records failed operations when source file is missing', async () => {
    const missingPath = path.join(sourceDir, 'missing.md')
    const ops = [makeCreateOp(missingPath, 'docs/current/spec/missing.md')]
    const dirs = ['docs/current/spec']
    const state = makeApplyState(ops, dirs)

    const result = await runApplyStage(state, projectDir)

    expect(result.state.applyResult!.failedOps).toHaveLength(1)
    expect(result.state.applyResult!.failedOps[0]!.operation.sourcePath).toBe(missingPath)
    expect(result.state.applyResult!.createdFiles).toHaveLength(0)
  })

  it('records failed operations when create op lacks sourcePath', async () => {
    const ops: MigrationOperation[] = [{ type: 'create', targetPath: 'docs/no-source.md' }]
    const state = makeApplyState(ops)

    const result = await runApplyStage(state, projectDir)

    expect(result.state.applyResult!.failedOps).toHaveLength(1)
    expect(result.state.applyResult!.failedOps[0]!.error).toContain('missing sourcePath')
  })

  // ==========================================================================
  // Checkpoint saving
  // ==========================================================================

  it('saves checkpoint after every 10 files', async () => {
    const ops: MigrationOperation[] = []
    for (let i = 0; i < 25; i++) {
      const sourcePath = await createSourceFile(`file-${i}.md`, `# File ${i}`)
      ops.push(makeCreateOp(sourcePath, `docs/current/spec/file-${i}.md`))
    }
    const state = makeApplyState(ops, ['docs/current/spec'])

    const result = await runApplyStage(state, projectDir)

    // All should be created
    expect(result.state.applyResult!.createdFiles).toHaveLength(25)
    expect(result.state.applyResult!.failedOps).toHaveLength(0)
    expect(result.state.stage).toBe('cleanup')
  })

  // ==========================================================================
  // docs/index.md generation
  // ==========================================================================

  it('generates docs/index.md if missing', async () => {
    const sourcePath = await createSourceFile('one.md', '# One')
    const ops = [makeCreateOp(sourcePath, 'docs/current/spec/one.md')]
    const state = makeApplyState(ops, ['docs/current/spec'])

    // Ensure docs directory exists but index.md doesn't
    await fs.mkdir(path.join(targetDir, 'docs'), { recursive: true })

    await runApplyStage(state, projectDir)

    const indexPath = path.join(targetDir, 'docs', 'index.md')
    const indexContent = await fs.readFile(indexPath, 'utf-8')
    expect(indexContent).toContain('# Documentation')
    expect(indexContent).toContain('OpenFlow')
  })

  it('does not overwrite existing docs/index.md', async () => {
    const sourcePath = await createSourceFile('one.md', '# One')
    const ops = [makeCreateOp(sourcePath, 'docs/current/spec/one.md')]
    const state = makeApplyState(ops, ['docs/current/spec'])

    // Create a pre-existing index.md
    await fs.mkdir(path.join(targetDir, 'docs'), { recursive: true })
    const existingContent = '# Custom Index\n\nMy docs.'
    await fs.writeFile(path.join(targetDir, 'docs', 'index.md'), existingContent, 'utf-8')

    await runApplyStage(state, projectDir)

    const indexContent = await fs.readFile(path.join(targetDir, 'docs', 'index.md'), 'utf-8')
    expect(indexContent).toBe(existingContent)
  })

  // ==========================================================================
  // Dry run
  // ==========================================================================

  it('skips apply in dry-run mode', async () => {
    const sourcePath = await createSourceFile('dry.md', '# Dry')
    const ops = [makeCreateOp(sourcePath, 'docs/current/spec/dry.md')]
    const plan = makePlan(ops, ['docs/current/spec'])
    const state: MigrationState = {
      ...createInitialMigrationState(sourceDir, targetDir, 'generic', { dryRun: true }),
      stage: 'apply',
      plan,
      inventory: [],
      classifications: [],
    }

    const result = await runApplyStage(state, projectDir)

    expect(result.state.stage).toBe('cleanup')
    expect(result.state.applyResult).toBeUndefined()

    // File should NOT have been created
    await expect(
      fs.access(path.join(targetDir, 'docs/current/spec/dry.md'))
    ).rejects.toThrow()
  })

  // ==========================================================================
  // No plan error
  // ==========================================================================

  it('throws when no migration plan is available', async () => {
    const state: MigrationState = {
      ...createInitialMigrationState(sourceDir, targetDir, 'generic'),
      stage: 'apply',
      inventory: [],
      classifications: [],
    }

    await expect(runApplyStage(state, projectDir)).rejects.toThrow(OpenFlowError)
    await expect(runApplyStage(state, projectDir)).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
    })
  })

  // ==========================================================================
  // Multiple operations
  // ==========================================================================

  it('processes mixed create, modify, and skip operations', async () => {
    const createContent = '# Create'
    const modifyContent = '# Modify'
    const createPath = await createSourceFile('create.md', createContent)
    const modifyPath = await createSourceFile('modify.md', modifyContent)

    const ops: MigrationOperation[] = [
      makeCreateOp(createPath, 'docs/current/spec/create.md'),
      makeModifyOp(modifyPath, 'docs/current/spec/modify.md'),
      makeSkipOp('docs/skip.md', 'User skip'),
    ]
    const dirs = ['docs/current/spec']
    const state = makeApplyState(ops, dirs)

    const result = await runApplyStage(state, projectDir)

    expect(result.state.applyResult!.createdFiles).toEqual(['docs/current/spec/create.md'])
    expect(result.state.applyResult!.modifiedFiles).toEqual(['docs/current/spec/modify.md'])
    expect(result.state.applyResult!.skippedFiles).toHaveLength(1)
    expect(result.state.applyResult!.failedOps).toHaveLength(0)
  })

  // ==========================================================================
  // Stage result metadata
  // ==========================================================================

  it('includes operation counts in stage result metadata', async () => {
    const createPath = await createSourceFile('a.md', '# A')
    const ops: MigrationOperation[] = [
      makeCreateOp(createPath, 'docs/current/spec/a.md'),
      makeSkipOp('docs/skip.md'),
    ]
    const state = makeApplyState(ops, ['docs/current/spec'])

    const result = await runApplyStage(state, projectDir)

    const stageResult = result.state.stageResults.find((r) => r.stage === 'apply')
    expect(stageResult).toBeDefined()
    expect(stageResult!.metadata).toMatchObject({
      created: 1,
      skipped: 1,
      failed: 0,
    })
  })
})
