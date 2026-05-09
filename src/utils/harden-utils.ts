import type { ComplexityGrade, HardenFinding, HardenFindingLevel } from '../types.js'

const VALID_LEVELS: HardenFindingLevel[] = [
  'blocking_bug',
  'spec_violation',
  'regression_risk',
  'test_gap',
  'design_ambiguity',
  'style_or_preference',
]

const DOC_CONFIG_EXTENSIONS = new Set([
  '.md', '.txt', '.rst', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.json',
])

function countDiffStats(diffStr: string): { filesChanged: number; totalLines: number } {
  const lines = diffStr.split('\n')
  const filesChanged = new Set<string>()
  let totalLines = 0

  for (const line of lines) {
    if (line.startsWith('--- a/') || line.startsWith('+++ b/') || line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/)?.[1] ?? line.match(/a\/(.+)$/)?.[1]
      if (match) filesChanged.add(match)
    }
    if (line.startsWith('+') && !line.startsWith('+++')) totalLines++
    if (line.startsWith('-') && !line.startsWith('---')) totalLines++
  }

  return { filesChanged: filesChanged.size, totalLines }
}

function onlyDocConfigFiles(diffStr: string): boolean {
  const lines = diffStr.split('\n')
  const files = new Set<string>()

  for (const line of lines) {
    const match = line.match(/b\/(.+)$/)?.[1]
    if (match) files.add(match)
  }

  if (files.size === 0) return false

  for (const f of files) {
    const ext = '.' + f.split('.').pop()!.toLowerCase()
    if (!DOC_CONFIG_EXTENSIONS.has(ext)) return false
  }
  return true
}

