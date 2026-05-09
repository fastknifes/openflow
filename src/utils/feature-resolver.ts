import * as fs from 'node:fs/promises'
import type { OpenFlowContext } from '../types.js'
import { createSafePath } from './security.js'

export async function findActiveFeature(ctx: OpenFlowContext): Promise<string | null> {
  const plansDir = createSafePath(ctx.directory, '.sisyphus', 'plans')
  try {
    const files = await fs.readdir(plansDir)
    const mdFiles = files.filter(file => file.endsWith('.md'))
    if (mdFiles.length === 0) return null

    let latestFeature: { name: string; mtime: number } | null = null
    for (const file of mdFiles) {
      const filePath = createSafePath(ctx.directory, '.sisyphus', 'plans', file)
      const stat = await fs.stat(filePath)
      if (!latestFeature || stat.mtimeMs > latestFeature.mtime) {
        latestFeature = {
          name: file.replace(/\.md$/u, ''),
          mtime: stat.mtimeMs,
        }
      }
    }
    return latestFeature?.name ?? null
  } catch {
    return null
  }
}
