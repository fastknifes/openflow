import * as path from 'node:path'
import * as fs from 'node:fs/promises'

export const MAX_FEATURE_NAME_LENGTH = 64
export const MAX_BUILD_ID_LENGTH = 32
export const MAX_PATH_DEPTH = 10

const DANGEROUS_PATH_PATTERNS = [
  /\.\./,
  /\0/,
  /^[A-Za-z]:/,
  /^\/dev\//,
  /^\/proc\//,
  /^\/etc\//,
]

export class SecurityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SecurityError'
  }
}

export function sanitizeFeatureName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new SecurityError('Feature name is required')
  }

  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new SecurityError('Feature name cannot be empty')
  }

  if (trimmed.length > MAX_FEATURE_NAME_LENGTH) {
    throw new SecurityError(`Feature name exceeds maximum length of ${MAX_FEATURE_NAME_LENGTH}`)
  }

  const sanitized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, MAX_FEATURE_NAME_LENGTH)

  if (sanitized.length < 2) {
    throw new SecurityError('Feature name is too short after sanitization')
  }

  return sanitized
}

export function validateBuildId(buildId: string): void {
  if (!buildId || typeof buildId !== 'string') {
    throw new SecurityError('Build ID is required')
  }

  if (buildId.length > MAX_BUILD_ID_LENGTH) {
    throw new SecurityError(`Build ID exceeds maximum length of ${MAX_BUILD_ID_LENGTH}`)
  }

  if (!/^build-[a-z0-9]+-[a-z0-9]+$/i.test(buildId)) {
    throw new SecurityError('Invalid build ID format')
  }
}

export function validateConfigPath(configPath: string): string {
  if (!configPath || typeof configPath !== 'string') {
    throw new SecurityError('Config path is required')
  }

  // Check for .. BEFORE normalize to prevent docs/../x bypass
  if (configPath.includes('..')) {
    throw new SecurityError('Config path cannot contain parent directory references')
  }

  const normalized = path.normalize(configPath)

  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new SecurityError(`Config path contains forbidden pattern: ${configPath}`)
    }
  }

  const parts = normalized.split(/[/\\]/)
  if (parts.length > MAX_PATH_DEPTH) {
    throw new SecurityError(`Config path exceeds maximum depth of ${MAX_PATH_DEPTH}`)
  }

  return normalized
}

export function createSafePath(baseDir: string, ...segments: string[]): string {
  const resolvedBase = path.resolve(baseDir)
  const fullPath = path.resolve(resolvedBase, ...segments)

  // Use path.relative to detect path traversal (more secure than startsWith)
  // On Windows, C:\repo is a prefix of C:\repo2, so startsWith is vulnerable
  const relativePath = path.relative(resolvedBase, fullPath)
  
  // If relative path starts with '..' or is absolute, it's outside base dir
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new SecurityError(`Path traversal detected: ${segments.join('/')}`)
  }

  return fullPath
}

export async function isSafeToRead(filePath: string, baseDir: string): Promise<boolean> {
  try {
    const resolvedBase = path.resolve(baseDir)
    const stats = await fs.lstat(filePath)
    
    if (stats.isSymbolicLink()) {
      const realPath = await fs.realpath(filePath)
      const relativePath = path.relative(resolvedBase, realPath)
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return false
      }
    }

    return stats.isFile() || stats.isDirectory()
  } catch {
    return false
  }
}

export async function safeCopyDirectory(
  src: string,
  dest: string,
  baseDir: string
): Promise<void> {
  const resolvedSrc = createSafePath(baseDir, src)
  const resolvedDest = createSafePath(baseDir, dest)

  const srcStats = await fs.lstat(resolvedSrc)
  
  if (srcStats.isSymbolicLink()) {
    throw new SecurityError(`Cannot copy symbolic link: ${src}`)
  }

  await fs.mkdir(resolvedDest, { recursive: true })

  const entries = await fs.readdir(resolvedSrc, { withFileTypes: true })

  for (const entry of entries) {
    const entrySrc = path.join(resolvedSrc, entry.name)
    const entryDest = path.join(resolvedDest, entry.name)

    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      await safeCopyDirectory(entrySrc, entryDest, baseDir)
    } else if (entry.isFile()) {
      await fs.copyFile(entrySrc, entryDest)
    }
  }
}

export function escapeMarkdown(content: string): string {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/\*/g, '\\*')
    .replace(/!/g, '\\!')
    .replace(/</g, '\\<')
    .replace(/>/g, '\\>')
}

export function generateBuildId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 6)
  return `build-${timestamp}-${random}`
}

/**
 * Generate date prefix for document filenames (YYYYMMDD format)
 * Used for all custom-generated documents
 */
export function getDatePrefix(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Add date prefix to a filename
 * Example: "proposal.md" -> "20260311-proposal.md"
 */
export function addDatePrefix(filename: string): string {
  const prefix = getDatePrefix()
  return `${prefix}-${filename}`
}

/**
 * Find the latest document matching a pattern in a directory
 * Returns the full path of the most recent file
 */
export async function findLatestDocument(
  dir: string,
  pattern: RegExp
): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const matchingFiles = entries
      .filter(e => e.isFile() && pattern.test(e.name))
      .map(e => ({
        name: e.name,
        path: path.join(dir, e.name),
        // Extract date from filename (YYYYMMDD-filename.md)
        date: e.name.match(/^(\d{8})-/)?.[1] || '00000000'
      }))
      .sort((a, b) => b.date.localeCompare(a.date))

    return matchingFiles[0]?.path || null
  } catch {
    return null
  }
}
