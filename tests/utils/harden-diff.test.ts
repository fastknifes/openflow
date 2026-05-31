import { test, expect, describe } from 'bun:test'
import { computeDiffHash, computeChangedFilesSet, hasMaterialChange } from '../../src/utils/harden-diff.js'

// ── computeDiffHash ──────────────────────────────────────────────────────────

describe('computeDiffHash', () => {
  test('empty string returns consistent hash', () => {
    const hash1 = computeDiffHash('')
    const hash2 = computeDiffHash('')
    expect(hash1).toBe(hash2)
    expect(typeof hash1).toBe('string')
  })

  test('same input produces same hash', () => {
    const diff = 'diff --git a/foo.ts b/foo.ts\n+hello\n-world'
    expect(computeDiffHash(diff)).toBe(computeDiffHash(diff))
  })

  test('different inputs produce different hashes', () => {
    const hash1 = computeDiffHash('diff content A')
    const hash2 = computeDiffHash('diff content B')
    expect(hash1).not.toBe(hash2)
  })

  test('returns 8-char hex string', () => {
    const hash = computeDiffHash('some diff content here')
    expect(hash).toHaveLength(8)
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  test('empty string also returns 8-char hex string', () => {
    const hash = computeDiffHash('')
    expect(hash).toHaveLength(8)
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })
})

// ── computeChangedFilesSet ───────────────────────────────────────────────────

describe('computeChangedFilesSet', () => {
  test('empty string returns empty set', () => {
    const files = computeChangedFilesSet('')
    expect(files.size).toBe(0)
  })

  test('extracts files from diff --git a/X b/Y lines', () => {
    const diff = 'diff --git a/src/foo.ts b/src/foo.ts\n+added line'
    const files = computeChangedFilesSet(diff)
    expect(files.has('src/foo.ts')).toBe(true)
  })

  test('extracts different files from a/X and b/Y', () => {
    const diff = 'diff --git a/old.ts b/new.ts\n+line'
    const files = computeChangedFilesSet(diff)
    expect(files.has('old.ts')).toBe(true)
    expect(files.has('new.ts')).toBe(true)
    expect(files.size).toBe(2)
  })

  test('extracts files from --- a/X and +++ b/Y lines', () => {
    const diff = '--- a/src/utils.ts\n+++ b/src/utils.ts\n+added'
    const files = computeChangedFilesSet(diff)
    expect(files.has('src/utils.ts')).toBe(true)
  })

  test('deduplicates files from diff --git and ---/+++ lines', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '+added line',
    ].join('\n')
    const files = computeChangedFilesSet(diff)
    expect(files.size).toBe(1)
    expect(files.has('src/foo.ts')).toBe(true)
  })

  test('normalizes backslashes in file paths', () => {
    const diff = 'diff --git a/src\\utils\\foo.ts b/src\\utils\\foo.ts\n+line'
    const files = computeChangedFilesSet(diff)
    expect(files.has('src/utils/foo.ts')).toBe(true)
  })

  test('strips leading ./ from file paths', () => {
    const diff = 'diff --git a/./src/foo.ts b/./src/foo.ts\n+line'
    const files = computeChangedFilesSet(diff)
    expect(files.has('src/foo.ts')).toBe(true)
  })

  test('handles multiple diff sections', () => {
    const diff = [
      'diff --git a/one.ts b/one.ts',
      '+change',
      'diff --git a/two.ts b/two.ts',
      '+change',
    ].join('\n')
    const files = computeChangedFilesSet(diff)
    expect(files.size).toBe(2)
    expect(files.has('one.ts')).toBe(true)
    expect(files.has('two.ts')).toBe(true)
  })
})

// ── hasMaterialChange ────────────────────────────────────────────────────────

describe('hasMaterialChange', () => {
  test('same hash + same files → false', () => {
    const files = new Set(['src/foo.ts', 'src/bar.ts'])
    expect(hasMaterialChange('abc', 'abc', files, new Set(files))).toBe(false)
  })

  test('same hash + same files (empty) → false', () => {
    expect(hasMaterialChange('abc', 'abc', new Set(), new Set())).toBe(false)
  })

  test('different hash → true', () => {
    const files = new Set(['src/foo.ts'])
    expect(hasMaterialChange('hash1', 'hash2', files, new Set(files))).toBe(true)
  })

  test('same hash but different file count → true', () => {
    expect(hasMaterialChange('abc', 'abc', new Set(['a.ts']), new Set(['a.ts', 'b.ts']))).toBe(true)
  })

  test('same hash, same count but different files → true', () => {
    expect(
      hasMaterialChange('abc', 'abc', new Set(['a.ts', 'b.ts']), new Set(['a.ts', 'c.ts'])),
    ).toBe(true)
  })
})
