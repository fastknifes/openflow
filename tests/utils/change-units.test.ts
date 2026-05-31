import { test, expect, describe } from 'bun:test'
import {
  ensureChangeUnitDir,
  resolveChangeUnitDir,
  ensureArchiveUnitDir,
  resolveArchiveUnitDir,
} from '../../src/utils/change-units.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

const TEST_INDEX_PATH = '.openflow/change-units.json'
const TEST_CHANGES_DIR = 'docs/changes'

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-test-'))
  try {
    await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

function readIndex(dir: string) {
  return fs.readFile(path.join(dir, TEST_INDEX_PATH), 'utf-8').then(JSON.parse)
}

describe('ensureChangeUnitDir', () => {
  test('creates change-units.json if not exists', async () => {
    await withTempDir(async (dir) => {
      const result = await ensureChangeUnitDir(dir, 'my-feature', TEST_INDEX_PATH)
      const indexPath = path.join(dir, TEST_INDEX_PATH)
      const stat = await fs.stat(indexPath)
      expect(stat.isFile()).toBe(true)
      const index = await readIndex(dir)
      expect(index.version).toBe(1)
      expect(index.byFeature['my-feature'].changeDir).toBe(result)
    })
  })

  test('returns date-prefixed dir name (YYYY-MM-DD-feature)', async () => {
    await withTempDir(async (dir) => {
      const result = await ensureChangeUnitDir(dir, 'cool-feature', TEST_INDEX_PATH)
      // Should match YYYY-MM-DD-cool-feature pattern
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-cool-feature$/)
    })
  })

  test('same feature called twice returns same dir name', async () => {
    await withTempDir(async (dir) => {
      const first = await ensureChangeUnitDir(dir, 'same-feature', TEST_INDEX_PATH)
      const second = await ensureChangeUnitDir(dir, 'same-feature', TEST_INDEX_PATH)
      expect(first).toBe(second)
    })
  })

  test('different features return different dir names', async () => {
    await withTempDir(async (dir) => {
      const a = await ensureChangeUnitDir(dir, 'feature-alpha', TEST_INDEX_PATH)
      const b = await ensureChangeUnitDir(dir, 'feature-beta', TEST_INDEX_PATH)
      expect(a).not.toBe(b)
      expect(a).toContain('feature-alpha')
      expect(b).toContain('feature-beta')
    })
  })
})

describe('resolveChangeUnitDir', () => {
  test('returns mapped dir when index has mapping and directory exists on disk', async () => {
    await withTempDir(async (dir) => {
      // First ensure a mapping exists
      const changeDir = await ensureChangeUnitDir(dir, 'mapped-feature', TEST_INDEX_PATH)
      // Create the actual directory on disk
      await fs.mkdir(path.join(dir, TEST_CHANGES_DIR, changeDir), { recursive: true })

      const resolved = await resolveChangeUnitDir(dir, 'mapped-feature', TEST_CHANGES_DIR, TEST_INDEX_PATH)
      expect(resolved).toBe(changeDir)
    })
  })

  test('returns sanitized feature name when no mapping and no directory on disk', async () => {
    await withTempDir(async (dir) => {
      const resolved = await resolveChangeUnitDir(dir, 'My Cool Feature', TEST_CHANGES_DIR, TEST_INDEX_PATH)
      // Should be sanitized: lowercase, hyphens
      expect(resolved).toBe('my-cool-feature')
    })
  })

  test('feature name is sanitized (lowercase, hyphens)', async () => {
    await withTempDir(async (dir) => {
      const resolved = await resolveChangeUnitDir(dir, 'UPPER CASE Name', TEST_CHANGES_DIR, TEST_INDEX_PATH)
      expect(resolved).toBe('upper-case-name')
    })
  })

  test('discovers existing dated directory on disk', async () => {
    await withTempDir(async (dir) => {
      const datedDir = '2025-01-15-experiment'
      await fs.mkdir(path.join(dir, TEST_CHANGES_DIR, datedDir), { recursive: true })

      const resolved = await resolveChangeUnitDir(dir, 'experiment', TEST_CHANGES_DIR, TEST_INDEX_PATH)
      expect(resolved).toBe(datedDir)
    })
  })
})

describe('ensureArchiveUnitDir', () => {
  test('creates archive dir mapping in index', async () => {
    await withTempDir(async (dir) => {
      const result = await ensureArchiveUnitDir(dir, 'arch-feature', TEST_INDEX_PATH)
      const index = await readIndex(dir)
      expect(index.byFeature['arch-feature'].archiveDir).toBe(result)
    })
  })

  test('reuses existing archive dir on second call', async () => {
    await withTempDir(async (dir) => {
      const first = await ensureArchiveUnitDir(dir, 'reuse-feature', TEST_INDEX_PATH)
      const second = await ensureArchiveUnitDir(dir, 'reuse-feature', TEST_INDEX_PATH)
      expect(first).toBe(second)
    })
  })

  test('defaults to changeDir if no archive dir set', async () => {
    await withTempDir(async (dir) => {
      // First set up a change unit dir
      const changeDir = await ensureChangeUnitDir(dir, 'fallback-feature', TEST_INDEX_PATH)
      // Now ensure archive unit dir — should default to changeDir
      const archiveDir = await ensureArchiveUnitDir(dir, 'fallback-feature', TEST_INDEX_PATH)
      expect(archiveDir).toBe(changeDir)
    })
  })
})

describe('resolveArchiveUnitDir', () => {
  test('returns archiveDir if set', async () => {
    await withTempDir(async (dir) => {
      // Set up with explicit archive dir
      await ensureArchiveUnitDir(dir, 'explicit-archive', TEST_INDEX_PATH)
      const index = await readIndex(dir)
      const archiveDir = index.byFeature['explicit-archive'].archiveDir

      const resolved = await resolveArchiveUnitDir(dir, 'explicit-archive', TEST_INDEX_PATH)
      expect(resolved).toBe(archiveDir)
    })
  })

  test('falls back to changeDir when no archiveDir', async () => {
    await withTempDir(async (dir) => {
      // Set up a change unit (which sets changeDir but no archiveDir)
      const changeDir = await ensureChangeUnitDir(dir, 'no-archive', TEST_INDEX_PATH)
      const resolved = await resolveArchiveUnitDir(dir, 'no-archive', TEST_INDEX_PATH)
      expect(resolved).toBe(changeDir)
    })
  })

  test('falls back to sanitized feature name when no entry exists', async () => {
    await withTempDir(async (dir) => {
      const resolved = await resolveArchiveUnitDir(dir, 'Brand New Feature', TEST_INDEX_PATH)
      expect(resolved).toBe('brand-new-feature')
    })
  })
})
