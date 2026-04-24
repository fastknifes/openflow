/**
 * Kiro Adapter
 *
 * Detects and maps Kiro source documents to OpenFlow target structure.
 *
 * Detection markers:
 * - `.kiro/` directory containing `specs/`
 * - `.kiro/specs/`, `.kiro/steering/`, `.kiro/hooks/`
 *
 * Classification rules (heuristic only, no LLM):
 * - `.kiro/specs/<feature>/requirements.md` -> `current/requirements/` (0.85)
 * - `.kiro/specs/<feature>/design.md` -> `current/design/` (0.85)
 * - `.kiro/specs/<feature>/tasks.md` -> `changes/` (0.7)
 * - `.kiro/specs/<feature>/bugfix.md` -> `changes/` (0.7)
 * - `.kiro/steering/*` -> `decisions/` ADR candidate (0.6)
 * - `.kiro/hooks/*` -> `current/workflow/` (0.7)
 */

import { readdir, stat } from 'node:fs/promises'
import { join, relative, extname, basename } from 'node:path'
import type { DocAdapter } from './types.js'
import type {
  AdapterDetectResult,
  ClassificationResult,
  ConfidenceLevel,
  FileInventory,
  TargetCategory,
} from '../types.js'
import { ALLOWED_EXTENSIONS, MAX_SCAN_DEPTH, MAX_SCAN_FILES } from '../types.js'

// ============================================================================
// Detection
// ============================================================================

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isDirectory()
  } catch {
    return false
  }
}

// ============================================================================
// Adapter Implementation
// ============================================================================

