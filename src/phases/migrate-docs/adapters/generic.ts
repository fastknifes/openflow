/**
 * Generic DocAdapter
 *
 * Fallback adapter that detects any directory and classifies files
 * using heuristic filename-based rules. NO LLM is used.
 */

import { readdir, stat, readFile } from 'node:fs/promises'
import { join, relative, basename, extname } from 'node:path'
import type { DocAdapter } from './types.js'
import type {
  AdapterDetectResult,
  ClassificationResult,
  FileInventory,
  TargetCategory,
  ConfidenceLevel,
} from '../types.js'
import {
  ALLOWED_EXTENSIONS,
  MAX_SCAN_DEPTH,
  MAX_SCAN_FILES,
} from '../types.js'

export const genericAdapter: DocAdapter = {
  name: 'generic',

  async detect(): Promise<AdapterDetectResult> {
    return {
      adapter: 'generic',
      detected: true,
      confidence: 0.3,
    }
  },

  async scan(sourceDir: string): Promise<FileInventory[]> {
    const results: FileInventory[] = []

    async function walk(dir: string, depth: number): Promise<void> {
      if (depth > MAX_SCAN_DEPTH) return
      if (results.length >= MAX_SCAN_FILES) return

      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isSymbolicLink()) continue

        if (entry.isDirectory()) {
          await walk(fullPath, depth + 1)
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase()
          if (!ALLOWED_EXTENSIONS.includes(ext as '.md' | '.markdown')) {
            continue
          }

          const s = await stat(fullPath)
          results.push({
            sourcePath: fullPath,
            relativePath: relative(sourceDir, fullPath),
            size: s.size,
            modifiedAt: s.mtime.toISOString(),
            extension: ext,
            directoryContext: basename(dir),
          })
        }
      }
    }

    await walk(sourceDir, 0)
    return results
  },

  async classify(inventory: FileInventory[]): Promise<ClassificationResult[]> {
    return Promise.all(
      inventory.map(async (item): Promise<ClassificationResult> => {
        const rel = item.relativePath.replace(/\\/g, '/')
        const fileNameLower = basename(rel).toLowerCase()

        // Read first 50 lines for heading extraction
        let firstHeading = ''
        try {
          const content = await readFile(item.sourcePath, 'utf-8')
          const lines = content.split('\n').slice(0, 50)
          for (const line of lines) {
            const match = line.match(/^#+\s+(.+)$/)
            if (match && match[1]) {
              firstHeading = match[1].trim()
              break
            }
          }
        } catch {
          // ignore read errors
        }

        // Filename keyword heuristics
        if (fileNameLower.includes('readme')) {
          return buildResult(item, 'references/raw', 'low', 0.3, `README file mapped to references/raw/`)
        }

        if (/design/.test(fileNameLower)) {
          return buildResult(item, 'current/design', 'medium', 0.5, `Design document mapped to current/design/`)
        }

        if (/spec/.test(fileNameLower)) {
          return buildResult(item, 'current/spec', 'medium', 0.5, `Spec document mapped to current/spec/`)
        }

        if (/requirement|需求/.test(fileNameLower)) {
          return buildResult(item, 'current/requirements', 'medium', 0.5, `Requirements document mapped to current/requirements/`)
        }

        if (/todo|changelog|change/.test(fileNameLower)) {
          return buildResult(item, 'changes', 'low', 0.4, `Change-related file mapped to changes/`)
        }

        if (/deprecated|legacy|old|旧/.test(fileNameLower)) {
          return buildResult(item, 'archive', 'medium', 0.6, `Deprecated/legacy document mapped to archive/`)
        }

        if (/adr|decision|决策/.test(fileNameLower)) {
          return buildResult(item, 'decisions', 'low', 0.4, `ADR/decision candidate mapped to decisions/`)
        }

        // Heading-based heuristic fallback
        if (firstHeading) {
          const headingLower = firstHeading.toLowerCase()
          if (/design/.test(headingLower)) {
            return buildResult(item, 'current/design', 'medium', 0.5, `Heading indicates design document; mapped to current/design/`)
          }
          if (/spec/.test(headingLower)) {
            return buildResult(item, 'current/spec', 'medium', 0.5, `Heading indicates spec document; mapped to current/spec/`)
          }
          if (/requirement|需求/.test(headingLower)) {
            return buildResult(item, 'current/requirements', 'medium', 0.5, `Heading indicates requirements document; mapped to current/requirements/`)
          }
        }

        // Everything else -> references/raw/ (0.3)
        return buildResult(item, 'references/raw', 'low', 0.3, `Unrecognized file; defaulting to references/raw/`)
      })
    )
  },
}

function buildResult(
  item: FileInventory,
  targetType: TargetCategory,
  confidence: ConfidenceLevel,
  confidenceScore: number,
  reasoning: string
): ClassificationResult {
  const rel = item.relativePath.replace(/\\/g, '/')
  return {
    inventoryItem: item,
    targetType,
    confidence,
    confidenceScore,
    adapterUsed: 'generic',
    reasoning,
    proposedTargetPath: `docs/${targetType}/${basename(rel)}`,
  }
}
