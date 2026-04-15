import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CurrentPromotionSuggestion } from '../../types.js'
import { createSafePath, safeCopyDirectory } from '../../utils/security.js'

interface PromotionAreaConfig {
  area: 'design' | 'requirements'
  archiveSubDir: 'design' | 'requirements'
  currentBaseDir: string
}

const PROMOTION_AREAS: PromotionAreaConfig[] = [
  { area: 'design', archiveSubDir: 'design', currentBaseDir: path.join('docs', 'current', 'design') },
  { area: 'requirements', archiveSubDir: 'requirements', currentBaseDir: path.join('docs', 'current', 'requirements') },
]

export interface BuildPromotionSuggestionsOptions {
  projectDir: string
  archiveDir: string
  feature: string
}

export interface ApplyPromotionSuggestionsOptions {
  projectDir: string
  suggestions: CurrentPromotionSuggestion[]
}

export interface PromotionResult {
  applied: CurrentPromotionSuggestion[]
  skipped: CurrentPromotionSuggestion[]
}

export async function buildPromotionSuggestions(
  options: BuildPromotionSuggestionsOptions
): Promise<CurrentPromotionSuggestion[]> {
  const { projectDir, archiveDir, feature } = options
  const suggestions: CurrentPromotionSuggestion[] = []

  for (const area of PROMOTION_AREAS) {
    const sourcePath = createSafePath(archiveDir, area.archiveSubDir)
    const targetPath = createSafePath(projectDir, area.currentBaseDir, feature)
    const sourceExists = await pathExists(sourcePath)
    const targetExists = await pathExists(targetPath)

    if (sourceExists && targetExists) {
      suggestions.push({
        type: 'UPDATE',
        targetArea: area.area,
        sourcePath,
        targetPath,
        reason: `archive contains ${area.area} and current already has ${area.area}`,
      })
      continue
    }

    if (sourceExists && !targetExists) {
      suggestions.push({
        type: 'ADD',
        targetArea: area.area,
        sourcePath,
        targetPath,
        reason: `archive contains new ${area.area} while current is missing`,
      })
      continue
    }

    if (!sourceExists && targetExists) {
      suggestions.push({
        type: 'REMOVE',
        targetArea: area.area,
        targetPath,
        reason: `${area.area} does not exist in archive but exists in current`,
      })
    }
  }

  return suggestions
}

export async function applyPromotionSuggestions(
  options: ApplyPromotionSuggestionsOptions
): Promise<PromotionResult> {
  const { projectDir, suggestions } = options
  const applied: CurrentPromotionSuggestion[] = []
  const skipped: CurrentPromotionSuggestion[] = []

  for (const suggestion of suggestions) {
    if (suggestion.type === 'REMOVE') {
      await fs.rm(suggestion.targetPath, { recursive: true, force: true })
      applied.push(suggestion)
      continue
    }

    if (!suggestion.sourcePath) {
      skipped.push(suggestion)
      continue
    }

    if (!(await pathExists(suggestion.sourcePath))) {
      skipped.push(suggestion)
      continue
    }

    if (suggestion.type === 'UPDATE') {
      await fs.rm(suggestion.targetPath, { recursive: true, force: true })
    }

    await safeCopyDirectory(suggestion.sourcePath, suggestion.targetPath, projectDir)
    applied.push(suggestion)
  }

  return { applied, skipped }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath)
    return true
  } catch {
    return false
  }
}
