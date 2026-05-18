import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import type { OpenFlowContext } from '../types.js'
import { createSafePath, sanitizeFeatureName } from './security.js'

export interface DerivedFeatureIdentity {
  slug: string
  title?: string | undefined
  sourceIntent?: string | undefined
}

export interface FeatureSessionCandidate {
  slug: string
  title?: string | undefined
  sourceIntent?: string | undefined
  updatedAt: string
}

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

export function deriveFeatureIdentity(input: string): DerivedFeatureIdentity {
  const trimmed = input.trim()
  const direct = trySanitizeFeatureName(trimmed)
  if (direct && direct === trimmed.toLowerCase()) {
    return { slug: direct }
  }

  const asciiWords = trimmed.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const meaningfulWords = asciiWords.filter((word) => !['the', 'a', 'an', 'and', 'or', 'to', 'for', 'with'].includes(word))
  const base = meaningfulWords.slice(0, 8).join('-')
  const hash = createHash('sha256').update(trimmed).digest('hex').slice(0, 8)
  const slug = trySanitizeFeatureName(base ? `${base}-${hash}` : `feature-${hash}`) ?? `feature-${hash}`

  return {
    slug,
    title: trimmed,
    sourceIntent: trimmed,
  }
}

export async function findIncompleteFeatureSessions(projectDir: string): Promise<FeatureSessionCandidate[]> {
  const featureDir = createSafePath(projectDir, '.sisyphus', 'feature')
  try {
    const files = await fs.readdir(featureDir)
    const candidates: FeatureSessionCandidate[] = []

    for (const file of files.filter((entry) => entry.endsWith('.json') && entry !== 'active.json' && entry !== 'recent-completed.json')) {
      const filePath = createSafePath(projectDir, '.sisyphus', 'feature', file)
      try {
        const content = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>
        if (content.workflowState === 'completed') continue
        const stat = await fs.stat(filePath)
        candidates.push({
          slug: path.basename(file, '.json'),
          title: typeof content.featureTitle === 'string' ? content.featureTitle : undefined,
          sourceIntent: typeof content.sourceIntent === 'string' ? content.sourceIntent : undefined,
          updatedAt: typeof content.updatedAt === 'string' ? content.updatedAt : stat.mtime.toISOString(),
        })
      } catch {
        continue
      }
    }

    return candidates.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  } catch {
    return []
  }
}

function trySanitizeFeatureName(value: string): string | undefined {
  try {
    return sanitizeFeatureName(value)
  } catch {
    return undefined
  }
}