function hasNewDefinitions(diffStr: string): boolean {
  const addedLines = diffStr.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
  for (const line of addedLines) {
    const content = line.slice(1)
    if (/\bfunction\b/.test(content) && /\bexport\s+function\b/.test(content)) return true
    if (/\bclass\s+\w/.test(content)) return true
    if (/\(\s*async\s+/.test(content)) return true
    if (/\bexport\s+function\b/.test(content)) return true
  }
  return false
}

export function gradeComplexity(planContent: string, diffStr: string): ComplexityGrade {
  if (!planContent || planContent.trim().length === 0) return 'complex'

  const diffLines = diffStr.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length
  if (!diffStr || diffStr.trim().length === 0 || diffLines <= 3) return 'trivial'

  const { filesChanged, totalLines } = countDiffStats(diffStr)

  if (onlyDocConfigFiles(diffStr)) return 'trivial'

  if (filesChanged <= 1 && totalLines <= 10) return 'trivial'

  if (hasNewDefinitions(diffStr)) return 'complex'

  if (
    (filesChanged <= 1 && totalLines <= 50) ||
    (filesChanged >= 2 && filesChanged <= 3 && totalLines < filesChanged * 10)
  ) {
    return 'simple'
  }

  return 'complex'
}

export function classifyFindings(
  rawFindings: string,
  _designDocPaths: string[],
): { actionable: HardenFinding[]; ambiguous: HardenFinding[]; nonBlocking: HardenFinding[]; style: HardenFinding[] } {
  const empty = { actionable: [], ambiguous: [], nonBlocking: [], style: [] }

  if (!rawFindings || rawFindings.trim().length === 0) return empty
  if (rawFindings.trim() === 'NO_FINDINGS') return empty

  const findings = parseFindings(rawFindings)
  if (findings.length === 0) {
    const evidence = extractEvidence(rawFindings)
    const files = extractFiles(rawFindings)
    if (evidence.trim().length === 0 && files.length === 0) return empty

    // Fallback: treat entire text as one actionable finding
    return {
      actionable: [{
        level: 'blocking_bug',
        description: rawFindings.trim(),
        evidence,
        files,
      }],
      ambiguous: [],
      nonBlocking: [],
      style: [],
    }
  }

  const result = { actionable: [] as HardenFinding[], ambiguous: [] as HardenFinding[], nonBlocking: [] as HardenFinding[], style: [] as HardenFinding[] }

  for (const finding of findings) {
    if (!hasEvidence(finding)) continue

    switch (finding.level) {
      case 'blocking_bug':
      case 'spec_violation':
        result.actionable.push(finding)
        break
      case 'regression_risk':
        result.actionable.push(finding)
        break
      case 'design_ambiguity':
        result.ambiguous.push(finding)
        break
      case 'test_gap':
        result.nonBlocking.push(finding)
        break
      case 'style_or_preference':
        // discard per spec
        break
    }
  }

  return result
}

function hasEvidence(finding: Pick<HardenFinding, 'evidence' | 'files'>): boolean {
  return finding.evidence.trim().length > 0 || finding.files.length > 0
}

interface ParsedFinding {
  level: HardenFindingLevel
  description: string
  evidence: string
  files: string[]
}

function parseFindings(rawFindings: string): ParsedFinding[] {
  const findings: ParsedFinding[] = []

  // Split into blocks by finding markers
  const blocks = rawFindings.split(/(?=(?:^|\n)#{1,3}\s*(?:Finding|Bug|Issue|Concern|Risk|Gap))/gm)

  if (blocks.length <= 1) {
    // Try line-by-line level extraction
    return extractFindingsByLevel(rawFindings)
  }

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    const level = extractLevel(trimmed)
    const description = extractDescription(trimmed)
    const evidence = extractEvidence(trimmed)
    const files = extractFiles(trimmed)

    findings.push({ level, description, evidence, files })
  }

  return findings
}

function extractFindingsByLevel(rawFindings: string): ParsedFinding[] {
  const findings: ParsedFinding[] = []
  const lines = rawFindings.split('\n')
  let currentLevel: HardenFindingLevel | null = null
  let currentDescription: string[] = []

  const flush = () => {
    if (currentLevel && currentDescription.length > 0) {
      findings.push({
        level: currentLevel,
        description: currentDescription.join('\n').trim(),
        evidence: '',
        files: extractFiles(currentDescription.join('\n')),
      })
    }
    currentDescription = []
  }

  for (const line of lines) {
    const levelMatch = line.match(/Level:\s*(\w+)/i)
    if (levelMatch?.[1]) {
      flush()
      currentLevel = matchLevel(levelMatch[1]!)
      continue
    }
    if (currentLevel) {
      currentDescription.push(line)
    }
  }
  flush()

  if (findings.length === 0) {
    // Try to find any level keywords inline
    const inlinePattern = /\b(blocking_bug|spec_violation|regression_risk|test_gap|design_ambiguity|style_or_preference)\b/gi
    let match: RegExpExecArray | null
    const text = rawFindings
    while ((match = inlinePattern.exec(text)) !== null) {
      const level = matchLevel(match[1]!)
      const start = Math.max(0, match.index - 100)
      const end = Math.min(text.length, match.index + match[0].length + 200)
      findings.push({
        level,
        description: text.slice(start, end).trim(),
        evidence: extractEvidence(text.slice(start, end)),
        files: extractFiles(text.slice(start, end)),
      })
    }
  }

  return findings
}

function matchLevel(raw: string): HardenFindingLevel {
  const normalized = raw.toLowerCase().replace(/[-_\s]+/g, '_')
  for (const level of VALID_LEVELS) {
    if (normalized === level || normalized.includes(level)) return level
  }
  return 'blocking_bug' // default fallback
}

function extractLevel(text: string): HardenFindingLevel {
  const levelMatch = text.match(/Level:\s*(\w+)/i)
  if (levelMatch?.[1]) return matchLevel(levelMatch[1])

  // Check heading for level hints
  const lower = text.toLowerCase()
  for (const level of VALID_LEVELS) {
    if (lower.includes(level)) return level
  }
  if (lower.includes('bug') || lower.includes('critical')) return 'blocking_bug'
  if (lower.includes('spec') || lower.includes('violation')) return 'spec_violation'
  if (lower.includes('regression') || lower.includes('risk')) return 'regression_risk'
  if (lower.includes('test') || lower.includes('gap')) return 'test_gap'
  if (lower.includes('ambigu') || lower.includes('unclear')) return 'design_ambiguity'
  if (lower.includes('style') || lower.includes('prefer')) return 'style_or_preference'

  return 'blocking_bug'
}

function extractDescription(text: string): string {
  // Take the first paragraph after the heading
  const lines = text.split('\n')
  const descLines: string[] = []
  let started = false
  for (const line of lines) {
    if (line.match(/^#{1,3}\s/)) {
      if (started) break
      started = true
      continue
    }
    if (line.match(/^Level:/i)) continue
    if (line.trim() === '' && descLines.length > 0) break
    if (line.trim()) descLines.push(line.trim())
  }
  return descLines.join(' ').trim()
}

function extractEvidence(text: string): string {
  const evidenceMatch = text.match(/Evidence:\s*([\s\S]*?)(?=\n(?:#{1,3}|\n\n|\Z))/i)
  if (evidenceMatch?.[1]) return evidenceMatch[1].trim()

  const fileMatch = text.match(/File:\s*(.+)/i)
  if (fileMatch?.[1]) return fileMatch[1].trim()

  const lineMatch = text.match(/Line:\s*(.+)/i)
  if (lineMatch?.[1]) return lineMatch[1].trim()

  return ''
}

function extractFiles(text: string): string[] {
  const files = new Set<string>()
  // Match common file path patterns
  const pathPattern = /(?:^|[\s(])(?:src|lib|test|tests|docs|pkg|cmd|app)[/\\][\w./\\-]+\.\w+/g
  let match: RegExpExecArray | null
  while ((match = pathPattern.exec(text)) !== null) {
    files.add(match[0].trim())
  }
  return [...files]
}

export function compressInput(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const headLen = Math.floor(maxLength * 0.6)
  const tailLen = maxLength - headLen - '[... compressed ...]'.length

  const head = text.slice(0, headLen)
  const tail = text.slice(text.length - tailLen)

  return head + '[... compressed ...]' + tail
}
