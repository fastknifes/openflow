import type { OpenFlowContract, AlignmentItem } from '../contracts/openflow-contract.js'
import type { DriftDisposition } from '../types.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export interface DriftCheckResult {
  item: string
  type: 'file' | 'symbol'
  contractReference: string
  actualValue: string
  reason: string
  suggestedFix?: string
  alignmentItem?: AlignmentItem
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

// --- Keyword extraction (matching design-drift.ts pattern) ---
export function extractCodeKeywords(content: string): string[] {
  const keywords = new Set<string>()
  for (const match of content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    const kw = match[1]
    if (kw) keywords.add(kw)
  }
  for (const match of content.matchAll(/export\s+class\s+(\w+)/g)) {
    const kw = match[1]
    if (kw) keywords.add(kw)
  }
  for (const match of content.matchAll(/export\s+const\s+(\w+)/g)) {
    const kw = match[1]
    if (kw) keywords.add(kw)
  }
  return [...keywords]
}

// --- File-level drift ---
export async function checkFileDrift(
  filePath: string,
  contract: OpenFlowContract,
  _projectDir: string,
): Promise<DriftCheckResult[]> {
  const results: DriftCheckResult[] = []
  const normalizedFile = normalizePath(filePath)

  // Find alignment items that reference this file path
  const matchingItems = contract.alignmentItems.filter(item => {
    const allPaths = [...item.files, ...item.modules].map(normalizePath)
    return allPaths.some(p => normalizedFile.includes(p) || p.includes(normalizedFile))
  })

  if (matchingItems.length === 0) {
    // File is not in any alignment item — check if it could be a rename
    results.push({
      item: normalizedFile,
      type: 'file',
      contractReference: 'No matching alignment item',
      actualValue: normalizedFile,
      reason: `File ${normalizedFile} is not referenced in any alignment item's files or modules`,
    })
    return results
  }

  // File matches at least one alignment item — no drift
  for (const item of matchingItems) {
    results.push({
      item: normalizedFile,
      type: 'file',
      contractReference: item.designResponse,
      actualValue: normalizedFile,
      reason: 'File matches alignment item',
      alignmentItem: item,
    })
  }

  return results
}

// Check if file rename is detectable (same content hash on different path)
export async function detectFileRename(
  oldPath: string,
  newPath: string,
  projectDir: string,
): Promise<boolean> {
  try {
    const oldContent = await fs.readFile(path.join(projectDir, oldPath), 'utf-8')
    const newContent = await fs.readFile(path.join(projectDir, newPath), 'utf-8')
    return oldContent === newContent
  } catch {
    return false
  }
}

// --- Symbol-level drift ---
export function checkSymbolDrift(
  filePath: string,
  codeContent: string,
  contract: OpenFlowContract,
): DriftCheckResult[] {
  const results: DriftCheckResult[] = []
  const normalizedFile = normalizePath(filePath)
  const keywords = extractCodeKeywords(codeContent)

  if (keywords.length === 0) return results

  // Find alignment items for this file
  const matchingItems = contract.alignmentItems.filter(item => {
    const allPaths = [...item.files, ...item.modules].map(normalizePath)
    return allPaths.some(p => normalizedFile.includes(p) || p.includes(normalizedFile))
  })

  // Get all expected symbols from matching alignment items
  const expectedSymbols = new Set<string>()
  for (const item of matchingItems) {
    for (const sym of item.expectedSymbols) {
      expectedSymbols.add(sym.toLowerCase())
    }
  }

  if (expectedSymbols.size === 0) {
    // No expected symbols defined — can't check
    return results
  }

  // Check each keyword against expected symbols
  for (const keyword of keywords) {
    if (expectedSymbols.has(keyword.toLowerCase())) {
      // Symbol matches — no drift
      results.push({
        item: keyword,
        type: 'symbol',
        contractReference: 'Expected symbol',
        actualValue: `Found in ${normalizedFile}`,
        reason: 'Symbol matches expected',
      })
    } else {
      // Symbol not expected — potential drift
      results.push({
        item: keyword,
        type: 'symbol',
        contractReference: 'Not in expected symbols',
        actualValue: `Found in ${normalizedFile}`,
        reason: `Symbol '${keyword}' is not in contract's expectedSymbols`,
      })
    }
  }

  return results
}

// --- Disposition classification ---
export function classifyDrift(
  result: DriftCheckResult,
  _contract: OpenFlowContract,
): DriftDisposition {
  // Symbol matches expected → no drift
  if (result.type === 'symbol' && result.reason === 'Symbol matches expected') {
    return 'no_drift'
  }

  // File matches alignment → no drift
  if (result.type === 'file' && result.reason === 'File matches alignment item') {
    return 'no_drift'
  }

  // File not in any alignment → ambiguous (could be rename or accidental)
  if (result.type === 'file' && result.reason.includes('not referenced')) {
    // If suggestedFix is present (file rename detected), auto-repair
    if (result.suggestedFix) {
      return 'auto_repaired'
    }
    // If multiple contracts reference same file → ambiguous
    return 'ambiguous_needs_confirmation'
  }

  // Symbol not expected → depends on context
  if (result.type === 'symbol' && result.reason.includes('not in contract')) {
    // Missing symbol from contract → violation (design says it should exist but it doesn't)
    // Extra symbol not in contract → ambiguous (could be new implementation)
    return 'ambiguous_needs_confirmation'
  }

  return 'no_drift'
}

// --- Composite check (convenience) ---
export async function checkDrift(
  filePath: string,
  contract: OpenFlowContract,
  projectDir: string,
): Promise<{ results: DriftCheckResult[]; disposition: DriftDisposition }> {
  const normalizedFile = normalizePath(filePath)

  // File-level check
  const fileResults = await checkFileDrift(filePath, contract, projectDir)

  // Symbol-level check (if file exists and is a code file)
  let symbolResults: DriftCheckResult[] = []
  if (normalizedFile.endsWith('.ts') || normalizedFile.endsWith('.tsx') || normalizedFile.endsWith('.js')) {
    try {
      const content = await fs.readFile(path.join(projectDir, filePath), 'utf-8')
      symbolResults = checkSymbolDrift(filePath, content, contract)
    } catch {
      // File may not exist yet — skip symbol check
    }
  }

  const allResults = [...fileResults, ...symbolResults]

  // Determine overall disposition: use most severe
  const dispositions = allResults.map(r => classifyDrift(r, contract))
  if (dispositions.includes('violation_needs_fix')) return { results: allResults, disposition: 'violation_needs_fix' }
  if (dispositions.includes('ambiguous_needs_confirmation')) return { results: allResults, disposition: 'ambiguous_needs_confirmation' }
  if (dispositions.includes('auto_repaired')) return { results: allResults, disposition: 'auto_repaired' }

  return { results: allResults, disposition: 'no_drift' }
}
