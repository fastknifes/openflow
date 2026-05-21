import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { OpenFlowContext } from '../types.js'
import { createSafePath, sanitizeFeatureName } from './security.js'

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
  const plansDir = createSafePath(ctx.directory, ctx.config.paths.plans)
  try {
    const files = await fs.readdir(plansDir)
    const mdFiles = files.filter(file => file.endsWith('.md'))
    if (mdFiles.length === 0) return null

    let latestFeature: { name: string; mtime: number } | null = null
    for (const file of mdFiles) {
      const filePath = createSafePath(ctx.directory, ctx.config.paths.plans, file)
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
    if (isGenericFeatureSlug(direct)) {
      return {
        slug: direct,
        title: trimmed,
        sourceIntent: trimmed,
        lowConfidenceReason: 'generic_slug',
      }
    }
    return { slug: direct }
  }

  if (looksLikeGenericFeatureInstruction(trimmed)) {
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
  const base = meaningfulWords.slice(0, 8).join('-')
  const lowConfidenceReason = base ? undefined : 'generic_instruction'
  const slug = (base ? trySanitizeFeatureName(base) : undefined) ?? trySanitizeFeatureName(trimmed) ?? 'untitled-feature'

  return {
    slug,
    title: trimmed,
    sourceIntent: trimmed,
    lowConfidenceReason,
  }
}

export async function findIncompleteFeatureSessions(projectDir: string, featureStateDir = '.sisyphus/feature'): Promise<FeatureSessionCandidate[]> {
  const featureDir = createSafePath(projectDir, featureStateDir)
  try {
    const files = await fs.readdir(featureDir)
    const candidates: FeatureSessionCandidate[] = []

    for (const file of files.filter((entry) => entry.endsWith('.json') && entry !== 'active.json' && entry !== 'recent-completed.json')) {
      const filePath = createSafePath(projectDir, featureStateDir, file)
      try {
        const content = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Record<string, unknown>
        if (content.workflowState === 'completed') continue
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

  return /^请/u.test(input)
    && /(?:收集|生成|创建|整理)/u.test(input)
    && /(?:约束|文档|相关文档|资料)/u.test(input)
    && !/(?:质量门|命名|重命名|登录|优惠券|扣减|前端|预览|阶段|适用性|触发|边界)/u.test(input)
}

function inferChineseFeatureWords(input: string): string[] {
  const dictionary: Array<[RegExp, string[]]> = [
    [/质量门/u, ['quality', 'gate']],
    [/门禁/u, ['gate']],
    [/阶段/u, ['stage']],
    [/适用性/u, ['applicability']],
    [/判定|分类/u, ['classifier']],
    [/触发/u, ['trigger']],
    [/边界/u, ['boundary']],
    [/命名/u, ['naming']],
    [/重命名/u, ['rename']],
    [/登录/u, ['login']],
    [/优惠券/u, ['coupon']],
    [/扣减/u, ['deduction']],
    [/规则/u, ['rule']],
    [/配置/u, ['config']],
    [/前端/u, ['frontend']],
    [/设计/u, ['design']],
    [/预览/u, ['preview']],
    [/约束/u, ['constraints']],
  ]

  return dictionary.flatMap(([pattern, words]) => pattern.test(input) ? words : [])
}
