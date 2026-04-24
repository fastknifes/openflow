import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export interface TraceabilityItem {
  sourceType: 'requirement' | 'proposal' | 'design'
  sourcePath: string
  sourceLabel: string
  item: string
}

export interface TraceabilityResult {
  items: TraceabilityItem[]
  usedDesignFallback: boolean
}

export async function collectTraceabilityItems(
  projectDir: string,
  requirementsPath?: string | null,
  designPath?: string | null
): Promise<TraceabilityResult> {
  const requirementItems = requirementsPath
    ? await extractTraceabilityItems(projectDir, requirementsPath, 'requirement')
    : []
  const proposalItems = designPath
    ? await collectSiblingItems(projectDir, designPath, 'proposal', 'proposal.md', /^\d{8}-proposal\.md$/)
    : []

  if (requirementItems.length > 0 || proposalItems.length > 0) {
    return {
      items: [...requirementItems, ...proposalItems],
      usedDesignFallback: false,
    }
  }

  const designItems = designPath
    ? await extractTraceabilityItems(projectDir, designPath, 'design')
    : []

  return {
    items: designItems,
    usedDesignFallback: designItems.length > 0,
  }
}

async function collectSiblingItems(
  projectDir: string,
  anchorPath: string,
  sourceType: TraceabilityItem['sourceType'],
  preferredName: string,
  fallbackPattern: RegExp
): Promise<TraceabilityItem[]> {
  const dir = path.dirname(anchorPath)
  const preferredPath = path.join(dir, preferredName)

  try {
    await fs.access(preferredPath)
    return extractTraceabilityItems(projectDir, preferredPath, sourceType)
  } catch {
    void 0
  }

  const markdownFiles = await listMarkdownFiles(dir)
  const fallbackFile = markdownFiles.find(filePath => fallbackPattern.test(path.basename(filePath)))
  return fallbackFile ? extractTraceabilityItems(projectDir, fallbackFile, sourceType) : []
}

async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const files = await Promise.all(entries.map(async entry => {
      const entryPath = path.join(rootDir, entry.name)
      if (entry.isDirectory()) return listMarkdownFiles(entryPath)
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) return [entryPath]
      return []
    }))
    return files.flat().sort()
  } catch {
    return []
  }
}

async function extractTraceabilityItems(
  projectDir: string,
  filePath: string,
  sourceType: TraceabilityItem['sourceType']
): Promise<TraceabilityItem[]> {
  const content = await fs.readFile(filePath, 'utf-8')
  const relativePath = normalizePath(path.relative(projectDir, filePath))
  const lines = content.split(/\r?\n/)
  const items: TraceabilityItem[] = []
  let currentHeading = ''

  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^#{1,6}\s+(.+?)\s*$/)
    if (headingMatch) {
      currentHeading = cleanMarkdown(headingMatch[1] ?? '')
      continue
    }

    const bulletMatch = rawLine.match(/^\s*(?:[-*+]|\d+\.)\s+(.*\S)\s*$/)
    if (!bulletMatch?.[1]) continue

    const item = cleanMarkdown(bulletMatch[1])
    if (!item) continue

    const sourceLabel = currentHeading
      ? `${sourceType}: ${relativePath} → ${currentHeading}`
      : `${sourceType}: ${relativePath}`

    items.push({
      sourceType,
      sourcePath: relativePath,
      sourceLabel,
      item,
    })
  }

  return items
}

function cleanMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}
