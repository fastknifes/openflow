/**
 * Trae DocAdapter
 *
 * Detects, scans, and classifies Trae IDE source document structures.
 * Uses heuristic rules (filename patterns, directory context) only.
 */

import { readdir, stat } from 'node:fs/promises'
import { join, relative, basename, extname } from 'node:path'
import type { DocAdapter } from './types.js'
import type {
  AdapterDetectResult,
  ClassificationResult,
  FileInventory,
} from '../types.js'
import {
  ALLOWED_EXTENSIONS,
  MAX_SCAN_DEPTH,
  MAX_SCAN_FILES,
} from '../types.js'

export const traeAdapter: DocAdapter = {
  name: 'trae',

  async detect(sourceDir: string): Promise<AdapterDetectResult> {
    const hasDir = async (p: string) => {
      try {
        const s = await stat(join(sourceDir, p))
        return s.isDirectory()
      } catch {
        return false
      }
    }

    const hasTraeDir = await hasDir('.trae')
    const hasTraeDocs = await hasDir('.trae/docs')
    const hasTraeRules = await hasDir('.trae/rules')

    let confidence = 0
    if (hasTraeDir && (hasTraeDocs || hasTraeRules)) {
      confidence = 0.9
    } else if (hasTraeDir) {
      confidence = 0.5
    }

    const metadata: Record<string, string> = {}
    if (hasTraeDocs) metadata.hasTraeDocs = 'true'
    if (hasTraeRules) metadata.hasTraeRules = 'true'

    return {
      adapter: 'trae',
      detected: confidence > 0,
      confidence,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  },

  async scan(sourceDir: string): Promise<FileInventory[]> {
    const results: FileInventory[] = []
    const traeDir = join(sourceDir, '.trae')

    try {
      const s = await stat(traeDir)
      if (!s.isDirectory()) return []
    } catch {
      return []
    }

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
            console.warn(`[trae] Skipping non-Markdown file: ${relative(sourceDir, fullPath)}`)
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

    await walk(traeDir, 0)
    return results
  },

  async classify(inventory: FileInventory[]): Promise<ClassificationResult[]> {
    return inventory.map((item): ClassificationResult => {
      const rel = item.relativePath.replace(/\\/g, '/')
      const fileNameLower = basename(rel).toLowerCase()

      // rules files -> current/workflow/ (0.6)
      if (
        rel.includes('/rules/') ||
        fileNameLower.includes('rule') ||
        fileNameLower.includes('guideline')
      ) {
        const targetFile = basename(rel)
        return {
          inventoryItem: item,
          targetType: 'current/workflow',
          confidence: 'medium',
          confidenceScore: 0.6,
          adapterUsed: 'trae',
          reasoning: `Trae rules file mapped to current/workflow/`,
          proposedTargetPath: `docs/current/workflow/${targetFile}`,
        }
      }

      // config files -> references/raw/ (0.4)
      if (
        fileNameLower.includes('config') ||
        fileNameLower.includes('setting') ||
        fileNameLower.includes('preference')
      ) {
        const targetFile = basename(rel)
        return {
          inventoryItem: item,
          targetType: 'references/raw',
          confidence: 'low',
          confidenceScore: 0.4,
          adapterUsed: 'trae',
          reasoning: `Trae config file mapped to references/raw/`,
          proposedTargetPath: `docs/references/raw/trae/${targetFile}`,
        }
      }

      // Default -> references/raw/ (0.3)
      const targetFile = basename(rel)
      return {
        inventoryItem: item,
        targetType: 'references/raw',
        confidence: 'low',
        confidenceScore: 0.3,
        adapterUsed: 'trae',
        reasoning: `Unrecognized Trae file; defaulting to references/raw/`,
        proposedTargetPath: `docs/references/raw/trae/${targetFile}`,
      }
    })
  },
}
