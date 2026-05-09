import { describe, expect, test } from 'bun:test'
import { gradeComplexity } from '../../src/utils/harden-utils.js'

describe('gradeComplexity', () => {
  const plan = '# Plan\nSome plan content here.\n\n## Tasks\n- Task 1\n- Task 2'

  test('empty planContent returns complex', () => {
    expect(gradeComplexity('', '')).toBe('complex')
    expect(gradeComplexity('   ', '')).toBe('complex')
  })

  test('empty diff returns trivial', () => {
    expect(gradeComplexity(plan, '')).toBe('trivial')
    expect(gradeComplexity(plan, '   ')).toBe('trivial')
  })

  test('diff with 3 or fewer changed lines returns trivial', () => {
    const smallDiff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abc..def 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,3 @@',
      '- old line',
      '+ new line',
    ].join('\n')
    expect(gradeComplexity(plan, smallDiff)).toBe('trivial')
  })

  test('single file with 10 or fewer lines returns trivial', () => {
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
    expect(gradeComplexity(plan, diff)).toBe('trivial')
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
    expect(gradeComplexity(plan, diff)).toBe('trivial')
  })

  test('single file with <=50 lines and no new definitions returns simple', () => {
    const diff = [
      'diff --git a/src/utils/a.ts b/src/utils/a.ts',
      '--- a/src/utils/a.ts',
      '+++ b/src/utils/a.ts',
      '@@ -1,5 +1,30 @@',
      '-old',
      '+new line 1',
      '+new line 2',
      '+new line 3',
      '+new line 4',
      '+new line 5',
      '+new line 6',
      '+new line 7',
      '+new line 8',
      '+new line 9',
      '+new line 10',
      '+new line 11',
      '+new line 12',
      '+new line 13',
      '+new line 14',
      '+new line 15',
      '+new line 16',
      '+new line 17',
      '+new line 18',
      '+new line 19',
      '+new line 20',
    ].join('\n')
    expect(gradeComplexity(plan, diff)).toBe('simple')
  })

  test('2-3 files with fewer than 10 lines each returns simple', () => {
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
    expect(gradeComplexity(plan, diff)).toBe('simple')
  })

  test('diff with new export function definition returns complex', () => {
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
    expect(gradeComplexity(plan, diff)).toBe('complex')
  })

  test('multi-file with many lines returns complex', () => {
    const lines: string[] = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
    ]
    for (let i = 0; i < 30; i++) {
      lines.push(`+new line ${i}`)
      lines.push(`-old line ${i}`)
    }
    lines.push('')
    lines.push('diff --git a/src/b.ts b/src/b.ts')
    lines.push('--- a/src/b.ts')
    lines.push('+++ b/src/b.ts')
    for (let i = 0; i < 30; i++) {
      lines.push(`+new line ${i}`)
      lines.push(`-old line ${i}`)
    }
    expect(gradeComplexity(plan, lines.join('\n'))).toBe('complex')
  })

  test('diff with class definition returns complex', () => {
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
    expect(gradeComplexity(plan, diff)).toBe('complex')
  })
})
