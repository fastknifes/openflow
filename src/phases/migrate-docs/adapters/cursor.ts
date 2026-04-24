/**
 * Cursor DocAdapter
 *
 * Detects, scans, and classifies Cursor IDE source document structures.
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

export const cursorAdapter: DocAdapter = {
  name: 'cursor',

  async detect(sourceDir: string): Promise<AdapterDetectResult> {
    const hasDir = async (p: string) => {
      try {
        const s = await stat(join(sourceDir, p))
        return s.isDirectory()
      } catch {
        return false
      }
    }

    const hasFile = async (p: string) => {
      try {
        const s = await stat(join(sourceDir, p))
        return s.isFile()
      } catch {
        return false
      }
    }

    const hasCursorRulesDir = await hasDir('.cursor/rules')
    const hasCursorMd = await hasFile('cursor.md')
    const hasCursorRulesMd = await hasFile('cursor-rules.md')

    let confidence = 0
    if (hasCursorRulesDir) {
      confidence = 0.9
    } else if (hasCursorMd || hasCursorRulesMd) {
      confidence = 0.6
    }

    const metadata: Record<string, string> = {}
    if (hasCursorRulesDir) metadata.hasCursorRulesDir = 'true'
    if (hasCursorMd) metadata.hasCursorMd = 'true'
    if (hasCursorRulesMd) metadata.hasCursorRulesMd = 'true'

    return {
      adapter: 'cursor',
      detected: confidence > 0,
      confidence,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  },

  async scan(sourceDir: string): Promise<FileInventory[]> {
    const results: FileInventory[] = []
    const cursorDir = join(sourceDir, '.cursor')

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
            console.warn(`[cursor] Skipping non-Markdown file: ${relative(sourceDir, fullPath)}`)
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

    // Scan .cursor/ directory
    try {
      const s = await stat(cursorDir)
      if (s.isDirectory()) {
        await walk(cursorDir, 0)
      }
    } catch {
      // .cursor directory doesn't exist
    }

    // Also scan root-level cursor files
    for (const fileName of ['cursor.md', 'cursor-rules.md']) {
      const fullPath = join(sourceDir, fileName)
      try {
        const s = await stat(fullPath)
        if (s.isFile()) {
          const ext = extname(fileName).toLowerCase()
          if (ALLOWED_EXTENSIONS.includes(ext as '.md' | '.markdown')) {
            results.push({
              sourcePath: fullPath,
              relativePath: fileName,
              size: s.size,
              modifiedAt: s.mtime.toISOString(),
              extension: ext,
              directoryContext: basename(sourceDir),
            })
          }
        }
      } catch {
        // file not found, skip
      }
    }

    return results
  },

  async classify(inventory: FileInventory[]): Promise<ClassificationResult[]> {
    return inventory.map((item): ClassificationResult => {
      const rel = item.relativePath.replace(/\\/g, '/')

      // .cursor/rules/* -> current/workflow/cursor-rules.md (0.6)
      if (rel.startsWith('.cursor/rules/')) {
        return {
          inventoryItem: item,
          targetType: 'current/workflow',
          confidence: 'medium',
          confidenceScore: 0.6,
          adapterUsed: 'cursor',
          reasoning: `Cursor rules file mapped to current/workflow/cursor-rules.md`,
          proposedTargetPath: `docs/current/workflow/cursor-rules.md`,
        }
      }

      // conversation history files -> references/raw/cursor-conversations/ (0.4)
      if (
        rel.includes('conversation') ||
        rel.includes('history') ||
        rel.includes('chat')
      ) {
        const targetFile = basename(rel)
        return {
          inventoryItem: item,
          targetType: 'references/raw',
          confidence: 'low',
          confidenceScore: 0.4,
          adapterUsed: 'cursor',
          reasoning: `Cursor conversation history file mapped to references/raw/cursor-conversations/`,
          proposedTargetPath: `docs/references/raw/cursor-conversations/${targetFile}`,
        }
      }

      // cursor.md -> references/raw/ (0.4)
      if (rel === 'cursor.md' || rel === 'cursor-rules.md') {
        const targetFile = rel
        return {
          inventoryItem: item,
          targetType: 'references/raw',
          confidence: 'low',
          confidenceScore: 0.4,
          adapterUsed: 'cursor',
          reasoning: `Root-level cursor file mapped to references/raw/`,
          proposedTargetPath: `docs/references/raw/${targetFile}`,
        }
      }

      // Default: everything else under .cursor/ -> references/raw/ (0.3)
      const targetFile = rel.replace('.cursor/', '')
      return {
        inventoryItem: item,
        targetType: 'references/raw',
        confidence: 'low',
        confidenceScore: 0.3,
        adapterUsed: 'cursor',
        reasoning: `Unrecognized Cursor file; defaulting to references/raw/`,
        proposedTargetPath: `docs/references/raw/cursor/${targetFile}`,
      }
    })
  },
}
