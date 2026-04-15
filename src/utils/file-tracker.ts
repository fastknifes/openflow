import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { FileChangeRecord } from '../types.js'
import { getChangesPath, getBuildsPath, getBuildPath } from '../config.js'
import { validateBuildId, generateBuildId } from './security.js'
import { logger } from './logger.js'

export interface ChangeTrackerOptions {
  projectDir: string
  buildId?: string
}

export interface ChangeTracker {
  trackChange(change: FileChangeRecord): Promise<void>
  getChanges(): Promise<FileChangeRecord[]>
  getBuildId(): string
  flush(): Promise<void>
}

function isValidBuildId(id: string): boolean {
  try {
    validateBuildId(id)
    return true
  } catch {
    return false
  }
}

export async function createChangeTracker(options: ChangeTrackerOptions): Promise<ChangeTracker> {
  const { projectDir, buildId } = options
  
  let currentBuildId = buildId
  let changes: FileChangeRecord[] = []
  let dirty = false

  if (currentBuildId && isValidBuildId(currentBuildId)) {
    changes = await loadExistingChanges(projectDir, currentBuildId)
  } else {
    currentBuildId = generateBuildId()
    await ensureBuildDir(projectDir, currentBuildId)
  }

  async function trackChange(change: FileChangeRecord): Promise<void> {
    const existingIndex = changes.findIndex(c => c.filePath === change.filePath)
    
    if (existingIndex >= 0) {
      changes[existingIndex] = change
    } else {
      changes.push(change)
    }
    
    dirty = true
  }

  async function getChanges(): Promise<FileChangeRecord[]> {
    return [...changes]
  }

  function getBuildId(): string {
    return currentBuildId!
  }

  async function flush(): Promise<void> {
    if (!dirty) return
    
    const changesPath = getChangesPath(projectDir, currentBuildId!)
    await fs.writeFile(changesPath, JSON.stringify(changes, null, 2), 'utf-8')
    dirty = false
    logger.debug('Flushed changes to disk', { buildId: currentBuildId, count: changes.length })
  }

  return {
    trackChange,
    getChanges,
    getBuildId,
    flush,
  }
}

async function loadExistingChanges(projectDir: string, buildId: string): Promise<FileChangeRecord[]> {
  const changesPath = getChangesPath(projectDir, buildId)
  
  try {
    const content = await fs.readFile(changesPath, 'utf-8')
    return JSON.parse(content) as FileChangeRecord[]
  } catch {
    return []
  }
}

async function ensureBuildDir(projectDir: string, buildId: string): Promise<void> {
  const buildPath = getBuildPath(projectDir, buildId)
  await fs.mkdir(buildPath, { recursive: true })
}

export async function trackFileChange(
  projectDir: string,
  buildId: string,
  change: FileChangeRecord
): Promise<void> {
  const changesPath = getChangesPath(projectDir, buildId)
  
  let changes: FileChangeRecord[] = []
  
  try {
    const content = await fs.readFile(changesPath, 'utf-8')
    changes = JSON.parse(content) as FileChangeRecord[]
  } catch {
    await fs.mkdir(path.dirname(changesPath), { recursive: true })
  }
  
  const existingIndex = changes.findIndex(c => c.filePath === change.filePath)
  if (existingIndex >= 0) {
    changes[existingIndex] = change
  } else {
    changes.push(change)
  }
  
  await fs.writeFile(changesPath, JSON.stringify(changes, null, 2), 'utf-8')
  logger.debug('Tracked file change', { filePath: change.filePath, tool: change.tool })
}

export async function getBuildChanges(
  projectDir: string,
  buildId: string
): Promise<FileChangeRecord[]> {
  const changesPath = getChangesPath(projectDir, buildId)
  
  try {
    const content = await fs.readFile(changesPath, 'utf-8')
    return JSON.parse(content) as FileChangeRecord[]
  } catch {
    return []
  }
}

export async function listBuilds(projectDir: string): Promise<string[]> {
  const buildsPath = getBuildsPath(projectDir)
  
  try {
    const entries = await fs.readdir(buildsPath, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && e.name.startsWith('build-'))
      .map(e => e.name)
      .sort()
      .reverse()
  } catch {
    return []
  }
}
