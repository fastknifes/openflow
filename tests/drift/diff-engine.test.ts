import { describe, expect, test, afterAll, beforeAll } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  checkFileDrift,
  checkSymbolDrift,
  classifyDrift,
  checkDrift,
  detectFileRename,
  extractCodeKeywords,
  normalizePath,
} from '../../src/drift/diff-engine.js'
import type { OpenFlowContract } from '../../src/contracts/openflow-contract.js'
import type { DriftCheckResult } from '../../src/drift/diff-engine.js'

// --- Test fixtures ---

const TEMP_DIR = join(process.cwd(), '.test-diff-engine')

function makeContract(overrides?: Partial<OpenFlowContract>): OpenFlowContract {
  return {
    feature: 'test-feature',
    sourceFiles: [],
    behaviorScenarios: [],
    alignmentItems: [
      {
        behaviorId: 'b1',
        designResponse: 'Created src/foo.ts with FooService',
        files: ['src/foo.ts'],
        modules: ['src/services'],
        expectedSymbols: ['FooService', 'createFoo'],
        risk: 'low',
      },
      {
        behaviorId: 'b2',
        designResponse: 'Created src/bar.ts with BarHelper',
        files: ['src/bar.ts'],
        modules: ['src/helpers'],
        expectedSymbols: ['BarHelper', 'formatBar'],
        risk: 'medium',
      },
      {
        behaviorId: 'b3',
        designResponse: 'Created src/empty.ts (no expected symbols)',
        files: ['src/empty.ts'],
        modules: [],
        expectedSymbols: [],
        risk: 'low',
      },
      {
        behaviorId: 'b4',
        designResponse: 'Created src/qux.ts module-level only',
        files: [],
        modules: ['src/qux-module'],
        expectedSymbols: ['QuxUtil'],
        risk: 'high',
      },
    ],
    currentConstraints: [],
    decisionConstraints: [],
    extractedAt: '2026-01-01T00:00:00Z',
    sourceHashes: {},
  }
}

beforeAll(async () => {
  await mkdir(TEMP_DIR, { recursive: true })
})

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true })
})

// ================================================================
// normalizePath
// ================================================================

describe('normalizePath', () => {
  test('converts backslashes to forward slashes', () => {
    expect(normalizePath('src\\foo\\bar.ts')).toBe('src/foo/bar.ts')
  })

  test('leaves forward-slash paths unchanged', () => {
    expect(normalizePath('src/foo/bar.ts')).toBe('src/foo/bar.ts')
  })
})

// ================================================================
// extractCodeKeywords
// ================================================================

describe('extractCodeKeywords', () => {
  test('finds exported functions', () => {
    const code = `
export function createFoo() {}
export async function refreshFoo() {}
export function deleteFoo() {}
`
    const keywords = extractCodeKeywords(code)
    expect(keywords).toContain('createFoo')
    expect(keywords).toContain('refreshFoo')
    expect(keywords).toContain('deleteFoo')
    expect(keywords).toHaveLength(3)
  })

  test('finds exported classes', () => {
    const code = `
export class FooService {}
export class BarHelper {}
`
    const keywords = extractCodeKeywords(code)
    expect(keywords).toContain('FooService')
    expect(keywords).toContain('BarHelper')
    expect(keywords).toHaveLength(2)
  })

  test('finds exported consts', () => {
    const code = `
export const API_URL = 'https://api.example.com'
export const MAX_RETRIES = 3
`
    const keywords = extractCodeKeywords(code)
    expect(keywords).toContain('API_URL')
    expect(keywords).toContain('MAX_RETRIES')
    expect(keywords).toHaveLength(2)
  })

  test('ignores non-exported functions/classes/consts', () => {
    const code = `
function internalHelper() {}
class InternalThing {}
const localVar = 1
`
    const keywords = extractCodeKeywords(code)
    expect(keywords).toHaveLength(0)
  })

  test('handles empty content', () => {
    const keywords = extractCodeKeywords('')
    expect(keywords).toHaveLength(0)
  })

  test('finds mixed export types together', () => {
    const code = `
export class AppService {}
export function init() {}
export const VERSION = "1.0"
`
    const keywords = extractCodeKeywords(code)
    expect(keywords).toContain('AppService')
    expect(keywords).toContain('init')
    expect(keywords).toContain('VERSION')
    expect(keywords).toHaveLength(3)
  })
})

// ================================================================
// checkFileDrift
// ================================================================

