import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import type { FileChangeRecord } from '../../types.js'
import { logger } from '../../utils/logger.js'

export interface CodeMappingEntry {
  feature: string
  step: string
  filePath: string
  symbol: string
  lineRange?: string
  description?: string
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
    
    return [...new Set(symbols)]
  } catch {
    return []
  }
}

export function generateCodeMappingTable(
  feature: string,
  changes: FileChangeRecord[]
): CodeMappingEntry[] {
  return changes.map((change, index) => ({
    feature,
    step: `Step ${index + 1}`,
    filePath: change.filePath,
    symbol: '*auto-detect*',
    description: `File ${change.tool === 'write' ? 'created' : 'modified'}`,
  }))
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
  const mappings = generateCodeMappingTable(feature, changes)
  
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

| Feature Step | File | Symbol | Description |
|--------------|------|--------|-------------|
${mappings.map(m => `| ${m.step} | ${m.filePath} | ${m.symbol} | ${m.description || ''} |`).join('\n')}

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
