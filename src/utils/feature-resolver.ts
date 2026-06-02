import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { createSafePath, sanitizeFeatureName } from './security.js'
import { tArray, tPatterns } from '../i18n/index.js'
import { loadAcceptanceState } from './acceptance-state.js'
import { getChangePlansPath } from '../config.js'

export interface DerivedFeatureIdentity {
  slug: string
  title?: string | undefined
  sourceIntent?: string | undefined
  lowConfidenceReason?: 'generic_slug' | 'generic_instruction' | undefined
}

export interface FeatureSessionCandidate {
  slug: string
  title?: string | undefined
  sourceIntent?: string | undefined
  updatedAt: string
}

export async function findActiveFeature(ctx: OpenFlowContext): Promise<string | null> {
  // Strategy 1: Check acceptance state for active feature with matching plan
  const acceptanceState = await loadAcceptanceState(ctx.directory)
  if (acceptanceState?.feature) {
    const planPath = await getChangePlansPath(ctx.directory, acceptanceState.feature, ctx.config)
    try {
      await fs.access(planPath)
      return acceptanceState.feature
    } catch {
      // Acceptance state feature doesn't have a matching plan file, continue to strategy 2
    }
  }

  // Strategy 2: Scan docs/changes/*/plan.md for the most recently modified plan
  const changesDir = createSafePath(ctx.directory, 'docs', 'changes')
  try {
    const entries = await fs.readdir(changesDir, { withFileTypes: true })
    const planCandidates: Array<{ feature: string; mtime: number }> = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const planFile = path.join(changesDir, entry.name, 'plan.md')
      try {
        const stat = await fs.stat(planFile)
        // Extract feature slug from directory name: "YYYY-MM-DD-slug" → "slug"
        const slug = entry.name.replace(/^\d{4}-\d{2}-\d{2}-/u, '')
        planCandidates.push({ feature: slug, mtime: stat.mtimeMs })
      } catch {
        // No plan.md in this directory, skip
      }
    }
    if (planCandidates.length === 0) return null
    planCandidates.sort((a, b) => b.mtime - a.mtime)
    return planCandidates[0]!.feature
  } catch {
    return null
  }
}

export async function featureHasArtifacts(ctx: OpenFlowContext, feature: string): Promise<boolean> {
  // Check docs/changes/*/plan.md first (canonical plan location)
  const planPath = await getChangePlansPath(ctx.directory, feature, ctx.config)
  try {
    await fs.access(planPath)
    return true
  } catch {
    // No plan file; also check docs/changes workspace directory existence
  }

  const changesDir = createSafePath(ctx.directory, 'docs', 'changes')
  try {
    const entries = await fs.readdir(changesDir)
    return entries.some(entry => entry.endsWith(`-${feature}`) || entry === feature)
  } catch {
    return false
  }
}

export function deriveFeatureIdentity(input: string): DerivedFeatureIdentity {
  const trimmed = input.trim()
  const direct = trySanitizeFeatureName(trimmed)
  if (direct && direct === trimmed.toLowerCase()) {
    if (isGenericFeatureSlug(direct)) {
      return {
        slug: direct,
        title: trimmed,
        sourceIntent: trimmed,
        lowConfidenceReason: 'generic_slug',
      }
    }
    // Always preserve sourceIntent - command text is natural-language requirement intent, not a feature ID
    return { slug: direct, sourceIntent: trimmed }
  }

  if (looksLikeGenericFeatureInstruction(trimmed)) {
    return {
      slug: trySanitizeFeatureName(trimmed) ?? 'untitled-feature',
      title: trimmed,
      sourceIntent: trimmed,
      lowConfidenceReason: 'generic_instruction',
    }
  }

  // Long English-only sentences (no CJK) are almost never valid feature names.
  // e.g. "describe idea in natural language continue in session" → generic_instruction
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/u.test(trimmed)
  if (!hasCJK && tokens.length > 5) {
    return {
      slug: trySanitizeFeatureName(trimmed) ?? 'untitled-feature',
      title: trimmed,
      sourceIntent: trimmed,
      lowConfidenceReason: 'generic_instruction',
    }
  }

  const asciiWords = trimmed.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const inferredWords = inferChineseFeatureWords(trimmed)
  const meaningfulWords = [...asciiWords, ...inferredWords]
    .filter((word) => !isIgnoredFeatureWord(word))
  const base = meaningfulWords.slice(0, 3).join('-')
  const lowConfidenceReason = base ? undefined : 'generic_instruction'
  const slug = (base ? trySanitizeFeatureName(base) : undefined) ?? trySanitizeFeatureName(trimmed) ?? 'untitled-feature'

  return {
    slug,
    title: trimmed,
    sourceIntent: trimmed,
    lowConfidenceReason,
  }
}

