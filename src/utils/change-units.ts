import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createSafePath, sanitizeFeatureName } from './security.js'

interface ChangeUnitIndex {
  version: 1
  byFeature: Record<string, { changeDir: string; archiveDir?: string }>
}

const DEFAULT_CHANGE_UNITS_INDEX_PATH = '.sisyphus/change-units.json'
const DEFAULT_CHANGES_DIR = 'docs/changes'

function getTodayDirPrefix(): string {
  const now = new Date()
  const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return shanghaiDate
}

function buildDatedDirName(feature: string, datePrefix = getTodayDirPrefix()): string {
  return `${datePrefix}-${sanitizeFeatureName(feature)}`
}

function getIndexPath(projectDir: string, changeUnitsPath = DEFAULT_CHANGE_UNITS_INDEX_PATH): string {
  return createSafePath(projectDir, changeUnitsPath)
}

async function loadIndex(projectDir: string, changeUnitsPath?: string): Promise<ChangeUnitIndex> {
  const indexPath = getIndexPath(projectDir, changeUnitsPath)
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

async function saveIndex(projectDir: string, index: ChangeUnitIndex, changeUnitsPath?: string): Promise<void> {
  const indexPath = getIndexPath(projectDir, changeUnitsPath)
  await fs.mkdir(path.dirname(indexPath), { recursive: true })
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8')
}

async function directoryExists(projectDir: string, dirName: string, changesDir = DEFAULT_CHANGES_DIR): Promise<boolean> {
  try {
    const fullPath = createSafePath(projectDir, changesDir, dirName)
    const stats = await fs.stat(fullPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export async function ensureChangeUnitDir(projectDir: string, feature: string, changeUnitsPath?: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir, changeUnitsPath)
  const existing = index.byFeature[sanitizedFeature]?.changeDir
  if (existing) return existing

  const changeDir = buildDatedDirName(sanitizedFeature)
  index.byFeature[sanitizedFeature] = {
    ...(index.byFeature[sanitizedFeature] ?? {}),
    changeDir,
  }
  await saveIndex(projectDir, index, changeUnitsPath)
  return changeDir
}

export async function resolveChangeUnitDir(projectDir: string, feature: string, changesDir = DEFAULT_CHANGES_DIR, changeUnitsPath?: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir, changeUnitsPath)
  const mapped = index.byFeature[sanitizedFeature]?.changeDir
  if (mapped && await directoryExists(projectDir, mapped, changesDir)) return mapped
  const discovered = await findExistingChangeUnitDir(projectDir, sanitizedFeature, changesDir)
  if (discovered) return discovered
  return sanitizedFeature
}

async function findExistingChangeUnitDir(projectDir: string, sanitizedFeature: string, changesDir = DEFAULT_CHANGES_DIR): Promise<string | null> {
  const changesFullPath = createSafePath(projectDir, changesDir)
  try {
    const entries = await fs.readdir(changesFullPath, { withFileTypes: true })
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

export async function ensureArchiveUnitDir(projectDir: string, feature: string, changeUnitsPath?: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir, changeUnitsPath)
  const changeDir = index.byFeature[sanitizedFeature]?.changeDir ?? buildDatedDirName(sanitizedFeature)
  const archiveDir = index.byFeature[sanitizedFeature]?.archiveDir ?? changeDir

  index.byFeature[sanitizedFeature] = {
    changeDir,
    archiveDir,
  }
  await saveIndex(projectDir, index, changeUnitsPath)
  return archiveDir
}

export async function resolveArchiveUnitDir(projectDir: string, feature: string, changeUnitsPath?: string): Promise<string> {
  const sanitizedFeature = sanitizeFeatureName(feature)
  const index = await loadIndex(projectDir, changeUnitsPath)
  return index.byFeature[sanitizedFeature]?.archiveDir
    ?? index.byFeature[sanitizedFeature]?.changeDir
    ?? sanitizedFeature
}
