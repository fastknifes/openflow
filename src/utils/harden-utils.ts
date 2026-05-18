import { readFileSync } from 'node:fs'
import { normalizeFinding } from './harden-ledger.js'
import type { ComplexityGrade, Disposition, HardenFinding, HardenFindingLevel } from '../types.js'

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

const DIRECTORY_STRUCTURE_PREFERENCE_PATTERN = /\b(?:directory|folder|file)\s+structure\b|\borganization\b|\bshould\s+be\s+in\b|\bshould\s+move\s+to\b|\bmove\s+(?:the\s+)?file\s+to\b|\bplace\s+(?:the\s+)?file\s+in\b/iu
const FUNCTIONAL_IMPACT_PATTERN = /\b(?:crash|broken|breaks?|failing?|failure|incorrect|bug|exception|timeout|regression|wrong|mismatch|unhandled|missing\s+error\s+handling)\b/iu
const NON_BLOCKING_CANDIDATE_PATTERN = /\b(?:non[-\s]?blocking|does\s+not\s+block|doesn't\s+block|not\s+blocking|known\s+issue|acceptable|works\s+as\s+implemented|matches\s+the\s+actual\s+implementation|does\s+not\s+affect\s+functionality|no\s+functional\s+impact)\b/iu
const DESIGN_SCOPE_MISMATCH_PATTERN = /\b(?:not\s+in\s+design|not\s+specified\s+in\s+design|outside\s+design\s+scope|beyond\s+design(?:\s+scope)?|plan\s+(?:does\s+not|doesn't)\s+mention|reviewer\s+(?:wants|suggests?|requested?)|extra\s+step|additional\s+step|edge\s+case\s+not\s+in\s+design|scope\s+extends\s+beyond\s+design)\b/iu
const SYNONYM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bdoes\s+not\b|\bdoesn't\b|\bnot\b|\bwithout\b|\blacks?\b|\bno\b/giu, 'missing'],
  [/\bneeds?\s+to\b|\brequires?\b|\bmust\b|\bshould\s+be\b/giu, 'should'],
  [/\bpayload\s+shape\b|\bresponse\s+shape\b|\bresponse\s+payload\b|\bresponse\s+body\b/giu, 'response format'],
  [/\bresponse\s+(?:shape|payload|body)\b/giu, 'response format'],
  [/\breturns?\b|\breturning\b/giu, 'return'],
  [/\bwrong\b|\bincorrect\b/giu, 'incorrect'],
  [/\bhandle(?:s|d|ing)?\b/giu, 'handling'],
  [/\btests?\b/giu, 'test'],
  [/\binput\s+validation\b/giu, 'input validation middleware'],
  [/\bshould\s+add\b|\badd\b/giu, 'add'],
]
const DESIGN_MATCH_STOPWORDS = new Set([
  'a', 'actual', 'add', 'an', 'and', 'are', 'as', 'be', 'behavior', 'by', 'case', 'design', 'doc', 'edge', 'exists',
  'feature', 'file', 'files', 'for', 'found', 'from', 'implementation', 'in', 'is', 'issue', 'line', 'missing', 'must',
  'need', 'needs', 'no', 'not', 'of', 'on', 'or', 'plan', 'reviewer', 'should', 'spec', 'test', 'that', 'the', 'their',
  'there', 'this', 'to', 'validation', 'with', 'without', 'works', 'would', 'found', 'scenario', 'extra', 'step',
])

interface FindingGroups {
  actionable: HardenFinding[]
  ambiguous: HardenFinding[]
  nonBlocking: HardenFinding[]
  style: HardenFinding[]
}

interface DesignReference {
  raw: string
  normalized: string
  segments: string[]
}

interface FindingDispositionDecision {
  group: keyof FindingGroups
  level: HardenFindingLevel
  disposition?: Disposition
}

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

export function gradeComplexityFromDiff(diffStr: string): ComplexityGrade {
  const diffLines = diffStr.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length
  if (!diffStr || diffStr.trim().length === 0 || diffLines <= 3) return 'trivial'

  const { filesChanged, totalLines } = countDiffStats(diffStr)

  if (onlyDocConfigFiles(diffStr)) return 'trivial'

  if (filesChanged <= 1 && totalLines <= 10) return 'trivial'

  if (hasNewDefinitions(diffStr)) return 'complex'

  if (
    (filesChanged <= 1 && totalLines <= 50) ||
    (filesChanged === 2 && totalLines < filesChanged * 10)
  ) {
    return 'simple'
  }

  return 'complex'
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
  designDocPaths: string[],
): { actionable: HardenFinding[]; ambiguous: HardenFinding[]; nonBlocking: HardenFinding[]; style: HardenFinding[] } {
  if (!rawFindings || rawFindings.trim().length === 0) return cloneEmptyFindingGroups()
  if (rawFindings.trim() === 'NO_FINDINGS') return cloneEmptyFindingGroups()

  const designReference = loadDesignReference(designDocPaths)
  const findings = dedupeFindings(parseFindings(rawFindings))
  if (findings.length === 0) {
    const evidence = extractEvidence(rawFindings)
    const files = extractFiles(rawFindings)
    if (evidence.trim().length === 0 && files.length === 0) return cloneEmptyFindingGroups()

    // Fallback: treat entire text as one actionable finding
    const fallback = buildFindingIdentity({
      level: 'blocking_bug',
      description: rawFindings.trim(),
      evidence,
      files,
    })

    return {
      actionable: [{ ...fallback, disposition: 'must_fix' }],
      ambiguous: [],
      nonBlocking: [],
      style: [],
    }
  }

  const result = cloneEmptyFindingGroups()

  for (const finding of findings) {
    if (isDirectoryStructurePreference(finding)) continue

    const decision = resolveFindingDisposition(finding, designReference)
    if (decision.group === 'style') continue

    const nextFinding: HardenFinding = {
      ...finding,
      level: decision.level,
      ...(decision.disposition ? { disposition: decision.disposition } : {}),
    }
    result[decision.group].push(nextFinding)
  }

  return result
}

function cloneEmptyFindingGroups(): FindingGroups {
  return {
    actionable: [],
    ambiguous: [],
    nonBlocking: [],
    style: [],
  }
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
    findings.push(buildParsedFinding(level, trimmed))
  }

  return findings
}

function extractFindingsByLevel(rawFindings: string): ParsedFinding[] {
  const findings: ParsedFinding[] = []
  const lines = rawFindings.split('\n')
  let currentLevel: HardenFindingLevel | null = null
  let currentBlock: string[] = []

  const flush = () => {
    if (currentLevel && currentBlock.length > 0) {
      findings.push(buildParsedFinding(currentLevel, currentBlock.join('\n').trim()))
    }
    currentBlock = []
  }

  for (const line of lines) {
    const levelMatch = line.match(/Level:\s*(\w+)/i)
    if (levelMatch?.[1]) {
      flush()
      currentLevel = matchLevel(levelMatch[1]!)
      continue
    }
    if (currentLevel) {
      currentBlock.push(line)
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
      findings.push(buildParsedFinding(level, text.slice(start, end).trim()))
    }
  }

  return findings
}

function buildParsedFinding(level: HardenFindingLevel, text: string): ParsedFinding {
  return {
    level,
    description: extractStructuredDescription(text),
    evidence: extractStructuredEvidence(text),
    files: extractFiles(text),
  }
}

function extractStructuredDescription(text: string): string {
  const lines = text.split('\n')
  const descriptionLines: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      if (descriptionLines.length > 0) break
      continue
    }
    if (line.match(/^#{1,3}\s/)) continue
    if (line.match(/^Level:/i)) continue
    if (line.match(/^(Evidence|Files?|Lines?):/i)) break
    if (line.match(/^Description:/i)) {
      descriptionLines.push(line.replace(/^Description:\s*/i, '').trim())
      continue
    }
    descriptionLines.push(line)
  }

  return descriptionLines.join(' ').trim()
}

function extractStructuredEvidence(text: string): string {
  const evidenceMatch = text.match(/(?:^|\n)Evidence:\s*([\s\S]*?)(?=\n(?:Files?|Lines?|Level:|#{1,3}\s*(?:Finding|Bug|Issue|Concern|Risk|Gap))|$)/i)
  if (evidenceMatch?.[1]) return evidenceMatch[1].trim()

  const lineMatch = text.match(/(?:^|\n)Lines?:\s*(.+)/i)
  if (lineMatch?.[1]) return lineMatch[1].trim()

  return ''
}

function dedupeFindings(findings: ParsedFinding[]): HardenFinding[] {
  const deduped = new Map<string, HardenFinding>()

  for (const finding of findings) {
    const identified = buildFindingIdentity(finding)
    const existing = deduped.get(identified.normalizedKey!)
    if (!existing) {
      deduped.set(identified.normalizedKey!, identified)
      continue
    }

    const mergedEvidence = mergeText(existing.evidence, identified.evidence)
    const mergedFiles = [...new Set([...existing.files, ...identified.files])]

    deduped.set(identified.normalizedKey!, {
      ...existing,
      evidence: mergedEvidence,
      files: mergedFiles,
      repeatCount: Math.max(existing.repeatCount ?? 1, identified.repeatCount ?? 1) + 1,
    })
  }

  return [...deduped.values()]
}

function buildFindingIdentity(finding: ParsedFinding | HardenFinding): HardenFinding {
  const identified: HardenFinding = {
    level: finding.level,
    description: finding.description.trim(),
    evidence: finding.evidence.trim(),
    files: [...new Set(finding.files)],
  }

  return {
    ...identified,
    normalizedKey: normalizeFinding({
      ...identified,
      description: canonicalizeFindingText(identified.description),
      evidence: canonicalizeEvidenceForKey(identified.evidence),
    }),
    repeatCount: 1,
  }
}

function mergeText(current: string, next: string): string {
  if (!current) return next
  if (!next || current === next) return current
  return `${current}\n${next}`
}

function canonicalizeFindingText(text: string): string {
  let normalized = text.normalize('NFKC').toLowerCase()
  for (const [pattern, replacement] of SYNONYM_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement)
  }
  return normalized.replace(/\s+/gu, ' ').trim()
}

function canonicalizeEvidenceForKey(text: string): string {
  return canonicalizeFindingText(text)
    .replace(/(?:src|lib|test|tests|docs|pkg|cmd|app)[/\\][\w./\\-]+\.\w+/giu, 'file')
    .replace(/\bline\b/giu, 'line')
    .replace(/\b(?:file|found|exists|there|is|at|the|an?)\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function resolveFindingDisposition(
  finding: HardenFinding,
  designReference: DesignReference,
): FindingDispositionDecision {
  const evidencePresent = hasEvidence(finding)
  const designSupported = hasDesignSupport(finding, designReference)

  switch (finding.level) {
    case 'blocking_bug':
      if (evidencePresent) {
        return { group: 'actionable', level: 'blocking_bug', disposition: 'must_fix' }
      }
      return { group: 'ambiguous', level: 'design_ambiguity', disposition: 'needs_decision' }
    case 'spec_violation':
      if (designSupported && evidencePresent) {
        return { group: 'actionable', level: 'spec_violation', disposition: 'must_fix' }
      }
      if (!designSupported) {
        return { group: 'ambiguous', level: 'design_ambiguity', disposition: 'design_divergence' }
      }
      return { group: 'ambiguous', level: 'design_ambiguity', disposition: 'needs_decision' }
    case 'regression_risk':
      if (evidencePresent) {
        return { group: 'actionable', level: 'regression_risk', disposition: 'must_fix' }
      }
      return { group: 'nonBlocking', level: 'regression_risk', disposition: 'design_divergence' }
    case 'design_ambiguity':
      if (isAcceptedKnownIssueCandidate(finding)) {
        return { group: 'nonBlocking', level: 'design_ambiguity', disposition: 'accepted_known_issue' }
      }
      return { group: 'ambiguous', level: 'design_ambiguity', disposition: 'design_divergence' }
    case 'test_gap':
      if (isBeyondDesignScope(finding)) {
        return { group: 'nonBlocking', level: 'test_gap', disposition: 'false_positive' }
      }
      if (isAcceptedKnownIssueCandidate(finding)) {
        return { group: 'nonBlocking', level: 'test_gap', disposition: 'accepted_known_issue' }
      }
      return { group: 'nonBlocking', level: 'test_gap', disposition: 'needs_decision' }
    case 'style_or_preference':
      return { group: 'style', level: 'style_or_preference' }
  }
}

function isDirectoryStructurePreference(finding: HardenFinding): boolean {
  const text = `${finding.description}\n${finding.evidence}`
  return DIRECTORY_STRUCTURE_PREFERENCE_PATTERN.test(text) && !FUNCTIONAL_IMPACT_PATTERN.test(text)
}

function isAcceptedKnownIssueCandidate(finding: HardenFinding): boolean {
  if (!hasEvidence(finding)) return false
  if (finding.level !== 'test_gap' && finding.level !== 'design_ambiguity') return false
  return NON_BLOCKING_CANDIDATE_PATTERN.test(`${finding.description}\n${finding.evidence}`)
}

function isBeyondDesignScope(finding: HardenFinding): boolean {
  return DESIGN_SCOPE_MISMATCH_PATTERN.test(`${finding.description}\n${finding.evidence}`)
}

function loadDesignReference(designDocPaths: string[]): DesignReference {
  const raw = designDocPaths
    .map(path => {
      try {
        return readFileSync(path, 'utf8')
      }
      catch {
        return ''
      }
    })
    .filter(Boolean)
    .join('\n')

  const normalized = canonicalizeFindingText(raw)
  const segments = raw
    .split(/\n+/)
    .map(segment => canonicalizeFindingText(segment))
    .filter(Boolean)

  return { raw, normalized, segments }
}

function hasDesignSupport(finding: HardenFinding, designReference: DesignReference): boolean {
  if (!designReference.raw.trim()) return false

  const claim = canonicalizeFindingText(`${finding.description} ${finding.evidence}`)
  if (claim && designReference.normalized.includes(claim)) return true

  const tokens = extractDesignMatchTokens(finding.description)
  if (tokens.length === 0) return false

  for (const segment of designReference.segments) {
    const overlap = tokens.filter(token => segment.includes(token)).length
    const requiredOverlap = Math.min(tokens.length, Math.max(2, Math.ceil(tokens.length * 0.6)))
    if (overlap >= requiredOverlap) {
      return true
    }
  }

  return false
}

function extractDesignMatchTokens(text: string): string[] {
  return [...new Set(
    canonicalizeFindingText(text)
      .split(/[^a-z0-9/]+/giu)
      .map(token => token.trim())
      .filter(token => token.length >= 3 || /^\d{3,}$/u.test(token))
      .filter(token => !DESIGN_MATCH_STOPWORDS.has(token)),
  )]
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