export async function findIncompleteFeatureSessions(projectDir: string, featureStateDir = '.openflow/feature'): Promise<FeatureSessionCandidate[]> {
  const featureDir = createSafePath(projectDir, featureStateDir)
  try {
    const files = await fs.readdir(featureDir)
    const candidates: FeatureSessionCandidate[] = []

    for (const file of files.filter((entry) => entry.endsWith('.json') && entry !== 'active.json' && entry !== 'recent-completed.json')) {
      const filePath = createSafePath(projectDir, featureStateDir, file)
      try {
        const content = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>
        if (content.workflowState === 'complete' || content.workflowState === 'completed') continue
        const stat = await fs.stat(filePath)
        candidates.push({
          slug: path.basename(file, '.json'),
          title: typeof content.featureTitle === 'string' ? content.featureTitle : undefined,
          sourceIntent: typeof content.sourceIntent === 'string' ? content.sourceIntent : undefined,
          updatedAt: new Date(stat.mtimeMs).toISOString(),
        })
      } catch {
        // Skip unreadable files
      }
    }

    return candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
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

function isIgnoredFeatureWord(word: string): boolean {
  return [
    'the', 'a', 'an', 'and', 'or', 'to', 'for', 'with',
    'feature', 'future', 'task', 'todo', 'change', 'update',
    'doc', 'docs', 'document', 'documents', 'documentation',
  ].includes(word)
}

function isGenericFeatureSlug(slug: string): boolean {
  const words = slug.split('-').filter(Boolean)
  return words.length === 0 || words.every(isIgnoredFeatureWord)
}

function looksLikeGenericFeatureInstruction(input: string): boolean {
  const normalized = input.trim().toLowerCase()
  if (/^(?:future|feature|task|todo|change|update)(?:\s+|[-_])*(?:future|feature|task|todo|change|update)?$/u.test(normalized)) {
    return true
  }

  const collectWords = tArray('resolver.collectConstraints')
  const excludedFeatureTags = new Set(['quality', 'naming', 'rename', 'login', 'coupon', 'deduction', 'frontend', 'preview', 'stage', 'applicability', 'trigger', 'boundary'])
  const excludedFeaturePatterns = tPatterns('resolver.featureKeywords')
    .filter((keyword) => keyword.tags.some((tag) => excludedFeatureTags.has(tag)))
    .map((keyword) => keyword.pattern)

  return /^请/u.test(input)
    && new RegExp(`(?:${collectWords.join('|')})`, 'u').test(input)
    && /(?:约束|文档|相关文档|资料)/u.test(input)
    && !new RegExp(`(?:${excludedFeaturePatterns.join('|')})`, 'u').test(input)
}

function inferChineseFeatureWords(input: string): string[] {
  const dictionary: Array<[RegExp, string[]]> = [
    ...tPatterns('resolver.featureKeywords').map((keyword) => [new RegExp(keyword.pattern, 'u'), keyword.tags] as [RegExp, string[]]),
  ]

  return dictionary.flatMap(([pattern, words]) => pattern.test(input) ? words : [])
}
