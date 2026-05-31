import { test, expect, describe } from 'bun:test'
import { stripJsoncComments, discoverConfig } from '../../src/utils/config-loader.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

// ---------------------------------------------------------------------------
// Helper: create a temp dir, run fn, then clean up
// ---------------------------------------------------------------------------
async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-test-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// stripJsoncComments
// ---------------------------------------------------------------------------
describe('stripJsoncComments', () => {
  test('no comments — returns unchanged', () => {
    const input = '{"key": "value", "num": 42}'
    expect(stripJsoncComments(input)).toBe(input)
  })

  test('line comments (//) are removed', () => {
    const input = '{\n  // this is a comment\n  "key": "value"\n}'
    const result = stripJsoncComments(input)
    expect(result).not.toContain('//')
    expect(result).not.toContain('this is a comment')
    expect(result).toContain('"key"')
  })

  test('block comments (/* */) are removed', () => {
    const input = '{\n  /* block comment */\n  "key": "value"\n}'
    const result = stripJsoncComments(input)
    expect(result).not.toContain('/*')
    expect(result).not.toContain('block comment')
    expect(result).toContain('"key"')
  })

  test('multi-line block comments are removed', () => {
    const input = '{\n  /*\n   * multi-line\n   * comment\n   */\n  "key": 1\n}'
    const result = stripJsoncComments(input)
    expect(result).not.toContain('multi-line')
    expect(result).toContain('"key"')
  })

  test('comments inside strings are preserved', () => {
    const input = '{"url": "https://example.com", "path": "a//b"}'
    const result = stripJsoncComments(input)
    expect(result).toBe(input)
  })

  test('string with comment-like content is preserved', () => {
    const input = '{"text": "/* not a comment */"}'
    const result = stripJsoncComments(input)
    expect(result).toContain('/* not a comment */')
  })

  test('multiple comment types mixed', () => {
    const input = [
      '{',
      '  // line comment',
      '  "a": 1, /* inline block */',
      '  /*',
      '   * block',
      '   */',
      '  "b": "https://example.com"',
      '}',
    ].join('\n')

    const result = stripJsoncComments(input)
    expect(result).not.toContain('line comment')
    expect(result).not.toContain('inline block')
    expect(result).not.toContain('/*')
    expect(result).toContain('"a"')
    expect(result).toContain('"b"')
    expect(result).toContain('https://example.com')
  })

  test('line comment at end of input (no trailing newline) is removed', () => {
    const input = '{"a":1}// trailing'
    const result = stripJsoncComments(input)
    expect(result).not.toContain('trailing')
    expect(result).toContain('"a"')
  })

  test('unclosed block comment — strips to end', () => {
    const input = '{"a":1}/* never closed'
    const result = stripJsoncComments(input)
    expect(result).toBe('{"a":1}')
  })
})

// ---------------------------------------------------------------------------
// discoverConfig
// ---------------------------------------------------------------------------
describe('discoverConfig', () => {
  test('no files, no opencodeConfig → null', async () => {
    await withTempDir(async (dir) => {
      const result = await discoverConfig(dir)
      expect(result).toBeNull()
    })
  })

  test('valid openflow.json → { openflow: {...} }', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(
        path.join(dir, 'openflow.json'),
        JSON.stringify({ version: 1, features: {} }),
      )
      const result = await discoverConfig(dir)
      expect(result).not.toBeNull()
      expect(result!.openflow).toEqual({ version: 1, features: {} })
    })
  })

  test('valid openflow.jsonc → { openflow: {...} }', async () => {
    await withTempDir(async (dir) => {
      // Write openflow.jsonc WITHOUT comments (still valid JSONC)
      await fs.writeFile(
        path.join(dir, 'openflow.jsonc'),
        JSON.stringify({ version: 1 }),
      )
      const result = await discoverConfig(dir)
      expect(result).not.toBeNull()
      expect(result!.openflow).toEqual({ version: 1 })
    })
  })

  test('JSONC with comments → correctly parsed', async () => {
    await withTempDir(async (dir) => {
      const content = `{
  // OpenFlow configuration
  "version": 1,
  /* main section */
  "features": {}
}`
      await fs.writeFile(path.join(dir, 'openflow.jsonc'), content)
      const result = await discoverConfig(dir)
      expect(result).not.toBeNull()
      expect(result!.openflow).toEqual({ version: 1, features: {} })
    })
  })

  test('openflow.json takes priority over openflow.jsonc', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(
        path.join(dir, 'openflow.json'),
        JSON.stringify({ source: 'json' }),
      )
      await fs.writeFile(
        path.join(dir, 'openflow.jsonc'),
        JSON.stringify({ source: 'jsonc' }),
      )
      const result = await discoverConfig(dir)
      expect(result!.openflow).toEqual({ source: 'json' })
    })
  })

  test('invalid JSON in openflow.json → warns, returns null', async () => {
    // Capture console.warn
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]))

    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'openflow.json'), '{ invalid json }')
      const result = await discoverConfig(dir)
      expect(result).toBeNull()
    })

    console.warn = originalWarn
    expect(warnings.some(w => w.includes('Invalid openflow.json'))).toBe(true)
  })

  test('invalid JSON in openflow.json does NOT fall through to jsonc', async () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]))

    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'openflow.json'), '{ bad }')
      await fs.writeFile(
        path.join(dir, 'openflow.jsonc'),
        JSON.stringify({ source: 'jsonc' }),
      )
      const result = await discoverConfig(dir)
      // Invalid json should NOT fall through to jsonc
      expect(result).toBeNull()
    })

    console.warn = originalWarn
  })

  test('falls back to opencodeConfig.openflow when no files exist', async () => {
    await withTempDir(async (dir) => {
      const opencodeConfig = {
        openflow: { version: 1, source: 'opencode' },
      }
      const result = await discoverConfig(dir, opencodeConfig)
      expect(result).toEqual(opencodeConfig)
    })
  })

  test('does NOT fall back to opencodeConfig when openflow.json exists', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(
        path.join(dir, 'openflow.json'),
        JSON.stringify({ source: 'file' }),
      )
      const opencodeConfig = {
        openflow: { source: 'opencode' },
      }
      const result = await discoverConfig(dir, opencodeConfig)
      expect(result!.openflow).toEqual({ source: 'file' })
    })
  })

  test('opencodeConfig without openflow field → null', async () => {
    await withTempDir(async (dir) => {
      const result = await discoverConfig(dir, { other: true })
      expect(result).toBeNull()
    })
  })
})
