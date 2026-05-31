import * as fs from 'node:fs/promises'

export interface ResolvedSymbol {
  name: string
  kind: 'function' | 'class' | 'method' | 'interface' | 'type' | 'const' | 'enum'
  file: string
  line?: number
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------
const EXPORT_FUNCTION_RE = /export\s+(?:async\s+)?function\s+(\w+)/g
const EXPORT_CLASS_RE = /export\s+class\s+(\w+)/g
const EXPORT_CONST_RE = /export\s+const\s+(\w+)/g
const EXPORT_INTERFACE_RE = /export\s+interface\s+(\w+)/g
const EXPORT_TYPE_RE = /export\s+type\s+(\w+)/g
const EXPORT_ENUM_RE = /export\s+enum\s+(\w+)/g

// Matches class method signatures: public/private/protected/static, async, methodName (
const CLASS_METHOD_RE = /(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(\w+)\s*\(/g

// Matches export class blocks to limit method extraction scope
const CLASS_BLOCK_RE = /export\s+class\s+(\w+)\s*\{/g

const LINE_DELIMITER = '\n'

// ---------------------------------------------------------------------------
// Line number helper
// ---------------------------------------------------------------------------
function lineNumberAt(content: string, matchIndex: number): number {
  // Count newlines before the match index (0-based). Line numbers are 1-based.
  let count = 1
  for (let i = 0; i < matchIndex; i++) {
    if (content[i] === LINE_DELIMITER) {
      count++
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// Top-level symbol extraction
// ---------------------------------------------------------------------------
interface TopLevelPattern {
  regex: RegExp
  kind: ResolvedSymbol['kind']
}

const TOP_LEVEL_PATTERNS: TopLevelPattern[] = [
  { regex: EXPORT_FUNCTION_RE, kind: 'function' },
  { regex: EXPORT_CLASS_RE, kind: 'class' },
  { regex: EXPORT_CONST_RE, kind: 'const' },
  { regex: EXPORT_INTERFACE_RE, kind: 'interface' },
  { regex: EXPORT_TYPE_RE, kind: 'type' },
  { regex: EXPORT_ENUM_RE, kind: 'enum' },
]

function extractTopLevelSymbols(
  content: string,
  filePath: string,
): ResolvedSymbol[] {
  const results: ResolvedSymbol[] = []

  for (const { regex, kind } of TOP_LEVEL_PATTERNS) {
    // Reset regex state
    const re = new RegExp(regex.source, regex.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      if (name === undefined) continue
      const line = lineNumberAt(content, match.index)
      results.push({ name, kind, file: filePath, line })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Class method extraction
// ---------------------------------------------------------------------------
function findClassBlocks(
  content: string,
): Array<{ className: string; bodyStart: number; bodyEnd: number }> {
  const blocks: Array<{ className: string; bodyStart: number; bodyEnd: number }> = []
  const re = new RegExp(CLASS_BLOCK_RE.source, CLASS_BLOCK_RE.flags)
  let match: RegExpExecArray | null

  while ((match = re.exec(content)) !== null) {
    const className = match[1]
    if (className === undefined) continue
    // Find the opening brace position
    const braceStart = content.indexOf('{', match.index)
    if (braceStart === -1) continue

    // Find matching closing brace
    const bodyEnd = findMatchingBrace(content, braceStart + 1)
    if (bodyEnd === -1) continue

    blocks.push({ className, bodyStart: braceStart + 1, bodyEnd })
  }

  return blocks
}

function findMatchingBrace(content: string, start: number): number {
  let depth = 1
  for (let i = start; i < content.length; i++) {
    if (content[i] === '{') depth++
    if (content[i] === '}') depth--
    if (depth === 0) return i
  }
  return -1
}

function extractMethodSymbols(
  content: string,
  filePath: string,
): ResolvedSymbol[] {
  const results: ResolvedSymbol[] = []
  const classBlocks = findClassBlocks(content)

  for (const block of classBlocks) {
    const body = content.slice(block.bodyStart, block.bodyEnd)
    const re = new RegExp(CLASS_METHOD_RE.source, CLASS_METHOD_RE.flags)
    let match: RegExpExecArray | null

    while ((match = re.exec(body)) !== null) {
      const methodName = match[1]
      if (methodName === undefined) continue
      // Skip 'constructor', 'if', 'while', 'for', 'switch', 'catch', 'return', 'new'
      if (
        methodName === 'constructor' ||
        methodName === 'if' ||
        methodName === 'while' ||
        methodName === 'for' ||
        methodName === 'switch' ||
        methodName === 'catch' ||
        methodName === 'return' ||
        methodName === 'new' ||
        methodName === 'throw' ||
        methodName === 'typeof' ||
        methodName === 'instanceof' ||
        methodName === 'delete'
      ) {
        continue
      }

      // Offset from the original file content
      const originalIndex = block.bodyStart + match.index
      const line = lineNumberAt(content, originalIndex)
      results.push({ name: methodName, kind: 'method', file: filePath, line })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Extract symbols from one file using regex
// ---------------------------------------------------------------------------
function extractFromFile(
  content: string,
  filePath: string,
): ResolvedSymbol[] {
  const topLevel = extractTopLevelSymbols(content, filePath)
  const methods = extractMethodSymbols(content, filePath)
  return [...topLevel, ...methods]
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
function deduplicate(symbols: ResolvedSymbol[]): ResolvedSymbol[] {
  const seen = new Set<string>()
  const result: ResolvedSymbol[] = []

  for (const sym of symbols) {
    const key = `${sym.file}::${sym.name}::${sym.kind}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(sym)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// LSP stub (Phase 2 integration)
// ---------------------------------------------------------------------------
async function extractSymbolsViaLsp(
  _filePaths: string[],
): Promise<ResolvedSymbol[]> {
  // Phase 2: integrate with a running LSP server.
  // For now, throw so the regex fallback is always used.
  throw new Error('LSP symbol extraction not yet implemented')
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function extractSymbols(
  filePaths: string[],
): Promise<ResolvedSymbol[]> {
  // Try LSP first
  try {
    const lspResult = await extractSymbolsViaLsp(filePaths)
    if (lspResult.length > 0) {
      return deduplicate(lspResult)
    }
  } catch {
    // Fall through to regex fallback
  }

  // Regex fallback
  const sourceFiles = filePaths.filter((p) => {
    const ext = p.slice(p.lastIndexOf('.')).toLowerCase()
    return SOURCE_EXTENSIONS.has(ext)
  })

  const allSymbols: ResolvedSymbol[] = []

  for (const filePath of sourceFiles) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const symbols = extractFromFile(content, filePath)
      allSymbols.push(...symbols)
    } catch {
      // File might not exist or be unreadable — skip it
    }
  }

  return deduplicate(allSymbols)
}
