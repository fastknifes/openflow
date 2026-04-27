/**
 * Cleanup Stage
 *
 * 1. Handle source document disposal based on disposalMode:
 *    - keep: leave source files in place
 *    - move-to-references: move source files to docs/references/raw/
 *    - delete: delete source files (requires exact "DELETE ORIGINAL DOCS" phrase)
 * 2. Keep and move-to-references modes generate migration-report.md + migration-manifest.json
 * 3. Delete mode does NOT generate any report
 * 4. Release migration lock on completion
 * 5. Mark stage completed → advance to 'completed'
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { MigrationState } from '../types.js'
import { DELETE_CONFIRMATION_PHRASE } from '../types.js'
import { markStageCompleted } from '../state-machine.js'
import { releaseMigrationLock } from '../persistence.js'
import { createSafePath } from '../../../utils/security.js'
import { ErrorCode, OpenFlowError } from '../../../utils/errors.js'
import { throwDeleteConfirmationError } from '../errors.js'

export interface CleanupStageResult {
  state: MigrationState
  output: string
}

/**
 * Run the cleanup stage - dispose of source documents and finalize migration.
 *
 * @param state - Migration state with applyResult (stage must be 'cleanup')
 * @param confirmation - User confirmation string (must be exact for delete mode)
 * @param projectDir - Project root directory for lock release and report paths
 * @returns Updated migration state advanced to 'completed'
 */
export async function runCleanupStage(
  state: MigrationState,
  confirmation: string,
  projectDir: string
): Promise<CleanupStageResult> {
  if (state.dryRun) {
    return {
      state: markStageCompleted(state, 'cleanup', {
        metadata: { dryRun: true, completedWithoutMutations: true },
      }),
      output: 'Dry-run: cleanup stage skipped. No files were modified or deleted.',
    }
  }

  const mode = state.disposalMode

  switch (mode) {
    case 'keep':
      return handleKeepMode(state, projectDir)
    case 'move-to-references':
      return handleMoveToReferencesMode(state, projectDir)
    case 'delete':
      return handleDeleteMode(state, confirmation, projectDir)
    default:
      throw new OpenFlowError(
        ErrorCode.INVALID_INPUT,
        `Unknown disposal mode: ${mode}`
      )
  }
}

// ============================================================================
// Disposal Mode Handlers
// ============================================================================

async function handleKeepMode(
  state: MigrationState,
  projectDir: string
): Promise<CleanupStageResult> {
  await generateMigrationReport(state, projectDir)
  await generateMigrationManifest(state, projectDir)
  await releaseMigrationLock(projectDir, state.migrationId)

  const completed = markStageCompleted(state, 'cleanup', {
    metadata: {
      disposalMode: 'keep',
      reportsGenerated: true,
      reportPath: 'migration-report.md',
      manifestPath: 'migration-manifest.json',
    },
  })

  return {
    state: completed,
    output: formatKeepSummary(state),
  }
}

async function handleMoveToReferencesMode(
  state: MigrationState,
  projectDir: string
): Promise<CleanupStageResult> {
  const movedCount = await moveSourceFilesToReferences(state)

  await generateMigrationReport(state, projectDir)
  await generateMigrationManifest(state, projectDir)
  await releaseMigrationLock(projectDir, state.migrationId)

  const completed = markStageCompleted(state, 'cleanup', {
    metadata: {
      disposalMode: 'move-to-references',
      reportsGenerated: true,
      reportPath: 'migration-report.md',
      manifestPath: 'migration-manifest.json',
      movedFiles: movedCount,
    },
  })

  return {
    state: completed,
    output: formatMoveSummary(movedCount),
  }
}

async function handleDeleteMode(
  state: MigrationState,
  confirmation: string,
  projectDir: string
): Promise<CleanupStageResult> {
  if (confirmation !== DELETE_CONFIRMATION_PHRASE) {
    throwDeleteConfirmationError()
  }

  const deletedCount = await deleteSourceFiles(state)

  // Delete mode: NO report generated
  await releaseMigrationLock(projectDir, state.migrationId)

  const completed = markStageCompleted(state, 'cleanup', {
    metadata: {
      disposalMode: 'delete',
      reportsGenerated: false,
      deletedFiles: deletedCount,
    },
  })

  return {
    state: completed,
    output: formatDeleteSummary(deletedCount),
  }
}

// ============================================================================
// Source File Operations
// ============================================================================

/**
 * Move source files from inventory into docs/references/raw/ in the target.
 */
