import { generateBuildId } from '../utils/security.js'
import { logger } from '../utils/logger.js'

const sessionBuildIds = new Map<string, string>()

export function normalizePath(filePath: string): string {
  return filePath.toLowerCase().replace(/\\/g, '/')
}

export function isPlanFile(normalizedPath: string): boolean {
  if (normalizedPath.includes('.sisyphus/plans/') && normalizedPath.endsWith('.md')) {
    return true
  }
  if (normalizedPath.includes('docs/changes/') && /\/plan\.md$/i.test(normalizedPath)) {
    return true
  }
  return false
}

export function isDesignDoc(normalizedPath: string): boolean {
  return /^(?:\d{8}-(proposal|design|decisions)|(proposal|design|decisions))\.md$/.test(normalizedPath.split('/').pop() || '')
}

export function extractFeatureFromDesignPath(filePath: string): string | null {
  const parts = filePath.split(/[/\\]/)
  const changesIdx = parts.lastIndexOf('changes')
  if (changesIdx !== -1) {
    const featurePart = parts[changesIdx + 1]
    if (featurePart && !/\.md$/i.test(featurePart)) {
      return featurePart.replace(/^\d{4}-\d{2}-\d{2}-/, '')
    }
  }

  const designIdx = parts.lastIndexOf('design')
  if (designIdx === -1) return null
  return parts[designIdx - 1] || null
}

export function shouldTrackChange(normalizedPath: string): boolean {
  return !normalizedPath.includes('node_modules/') && !normalizedPath.includes('.sisyphus/')
}

export function resolveBuildId(sessionID?: string): string {
  if (sessionID) {
    const existingBuildId = sessionBuildIds.get(sessionID)
    if (existingBuildId) {
      return existingBuildId
    }

    const newBuildId = generateBuildId()
    sessionBuildIds.set(sessionID, newBuildId)
    return newBuildId
  }

  const buildId = generateBuildId()
  logger.debug('Generated isolated build ID for no-session change tracking', { buildId })
  return buildId
}

export function shouldPromptForAcceptanceDocSync(normalizedPath: string): boolean {
  return !normalizedPath.startsWith('docs/') && !normalizedPath.includes('/docs/')
}

export function appendToolAfterPrompt(output: unknown, prompt: string): void {
  if (!output || typeof output !== 'object') {
    return
  }

  const rawOutput = output as Record<string, unknown>
  const existingOutput = typeof rawOutput.output === 'string' ? rawOutput.output : ''
  rawOutput.output = existingOutput ? `${existingOutput}\n\n${prompt}` : prompt
}
