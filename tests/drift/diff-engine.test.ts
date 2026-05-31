import { test, expect, describe } from 'bun:test'
import { normalizePath, extractCodeKeywords, checkSymbolDrift, classifyDrift } from '../../src/drift/diff-engine.js'
import type { OpenFlowContract, AlignmentItem } from '../../src/contracts/openflow-contract.js'

// ── Helpers ──

function makeContract(items: AlignmentItem[] = []): OpenFlowContract {
  return {
    feature: 'test-feature',
    sourceFiles: [],
    behaviorScenarios: [],
    alignmentItems: items,
    currentConstraints: [],
    decisionConstraints: [],
    extractedAt: '',
    sourceHashes: {},
  }
}

function makeAlignmentItem(overrides: Partial<AlignmentItem> = {}): AlignmentItem {
  return {
    behaviorId: 'B1',
    designResponse: 'test response',
    files: ['src/foo.ts'],
    modules: [],
    expectedSymbols: ['doSomething'],
    risk: 'low',
    ...overrides,
  }
}

// ── normalizePath ──

describe('normalizePath', () => {
  test('converts backslashes to forward slashes', () => {
    expect(normalizePath('src\\foo\\bar.ts')).toBe('src/foo/bar.ts')
  })

  test('leaves already-normalized paths unchanged', () => {
    expect(normalizePath('src/foo/bar.ts')).toBe('src/foo/bar.ts')
  })

  test('handles mixed separators', () => {
    expect(normalizePath('src\\foo/bar\\baz.ts')).toBe('src/foo/bar/baz.ts')
  })

  test('handles empty string', () => {
    expect(normalizePath('')).toBe('')
  })
})

// ── extractCodeKeywords ──

describe('extractCodeKeywords', () => {
  test('extracts export function names', () => {
    expect(extractCodeKeywords('export function foo() {}')).toEqual(['foo'])
  })

  test('extracts export class names', () => {
    expect(extractCodeKeywords('export class Bar {}')).toEqual(['Bar'])
  })

  test('extracts export const names', () => {
    expect(extractCodeKeywords('export const BAZ = 1')).toEqual(['BAZ'])
  })

  test('extracts mixed exports', () => {
    const code = `
      export function foo() {}
      export class Bar {}
      export const BAZ = 1
    `
    const keywords = extractCodeKeywords(code)
    expect(keywords).toContain('foo')
    expect(keywords).toContain('Bar')
    expect(keywords).toContain('BAZ')
    expect(keywords.length).toBe(3)
  })

  test('excludes non-export functions', () => {
    expect(extractCodeKeywords('function hidden() {}')).toEqual([])
  })

  test('returns empty array for empty content', () => {
    expect(extractCodeKeywords('')).toEqual([])
  })

  test('extracts async function names', () => {
    expect(extractCodeKeywords('export async function baz() {}')).toEqual(['baz'])
  })

  test('does not duplicate names from same keyword', () => {
    const code = 'export function foo() {}\nexport function foo() {}'
    const keywords = extractCodeKeywords(code)
    // Set semantics: only one 'foo' even if matched twice
    expect(keywords).toEqual(['foo'])
  })
})

// ── checkSymbolDrift ──

