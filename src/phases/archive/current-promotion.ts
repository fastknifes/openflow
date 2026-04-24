import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { CurrentPromotionSuggestion } from '../../types.js'
import { createSafePath } from '../../utils/security.js'

interface PromotionAreaConfig {
  area: 'design' | 'requirements'
  archiveFile: 'design.md' | 'prd.md'
  currentBaseDir: string
  currentFileName: 'design.md' | 'prd.md'
  currentFilePattern: RegExp
}

interface DocumentProfile {
  headings: Set<string>
  bodyTokens: Set<string>
}

interface MarkdownSection {
  heading: string | null
  normalizedHeading: string | null
  raw: string
  tokens: Set<string>
}

interface MatchCandidate {
  path: string
  headingOverlap: number
  tokenOverlap: number
  score: number
}

const PROMOTION_AREAS: PromotionAreaConfig[] = [
  {
    area: 'design',
    archiveFile: 'design.md',
    currentBaseDir: path.join('docs', 'current', 'design'),
    currentFileName: 'design.md',
    currentFilePattern: /^(?:design|\d{8}-design)\.md$/i,
  },
  {
    area: 'requirements',
    archiveFile: 'prd.md',
    currentBaseDir: path.join('docs', 'current', 'requirements'),
    currentFileName: 'prd.md',
    currentFilePattern: /^(?:prd|\d{8}-prd)\.md$/i,
  },
]

const MIN_TOKEN_LENGTH = 3
const RELIABLE_MATCH_SCORE = 0.25
const RELIABLE_HEADING_OVERLAP = 0.3
const RELIABLE_TOKEN_OVERLAP = 0.08
const SECTION_MATCH_SCORE = 0.5
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'when', 'what', 'where', 'will', 'have', 'your', 'about',
  'are', 'was', 'were', 'has', 'had', 'not', 'but', 'can', 'use', 'using', 'used', 'how', 'why', 'all', 'new', 'old',
  'docs', 'doc', 'design', 'requirements', 'requirement', 'current', 'archive', 'feature', 'plan', 'section',
])

export interface BuildPromotionSuggestionsOptions {
  projectDir: string
  archiveDir: string
  feature: string
}

export interface ApplyPromotionSuggestionsOptions {
  projectDir: string
  suggestions: CurrentPromotionSuggestion[]
}

export interface PromotionResult {
  applied: CurrentPromotionSuggestion[]
  skipped: CurrentPromotionSuggestion[]
}

export async function buildPromotionSuggestions(
  options: BuildPromotionSuggestionsOptions
): Promise<CurrentPromotionSuggestion[]> {
  const { projectDir, archiveDir, feature } = options
  const suggestions: CurrentPromotionSuggestion[] = []

  for (const area of PROMOTION_AREAS) {
    const sourcePath = createSafePath(archiveDir, area.archiveFile)
    const directTargetPath = createSafePath(projectDir, area.currentBaseDir, feature, area.currentFileName)
    const sourceExists = await pathExists(sourcePath)
    const directTargetExists = await pathExists(directTargetPath)

    if (sourceExists) {
      const match = await findHistoricalMatch({
        currentAreaRoot: createSafePath(projectDir, area.currentBaseDir),
        directTargetPath,
        sourcePath,
        filePattern: area.currentFilePattern,
      })

      if (match) {
        suggestions.push({
          type: 'UPDATE',
          targetArea: area.area,
          sourcePath,
          targetPath: match.path,
          strategy: 'synthesized_refresh',
          reason: `reliable historical ${area.area} match found (heading overlap ${match.headingOverlap.toFixed(2)}, token overlap ${match.tokenOverlap.toFixed(2)})`,
        })
        continue
      }

      suggestions.push({
        type: directTargetExists ? 'UPDATE' : 'ADD',
        targetArea: area.area,
        sourcePath,
        targetPath: directTargetPath,
        strategy: 'direct_migration',
        reason: directTargetExists
          ? `no reliable historical ${area.area} match; refreshing direct current document`
          : `no reliable historical ${area.area} match; migrating archive document into current`,
      })
      continue
    }

    if (!sourceExists && directTargetExists) {
      suggestions.push({
        type: 'REMOVE',
        targetArea: area.area,
        targetPath: directTargetPath,
        reason: `${area.area} does not exist in archive but exists in current`,
      })
    }
  }

  return suggestions
}

