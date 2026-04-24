import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { analyzeAgentsContent, renderAgentsContent, detectNewline } from './init-agents.js'
import { NEWLINE_DEFAULT, type InitResult } from './init-content.js'
import { OpenFlowError, ErrorCode } from '../utils/errors.js'
import { createSafePath } from '../utils/security.js'
import { logger } from '../utils/logger.js'

/**
 * Result of updating AGENTS.md file.
 */
export interface InitPersistenceResult {
  /** The action that was taken */
  action: InitResult
  /** Path to the AGENTS.md file */
  filePath: string
  /** Whether the file was created (didn't exist before) */
  isNewFile: boolean
}

/**
 * Options for updating AGENTS.md.
 */
export interface UpdateAgentsFileOptions {
  /** Project root directory */
  projectDir: string
}

/**
 * Atomically write content to a file using temp file + rename pattern.
 *
 * @param filePath - Final destination path
 * @param content - Content to write
 * @throws OpenFlowError if write fails
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  const tempFile = path.join(dir, `.agents-md-temp-${Date.now()}.tmp`)

  try {
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true })

    // Write to temp file
    await fs.writeFile(tempFile, content, 'utf-8')

    // Atomically rename to target
    await fs.rename(tempFile, filePath)
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tempFile)
    } catch (cleanupError) {
      // Log cleanup failure but don't mask the original error
      logger.warn('Failed to clean up temp file after write failure', {
        tempFile,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    }

    throw new OpenFlowError(
      ErrorCode.OPERATION_FAILED,
      `Failed to write AGENTS.md: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Result of reading AGENTS.md file.
 */
interface AgentsFileReadResult {
  /** Whether the file existed before reading */
  exists: boolean
  /** File content (empty string if file doesn't exist or is empty) */
  content: string
}

/**
 * Read existing AGENTS.md content or return empty result if not found.
 *
 * @param filePath - Path to AGENTS.md
 * @returns Object with existence flag and content
 * @throws OpenFlowError for permission errors
 */
async function readAgentsFile(filePath: string): Promise<AgentsFileReadResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return { exists: true, content }
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist
        return { exists: false, content: '' }
      }
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new OpenFlowError(
          ErrorCode.PERMISSION_DENIED,
          `Permission denied reading AGENTS.md: ${error.message}`,
          error
        )
      }
    }
    throw new OpenFlowError(
      ErrorCode.OPERATION_FAILED,
      `Failed to read AGENTS.md: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Update the root AGENTS.md file with OpenFlow managed block.
 *
 * This function:
 * 1. Reads existing AGENTS.md if present
 * 2. Detects newline style (preserves CRLF if found)
 * 3. Determines the appropriate update action
 * 4. Renders new content
 * 5. Writes atomically using temp file + rename
 *
 * @param options - Update options
 * @returns Result describing what action was taken
 * @throws OpenFlowError for filesystem errors
 */
export async function updateAgentsFile(
  options: UpdateAgentsFileOptions
): Promise<InitPersistenceResult> {
  const { projectDir } = options

  // Resolve safe path for AGENTS.md
  const agentsPath = createSafePath(projectDir, 'AGENTS.md')

  // Read existing content and check existence
  const { exists: fileExists, content: existingContent } = await readAgentsFile(agentsPath)

  // Detect newline style
  const newline = existingContent.length > 0 ? detectNewline(existingContent) : NEWLINE_DEFAULT

  // Analyze content and determine action
  const analysis = analyzeAgentsContent(existingContent)

  // Render new content
  const newContent = renderAgentsContent(analysis, newline)

  // Write atomically
  await atomicWrite(agentsPath, newContent)

  // Map internal action to InitResult
  let action: InitResult
  switch (analysis.action) {
    case 'create_new_file':
      action = 'initialized'
      break
    case 'replace_valid_block':
      action = 'refreshed'
      break
    case 'append_missing_block':
      action = 'appended'
      break
    case 'append_safe_repair_block':
      action = 'safe_repair'
      break
    default:
      // Exhaustive check: this should never happen with a closed union
      throw new OpenFlowError(
        ErrorCode.OPERATION_FAILED,
        `Unexpected analysis action: ${analysis.action}`
      )
  }

  return {
    action,
    filePath: agentsPath,
    isNewFile: !fileExists,
  }
}
