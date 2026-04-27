/**
 * Apply Stage
 *
 * 1. Validate state has a migration plan
 * 2. Create all target directories from plan.directoryCreations
 * 3. Execute each operation:
 *    - create: atomic write (temp file + rename) from source to target
 *    - modify: atomic write (temp file + rename) overwriting existing target
 *    - skip: record in skipped files list
 *    - create_dir: already handled in directory creation phase
 * 4. Save checkpoint after every 10 files
 * 5. Generate docs/index.md if it doesn't exist in targetRoot
 * 6. Populate ApplyResult and mark stage completed → advance to cleanup
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type {
  MigrationState,
  MigrationOperation,
  MigrationPlan,
  ApplyResult,
} from '../types.js'
import { saveMigrationSession } from '../persistence.js'
import { markStageCompleted } from '../state-machine.js'
import { createSafePath } from '../../../utils/security.js'
import { ErrorCode, OpenFlowError } from '../../../utils/errors.js'

const CHECKPOINT_INTERVAL = 10

export interface ApplyStageResult {
  state: MigrationState
}

/**
 * Execute the apply stage - copy source files to target with atomic writes.
 *
 * @param state - Migration state with plan (stage must be 'apply')
 * @param projectDir - Project root directory for checkpoint persistence
 * @returns Updated migration state advanced to 'cleanup'
 */
export async function runApplyStage(
  state: MigrationState,
  projectDir: string
): Promise<ApplyStageResult> {
  const plan = state.plan
  if (!plan) {
    throw new OpenFlowError(
      ErrorCode.OPERATION_FAILED,
      'Cannot run apply stage: no migration plan available'
    )
  }

  if (state.dryRun) {
    return {
      state: markStageCompleted(state, 'apply', {
        metadata: { dryRun: true, skippedApplyExecution: true },
      }),
    }
  }

  const result: ApplyResult = {
    createdFiles: [],
    modifiedFiles: [],
    deletedFiles: [],
    skippedFiles: [],
    failedOps: [],
  }

  // 1. Create all target directories first (deepest-first for safety)
  for (const dirPath of plan.directoryCreations) {
    await createTargetDirectory(state.targetRoot, dirPath, plan)
  }

  // 2. Execute operations
  let processedCount = 0
  let currentState = state

  for (const operation of plan.operations) {
    switch (operation.type) {
      case 'create':
        await executeCreateOperation(operation, state.targetRoot, result)
        break
      case 'modify':
        await executeModifyOperation(operation, state.targetRoot, result)
        break
      case 'skip':
        result.skippedFiles.push({
          path: operation.targetPath,
          reason: operation.reason ?? 'Skipped by plan',
        })
        break
      case 'create_dir':
        // Already handled above
        break
      default:
        result.skippedFiles.push({
          path: operation.targetPath,
          reason: `Unknown operation type: ${(operation as MigrationOperation).type}`,
        })
    }

    processedCount++

    // 3. Checkpoint after every 10 files
    if (processedCount % CHECKPOINT_INTERVAL === 0) {
      currentState = {
        ...currentState,
        applyResult: { ...result },
        updatedAt: new Date().toISOString(),
      }
      await saveMigrationSession(projectDir, currentState)
    }
  }

  // 4. Generate docs/index.md if it doesn't exist
  await ensureDocsIndex(state.targetRoot)

  // 5. Build final state
  const finalState: MigrationState = {
    ...state,
    applyResult: result,
  }

  const advanced = markStageCompleted(finalState, 'apply', {
    metadata: {
      created: result.createdFiles.length,
      modified: result.modifiedFiles.length,
      skipped: result.skippedFiles.length,
      failed: result.failedOps.length,
    },
  })

  return { state: advanced }
}

// ============================================================================
// Directory Creation
// ============================================================================

async function createTargetDirectory(
  targetRoot: string,
  dirPath: string,
  _plan: MigrationPlan
): Promise<void> {
  const validPath = createSafePath(targetRoot, dirPath)
  await fs.mkdir(validPath, { recursive: true })
}