export async function applyPromotionSuggestions(
  options: ApplyPromotionSuggestionsOptions
): Promise<PromotionResult> {
  const { suggestions } = options
  const applied: CurrentPromotionSuggestion[] = []
  const skipped: CurrentPromotionSuggestion[] = []

  for (const suggestion of suggestions) {
    if (suggestion.type === 'REMOVE') {
      await fs.rm(suggestion.targetPath, { recursive: true, force: true })
      applied.push(suggestion)
      continue
    }

    if (!suggestion.sourcePath) {
      skipped.push(suggestion)
      continue
    }

    if (!(await pathExists(suggestion.sourcePath))) {
      skipped.push(suggestion)
      continue
    }

    await fs.mkdir(path.dirname(suggestion.targetPath), { recursive: true })

    if (suggestion.strategy === 'synthesized_refresh' && await pathExists(suggestion.targetPath)) {
      const refreshedContent = await synthesizeCurrentDocument(suggestion.sourcePath, suggestion.targetPath)
      await fs.writeFile(suggestion.targetPath, refreshedContent, 'utf-8')
      applied.push(suggestion)
      continue
    }

    if (suggestion.type === 'UPDATE') {
      await fs.rm(suggestion.targetPath, { force: true })
    }

    await fs.copyFile(suggestion.sourcePath, suggestion.targetPath)
    applied.push(suggestion)
  }

  return { applied, skipped }
}

async function findHistoricalMatch(options: {
  currentAreaRoot: string
  directTargetPath: string
  sourcePath: string
  filePattern: RegExp
}): Promise<MatchCandidate | null> {
  const { currentAreaRoot, directTargetPath, sourcePath, filePattern } = options
  const sourceContent = await fs.readFile(sourcePath, 'utf-8')
  const sourceProfile = profileMarkdown(sourceContent)
  const directCandidate = await scoreCandidate(directTargetPath, sourceProfile)
  if (directCandidate && isReliableMatch(directCandidate)) {
    return directCandidate
  }

  const candidatePaths = await listCurrentDocuments(currentAreaRoot, filePattern)
  let best: MatchCandidate | null = null
  const normalizedDirectTargetPath = path.resolve(directTargetPath)

  for (const candidatePath of candidatePaths) {
    if (path.resolve(candidatePath) === normalizedDirectTargetPath) {
      continue
    }

    const candidate = await scoreCandidate(candidatePath, sourceProfile)
    if (!candidate) continue
    if (!best || candidate.score > best.score) {
      best = candidate
    }
  }

  return best && isReliableMatch(best) ? best : null
}

async function scoreCandidate(candidatePath: string, sourceProfile: DocumentProfile): Promise<MatchCandidate | null> {
  if (!(await pathExists(candidatePath))) {
    return null
  }

  const candidateProfile = profileMarkdown(await fs.readFile(candidatePath, 'utf-8'))
  const headingOverlap = overlapRatio(sourceProfile.headings, candidateProfile.headings)
  const tokenOverlap = overlapRatio(sourceProfile.bodyTokens, candidateProfile.bodyTokens)
  const score = headingOverlap * 0.65 + tokenOverlap * 0.35

  return {
    path: candidatePath,
    headingOverlap,
    tokenOverlap,
    score,
  }
}

function isReliableMatch(candidate: MatchCandidate): boolean {
  return candidate.score >= RELIABLE_MATCH_SCORE
    && candidate.headingOverlap >= RELIABLE_HEADING_OVERLAP
    && candidate.tokenOverlap >= RELIABLE_TOKEN_OVERLAP
}

async function listCurrentDocuments(rootPath: string, filePattern: RegExp): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return []
  }

  const results: string[] = []
  const stack = [rootPath]

  while (stack.length > 0) {
    const currentPath = stack.pop()
    if (!currentPath) continue

    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
        continue
      }

      if (entry.isFile() && filePattern.test(entry.name)) {
        results.push(entryPath)
      }
    }
  }

  return results.sort((left, right) => left.localeCompare(right))
}

async function synthesizeCurrentDocument(sourcePath: string, targetPath: string): Promise<string> {
  const [sourceContent, targetContent] = await Promise.all([
    fs.readFile(sourcePath, 'utf-8'),
    fs.readFile(targetPath, 'utf-8'),
  ])

  const sourceSections = parseMarkdownSections(sourceContent)
  const targetSections = parseMarkdownSections(targetContent)
  const sourceMatches = matchSections(sourceSections.sections, targetSections.sections)
  const sourceSectionsByIndex = new Map(sourceSections.sections.map((section, index) => [index, section]))

  const mergedSections = targetSections.sections.map((targetSection, targetIndex) => {
    const matchedSourceIndex = sourceMatches.get(targetIndex)
    return matchedSourceIndex === undefined
      ? targetSection.raw
      : sourceSectionsByIndex.get(matchedSourceIndex)?.raw ?? targetSection.raw
  })

  const appendedSections = sourceSections.sections
    .filter((_, sourceIndex) => ![...sourceMatches.values()].includes(sourceIndex))
    .map(section => section.raw)

  const mergedParts = [
    sourceSections.preamble.trim() || targetSections.preamble.trim(),
    ...mergedSections,
    ...appendedSections,
  ].filter(part => part && part.trim().length > 0)

  return `${mergedParts.join('\n\n').trim()}\n`
}

