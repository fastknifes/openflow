import { describe, expect, test } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { stripJsoncComments, discoverConfig } from '../../src/utils/config-loader'
import { loadConfig } from '../../src/config'
import { tmpdir } from 'node:os'

describe('stripJsoncComments', () => {
  test('removes line comments', () => {
    const input = '{\n  "a": 1, // comment\n  "b": 2\n}'
    expect(stripJsoncComments(input)).toBe('{\n  "a": 1,   "b": 2\n}')
  })

  test('removes block comments', () => {
    const input = '{\n  /* block \n   comment */\n  "a": 1\n}'
    expect(stripJsoncComments(input)).toBe('{\n  \n  "a": 1\n}')
  })

  test('preserves comments inside strings', () => {
    const input = '{\n  "a": "value // not a comment"\n}'
    expect(stripJsoncComments(input)).toBe('{\n  "a": "value // not a comment"\n}')
  })

  test('handles mixed comments', () => {
    const input = `{
      // line comment
      "a": 1,
      /* block */
      "b": 2
    }`
    const result = stripJsoncComments(input)
    expect(result).not.toContain('//')
    expect(result).not.toContain('/*')
    expect(JSON.parse(result)).toEqual({ a: 1, b: 2 })
  })
})

describe('discoverConfig', () => {
  async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = path.join(tmpdir(), `openflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.mkdir(dir, { recursive: true })
    try {
      await fn(dir)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }

  test('openflow.json wins over opencode config', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'openflow.json'), JSON.stringify({ paths: { plans: '.custom/plans' } }), 'utf-8')
      const result = await discoverConfig(dir, { openflow: { paths: { plans: '.opencode/plans' } } } as Record<string, unknown>)
      expect(result).toEqual({ openflow: { paths: { plans: '.custom/plans' } } })
    })
  })

  test('openflow.jsonc wins when json is missing', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'openflow.jsonc'), `{
        // comment
        "paths": { "plans": ".jsonc/plans" }
      }`, 'utf-8')
      const result = await discoverConfig(dir, { openflow: { paths: { plans: '.opencode/plans' } } } as Record<string, unknown>)
      expect(result).toEqual({ openflow: { paths: { plans: '.jsonc/plans' } } })
    })
  })

  test('falls back to opencode config when no standalone files', async () => {
    await withTempDir(async (dir) => {
      const result = await discoverConfig(dir, { openflow: { paths: { plans: '.opencode/plans' } } } as Record<string, unknown>)
      expect(result).toEqual({ openflow: { paths: { plans: '.opencode/plans' } } })
    })
  })

  test('invalid openflow.json does not fall through', async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, 'openflow.json'), 'not-json', 'utf-8')
      const result = await discoverConfig(dir, { openflow: { paths: { plans: '.opencode/plans' } } } as Record<string, unknown>)
      expect(result).toBeNull()
    })
  })

  test('returns null when no sources exist', async () => {
    await withTempDir(async (dir) => {
      const result = await discoverConfig(dir)
      expect(result).toBeNull()
    })
  })
})

describe('legacy harden tokenBudget fields', () => {
  test('legacy tokenBudget fields are accepted but ignored', () => {
    const config = loadConfig({
      openflow: {
        harden: {
          enabled: true,
          tokenBudgetTotal: 1000,
          tokenBudgetPerRound: 200,
        },
      },
    })
    // Config should load without throwing (validation passes)
    expect(config.harden.enabled).toBe(true)
    // Legacy fields should not appear as runtime controls on the loaded config
    expect((config.harden as Record<string, unknown>).tokenBudgetTotal).toBeUndefined()
    expect((config.harden as Record<string, unknown>).tokenBudgetPerRound).toBeUndefined()
    // New field must be present with default value
    expect(config.harden.maxArgumentRoundsPerFinding).toBe(2)
  })
})
