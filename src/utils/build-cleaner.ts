import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getBuildsPath, getBuildPath } from '../config.js'
import { logger } from './logger.js'

export interface CleanBuildOptions {
  projectDir: string
  buildId: string
  keepMetadata?: boolean
}

export interface CleanAllBuildsOptions {
  projectDir: string
  keepRecent?: number
  olderThanDays?: number
}

export async function cleanBuild(options: CleanBuildOptions): Promise<void> {
  const { projectDir, buildId, keepMetadata = false } = options
  const buildPath = getBuildPath(projectDir, buildId)
  
  try {
    if (keepMetadata) {
      const entries = await fs.readdir(buildPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name !== 'metadata.json') {
          const entryPath = path.join(buildPath, entry.name)
          await fs.rm(entryPath, { recursive: true, force: true })
        }
      }
      logger.debug('Cleaned build (kept metadata)', { buildId })
    } else {
      await fs.rm(buildPath, { recursive: true, force: true })
      logger.debug('Cleaned build', { buildId })
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export async function cleanAllBuilds(options: CleanAllBuildsOptions): Promise<number> {
  const { projectDir, keepRecent = 0, olderThanDays } = options
  const buildsPath = getBuildsPath(projectDir)
  
  let cleanedCount = 0
  
  try {
    const entries = await fs.readdir(buildsPath, { withFileTypes: true })
    const buildDirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith('build-'))
      .map(e => ({
        name: e.name,
        path: path.join(buildsPath, e.name),
      }))
    
    const sortedBuilds = await Promise.all(
      buildDirs.map(async b => {
        const stat = await fs.stat(b.path)
        return { ...b, mtime: stat.mtime }
      })
    )
    sortedBuilds.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    
    const cutoffTime = olderThanDays
      ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      : 0
    
    for (let i = 0; i < sortedBuilds.length; i++) {
      const build = sortedBuilds[i]
      if (!build) continue
      
      if (i < keepRecent) continue
      
      if (cutoffTime && build.mtime.getTime() > cutoffTime) continue
      
      await fs.rm(build.path, { recursive: true, force: true })
      cleanedCount++
    }
    
    if (cleanedCount > 0) {
      logger.info('Cleaned builds', { count: cleanedCount, kept: keepRecent })
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  
  return cleanedCount
}

export async function getBuildDiskUsage(projectDir: string): Promise<{ buildId: string; size: number }[]> {
  const buildsPath = getBuildsPath(projectDir)
  
  try {
    const entries = await fs.readdir(buildsPath, { withFileTypes: true })
    const buildDirs = entries.filter(e => e.isDirectory() && e.name.startsWith('build-'))
    
    const results = await Promise.all(
      buildDirs.map(async e => {
        const buildPath = path.join(buildsPath, e.name)
        const size = await getDirectorySize(buildPath)
        return { buildId: e.name, size }
      })
    )
    
    return results.sort((a, b) => b.size - a.size)
  } catch {
    return []
  }
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name)
      
      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(entryPath)
      } else if (entry.isFile()) {
        const stat = await fs.stat(entryPath)
        totalSize += stat.size
      }
    }
  } catch {
    void 0
  }
  
  return totalSize
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
}
