import type { DriftCheckResult } from './diff-engine.js'
import type { GuardianRepairRecord } from '../types.js'
import { appendGuardianRepair } from './state-store.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export interface RepairResult {
  success: boolean
  filePath: string
  reason: string
  repairRecord?: GuardianRepairRecord
}

const DEFAULT_MAX_RETRIES = 3

// Gate check: only repair if disposition is 'auto_repaired' AND result has a suggestedFix
export function isDeterministicRepair(result: DriftCheckResult): boolean {
  return result.suggestedFix !== undefined && result.suggestedFix.length > 0
}

// Execute a repair on a file using edit-only (oldString -> newString replacement)
export async function executeRepair(
  result: DriftCheckResult,
  filePath: string,
  projectDir: string,
  feature: string,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<RepairResult> {
  if (!isDeterministicRepair(result)) {
    return {
      success: false,
      filePath,
      reason: 'Not a deterministic repair - requires human confirmation',
    }
  }

  const fullPath = path.join(projectDir, filePath)
  const suggestedFix = result.suggestedFix!

  // Optimistic concurrency with retries
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Step 1: Read current content
      const originalContent = await fs.readFile(fullPath, 'utf-8')

      // Step 2: Check target segment exists
      // For "->" format, search for the old part; otherwise search for the full suggestedFix
      const searchTarget = suggestedFix.includes('->')
        ? suggestedFix.split('->', 2)[0]!
        : suggestedFix
      if (!originalContent.includes(searchTarget)) {
        // Pre-write re-read: if the target segment doesn't exist in current content,
        // it may already have been modified - retry
        if (attempt < maxRetries - 1) {
          await delay(50)
          continue
        }
        return {
          success: false,
          filePath,
          reason: `Target segment not found in current file content after ${maxRetries} attempts: concurrent_conflict`,
        }
      }

      // Step 3: Apply edit (replace oldString with newString - for path/symbol rename repairs)
      // The suggestedFix format for renames: "oldName->newName"
      let repairedContent: string
      if (suggestedFix.includes('->')) {
        const [oldPart, newPart] = suggestedFix.split('->', 2)
        repairedContent = originalContent.replace(new RegExp(escapeRegex(oldPart!), 'g'), newPart!)
      } else {
        // Direct replacement
        repairedContent = originalContent.replace(suggestedFix, '')
      }

      // Step 4: Pre-write re-read to check no concurrent change
      const reReadContent = await fs.readFile(fullPath, 'utf-8')
      if (reReadContent !== originalContent) {
        // Content changed between read and write -> retry
        if (attempt < maxRetries - 1) {
          await delay(50)
          continue
        }
        return {
          success: false,
          filePath,
          reason: `Concurrent modification detected after ${maxRetries} attempts: concurrent_conflict`,
        }
      }

      // Step 5: Write repaired content
      await fs.writeFile(fullPath, repairedContent, 'utf-8')

      // Step 6: Create repair log record
      const repairRecord: GuardianRepairRecord = {
        timestamp: new Date().toISOString(),
        feature,
        filePath,
        disposition: 'auto_repaired',
        originalSegment: originalContent,
        repairedSegment: repairedContent,
        reason: result.reason,
      }
      await appendGuardianRepair(projectDir, repairRecord)

      return {
        success: true,
        filePath,
        reason: `Repair applied on attempt ${attempt + 1}`,
        repairRecord,
      }
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await delay(50)
        continue
      }
      return {
        success: false,
        filePath,
        reason: `Repair failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  return {
    success: false,
    filePath,
    reason: 'Max retries exceeded',
  }
}

// Repair design doc path reference (update path in design.md)
export async function repairDesignDocRef(
  feature: string,
  oldPath: string,
  newPath: string,
  projectDir: string,
): Promise<RepairResult> {
  const designDir = path.join(projectDir, 'docs', 'changes')
  let designFile: string | null = null

  // Find the design.md for this feature
  try {
    const entries = await fs.readdir(designDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(feature)) {
        const candidate = path.join(designDir, entry.name, 'design.md')
        try {
          await fs.access(candidate)
          designFile = candidate
          break
        } catch { /* not found */ }
      }
    }
  } catch {
    return { success: false, filePath: oldPath, reason: 'Design directory not found' }
  }

  if (!designFile) {
    return { success: false, filePath: oldPath, reason: 'design.md not found for feature' }
  }

  return executeRepair(
    {
      item: oldPath,
      type: 'file',
      contractReference: 'Design doc path reference',
      actualValue: oldPath,
      reason: 'Path reference needs update',
      suggestedFix: `${oldPath}->${newPath}`,
    },
    path.relative(projectDir, designFile),
    projectDir,
    feature,
  )
}

// Repair symbol reference in design doc
export async function repairSymbolRefInDesign(
  feature: string,
  oldName: string,
  newName: string,
  projectDir: string,
): Promise<RepairResult> {
  const designDir = path.join(projectDir, 'docs', 'changes')
  let designFile: string | null = null

  try {
    const entries = await fs.readdir(designDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(feature)) {
        const candidate = path.join(designDir, entry.name, 'design.md')
        try {
          await fs.access(candidate)
          designFile = candidate
          break
        } catch { /* not found */ }
      }
    }
  } catch {
    return { success: false, filePath: '', reason: 'Design directory not found' }
  }

  if (!designFile) {
    return { success: false, filePath: '', reason: 'design.md not found' }
  }

  return executeRepair(
    {
      item: oldName,
      type: 'symbol',
      contractReference: 'Design doc symbol reference',
      actualValue: oldName,
      reason: 'Symbol rename detected',
      suggestedFix: `${oldName}->${newName}`,
    },
    path.relative(projectDir, designFile),
    projectDir,
    feature,
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
