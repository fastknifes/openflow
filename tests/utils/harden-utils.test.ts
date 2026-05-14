import { describe, expect, test } from 'bun:test'
import { gradeComplexityFromDiff } from '../../src/utils/harden-utils.js'

describe('gradeComplexityFromDiff', () => {
  test('empty diff returns trivial', () => {
    expect(gradeComplexityFromDiff('')).toBe('trivial')
    expect(gradeComplexityFromDiff('   ')).toBe('trivial')
  })

  test('diff with 3 or fewer changed lines returns trivial', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abc..def 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,3 @@',
      '- old line',
      '+ new line',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('trivial')
  })

  test('single file tiny diff (<=10 lines) returns trivial', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,5 +1,5 @@',
      '-line1',
      '-line2',
      '+line1a',
      '+line2a',
      '+line3',
      '+line4',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('trivial')
  })

  test('single file medium diff (11-50 lines) returns simple', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,5 +1,30 @@',
      '-old',
      ...Array.from({ length: 19 }, (_, i) => `+new line ${i}`),
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('simple')
  })

  test('two-file simple diff returns simple', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,4 @@',
      '-x',
      '+a1',
      '+a2',
      '+a3',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,2 +1,4 @@',
      '-y',
      '+b1',
      '+b2',
      '+b3',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('simple')
  })

  test('three-file diff returns complex', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,4 @@',
      '-x',
      '+a1',
      '+a2',
      '+a3',
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,2 +1,4 @@',
      '-y',
      '+b1',
      '+b2',
      '+b3',
      'diff --git a/src/c.ts b/src/c.ts',
      '--- a/src/c.ts',
      '+++ b/src/c.ts',
      '@@ -1,2 +1,4 @@',
      '-z',
      '+c1',
      '+c2',
      '+c3',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('complex')
  })

  test('50+ changed lines returns complex', () => {
    const lines: string[] = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
    ]
    for (let i = 0; i < 30; i++) {
      lines.push(`+new line ${i}`)
      lines.push(`-old line ${i}`)
    }
    expect(gradeComplexityFromDiff(lines.join('\n'))).toBe('complex')
  })

  test('exported function definition returns complex', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,2 +1,10 @@',
      '+export function newHelper() {',
      '+  const a = 1',
      '+  const b = 2',
      '+  const c = 3',
      '+  const d = 4',
      '+  const e = 5',
      '+  return a + b + c + d + e',
      '+}',
      '-old line 1',
      '-old line 2',
      '-old line 3',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('complex')
  })

  test('class definition returns complex', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,2 +1,12 @@',
      '+class NewService {',
      '+  private name: string',
      '+  private age: number',
      '+  private email: string',
      '+  constructor(name: string, age: number) {',
      '+    this.name = name',
      '+    this.age = age',
      '+    this.email = ""',
      '+  }',
      '+}',
      '-old line 1',
      '-old line 2',
      '-old line 3',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('complex')
  })

  test('doc-only files (.md) returns trivial', () => {
    const diff = [
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1,5 +1,10 @@',
      '-old text',
      '+new text',
      '+more new text',
      '+even more new text',
      '+and more',
      '+extra line',
      '+another line',
      '+yet another line',
      '+still going',
    ].join('\n')
    expect(gradeComplexityFromDiff(diff)).toBe('trivial')
  })
})
