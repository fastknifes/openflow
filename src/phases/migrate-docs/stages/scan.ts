/**
 * Scan Stage
 *
 * 1. Use adapter.scan(sourcePath) to get file inventory
 * 2. Validate each file path via createSafePath
 * 3. Filter to ALLOWED_EXTENSIONS only (.md, .markdown)
 * 4. Skip symlinks (check with fs.lstat)
 * 5. Enforce MAX_SCAN_DEPTH (10) and MAX_SCAN_FILES (5000)
 * 6. If 0 Markdown files found, throw throwEmptySourceError
 * 7. Sort inventory by relative path
 * 8. Update state with inventory, advance to 'classify'
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { MigrationState, FileInventory } from '../types.js'
import { ALLOWED_EXTENSIONS, MAX_SCAN_DEPTH, MAX_SCAN_FILES } from '../types.js'
import type { DocAdapter } from '../adapters/types.js'
import { createSafePath, SecurityError } from '../../../utils/security.js'
import { ErrorCode, OpenFlowError } from '../../../utils/errors.js'
import { throwEmptySourceError } from '../errors.js'
import { markStageCompleted } from '../state-machine.js'

/**
 * Calculate the depth of a relative path (number of directory separators).
 */
function getPathDepth(relativePath: string): number {
  const normalized = path.normalize(relativePath)
  // Count separators; root-level file has depth 0
  let count = 0
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === path.sep || normalized[i] === '/') {
      count++
    }
  }
  return count
}

/**
 * Validate a scanned file inventory item.
 * Returns the item if valid, or null if it should be skipped.
 */
async function validateInventoryItem(
  item: FileInventory,
  sourcePath: string
): Promise<FileInventory | null> {
  // Validate path is within source directory
  try {
    createSafePath(sourcePath, item.relativePath)
  } catch (e) {
    if (e instanceof SecurityError) {
      throw new OpenFlowError(
        ErrorCode.SECURITY_VIOLATION,
        `Path traversal detected in scanned file: ${item.relativePath}`
      )
    }
    throw e
  }

  // Check for symlink
  try {
    const stats = await fs.lstat(item.sourcePath)
    if (stats.isSymbolicLink()) {
      console.warn(`[scan] Skipping symlink: ${item.relativePath}`)
      return null
    }
  } catch {
    // File may have disappeared; skip it
    console.warn(`[scan] Skipping inaccessible file: ${item.relativePath}`)
    return null
  }

  // Check allowed extension
  const extLower = item.extension.toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(extLower as typeof ALLOWED_EXTENSIONS[number])) {
    console.warn(`[scan] Skipping non-Markdown file: ${item.relativePath}`)
    return null
  }

  return item
}

/**
 * Run the scan stage.
 */
export async function runScanStage(
  state: MigrationState,
  adapter: DocAdapter
): Promise<MigrationState> {
  // 1. Get inventory from adapter
  const rawInventory = await adapter.scan(state.sourcePath)

  // 2. Validate, filter, and enforce limits
  const inventory: FileInventory[] = []
  let skippedDepth = 0
  let skippedLimit = 0

  for (const item of rawInventory) {
    // Enforce max scan depth
    const depth = getPathDepth(item.relativePath)
    if (depth > MAX_SCAN_DEPTH) {
      skippedDepth++
      console.warn(`[scan] Skipping file beyond max depth (${MAX_SCAN_DEPTH}): ${item.relativePath}`)
      continue
    }

    // Enforce max scan files
    if (inventory.length >= MAX_SCAN_FILES) {
      skippedLimit++
      console.warn(`[scan] Skipping file beyond max files limit (${MAX_SCAN_FILES}): ${item.relativePath}`)
      continue
    }

    const validated = await validateInventoryItem(item, state.sourcePath)
    if (validated) {
      inventory.push(validated)
    }
  }

  if (skippedDepth > 0) {
    console.warn(`[scan] ${skippedDepth} file(s) skipped due to exceeding max depth (${MAX_SCAN_DEPTH})`)
  }
  if (skippedLimit > 0) {
    console.warn(`[scan] ${skippedLimit} file(s) skipped due to exceeding max files limit (${MAX_SCAN_FILES})`)
  }

  // 3. Throw if empty
  if (inventory.length === 0) {
    throwEmptySourceError(state.sourcePath)
  }

  // 4. Sort by relative path
  inventory.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  // 5. Update state and advance
  const updatedState: MigrationState = {
    ...state,
    inventory,
  }

  return markStageCompleted(updatedState, 'scan', {
    metadata: {
      totalFiles: inventory.length,
      skippedDepth,
      skippedLimit,
      skippedNonMarkdown: rawInventory.length - inventory.length - skippedDepth - skippedLimit,
    },
  })
}
