/**
 * Test helper utilities for the OpenFlow test suite.
 *
 * Provides:
 *   - Temporary directory creation/cleanup
 *   - File system fixtures
 *   - Common assertions
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

/**
 * Create a temporary directory for test isolation.
 * Returns the absolute path; caller is responsible for cleanup.
 */
export async function createTempDir(prefix = 'openflow-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

/**
 * Remove a directory recursively, ignoring errors if it doesn't exist.
 */
export async function removeTempDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
}

/**
 * Write a set of files into a base directory.
 * Keys are relative paths, values are file contents.
 */
export async function writeFiles(
  baseDir: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(baseDir, relativePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
  }
}

/**
 * Read a file as UTF-8 string. Returns null if file doesn't exist.
 */
export async function readFileOrNull(
  filePath: string,
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Check if a path exists on disk.
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
