import type { Dirent } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { tArray } from '../i18n/index.js'

// --- Types ---

export interface ScannedConstraint {
  source: 'current' | 'decision' | 'reflection'
  file: string          // relative path
  rule: string          // constraint rule text
  severity: 'blocking' | 'warning'
  appliesTo: string[]   // target file/directory paths
}

// --- Low-level helpers ---

export async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return result
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await walkMarkdownFiles(full)
      result.push(...nested)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      result.push(full)
    }
  }
  return result
}

export function extractTargetPaths(line: string): string[] {
  const paths: string[] = []

  const btRegex = /`((?:src|tests|docs)\/[\w.\/-]+)`/g
  let m: RegExpExecArray | null
  while ((m = btRegex.exec(line)) !== null) {
    paths.push(m[1]!)
  }

  const plainRegex = /(?<!`)((?:src|tests|docs)\/[\w.\/-]+)(?!`)/g
  while ((m = plainRegex.exec(line)) !== null) {
    if (!paths.includes(m[1]!)) {
      paths.push(m[1]!)
    }
  }

  return paths
}

export function detectConstraintLine(line: string): 'blocking' | 'warning' | false {
  const lower = line.toLowerCase()
  const blockingKeywords = tArray('contract.blockingKeywords')

  if (
    lower.includes('locked') ||
    lower.includes('must not change') ||
    blockingKeywords.some(keyword => lower.includes(keyword)) ||
    /@stable/.test(lower) ||
    /@public/.test(lower)
  ) {
    return 'blocking'
  }
  const warningKeywords = tArray('contract.warningKeywords')
  if (
    lower.includes('forbidden dependency') ||
    warningKeywords.some(keyword => lower.includes(keyword))
  ) {
    return 'warning'
  }

  return false
}

// --- Section extractor for current docs ---

function extractCurrentConstraintsFromSections(
  content: string,
  relPath: string,
): ScannedConstraint[] {
  const constraints: ScannedConstraint[] = []
  const lines = content.split('\n')
  let inConstraintSection = false

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/)
    if (headingMatch) {
      const heading = headingMatch[1]!.trim().toLowerCase()
      inConstraintSection = heading === 'constraints' || heading.includes('constraint')
      continue
    }

    if (/^##\s+/.test(line) && inConstraintSection) {
      inConstraintSection = false
      continue
    }

    if (!inConstraintSection) continue

    const isConstraint = detectConstraintLine(line)
    if (!isConstraint) continue

    const targetPaths = extractTargetPaths(line)
    if (targetPaths.length === 0) continue

    constraints.push({
      source: 'current',
      file: relPath,
      rule: line.trim(),
      severity: isConstraint === 'blocking' ? 'blocking' : 'warning',
      appliesTo: targetPaths,
    })
  }

  return constraints
}

// --- Code pattern extractor for decision docs ---

function extractCodePatterns(line: string): string[] {
  const patterns: string[] = []
  const regex = /`([^`]+)`/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(line)) !== null) {
    patterns.push(m[1]!)
  }
  return patterns
}

function extractDecisionRules(content: string, adrFile: string): ScannedConstraint[] {
  const constraints: ScannedConstraint[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    const lower = trimmed.toLowerCase()
    const decisionKeywords = tArray('contract.decisionKeywords')
    const hasKeyword =
      lower.includes('must') ||
      lower.includes('shall') ||
      lower.includes('required') ||
      decisionKeywords.some(keyword => lower.includes(keyword))
    if (!hasKeyword) continue

    const isItem = /^\d+\.\s/.test(trimmed) || /^-\s/.test(trimmed)
    if (!isItem) continue

    const codePatterns = extractCodePatterns(trimmed)
    if (codePatterns.length === 0) continue

    constraints.push({
      source: 'decision',
      file: adrFile,
      rule: trimmed,
      severity: 'blocking',
      appliesTo: codePatterns,
    })
  }

  return constraints
}

// --- High-level scan functions ---

export async function scanCurrentConstraints(projectDir: string): Promise<ScannedConstraint[]> {
  const currentDir = path.join(projectDir, 'docs', 'current')
  let mdFiles: string[]
  try {
    mdFiles = await walkMarkdownFiles(currentDir)
  } catch {
    return []
  }

  const reflectionDir = path.join(currentDir, 'workflow', 'ai-reflection')

  const constraints: ScannedConstraint[] = []

  for (const absPath of mdFiles) {
    // Skip ai-reflection directory — handled by scanReflectionDocs
    if (absPath.startsWith(reflectionDir)) continue

    const relPath = path.relative(projectDir, absPath).replace(/\\/g, '/')
    let content: string
    try {
      content = await fs.readFile(absPath, 'utf-8')
    } catch {
      continue
    }

    const sectionConstraints = extractCurrentConstraintsFromSections(content, relPath)
    constraints.push(...sectionConstraints)
  }

  return constraints
}

export async function scanDecisionConstraints(projectDir: string): Promise<ScannedConstraint[]> {
  const decisionsDir = path.join(projectDir, 'docs', 'decisions')
  let entries: string[]
  try {
    entries = await fs.readdir(decisionsDir)
  } catch {
    return []
  }

  const adrFiles = entries
    .filter(e => /^ADR-.*\.md$/i.test(e))
    .sort()

  const constraints: ScannedConstraint[] = []

  for (const adrFile of adrFiles) {
    const absPath = path.join(decisionsDir, adrFile)
    let content: string
    try {
      content = await fs.readFile(absPath, 'utf-8')
    } catch {
      continue
    }

    const adrConstraints = extractDecisionRules(content, adrFile)
    constraints.push(...adrConstraints)
  }

  return constraints
}

export async function scanReflectionDocs(projectDir: string): Promise<ScannedConstraint[]> {
  const reflectionDir = path.join(projectDir, 'docs', 'current', 'workflow', 'ai-reflection')
  let mdFiles: string[]
  try {
    mdFiles = await walkMarkdownFiles(reflectionDir)
  } catch {
    return []
  }

  const reflectionKeywords = ['must', 'shall', 'required', 'do not', 'never', 'always']

  const constraints: ScannedConstraint[] = []

  for (const absPath of mdFiles) {
    const relPath = path.relative(projectDir, absPath).replace(/\\/g, '/')
    let content: string
    try {
      content = await fs.readFile(absPath, 'utf-8')
    } catch {
      continue
    }

    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const lower = trimmed.toLowerCase()
      const hasKeyword = reflectionKeywords.some(kw => lower.includes(kw))
      if (!hasKeyword) continue

      const appliesTo = extractTargetPaths(trimmed)
      constraints.push({
        source: 'reflection',
        file: relPath,
        rule: trimmed,
        severity: 'warning',
        appliesTo: appliesTo.length > 0 ? appliesTo : ['*'],
      })
    }
  }

  return constraints
}