describe('checkSymbolDrift', () => {
  test('returns "Symbol matches expected" when keyword is in expectedSymbols', () => {
    const contract = makeContract([
      makeAlignmentItem({ files: ['src/app.ts'], expectedSymbols: ['doSomething'] }),
    ])
    const results = checkSymbolDrift('src/app.ts', 'export function doSomething() {}', contract)
    expect(results.length).toBe(1)
    expect(results[0].reason).toBe('Symbol matches expected')
    expect(results[0].item).toBe('doSomething')
  })

  test('reports "not in contract" for unexpected symbols', () => {
    const contract = makeContract([
      makeAlignmentItem({ files: ['src/app.ts'], expectedSymbols: ['doSomething'] }),
    ])
    const results = checkSymbolDrift('src/app.ts', 'export function unexpected() {}', contract)
    expect(results.length).toBe(1)
    expect(results[0].reason).toContain('not in contract')
  })

  test('returns empty array when no keywords extracted', () => {
    const contract = makeContract([makeAlignmentItem()])
    const results = checkSymbolDrift('src/foo.ts', 'function hidden() {}', contract)
    expect(results).toEqual([])
  })

  test('returns empty array when no matching alignment items', () => {
    const contract = makeContract([
      makeAlignmentItem({ files: ['src/other.ts'], expectedSymbols: ['doSomething'] }),
    ])
    const results = checkSymbolDrift('src/unrelated.ts', 'export function doSomething() {}', contract)
    expect(results).toEqual([])
  })

  test('matches symbols case-insensitively', () => {
    const contract = makeContract([
      makeAlignmentItem({ files: ['src/app.ts'], expectedSymbols: ['DoSomething'] }),
    ])
    const results = checkSymbolDrift('src/app.ts', 'export function dosomething() {}', contract)
    expect(results.length).toBe(1)
    expect(results[0].reason).toBe('Symbol matches expected')
  })

  test('handles multiple symbols in one file', () => {
    const contract = makeContract([
      makeAlignmentItem({ files: ['src/app.ts'], expectedSymbols: ['foo'] }),
    ])
    const code = 'export function foo() {}\nexport function bar() {}'
    const results = checkSymbolDrift('src/app.ts', code, contract)
    expect(results.length).toBe(2)
    const matched = results.find(r => r.item === 'foo')
    const unmatched = results.find(r => r.item === 'bar')
    expect(matched?.reason).toBe('Symbol matches expected')
    expect(unmatched?.reason).toContain('not in contract')
  })
})

// ── classifyDrift ──

describe('classifyDrift', () => {
  const contract = makeContract()

  test('symbol match → no_drift', () => {
    const result = {
      item: 'foo',
      type: 'symbol' as const,
      contractReference: 'Expected symbol',
      actualValue: 'Found in src/foo.ts',
      reason: 'Symbol matches expected',
    }
    expect(classifyDrift(result, contract)).toBe('no_drift')
  })

  test('file matches alignment → no_drift', () => {
    const result = {
      item: 'src/foo.ts',
      type: 'file' as const,
      contractReference: 'test response',
      actualValue: 'src/foo.ts',
      reason: 'File matches alignment item',
    }
    expect(classifyDrift(result, contract)).toBe('no_drift')
  })

  test('file not referenced → ambiguous_needs_confirmation', () => {
    const result = {
      item: 'src/unknown.ts',
      type: 'file' as const,
      contractReference: 'No matching alignment item',
      actualValue: 'src/unknown.ts',
      reason: "File src/unknown.ts is not referenced in any alignment item's files or modules",
    }
    expect(classifyDrift(result, contract)).toBe('ambiguous_needs_confirmation')
  })

  test('file not referenced with suggestedFix → auto_repaired', () => {
    const result = {
      item: 'src/unknown.ts',
      type: 'file' as const,
      contractReference: 'No matching alignment item',
      actualValue: 'src/unknown.ts',
      reason: "File src/unknown.ts is not referenced in any alignment item's files or modules",
      suggestedFix: 'Rename to src/known.ts',
    }
    expect(classifyDrift(result, contract)).toBe('auto_repaired')
  })

  test('symbol not in contract → ambiguous_needs_confirmation', () => {
    const result = {
      item: 'unexpected',
      type: 'symbol' as const,
      contractReference: 'Not in expected symbols',
      actualValue: 'Found in src/foo.ts',
      reason: "Symbol 'unexpected' is not in contract's expectedSymbols",
    }
    expect(classifyDrift(result, contract)).toBe('ambiguous_needs_confirmation')
  })
})
