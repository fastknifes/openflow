import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createSafePath, sanitizeFeatureName } from './security.js'

interface ChangeUnitIndex {
  version: 1
  byFeature: Record<string, { changeDir: string; archiveDir?: string }>
}

const CHANGE_UNITS_INDEX_PATH = ['.sisyphus', 'change-units.json'] as const

function getTodayDirPrefix(): string {
  return new Date().toISOString().split('T')[0] ?? new Date().toISOString().slice(0, 10)
}

function buildDatedDirName(feature: string, datePrefix = getTodayDirPrefix()): string {
  return `${datePrefix}-${sanitizeFeatureName(feature)}`
}

function getIndexPath(projectDir: string): string {
  return createSafePath(projectDir, ...CHANGE_UNITS_INDEX_PATH)
}

async function loadIndex(projectDir: string): Promise<ChangeUnitIndex> {
  const indexPath = getIndexPath(projectDir)
  try {
    const raw = await fs.readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ChangeUnitIndex>
    return {
      version: 1,
      byFeature: typeof parsed.byFeature === 'object' && parsed.byFeature !== null ? parsed.byFeature as ChangeUnitIndex['byFeature'] : {},
    }
  } catch {
    return { version: 1, byFeature: {} }
  }
}

async function saveIndex(projectDir: string, index: ChangeUnitIndex): Promise<void> {
  const indexPath = getIndexPath(projectDir)
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function directoryExists(projectDir: string, dirName: string): Promise<boolean> {
  try {
    const fullPath = createSafePath(projectDir, 'docs', 'changes', dirName)
    const stats = await fs.stat(fullPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export async function ensureChangeUnitDir(projectDir: string, feature: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir)
  const existing = index.byFeature[sanitizedFeature]?.changeDir
  if (existing) return existing

  const changeDir = buildDatedDirName(sanitizedFeature)
  index.byFeature[sanitizedFeature] = {
    ...(index.byFeature[sanitizedFeature] ?? {}),
    changeDir,
  }
  await saveIndex(projectDir, index)
  return changeDir
}

export async function resolveChangeUnitDir(projectDir: string, feature: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir)
  const mapped = index.byFeature[sanitizedFeature]?.changeDir
  if (mapped && await directoryExists(projectDir, mapped)) return mapped
  const discovered = await findExistingChangeUnitDir(projectDir, sanitizedFeature)
  if (discovered) return discovered
  return sanitizedFeature
}

async function findExistingChangeUnitDir(projectDir: string, sanitizedFeature: string): Promise<string | null> {
  const changesDir = createSafePath(projectDir, 'docs', 'changes')
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    const matches = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name => name === sanitizedFeature || name.endsWith(`-${sanitizedFeature}`))
      .sort()

    return matches[matches.length - 1] ?? null
  } catch {
    return null
  }
}

export async function ensureArchiveUnitDir(projectDir: string, feature: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir)
  const changeDir = index.byFeature[sanitizedFeature]?.changeDir ?? buildDatedDirName(sanitizedFeature)
  const archiveDir = index.byFeature[sanitizedFeature]?.archiveDir ?? changeDir

  index.byFeature[sanitizedFeature] = {
    changeDir,
    archiveDir,
  }
  await saveIndex(projectDir, index)
  return archiveDir
}

export async function resolveArchiveUnitDir(projectDir: string, feature: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir)
  return index.byFeature[sanitizedFeature]?.archiveDir
    ?? index.byFeature[sanitizedFeature]?.changeDir
    ?? sanitizedFeature
}