// ============================================================================
// Operation Execution
// ============================================================================

async function executeCreateOperation(
  operation: MigrationOperation,
  targetRoot: string,
  result: ApplyResult
): Promise<void> {
  if (!operation.sourcePath) {
    result.failedOps.push({
      operation,
      error: 'Create operation missing sourcePath',
    })
    return
  }

  try {
    const sourceContent = await fs.readFile(operation.sourcePath, 'utf-8')
    await atomicWrite(targetRoot, operation.targetPath, sourceContent)
    result.createdFiles.push(operation.targetPath)
  } catch (err) {
    result.failedOps.push({
      operation,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function executeModifyOperation(
  operation: MigrationOperation,
  targetRoot: string,
  result: ApplyResult
): Promise<void> {
  if (!operation.sourcePath) {
    // If no sourcePath, use provided content
    if (operation.content !== undefined) {
      try {
        await atomicWrite(targetRoot, operation.targetPath, operation.content)
        result.modifiedFiles.push(operation.targetPath)
        return
      } catch (err) {
        result.failedOps.push({
          operation,
          error: err instanceof Error ? err.message : String(err),
        })
        return
      }
    }

    result.failedOps.push({
      operation,
      error: 'Modify operation missing both sourcePath and content',
    })
    return
  }

  try {
    const sourceContent = await fs.readFile(operation.sourcePath, 'utf-8')
    await atomicWrite(targetRoot, operation.targetPath, sourceContent)
    result.modifiedFiles.push(operation.targetPath)
  } catch (err) {
    result.failedOps.push({
      operation,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ============================================================================
// Atomic Write
// ============================================================================

/**
 * Write content to targetPath atomically by writing to a .tmp file then renaming.
 * Creates parent directories as needed.
 */
async function atomicWrite(
  targetRoot: string,
  relativeTargetPath: string,
  content: string
): Promise<void> {
  const fullTargetPath = createSafePath(targetRoot, relativeTargetPath)
  const targetDir = path.dirname(fullTargetPath)

  // Ensure target directory exists
  await fs.mkdir(targetDir, { recursive: true })

  // Atomic write: write to temp file, then rename
  const tempPath = `${fullTargetPath}.tmp`
  await fs.writeFile(tempPath, content, 'utf-8')
  await fs.rename(tempPath, fullTargetPath)
}

// ============================================================================
// Docs Index Generation
// ============================================================================

const DOCS_INDEX_CONTENT = `# Documentation

Welcome to the OpenFlow documentation for this project.

## Structure

| Directory | Purpose |
|-----------|---------|
| \`docs/current/\` | Authoritative source of truth — current design, requirements, specs, and workflows |
| \`docs/changes/\` | Active work in progress for specific features |
| \`docs/archive/\` | Frozen history of completed features |
| \`docs/decisions/\` | Cross-feature architecture decision records (ADRs) |
| \`docs/references/\` | External reference material, raw imports, research notes |

## Getting Started

- Current system facts: browse \`docs/current/\`
- Active features: browse \`docs/changes/\`
- Historical features: browse \`docs/archive/\`
- Project rules: browse \`docs/decisions/\`
`

/**
 * Ensure docs/index.md exists in targetRoot.
 * Creates it if missing.
 */
async function ensureDocsIndex(targetRoot: string): Promise<void> {
  const indexPath = createSafePath(targetRoot, 'docs', 'index.md')
  const indexDir = path.dirname(indexPath)

  // Check if already exists
  try {
    await fs.access(indexPath)
    return // Already exists, nothing to do
  } catch {
    // File doesn't exist, create it
  }

  // Ensure docs directory exists
  await fs.mkdir(indexDir, { recursive: true })

  // Atomic write
  const tempPath = `${indexPath}.tmp`
  await fs.writeFile(tempPath, DOCS_INDEX_CONTENT, 'utf-8')
  await fs.rename(tempPath, indexPath)
}
