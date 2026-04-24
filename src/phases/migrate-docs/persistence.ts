/**
 * Migration session persistence - file I/O operations
 * Saves/loads migration sessions to/from .sisyphus/docs-migration/
 */

import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { createSafePath, SecurityError } from '../../utils/security'
import {
  type MigrationState,
  type MigrationSessionIndex,
  normalizeMigrationState,
} from './types'

const MIGRATION_DIR = 'docs-migration'
const INDEX_FILE = 'active.json'

// ============================================================================
// Session Persistence
// ============================================================================

/**
 * Save a migration session to disk
 */
export async function saveMigrationSession(
  projectDir: string,
  state: MigrationState
): Promise<void> {
  const sessionPath = getMigrationSessionPath(projectDir, state.migrationId)
  const sessionDir = path.dirname(sessionPath)

  // Ensure directory exists
  await fs.mkdir(sessionDir, { recursive: true })

  // Update timestamp before saving
  const stateToSave = {
    ...state,
    updatedAt: new Date().toISOString(),
  }

  // Atomic write: write to temp file then rename
  const tempPath = `${sessionPath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(stateToSave, null, 2), 'utf-8')
  await fs.rename(tempPath, sessionPath)
}

/**
 * Load a migration session from disk
 */
export async function loadMigrationSession(
  projectDir: string,
  migrationId: string
): Promise<MigrationState | null> {
  const sessionPath = getMigrationSessionPath(projectDir, migrationId)

  try {
    const content = await fs.readFile(sessionPath, 'utf-8')
    const parsed = JSON.parse(content) as unknown
    return normalizeMigrationState(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Check if a migration session exists
 */
export async function migrationSessionExists(
  projectDir: string,
  migrationId: string
): Promise<boolean> {
  const sessionPath = getMigrationSessionPath(projectDir, migrationId)
  try {
    await fs.access(sessionPath)
    return true
  } catch {
    return false
  }
}

/**
 * Delete a migration session
 */
export async function deleteMigrationSession(
  projectDir: string,
  migrationId: string
): Promise<void> {
  const sessionPath = getMigrationSessionPath(projectDir, migrationId)
  try {
    await fs.unlink(sessionPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

/**
 * List all migration sessions for a project
 */
export async function listMigrationSessions(projectDir: string): Promise<string[]> {
  const migrationDir = createSafePath(projectDir, '.sisyphus', MIGRATION_DIR)

  try {
    const entries = await fs.readdir(migrationDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.json') && e.name !== INDEX_FILE)
      .map((e) => e.name.replace(/\.json$/, ''))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/**
 * Get the file path for a migration session
 */
function getMigrationSessionPath(projectDir: string, migrationId: string): string {
  // Validate migration ID to prevent path traversal
  if (!isValidMigrationId(migrationId)) {
    throw new SecurityError(`Invalid migration ID: ${migrationId}`)
  }
  return createSafePath(projectDir, '.sisyphus', MIGRATION_DIR, `${migrationId}.json`)
}

function isValidMigrationId(id: string): boolean {
  // Migration IDs should start with 'migration-' and contain only alphanumeric chars and hyphens
  return /^migration-[a-z0-9-]+$/i.test(id) && id.length <= 128
}

// ============================================================================
// Session Index Management
// ============================================================================

/**
 * Load the migration session index
 */
export async function loadMigrationSessionIndex(
  projectDir: string
): Promise<MigrationSessionIndex> {
  const indexPath = getIndexPath(projectDir)

  try {
    const content = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(content) as Partial<MigrationSessionIndex>
    return normalizeSessionIndex(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { byMigrationID: {} }
    }
    throw error
  }
}

/**
 * Save the migration session index
 */
export async function saveMigrationSessionIndex(
  projectDir: string,
  index: MigrationSessionIndex
): Promise<void> {
  const indexPath = getIndexPath(projectDir)
  const indexDir = path.dirname(indexPath)

  // Ensure directory exists
  await fs.mkdir(indexDir, { recursive: true })

  // Atomic write
  const tempPath = `${indexPath}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(index, null, 2), 'utf-8')
  await fs.rename(tempPath, indexPath)
}

/**
 * Update the session index with a migration entry
 */
