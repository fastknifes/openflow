import { test, expect, describe } from 'bun:test'
import { extractTargetPaths, detectConstraintLine, walkMarkdownFiles } from '../../src/contracts/constraint-scanner.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

// ── Helpers ──

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-test-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

// ── extractTargetPaths ──

describe('extractTargetPaths', () => {
  test('extracts backtick-enclosed src/ path', () => {
    expect(extractTargetPaths('this applies to `src/foo.ts`')).toEqual(['src/foo.ts'])
  })

  test('extracts backtick-enclosed tests/ path', () => {
    expect(extractTargetPaths('see `tests/bar.ts` for details')).toEqual(['tests/bar.ts'])
  })

  test('extracts backtick-enclosed docs/ path', () => {
    expect(extractTargetPaths('documented in `docs/baz.md`')).toEqual(['docs/baz.md'])
  })

  test('extracts plain (non-backtick) path', () => {
    expect(extractTargetPaths('modify src/foo.ts directly')).toEqual(['src/foo.ts'])
  })

  test('returns empty array when no matching paths', () => {
    expect(extractTargetPaths('nothing relevant here')).toEqual([])
  })

  test('extracts multiple paths from one line', () => {
    const result = extractTargetPaths('change `src/a.ts` and `tests/b.ts`')
    expect(result).toContain('src/a.ts')
    expect(result).toContain('tests/b.ts')
    expect(result.length).toBe(2)
  })

  test('prefers backtick-enclosed paths over plain', () => {
    // Both backtick and plain match the same path — no duplicate
    const result = extractTargetPaths('see `src/foo.ts` and src/foo.ts again')
    expect(result).toEqual(['src/foo.ts'])
  })

  test('does not match paths outside known prefixes', () => {
    expect(extractTargetPaths('see `lib/utils.ts`')).toEqual([])
  })

  test('handles nested paths', () => {
    expect(extractTargetPaths('modify `src/components/Button.tsx`')).toEqual(['src/components/Button.tsx'])
  })
})

// ── detectConstraintLine ──

describe('detectConstraintLine', () => {
  test('returns "blocking" for "locked"', () => {
    expect(detectConstraintLine('this file is locked')).toBe('blocking')
  })

  test('returns "blocking" for "@stable"', () => {
    expect(detectConstraintLine('this is @stable API')).toBe('blocking')
  })

  test('returns "blocking" for "@public"', () => {
    expect(detectConstraintLine('this is a @public interface')).toBe('blocking')
  })

  test('returns "blocking" for "must not change"', () => {
    expect(detectConstraintLine('this must not change')).toBe('blocking')
  })

  test('returns "warning" for "forbidden dependency"', () => {
    expect(detectConstraintLine('this is a forbidden dependency')).toBe('warning')
  })

  test('returns false for normal line', () => {
    expect(detectConstraintLine('just a normal comment')).toBe(false)
  })

  test('case insensitive for locked', () => {
    expect(detectConstraintLine('this is LOCKED')).toBe('blocking')
  })

  test('case insensitive for must not change', () => {
    expect(detectConstraintLine('MUST NOT CHANGE this')).toBe('blocking')
  })

  test('case insensitive for forbidden dependency', () => {
    expect(detectConstraintLine('FORBIDDEN DEPENDENCY here')).toBe('warning')
  })

  test('returns blocking for i18n keyword "禁止修改" (zh-CN default)', () => {
    // Default locale is zh-CN; 禁止修改 is in blockingKeywords
    expect(detectConstraintLine('此文件禁止修改')).toBe('blocking')
  })

  test('returns warning for i18n keyword "禁止依赖" (zh-CN default)', () => {
    expect(detectConstraintLine('这是一个禁止依赖')).toBe('warning')
  })
})

// ── walkMarkdownFiles ──

describe('walkMarkdownFiles', () => {
  test('returns empty array for empty directory', async () => {
    await withTempDir(async (dir) => {
      const files = await walkMarkdownFiles(dir)
      expect(files).toEqual([])
    })
  })

  test('returns full paths for .md files in directory', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'a.md'), '# Hello')
      await fs.writeFile(path.join(dir, 'b.md'), '# World')
      const files = await walkMarkdownFiles(dir)
      expect(files.length).toBe(2)
      expect(files.every(f => f.endsWith('.md'))).toBe(true)
      expect(files.every(f => path.isAbsolute(f))).toBe(true)
    })
  })

  test('recursively finds .md files in nested directories', async () => {
    await withTempDir(async (dir) => {
      const sub = path.join(dir, 'sub')
      await fs.mkdir(sub)
      await fs.writeFile(path.join(dir, 'root.md'), '# Root')
      await fs.writeFile(path.join(sub, 'nested.md'), '# Nested')
      const files = await walkMarkdownFiles(dir)
      expect(files.length).toBe(2)
      const names = files.map(f => path.basename(f))
      expect(names).toContain('root.md')
      expect(names).toContain('nested.md')
    })
  })

  test('excludes non-.md files', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'readme.md'), '# Hello')
      await fs.writeFile(path.join(dir, 'script.ts'), 'console.log(1)')
      await fs.writeFile(path.join(dir, 'data.json'), '{}')
      const files = await walkMarkdownFiles(dir)
      expect(files.length).toBe(1)
      expect(files[0]).toContain('readme.md')
    })
  })

  test('returns empty array for non-existent directory', async () => {
    const files = await walkMarkdownFiles('/non/existent/path/openflow-test-fake')
    expect(files).toEqual([])
  })
})
