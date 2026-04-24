import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { AcceptanceState, FileChangeRecord, PhasedChanges } from '../../types.js'
import { logger } from '../../utils/logger.js'
import type { TraceabilityItem } from './traceability.js'

export interface CodeMappingEntry {
  feature: string
  step: string
  source: string
  filePath: string
  symbol: string
  lineRange?: string
  description?: string
  verificationEvidence?: string
}

export interface GenerateCodeMappingOptions {
  projectDir?: string
  traceabilityItems?: TraceabilityItem[]
  acceptanceState?: AcceptanceState | null
  phasedChanges?: PhasedChanges
}

export interface ApiEndpoint {
  path: string
  method: string
  handler: string
  description?: string
}

export interface Dependency {
  name: string
  version: string
  purpose?: string
}

interface ChangedFileEvidence {
  filePath: string
  symbols: string[]
  summary: string
  searchText: string
}

export async function extractCodeSymbols(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const symbols: string[] = []

    const functionMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g)
    for (const match of functionMatches) {
      if (match[1]) symbols.push(match[1])
    }

    const classMatches = content.matchAll(/(?:export\s+)?class\s+(\w+)/g)
    for (const match of classMatches) {
      if (match[1]) symbols.push(match[1])
    }

    const constMatches = content.matchAll(/(?:export\s+)?const\s+(\w+)\s*=/g)
    for (const match of constMatches) {
      if (match[1]) symbols.push(match[1])
    }

    const variableMatches = content.matchAll(/(?:export\s+)?(?:let|var)\s+(\w+)\s*=/g)
    for (const match of variableMatches) {
      if (match[1]) symbols.push(match[1])
    }

    const interfaceMatches = content.matchAll(/(?:export\s+)?interface\s+(\w+)/g)
    for (const match of interfaceMatches) {
      if (match[1]) symbols.push(match[1])
    }

    const typeMatches = content.matchAll(/(?:export\s+)?type\s+(\w+)\s*=/g)
    for (const match of typeMatches) {
      if (match[1]) symbols.push(match[1])
    }

    return [...new Set(symbols)]
  } catch {
    return []
  }
}

export async function generateCodeMappingTable(
  feature: string,
  changes: FileChangeRecord[],
  options: GenerateCodeMappingOptions = {}
): Promise<CodeMappingEntry[]> {
  if (changes.length === 0) return []

  const evidence = await Promise.all(changes.map(change => buildChangedFileEvidence(change, options.projectDir)))
  const verificationEvidence = formatVerificationEvidence(options.acceptanceState, options.phasedChanges)
  const traceabilityItems = options.traceabilityItems && options.traceabilityItems.length > 0
    ? options.traceabilityItems
    : [{ sourceLabel: 'changed files', item: `${feature} archived implementation changes`, sourceType: 'design' as const, sourcePath: '' }]

  return traceabilityItems.map(item => {
    const relevantEvidence = selectRelevantEvidence(item.item, evidence)
    return {
      feature,
      step: item.item,
      source: item.sourceLabel,
      filePath: relevantEvidence.map(entry => entry.filePath).join('; '),
      symbol: relevantEvidence.flatMap(entry => entry.symbols).filter(Boolean).join(', ') || '-',
      description: relevantEvidence.map(entry => entry.summary).join('; '),
      verificationEvidence,
    }
  })
}

export function generateApiEndpointsTable(endpoints: ApiEndpoint[]): string {
  if (endpoints.length === 0) {
    return '| *No API endpoints defined* | | |'
  }

  const header = '| Endpoint | Method | Handler | Description |'
  const separator = '|----------|--------|---------|-------------|'
  const rows = endpoints.map(e =>
    `| ${e.path} | ${e.method} | ${e.handler} | ${e.description || ''} |`
  )

  return [header, separator, ...rows].join('\n')
}

export function generateDependenciesTable(deps: Dependency[]): string {
  if (deps.length === 0) {
    return '| *No dependencies recorded* | | |'
  }

  const header = '| Package | Version | Purpose |'
  const separator = '|---------|---------|---------|'
  const rows = deps.map(d =>
    `| ${d.name} | ${d.version} | ${d.purpose || ''} |`
  )

  return [header, separator, ...rows].join('\n')
}

