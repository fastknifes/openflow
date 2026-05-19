import * as nodePath from 'node:path'
import { generateBuildId } from '../utils/security.js'
import { logger } from '../utils/logger.js'

const sessionBuildIds = new Map<string, string>()

export function normalizePath(filePath: string): string {
  return filePath.toLowerCase().replace(/\\/g, '/')
}

export function toProjectRelativePath(projectDir: string, filePath: string): string {
  if (!nodePath.isAbsolute(filePath)) {
    return normalizePath(filePath).replace(/^\.\//u, '')
  }

  const relativePath = nodePath.relative(projectDir, filePath)
  if (!relativePath || relativePath.startsWith('..') || nodePath.isAbsolute(relativePath)) {
    return normalizePath(filePath)
  }

  return normalizePath(relativePath)
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

export function isTestFile(normalizedPath: string): boolean {
  return /(^|\/)(tests?|__tests__)\//u.test(normalizedPath) || /\.(test|spec)\.(ts|tsx|js|jsx)$/u.test(normalizedPath)
}

export function isRuntimeCodeFile(normalizedPath: string): boolean {
  return normalizedPath.startsWith('src/') && /\.(ts|tsx|js|jsx|mjs|cjs)$/u.test(normalizedPath) && !isTestFile(normalizedPath)
}

export function isDesignOnlyFile(normalizedPath: string): boolean {
  return /^docs\/changes\/.*\/(design|behavior|prd|requirements|proposal|decisions)\.md$/u.test(normalizedPath)
}

export function isPlanningOnlyFile(normalizedPath: string): boolean {
  return /^\.sisyphus\/plans\/[^/]+\.md$/u.test(normalizedPath) || /^docs\/changes\/.*\/plan\.md$/u.test(normalizedPath)
}

export function isMetadataOnlyFile(normalizedPath: string): boolean {
  return /^\.sisyphus\//u.test(normalizedPath)
    || /^(package-lock|bun\.lockb|pnpm-lock|yarn\.lock)$/u.test(normalizedPath)
    || /^\.gitnexus\//u.test(normalizedPath)
}

export function isDocsOnlyFile(normalizedPath: string): boolean {
  return normalizedPath.endsWith('.md') && (normalizedPath.startsWith('docs/') || /^readme(?:_[a-z]+)?\.md$/u.test(normalizedPath))
}

export function isImplementationLikeFile(normalizedPath: string): boolean {
  if (isDesignOnlyFile(normalizedPath) || isPlanningOnlyFile(normalizedPath) || isMetadataOnlyFile(normalizedPath) || isDocsOnlyFile(normalizedPath)) {
    return false
  }

  return isRuntimeCodeFile(normalizedPath) || isTestFile(normalizedPath)
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
