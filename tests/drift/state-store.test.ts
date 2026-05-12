import { describe, expect, test, afterAll } from 'bun:test'
import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  ensureGuardianStateDir,
  readGuardianRepairs,
  appendGuardianRepair,
  writeSessionPending,
  readSessionPending,
  deleteSessionPending,
  writeFeatureGuardianState,
  readFeatureGuardianState,
  deleteFeatureGuardianState,
} from '../../src/drift/state-store.js'
import type { GuardianRepairRecord, GuardianPendingItem, GuardianJobState } from '../../src/types.js'

const TEMP_DIR = join(process.cwd(), '.test-guardian-state')

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true })
})

describe('state-store: repairs', () => {
  test('appendGuardianRepair then readGuardianRepairs round-trips correctly', async () => {
    const record1: GuardianRepairRecord = {
      timestamp: '2026-01-01T00:00:00Z',
      feature: 'test-feature',
      filePath: 'src/a.ts',
      disposition: 'auto_repaired',
      originalSegment: 'old code',
      repairedSegment: 'new code',
      reason: 'drift detected',
    }
    const record2: GuardianRepairRecord = {
      timestamp: '2026-01-02T00:00:00Z',
      feature: 'test-feature',
      filePath: 'src/b.ts',
      disposition: 'auto_repaired',
      originalSegment: 'old b',
      repairedSegment: 'new b',
      reason: 'another drift',
    }

    await appendGuardianRepair(TEMP_DIR, record1)
    await appendGuardianRepair(TEMP_DIR, record2)

    const repairs = await readGuardianRepairs(TEMP_DIR)
    expect(repairs).toHaveLength(2)
    expect(repairs[0]).toEqual(record1)
    expect(repairs[1]).toEqual(record2)
  })

  test('readGuardianRepairs on non-existent file returns empty array', async () => {
    const repairs = await readGuardianRepairs(join(TEMP_DIR, 'nonexistent'))
    expect(repairs).toEqual([])
  })

  test('multiple appendGuardianRepair calls produce valid JSONL', async () => {
    const dir = join(TEMP_DIR, 'jsonl-test')
    const records: GuardianRepairRecord[] = []
    for (let i = 0; i < 3; i++) {
      const r: GuardianRepairRecord = {
        timestamp: `2026-01-0${i + 1}T00:00:00Z`,
        feature: `feature-${i}`,
        filePath: `src/${i}.ts`,
        disposition: 'auto_repaired',
        originalSegment: `old ${i}`,
        repairedSegment: `new ${i}`,
        reason: `reason ${i}`,
      }
      records.push(r)
      await appendGuardianRepair(dir, r)
    }

    const repairs = await readGuardianRepairs(dir)
    expect(repairs).toHaveLength(3)
    for (let i = 0; i < 3; i++) {
      expect(repairs[i]).toEqual(records[i])
    }
  })
})

describe('state-store: session pending', () => {
  test('writeSessionPending then readSessionPending round-trips correctly', async () => {
    const items: GuardianPendingItem[] = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        feature: 'f1',
        filePath: 'src/a.ts',
        item: 'item1',
        disposition: 'ambiguous_needs_confirmation',
        reason: 'unclear intent',
      },
      {
        timestamp: '2026-01-02T00:00:00Z',
        feature: 'f1',
        filePath: 'src/b.ts',
        item: 'item2',
        disposition: 'violation_needs_fix',
        reason: 'breaks contract',
      },
      {
        timestamp: '2026-01-03T00:00:00Z',
        feature: 'f1',
        filePath: 'src/c.ts',
        item: 'item3',
        disposition: 'ambiguous_needs_confirmation',
        reason: 'maybe wrong',
        suggestedFix: 'change X to Y',
      },
    ]

    await writeSessionPending(TEMP_DIR, 'sess-1', items)
    const result = await readSessionPending(TEMP_DIR, 'sess-1')
    expect(result).toHaveLength(3)
    expect(result).toEqual(items)
  })

  test('readSessionPending on non-existent session returns empty array', async () => {
    const result = await readSessionPending(TEMP_DIR, 'nonexistent-session')
    expect(result).toEqual([])
  })

  test('deleteSessionPending removes file successfully', async () => {
    const items: GuardianPendingItem[] = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        feature: 'f2',
        filePath: 'src/a.ts',
        item: 'item1',
        disposition: 'ambiguous_needs_confirmation',
        reason: 'test',
      },
    ]
    await writeSessionPending(TEMP_DIR, 'sess-del', items)
    const before = await readSessionPending(TEMP_DIR, 'sess-del')
    expect(before).toHaveLength(1)

    await deleteSessionPending(TEMP_DIR, 'sess-del')
    const after = await readSessionPending(TEMP_DIR, 'sess-del')
    expect(after).toEqual([])
  })

  test('deleteSessionPending on non-existent file does NOT throw', async () => {
    await expect(deleteSessionPending(TEMP_DIR, 'no-such-session')).resolves.toBeUndefined()
  })
})

describe('state-store: feature guardian state', () => {
  const sampleState: GuardianJobState = {
    feature: 'my-feature',
    sessionId: 'sess-abc',
    startedAt: '2026-01-01T00:00:00Z',
    lastCheckedAt: '2026-01-01T01:00:00Z',
    repairsCount: 5,
    pendingCount: 2,
  }

  test('writeFeatureGuardianState then readFeatureGuardianState round-trips', async () => {
    await writeFeatureGuardianState(TEMP_DIR, 'my-feature', sampleState)
    const result = await readFeatureGuardianState(TEMP_DIR, 'my-feature')
    expect(result).toEqual(sampleState)
  })

  test('readFeatureGuardianState on non-existent feature returns null', async () => {
    const result = await readFeatureGuardianState(TEMP_DIR, 'nonexistent-feature')
    expect(result).toBeNull()
  })

  test('deleteFeatureGuardianState removes file successfully', async () => {
    await writeFeatureGuardianState(TEMP_DIR, 'to-delete', sampleState)
    const before = await readFeatureGuardianState(TEMP_DIR, 'to-delete')
    expect(before).not.toBeNull()

    await deleteFeatureGuardianState(TEMP_DIR, 'to-delete')
    const after = await readFeatureGuardianState(TEMP_DIR, 'to-delete')
    expect(after).toBeNull()
  })

  test('deleteFeatureGuardianState on non-existent file does NOT throw', async () => {
    await expect(deleteFeatureGuardianState(TEMP_DIR, 'no-such-feature')).resolves.toBeUndefined()
  })
})

describe('state-store: ensureGuardianStateDir', () => {
  test('creates the directory', async () => {
    const dir = join(TEMP_DIR, 'ensure-test')
    const result = await ensureGuardianStateDir(dir)
    const s = await stat(result)
    expect(s.isDirectory()).toBe(true)
  })
})