export async function updateMigrationSessionIndex(
  projectDir: string,
  state: MigrationState
): Promise<void> {
  const index = await loadMigrationSessionIndex(projectDir)
  index.byMigrationID[state.migrationId] = {
    migrationId: state.migrationId,
    sourcePath: state.sourcePath,
    targetRoot: state.targetRoot,
    stage: state.stage,
    updatedAt: new Date().toISOString(),
  }
  await saveMigrationSessionIndex(projectDir, index)
}

/**
 * Remove a migration from the session index
 */
export async function removeFromMigrationSessionIndex(
  projectDir: string,
  migrationId: string
): Promise<void> {
  const index = await loadMigrationSessionIndex(projectDir)
  if (index.byMigrationID[migrationId]) {
    delete index.byMigrationID[migrationId]
    if (index.activeMigrationId === migrationId) {
      delete index.activeMigrationId
    }
    await saveMigrationSessionIndex(projectDir, index)
  }
}

function getIndexPath(projectDir: string): string {
  return createSafePath(projectDir, '.sisyphus', MIGRATION_DIR, INDEX_FILE)
}

function normalizeSessionIndex(parsed: Partial<MigrationSessionIndex>): MigrationSessionIndex {
  const result: MigrationSessionIndex = {
    byMigrationID: parsed.byMigrationID && typeof parsed.byMigrationID === 'object'
      ? parsed.byMigrationID as Record<string, import('./types').MigrationSessionEntry>
      : {},
  }

  if (typeof parsed.activeMigrationId === 'string') {
    result.activeMigrationId = parsed.activeMigrationId
  }

  return result
}

// ============================================================================
// Lock Management
// ============================================================================

/**
 * Acquire a migration lock to prevent concurrent migrations
 * @throws ConcurrentMigrationError if another migration is already active
 */
export async function acquireMigrationLock(
  projectDir: string,
  migrationId: string
): Promise<void> {
  const index = await loadMigrationSessionIndex(projectDir)

  // Check if there's an active migration
  if (index.activeMigrationId && index.activeMigrationId !== migrationId) {
    const activeMigration = index.byMigrationID[index.activeMigrationId]
    if (activeMigration) {
      // Check if the active migration is in a terminal state
      const terminalStages = ['completed', 'failed']
      if (!terminalStages.includes(activeMigration.stage)) {
        throw new ConcurrentMigrationError(
          `Migration '${index.activeMigrationId}' is already in progress (stage: ${activeMigration.stage}). ` +
          `Only one migration can run at a time.`
        )
      }
    }
  }

  // Set this migration as active
  index.activeMigrationId = migrationId
  await saveMigrationSessionIndex(projectDir, index)
}

/**
 * Release the migration lock
 */
export async function releaseMigrationLock(
  projectDir: string,
  migrationId: string
): Promise<void> {
  const index = await loadMigrationSessionIndex(projectDir)

  if (index.activeMigrationId === migrationId) {
    delete index.activeMigrationId
    await saveMigrationSessionIndex(projectDir, index)
  }
}

/**
 * Check if there's an active migration lock
 */
export async function isMigrationLocked(projectDir: string): Promise<boolean> {
  const index = await loadMigrationSessionIndex(projectDir)
  if (!index.activeMigrationId) return false

  const activeMigration = index.byMigrationID[index.activeMigrationId]
  if (!activeMigration) return false

  const terminalStages = ['completed', 'failed']
  return !terminalStages.includes(activeMigration.stage)
}

/**
 * Get the active migration ID (if any)
 */
export async function getActiveMigrationId(projectDir: string): Promise<string | null> {
  const index = await loadMigrationSessionIndex(projectDir)
  if (!index.activeMigrationId) return null

  const activeMigration = index.byMigrationID[index.activeMigrationId]
  if (!activeMigration) return null

  const terminalStages = ['completed', 'failed']
  if (terminalStages.includes(activeMigration.stage)) return null

  return index.activeMigrationId
}

// ============================================================================
// Error Classes
// ============================================================================

export class ConcurrentMigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConcurrentMigrationError'
  }
}

export class MigrationNotFoundError extends Error {
  constructor(migrationId: string) {
    super(`Migration '${migrationId}' not found`)
    this.name = 'MigrationNotFoundError'
  }
}