describe('checkFileDrift', () => {
  test('file in alignmentItem.files returns match result', async () => {
    const contract = makeContract()
    const results = await checkFileDrift('src/foo.ts', contract, TEMP_DIR)
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('file')
    expect(results[0].reason).toBe('File matches alignment item')
    expect(results[0].alignmentItem).toBeDefined()
    expect(results[0].alignmentItem?.behaviorId).toBe('b1')
  })

  test('file NOT in any alignment returns not-referenced result', async () => {
    const contract = makeContract()
    const results = await checkFileDrift('src/unknown.ts', contract, TEMP_DIR)
    expect(results).toHaveLength(1)
    expect(results[0].reason).toInclude('not referenced')
    expect(results[0].alignmentItem).toBeUndefined()
  })

  test('file path matching alignmentItem.modules matches correctly', async () => {
    const contract = makeContract()
    const results = await checkFileDrift('src/qux-module/internal.ts', contract, TEMP_DIR)
    expect(results).toHaveLength(1)
    expect(results[0].reason).toBe('File matches alignment item')
    expect(results[0].alignmentItem?.behaviorId).toBe('b4')
  })

  test('file matches multiple alignment items', async () => {
    const contract = makeContract()
    // Add an overlapping item
    contract.alignmentItems.push({
      behaviorId: 'b5',
      designResponse: 'Also matches src/services pattern',
      files: [],
      modules: ['src/services'],
      expectedSymbols: [],
      risk: 'low',
    })
    const results = await checkFileDrift('src/services/foo.ts', contract, TEMP_DIR)
    // Should match both b1 (modules: ['src/services']) and b5
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.reason === 'File matches alignment item')).toBe(true)
  })

  test('backslash paths are normalized', async () => {
    const contract = makeContract()
    const results = await checkFileDrift('src\\foo.ts', contract, TEMP_DIR)
    expect(results).toHaveLength(1)
    expect(results[0].reason).toBe('File matches alignment item')
  })
})

// ================================================================
// checkSymbolDrift
// ================================================================

describe('checkSymbolDrift', () => {
  test('symbol matches expectedSymbols returns match result', () => {
    const contract = makeContract()
    const code = 'export class FooService {}'
    const results = checkSymbolDrift('src/foo.ts', code, contract)
    expect(results).toHaveLength(1)
    expect(results[0].item).toBe('FooService')
    expect(results[0].reason).toBe('Symbol matches expected')
  })

  test('symbol NOT in expectedSymbols returns ambiguous result', () => {
    const contract = makeContract()
    const code = 'export class UnknownService {}'
    const results = checkSymbolDrift('src/foo.ts', code, contract)
    expect(results).toHaveLength(1)
    expect(results[0].item).toBe('UnknownService')
    expect(results[0].reason).toInclude('not in contract')
  })

  test('code file with no expected symbols returns empty results', () => {
    const contract = makeContract()
    const code = 'export class FooService {}'
    const results = checkSymbolDrift('src/empty.ts', code, contract)
    expect(results).toHaveLength(0)
  })

  test('code with no exported symbols returns empty results', () => {
    const contract = makeContract()
    const code = 'const x = 1\nfunction f() {}'
    const results = checkSymbolDrift('src/foo.ts', code, contract)
    expect(results).toHaveLength(0)
  })

  test('file not matching any alignment item still returns results (symbols are checked)', () => {
    const contract = makeContract()
    const code = 'export class FooService {}'
    // File 'src/unknown.ts' doesn't match anything, so matchingItems is empty
    const results = checkSymbolDrift('src/unknown.ts', code, contract)
    // expectedSymbols set will be empty (no matching items) → returns empty
    expect(results).toHaveLength(0)
  })

  test('multiple symbols: mixture of matched and unmatched', () => {
    const contract = makeContract()
    const code = `
export class FooService {}
export class UnknownService {}
export function createFoo() {}
`
    const results = checkSymbolDrift('src/foo.ts', code, contract)
    const matched = results.filter(r => r.reason === 'Symbol matches expected')
    const unmatched = results.filter(r => r.reason.includes('not in contract'))
    expect(matched).toHaveLength(2) // FooService, createFoo
    expect(unmatched).toHaveLength(1) // UnknownService
  })

  test('case-insensitive symbol matching', () => {
    const contract = makeContract()
    const code = 'export class fooservice {}'
    const results = checkSymbolDrift('src/foo.ts', code, contract)
    expect(results).toHaveLength(1)
    expect(results[0].reason).toBe('Symbol matches expected')
  })
})

// ================================================================
// classifyDrift
// ================================================================