function matchSections(sourceSections: MarkdownSection[], targetSections: MarkdownSection[]): Map<number, number> {
  const matches = new Map<number, number>()
  const usedSourceIndexes = new Set<number>()

  for (let targetIndex = 0; targetIndex < targetSections.length; targetIndex += 1) {
    const targetSection = targetSections[targetIndex]
    if (!targetSection) continue

    for (let sourceIndex = 0; sourceIndex < sourceSections.length; sourceIndex += 1) {
      const sourceSection = sourceSections[sourceIndex]
      if (!sourceSection) continue
      if (usedSourceIndexes.has(sourceIndex)) continue
      if (!sourceSection.normalizedHeading || !targetSection.normalizedHeading) continue
      if (sourceSection.normalizedHeading !== targetSection.normalizedHeading) continue

      matches.set(targetIndex, sourceIndex)
      usedSourceIndexes.add(sourceIndex)
      break
    }
  }

  for (let targetIndex = 0; targetIndex < targetSections.length; targetIndex += 1) {
    if (matches.has(targetIndex)) continue
    const targetSection = targetSections[targetIndex]
    if (!targetSection) continue
    let bestSourceIndex: number | null = null
    let bestScore = 0

    for (let sourceIndex = 0; sourceIndex < sourceSections.length; sourceIndex += 1) {
      if (usedSourceIndexes.has(sourceIndex)) continue
      const sourceSection = sourceSections[sourceIndex]
      if (!sourceSection) continue
      const headingScore = sourceSection.normalizedHeading && targetSection.normalizedHeading
        ? Number(sourceSection.normalizedHeading === targetSection.normalizedHeading)
        : 0
      const tokenScore = overlapRatio(sourceSection.tokens, targetSection.tokens)
      const combinedScore = headingScore * 0.7 + tokenScore * 0.3

      if (combinedScore >= SECTION_MATCH_SCORE && combinedScore > bestScore) {
        bestScore = combinedScore
        bestSourceIndex = sourceIndex
      }
    }

    if (bestSourceIndex !== null) {
      matches.set(targetIndex, bestSourceIndex)
      usedSourceIndexes.add(bestSourceIndex)
    }
  }

  return matches
}

function parseMarkdownSections(markdown: string): { preamble: string; sections: MarkdownSection[] } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const sections: MarkdownSection[] = []
  const preambleLines: string[] = []
  let currentSectionLines: string[] | null = null
  let currentHeading: string | null = null

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      if (currentSectionLines) {
        sections.push(createSection(currentHeading, currentSectionLines))
      }
      currentHeading = line.replace(/^#{1,6}\s+/, '').trim()
      currentSectionLines = [line]
      continue
    }

    if (currentSectionLines) {
      currentSectionLines.push(line)
    } else {
      preambleLines.push(line)
    }
  }

  if (currentSectionLines) {
    sections.push(createSection(currentHeading, currentSectionLines))
  }

  return {
    preamble: preambleLines.join('\n').trim(),
    sections,
  }
}

function createSection(heading: string | null, lines: string[]): MarkdownSection {
  const raw = lines.join('\n').trim()
  return {
    heading,
    normalizedHeading: heading ? normalizeHeading(heading) : null,
    raw,
    tokens: tokenizeMarkdown(raw),
  }
}

function profileMarkdown(markdown: string): DocumentProfile {
  const parsed = parseMarkdownSections(markdown)
  const headings = new Set(parsed.sections.map(section => section.normalizedHeading).filter((value): value is string => Boolean(value)))
  return {
    headings,
    bodyTokens: tokenizeMarkdown(markdown),
  }
}

function overlapRatio(source: ReadonlySet<string>, candidate: ReadonlySet<string>): number {
  if (source.size === 0 || candidate.size === 0) {
    return 0
  }

  let intersectionCount = 0
  for (const token of source) {
    if (candidate.has(token)) {
      intersectionCount += 1
    }
  }

  return intersectionCount / source.size
}

function normalizeHeading(value: string): string {
  return value.toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim()
}

function tokenizeMarkdown(markdown: string): Set<string> {
  const normalized = markdown
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')

  return new Set(
    normalized
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token => token.length >= MIN_TOKEN_LENGTH)
      .filter(token => !STOP_WORDS.has(token))
  )
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath)
    return true
  } catch {
    return false
  }
}