async function moveSourceFilesToReferences(state: MigrationState): Promise<number> {
  const refDir = path.join(state.targetRoot, 'docs', 'references', 'raw')
  await fs.mkdir(refDir, { recursive: true })

  let movedCount = 0

  for (const item of state.inventory) {
    try {
      const destPath = path.join(refDir, path.basename(item.relativePath))
      // Use copyFile + unlink for atomic-like move
      await fs.copyFile(item.sourcePath, destPath)
      await fs.unlink(item.sourcePath)
      movedCount++
    } catch (err) {
      console.warn(`[cleanup] Failed to move ${item.relativePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return movedCount
}

/**
 * Delete source files from the source directory.
 */
async function deleteSourceFiles(state: MigrationState): Promise<number> {
  let deletedCount = 0

  for (const item of state.inventory) {
    try {
      await fs.unlink(item.sourcePath)
      deletedCount++
    } catch (err) {
      console.warn(`[cleanup] Failed to delete ${item.relativePath}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return deletedCount
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Generate migration-report.md in the target root.
 */
async function generateMigrationReport(
  state: MigrationState,
  _projectDir: string
): Promise<void> {
  const reportPath = createSafePath(state.targetRoot, 'migration-report.md')
  const content = buildMigrationReportContent(state)

  // Atomic write
  const tempPath = `${reportPath}.tmp`
  await fs.writeFile(tempPath, content, 'utf-8')
  await fs.rename(tempPath, reportPath)
}

function buildMigrationReportContent(state: MigrationState): string {
  const result = state.applyResult
  const plan = state.plan

  const lines: string[] = [
    '# Migration Report',
    '',
    `**Migration ID:** ${state.migrationId}`,
    `**Source Path:** ${state.sourcePath}`,
    `**Target Root:** ${state.targetRoot}`,
    `**Source Type:** ${state.sourceType ?? 'unknown'}`,
    `**Disposal Mode:** ${state.disposalMode}`,
    `**Completed At:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
    '## Summary',
    '',
  ]

  if (result) {
    lines.push(`- **Total operations:** ${result.createdFiles.length + result.modifiedFiles.length + result.skippedFiles.length + result.failedOps.length}`)
    lines.push(`- **Created:** ${result.createdFiles.length}`)
    lines.push(`- **Modified:** ${result.modifiedFiles.length}`)
    lines.push(`- **Skipped:** ${result.skippedFiles.length}`)
    lines.push(`- **Failed:** ${result.failedOps.length}`)
  }

  if (plan) {
    lines.push('')
    lines.push('## By Category')
    lines.push('')
    lines.push('| Category | Count |')
    lines.push('|----------|-------|')

    const byCategory = plan.summary.byCategory
    for (const [category, count] of Object.entries(byCategory)) {
      if (count && count > 0) {
        lines.push(`| ${category} | ${count} |`)
      }
    }
  }

  if (result && result.createdFiles.length > 0) {
    lines.push('')
    lines.push('## Created Files')
    lines.push('')
    for (const file of result.createdFiles) {
      lines.push(`- \`${file}\``)
    }
  }

  if (result && result.skippedFiles.length > 0) {
    lines.push('')
    lines.push('## Skipped Files')
    lines.push('')
    for (const item of result.skippedFiles) {
      lines.push(`- \`${item.path}\`: ${item.reason}`)
    }
  }

  if (result && result.failedOps.length > 0) {
    lines.push('')
    lines.push('## Failed Operations')
    lines.push('')
    for (const item of result.failedOps) {
      lines.push(`- \`${item.operation.targetPath}\`: ${item.error}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Generate migration-manifest.json in the target root.
 */
async function generateMigrationManifest(
  state: MigrationState,
  _projectDir: string
): Promise<void> {
  const manifestPath = createSafePath(state.targetRoot, 'migration-manifest.json')

  const manifest = {
    migrationId: state.migrationId,
    sourcePath: state.sourcePath,
    targetRoot: state.targetRoot,
    sourceType: state.sourceType,
    disposalMode: state.disposalMode,
    completedAt: new Date().toISOString(),
    startedAt: state.startedAt,
    result: state.applyResult
      ? {
          createdCount: state.applyResult.createdFiles.length,
          modifiedCount: state.applyResult.modifiedFiles.length,
          skippedCount: state.applyResult.skippedFiles.length,
          failedCount: state.applyResult.failedOps.length,
          createdFiles: state.applyResult.createdFiles,
          modifiedFiles: state.applyResult.modifiedFiles,
          skippedFiles: state.applyResult.skippedFiles,
          failedOps: state.applyResult.failedOps.map((f) => ({
            targetPath: f.operation.targetPath,
            error: f.error,
          })),
        }
      : null,
    plan: state.plan
      ? {
          totalFiles: state.plan.summary.totalFiles,
          totalOperations: state.plan.operations.length,
          byCategory: state.plan.summary.byCategory,
          confidenceDistribution: state.plan.summary.confidenceDistribution,
        }
      : null,
    stageResults: state.stageResults.map((r) => ({
      stage: r.stage,
      completedAt: r.completedAt,
      metadata: r.metadata,
    })),
  }

  // Atomic write
  const tempPath = `${manifestPath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), 'utf-8')
  await fs.rename(tempPath, manifestPath)
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatKeepSummary(state: MigrationState): string {
  const result = state.applyResult
  return [
    '## Migration Cleanup Complete',
    '',
    `**Disposal Mode:** keep (source files preserved)`,
    `**Report:** migration-report.md`,
    `**Manifest:** migration-manifest.json`,
    result ? `**Files created:** ${result.createdFiles.length}` : '',
    result ? `**Files modified:** ${result.modifiedFiles.length}` : '',
    result ? `**Files skipped:** ${result.skippedFiles.length}` : '',
    result ? `**Operations failed:** ${result.failedOps.length}` : '',
    '',
    'Migration completed successfully. Source documents were kept in place.',
  ].filter(Boolean).join('\n')
}

function formatMoveSummary(movedCount: number): string {
  return [
    '## Migration Cleanup Complete',
    '',
    `**Disposal Mode:** move-to-references`,
    `**Report:** migration-report.md`,
    `**Manifest:** migration-manifest.json`,
    `**Files moved to references:** ${movedCount}`,
    '',
    'Source documents have been moved to docs/references/raw/.',
    'Migration completed successfully.',
  ].join('\n')
}

function formatDeleteSummary(deletedCount: number): string {
  return [
    '## Migration Cleanup Complete',
    '',
    `**Disposal Mode:** delete`,
    `**Files deleted:** ${deletedCount}`,
    '',
    'Original source documents have been deleted.',
    'Migration completed successfully.',
  ].join('\n')
}