export const kiroAdapter: DocAdapter = {
  name: 'kiro',

  async detect(sourceDir: string): Promise<AdapterDetectResult> {
    const kiroDir = join(sourceDir, '.kiro')
    const hasKiroDir = await isDirectory(kiroDir)

    if (!hasKiroDir) {
      return {
        adapter: 'kiro',
        detected: false,
        confidence: 0,
      }
    }

    const hasSpecs = await isDirectory(join(kiroDir, 'specs'))
    const hasSteering = await isDirectory(join(kiroDir, 'steering'))
    const hasHooks = await isDirectory(join(kiroDir, 'hooks'))

    let confidence = 0.5
    if (hasSpecs && hasSteering) {
      confidence = 0.95
    } else if (hasSpecs) {
      confidence = 0.8
    }

    const metadata: Record<string, string> = {}
    if (hasSpecs) metadata.hasSpecs = 'true'
    if (hasSteering) metadata.hasSteering = 'true'
    if (hasHooks) metadata.hasHooks = 'true'

    return {
      adapter: 'kiro',
      detected: confidence > 0,
      confidence,
      metadata,
    }
  },

  async scan(sourceDir: string): Promise<FileInventory[]> {
    const kiroDir = join(sourceDir, '.kiro')
    const inventory: FileInventory[] = []
    let scannedCount = 0

    async function scanDir(dirPath: string, depth: number): Promise<void> {
      if (depth > MAX_SCAN_DEPTH) return

      let entries: string[]
      try {
        entries = await readdir(dirPath)
      } catch {
        return
      }

      for (const entry of entries) {
        if (scannedCount >= MAX_SCAN_FILES) break

        const fullPath = join(dirPath, entry)
        let entryStat
        try {
          entryStat = await stat(fullPath)
        } catch {
          continue
        }

        if (entryStat.isSymbolicLink()) continue

        if (entryStat.isDirectory()) {
          await scanDir(fullPath, depth + 1)
        } else if (entryStat.isFile()) {
          const ext = extname(entry).toLowerCase()
          if (ALLOWED_EXTENSIONS.includes(ext as '.md' | '.markdown') || entry === 'spec.json') {
            scannedCount++
            const relPath = relative(sourceDir, fullPath)
            const dirContext = basename(dirPath)
            inventory.push({
              sourcePath: fullPath,
              relativePath: relPath,
              size: entryStat.size,
              modifiedAt: entryStat.mtime.toISOString(),
              extension: ext || (entry === 'spec.json' ? '.json' : ''),
              directoryContext: dirContext,
              adapterMetadata: {
                kiroPath: relPath,
              },
            })
          } else {
            console.warn(`[kiro] Skipping non-Markdown file: ${relative(sourceDir, fullPath)}`)
          }
        }
      }
    }

    await scanDir(kiroDir, 0)
    return inventory
  },

  async classify(inventory: FileInventory[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = []

    for (const item of inventory) {
      const rel = item.relativePath.replace(/\\/g, '/')
      const result = classifySingle(item, rel)
      results.push(result)
    }

    return results
  },
}

// ============================================================================
// Utility Helpers
// ============================================================================

/**
 * Convert a string to English kebab-case
 */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

// ============================================================================
// Classification Helpers
// ============================================================================

function classifySingle(item: FileInventory, relPath: string): ClassificationResult {
  const fileName = basename(relPath).toLowerCase()

  // Extract feature/directory context from paths like .kiro/specs/<feature>/file.md
  const specsMatch = relPath.match(/\/specs\/([^/]+)\//)
  const featureName = specsMatch ? specsMatch[1] : ''

  // .kiro/specs/<feature>/requirements.md -> current/requirements (0.85)
  if (relPath.includes('/specs/') && fileName === 'requirements.md') {
    const targetFile = featureName
      ? `${toKebabCase(featureName)}-requirements.md`
      : 'requirements.md'
    return makeResult(item, 'current/requirements', 0.85, 'high',
      'Kiro specs requirements.md mapped to current/requirements',
      `docs/current/requirements/${targetFile}`)
  }

  // .kiro/specs/<feature>/design.md -> current/design (0.85)
  if (relPath.includes('/specs/') && fileName === 'design.md') {
    const targetFile = featureName
      ? `${toKebabCase(featureName)}-design.md`
      : 'design.md'
    return makeResult(item, 'current/design', 0.85, 'high',
      'Kiro specs design.md mapped to current/design',
      `docs/current/design/${targetFile}`)
  }

  // .kiro/specs/<feature>/tasks.md -> changes (0.7)
  if (relPath.includes('/specs/') && fileName === 'tasks.md') {
    const targetFile = featureName
      ? `${toKebabCase(featureName)}-tasks.md`
      : 'tasks.md'
    return makeResult(item, 'changes', 0.7, 'high',
      'Kiro specs tasks.md mapped to changes',
      `docs/changes/${targetFile}`)
  }

  // .kiro/specs/<feature>/bugfix.md -> changes (0.7)
  if (relPath.includes('/specs/') && fileName === 'bugfix.md') {
    const targetFile = featureName
      ? `${toKebabCase(featureName)}-bugfix.md`
      : 'bugfix.md'
    return makeResult(item, 'changes', 0.7, 'high',
      'Kiro specs bugfix.md mapped to changes',
      `docs/changes/${targetFile}`)
  }

  // .kiro/steering/* -> decisions ADR candidate (0.6)
  if (relPath.includes('/steering/')) {
    const targetFile = toKebabCase(basename(relPath, extname(relPath))) + extname(relPath)
    return makeResult(item, 'decisions', 0.6, 'medium',
      'Kiro steering document classified as ADR candidate (requires user confirmation)',
      `docs/decisions/${targetFile}`)
  }

  // .kiro/hooks/* -> current/workflow (0.7)
  if (relPath.includes('/hooks/')) {
    const targetFile = toKebabCase(basename(relPath, extname(relPath))) + extname(relPath)
    return makeResult(item, 'current/workflow', 0.7, 'high',
      'Kiro hooks document mapped to current/workflow',
      `docs/current/workflow/${targetFile}`)
  }

  // spec.json or other files under .kiro/specs/ -> current/spec (0.7)
  if (relPath.includes('/specs/') && fileName === 'spec.json') {
    const targetFile = featureName
      ? `${toKebabCase(featureName)}-spec.json`
      : 'spec.json'
    return makeResult(item, 'current/spec', 0.7, 'high',
      'Kiro spec.json mapped to current/spec',
      `docs/current/spec/${targetFile}`)
  }

  // Fallback: any other .md under .kiro/specs/ -> changes (0.6)
  if (relPath.includes('/specs/') && item.extension === '.md') {
    const targetFile = toKebabCase(basename(relPath, extname(relPath))) + extname(relPath)
    return makeResult(item, 'changes', 0.6, 'medium',
      'Unrecognized Kiro spec file mapped to changes',
      `docs/changes/${targetFile}`)
  }

  // Fallback: any other .md under .kiro/ -> references/raw (0.5)
  const fallbackFile = toKebabCase(basename(relPath, extname(relPath))) + extname(relPath)
  return makeResult(item, 'references/raw', 0.5, 'low',
    'Unrecognized Kiro file mapped to references/raw',
    `docs/references/raw/${fallbackFile}`)
}

function makeResult(
  item: FileInventory,
  targetType: TargetCategory,
  confidenceScore: number,
  confidence: ConfidenceLevel,
  reasoning: string,
  proposedTargetPath?: string,
): ClassificationResult {
  const result: ClassificationResult = {
    inventoryItem: item,
    targetType,
    confidence,
    confidenceScore,
    adapterUsed: 'kiro',
    reasoning,
  }
  if (proposedTargetPath !== undefined) {
    result.proposedTargetPath = proposedTargetPath
  }
  return result
}