export async function generateCodeMappingMarkdown(
  feature: string,
  _archiveDir: string,
  changes: FileChangeRecord[]
): Promise<string> {
  const date = new Date().toISOString().split('T')[0]
  const mappings = await generateCodeMappingTable(feature, changes)

  let symbolsContent = ''
  for (const change of changes.slice(0, 10)) {
    const symbols = await extractCodeSymbols(change.filePath)
    if (symbols.length > 0) {
      symbolsContent += `\n### ${change.filePath}\n\nSymbols: ${symbols.join(', ')}\n`
    }
  }

  return `# ${feature} - Implementation Mapping Details

**Generated**: ${date}

## Feature to Code Mapping

| Trace Source | Requirement / Proposal Item | File | Symbol | Verification |
|--------------|-----------------------------|------|--------|--------------|
${mappings.map(m => `| ${m.source} | ${m.step} | ${m.filePath} | ${m.symbol} | ${m.verificationEvidence || ''} |`).join('\n')}

## Extracted Symbols
${symbolsContent || '*No symbols extracted*'}

## Modified Files Summary

| File | Change Type |
|------|-------------|
${changes.map(c => `| ${c.filePath} | ${c.tool === 'write' ? 'created' : 'modified'} |`).join('\n')}
`
}

export async function saveCodeMapping(
  archiveDir: string,
  feature: string,
  changes: FileChangeRecord[]
): Promise<void> {
  const content = await generateCodeMappingMarkdown(feature, archiveDir, changes)
  const mappingPath = path.join(archiveDir, 'implementation-mapper.code-details.md')

  await fs.mkdir(path.dirname(mappingPath), { recursive: true })
  await fs.writeFile(mappingPath, content, 'utf-8')

  logger.info('Saved code mapping', { feature, fileCount: changes.length })
}

async function buildChangedFileEvidence(change: FileChangeRecord, projectDir?: string): Promise<ChangedFileEvidence> {
  const absolutePath = projectDir ? path.join(projectDir, change.filePath) : change.filePath
  const symbols = await extractCodeSymbols(absolutePath)
  const normalizedPath = normalizePath(change.filePath)
  const summary = symbols.length > 0
    ? `${normalizedPath} (${symbols.join(', ')})`
    : `${normalizedPath} (${change.tool === 'write' ? 'created' : 'modified'})`

  return {
    filePath: normalizedPath,
    symbols,
    summary,
    searchText: [normalizedPath, ...symbols].join(' ').toLowerCase(),
  }
}

function selectRelevantEvidence(item: string, evidence: ChangedFileEvidence[]): ChangedFileEvidence[] {
  if (evidence.length <= 2) return evidence

  const keywords = tokenize(item)
  const scored = evidence
    .map(entry => ({ entry, score: keywords.filter(keyword => entry.searchText.includes(keyword)).length }))
    .sort((a, b) => b.score - a.score)

  const matched = scored.filter(result => result.score > 0).map(result => result.entry)
  if (matched.length > 0) return matched.slice(0, 3)
  return evidence.slice(0, 3)
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(token => token.length >= 3)
}

function formatVerificationEvidence(
  acceptanceState?: AcceptanceState | null,
  phasedChanges?: PhasedChanges
): string {
  if (acceptanceState?.verificationCompletedAt) {
    return `verification completed at ${acceptanceState.verificationCompletedAt}`
  }

  if (acceptanceState?.verificationFailureCategory) {
    return `verification failed: ${acceptanceState.verificationFailureCategory}`
  }

  if (phasedChanges?.acceptance.length) {
    return `acceptance-phase file evidence recorded (${phasedChanges.acceptance.length} files)`
  }

  if (acceptanceState?.pendingDocUpdates.length) {
    return `pending acceptance/doc updates recorded (${acceptanceState.pendingDocUpdates.length})`
  }

  return 'archived file-change evidence recorded'
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}
