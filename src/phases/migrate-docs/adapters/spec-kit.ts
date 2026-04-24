/**
 * Spec Kit DocAdapter
 *
 * Detects, scans, and classifies Spec Kit source document structures.
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

export const specKitAdapter: DocAdapter = {
  name: 'spec-kit',

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

    const hasSpecify = await hasDir('.specify')
    const hasSpecs = await hasDir('.specify/specs')
    const hasMemory = await hasDir('.specify/memory')
    const hasConstitution = await hasFile('.specify/memory/constitution.md')
    const hasScripts = await hasDir('.specify/scripts')
    const hasTemplates = await hasDir('.specify/templates')

    let confidence = 0
    if (hasSpecify && hasConstitution && hasSpecs) {
      confidence = 0.95
    } else if (hasSpecify && hasSpecs) {
      confidence = 0.8
    } else if (hasSpecify) {
      confidence = 0.5
    }

    const metadata: Record<string, string> = {}
    if (hasSpecs) metadata.hasSpecs = 'true'
    if (hasMemory) metadata.hasMemory = 'true'
    if (hasConstitution) metadata.hasConstitution = 'true'
    if (hasScripts) metadata.hasScripts = 'true'
    if (hasTemplates) metadata.hasTemplates = 'true'

    return {
      adapter: 'spec-kit',
      detected: confidence > 0,
      confidence,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  },

  async scan(sourceDir: string): Promise<FileInventory[]> {
    const results: FileInventory[] = []
    const specifyDir = join(sourceDir, '.specify')

    try {
      const s = await stat(specifyDir)
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
            console.warn(
              `[spec-kit] Skipping non-Markdown file: ${relative(sourceDir, fullPath)}`
            )
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

    await walk(specifyDir, 0)

    return results
  },

  async classify(inventory: FileInventory[]): Promise<ClassificationResult[]> {
    return inventory.map((item): ClassificationResult => {
      const rel = item.relativePath.replace(/\\/g, '/')

      // .specify/specs/<feature>/spec.md -> current/spec/
      if (/^\.specify\/specs\/[^/]+\/spec\.md$/.test(rel)) {
        const targetFile = rel.replace('.specify/specs/', '')
        return {
          inventoryItem: item,
          targetType: 'current/spec',
          confidence: 'high',
          confidenceScore: 0.85,
          adapterUsed: 'spec-kit',
          reasoning: `Spec Kit spec file mapped to current/spec/`,
          proposedTargetPath: `docs/current/spec/${targetFile}`,
        }
      }

      // .specify/specs/<feature>/plan.md -> decisions/ ADR candidate
      if (/^\.specify\/specs\/[^/]+\/plan\.md$/.test(rel)) {
        const targetFile = rel.replace('.specify/specs/', '')
        return {
          inventoryItem: item,
          targetType: 'decisions',
          confidence: 'medium',
          confidenceScore: 0.6,
          adapterUsed: 'spec-kit',
          reasoning: `Spec Kit plan file is an ADR candidate for decisions/`,
          proposedTargetPath: `docs/decisions/${targetFile}`,
        }
      }

      // .specify/specs/<feature>/tasks.md -> changes/
      if (/^\.specify\/specs\/[^/]+\/tasks\.md$/.test(rel)) {
        const targetFile = rel.replace('.specify/specs/', '')
        return {
          inventoryItem: item,
          targetType: 'changes',
          confidence: 'high',
          confidenceScore: 0.7,
          adapterUsed: 'spec-kit',
          reasoning: `Spec Kit tasks file mapped to changes/`,
          proposedTargetPath: `docs/changes/${targetFile}`,
        }
      }

      // .specify/memory/constitution.md -> decisions/ ADR candidate
      if (rel === '.specify/memory/constitution.md') {
        return {
          inventoryItem: item,
          targetType: 'decisions',
          confidence: 'medium',
          confidenceScore: 0.6,
          adapterUsed: 'spec-kit',
          reasoning: `Spec Kit constitution file is an ADR candidate for decisions/`,
          proposedTargetPath: `docs/decisions/constitution.md`,
        }
      }

      // .specify/research/* -> references/research/
      if (rel.startsWith('.specify/research/')) {
        const targetFile = rel.replace('.specify/research/', '')
        return {
          inventoryItem: item,
          targetType: 'references/research',
          confidence: 'high',
          confidenceScore: 0.8,
          adapterUsed: 'spec-kit',
          reasoning: `Spec Kit research file mapped to references/research/`,
          proposedTargetPath: `docs/references/research/${targetFile}`,
        }
      }

      // Fallback for any other markdown under .specify/
      const targetFile = rel.replace('.specify/', '')
      return {
        inventoryItem: item,
        targetType: 'references/raw',
        confidence: 'low',
        confidenceScore: 0.3,
        adapterUsed: 'spec-kit',
        reasoning: `Unrecognized Spec Kit file; defaulting to references/raw/`,
        proposedTargetPath: `docs/references/raw/${targetFile}`,
      }
    })
  },
}