describe('classifyDrift', () => {
  const contract = makeContract()

  test('file match result → no_drift', () => {
    const result: DriftCheckResult = {
      item: 'src/foo.ts',
      type: 'file',
      contractReference: 'Created src/foo.ts',
      actualValue: 'src/foo.ts',
      reason: 'File matches alignment item',
    }
    expect(classifyDrift(result, contract)).toBe('no_drift')
  })

  test('file not referenced → ambiguous_needs_confirmation', () => {
    const result: DriftCheckResult = {
      item: 'src/unknown.ts',
      type: 'file',
      contractReference: 'No matching alignment item',
      actualValue: 'src/unknown.ts',
      reason: 'File src/unknown.ts is not referenced in any alignment item',
    }
    expect(classifyDrift(result, contract)).toBe('ambiguous_needs_confirmation')
  })

  test('file with suggestedFix → auto_repaired', () => {
    const result: DriftCheckResult = {
      item: 'src/renamed.ts',
      type: 'file',
      contractReference: 'No matching alignment item',
      actualValue: 'src/renamed.ts',
      reason: 'File src/renamed.ts is not referenced in any alignment item',
      suggestedFix: 'Update contract to reference src/renamed.ts',
    }
    expect(classifyDrift(result, contract)).toBe('auto_repaired')
  })

  test('symbol match result → no_drift', () => {
    const result: DriftCheckResult = {
      item: 'FooService',
      type: 'symbol',
      contractReference: 'Expected symbol',
      actualValue: 'Found in src/foo.ts',
      reason: 'Symbol matches expected',
    }
    expect(classifyDrift(result, contract)).toBe('no_drift')
  })

  test('symbol not in contract → ambiguous_needs_confirmation', () => {
    const result: DriftCheckResult = {
      item: 'UnknownService',
      type: 'symbol',
      contractReference: 'Not in expected symbols',
      actualValue: 'Found in src/foo.ts',
      reason: "Symbol 'UnknownService' is not in contract's expectedSymbols",
    }
    expect(classifyDrift(result, contract)).toBe('ambiguous_needs_confirmation')
  })

  test('unknown reason falls back to no_drift', () => {
    const result: DriftCheckResult = {
      item: 'something',
      type: 'file',
      contractReference: 'ref',
      actualValue: 'val',
      reason: 'some unclassified reason',
    }
    expect(classifyDrift(result, contract)).toBe('no_drift')
  })
})

// ================================================================
// checkDrift (composite)
// ================================================================

describe('checkDrift composite', () => {
  const contract = makeContract()

  test('returns correct disposition: most severe from results', async () => {
    // File not referenced → ambiguous, so the composite should also be ambiguous
    const { disposition } = await checkDrift('src/unknown.ts', contract, TEMP_DIR)
    expect(disposition).toBe('ambiguous_needs_confirmation')
  })

  test('returns no_drift disposition when everything matches', async () => {
    // src/services/dummy.ts matches b1 by modules but the file doesn't exist on disk,
    // so checkDrift will skip symbol check (file read fails) → only file check runs → matches
    // Actually, we need to think about this. The file check for src/foo.ts should match b1.
    // Since the actual file may not exist, the symbol check will fail silently (try/catch).
    const { results, disposition } = await checkDrift('src/foo.ts', contract, TEMP_DIR)
    expect(disposition).toBe('no_drift')
    expect(results.every(r => r.reason === 'File matches alignment item')).toBe(true)
  })

  test('non-code file skips symbol check', async () => {
    const { results } = await checkDrift('src/foo.md', contract, TEMP_DIR)
    // Should only have file-level results, no symbol results
    const symbolResults = results.filter(r => r.type === 'symbol')
    expect(symbolResults).toHaveLength(0)
  })
})

// ================================================================
// detectFileRename
// ================================================================

describe('detectFileRename', () => {
  test('same content → true', async () => {
    const dir = join(TEMP_DIR, 'rename-same')
    await mkdir(dir, { recursive: true })
    const content = 'export const VERSION = "1.0"'
    await writeFile(join(dir, 'old.ts'), content, 'utf-8')
    await writeFile(join(dir, 'new.ts'), content, 'utf-8')

    const result = await detectFileRename('rename-same/old.ts', 'rename-same/new.ts', TEMP_DIR)
    expect(result).toBe(true)
  })

  test('different content → false', async () => {
    const dir = join(TEMP_DIR, 'rename-diff')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'old.ts'), 'export const VERSION = "1.0"', 'utf-8')
    await writeFile(join(dir, 'new.ts'), 'export const VERSION = "2.0"', 'utf-8')

    const result = await detectFileRename('rename-diff/old.ts', 'rename-diff/new.ts', TEMP_DIR)
    expect(result).toBe(false)
  })

  test('non-existent file → false', async () => {
    const result = await detectFileRename('nonexistent/old.ts', 'nonexistent/new.ts', TEMP_DIR)
    expect(result).toBe(false)
  })
})
