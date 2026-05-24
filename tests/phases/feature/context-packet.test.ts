import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  BrainstormContextPacketSchema,
  ConfidenceSchema,
  ExtractedItemSchema,
  generatePacketId,
  isStale,
  readPacket,
  writePacket,
  listPackets,
  STALE_THRESHOLD_MS,
  type BrainstormContextPacket,
  type Confidence,
} from '../../../src/phases/feature/context-packet.js'

// --- Test fixtures ---

function makePacket(overrides?: Partial<BrainstormContextPacket>): BrainstormContextPacket {
  return {
    id: 'ses_abc123-my-feature',
    version: 1,
    featureHint: 'my-feature',
    sourceSessionID: 'ses_abc123',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), '.test-ctx-packet-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// --- Schema tests ---

describe('BrainstormContextPacketSchema', () => {
  test('parses a valid packet with all required fields', () => {
    const packet = makePacket()
    const result = BrainstormContextPacketSchema.safeParse(packet)
    expect(result.success).toBe(true)
  })

  test('rejects missing id', () => {
    const { id: _, ...withoutId } = makePacket()
    const result = BrainstormContextPacketSchema.safeParse(withoutId)
    expect(result.success).toBe(false)
  })

  test('rejects empty id', () => {
    const result = BrainstormContextPacketSchema.safeParse(makePacket({ id: '' }))
    expect(result.success).toBe(false)
  })

  test('rejects missing version', () => {
    const { version: _, ...withoutVersion } = makePacket()
    const result = BrainstormContextPacketSchema.safeParse(withoutVersion)
    expect(result.success).toBe(false)
  })

  test('rejects zero version', () => {
    const result = BrainstormContextPacketSchema.safeParse(makePacket({ version: 0 }))
    expect(result.success).toBe(false)
  })

  test('rejects negative version', () => {
    const result = BrainstormContextPacketSchema.safeParse(makePacket({ version: -1 }))
    expect(result.success).toBe(false)
  })

  test('rejects non-integer version', () => {
    const result = BrainstormContextPacketSchema.safeParse(makePacket({ version: 1.5 }))
    expect(result.success).toBe(false)
  })

  test('rejects missing featureHint', () => {
    const { featureHint: _, ...withoutHint } = makePacket()
    const result = BrainstormContextPacketSchema.safeParse(withoutHint)
    expect(result.success).toBe(false)
  })

  test('rejects missing sourceSessionID', () => {
    const { sourceSessionID: _, ...withoutSession } = makePacket()
    const result = BrainstormContextPacketSchema.safeParse(withoutSession)
    expect(result.success).toBe(false)
  })

  test('rejects missing createdAt', () => {
    const { createdAt: _, ...withoutCreatedAt } = makePacket()
    const result = BrainstormContextPacketSchema.safeParse(withoutCreatedAt)
    expect(result.success).toBe(false)
  })

  test('rejects invalid datetime for createdAt', () => {
    const result = BrainstormContextPacketSchema.safeParse(
      makePacket({ createdAt: 'not-a-date' })
    )
    expect(result.success).toBe(false)
  })

  test('rejects missing updatedAt', () => {
    const { updatedAt: _, ...withoutUpdatedAt } = makePacket()
    const result = BrainstormContextPacketSchema.safeParse(withoutUpdatedAt)
    expect(result.success).toBe(false)
  })
})

describe('ConfidenceSchema', () => {
  test('accepts all valid confidence levels', () => {
    for (const level of ['high', 'medium', 'low'] as const) {
      const result = ConfidenceSchema.safeParse(level)
      expect(result.success).toBe(true)
    }
  })

  test('rejects invalid confidence', () => {
    const result = ConfidenceSchema.safeParse('critical')
    expect(result.success).toBe(false)
  })
})

describe('ExtractedItemSchema', () => {
  test('parses a valid extracted item', () => {
    const result = ExtractedItemSchema.safeParse({
      type: 'constraint',
      content: 'must support 1000 concurrent users',
      confidence: 'high',
      source: 'user',
    })
    expect(result.success).toBe(true)
  })

  test('parses with optional confirmedBy', () => {
    const result = ExtractedItemSchema.safeParse({
      type: 'decision',
      content: 'use PostgreSQL',
      confidence: 'high',
      source: 'user',
      confirmedBy: 'ok',
    })
    expect(result.success).toBe(true)
  })

  test('rejects missing type', () => {
    const result = ExtractedItemSchema.safeParse({
      content: 'must support 1000 concurrent users',
      confidence: 'high',
      source: 'user',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing content', () => {
    const result = ExtractedItemSchema.safeParse({
      type: 'constraint',
      confidence: 'high',
      source: 'user',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing confidence', () => {
    const result = ExtractedItemSchema.safeParse({
      type: 'constraint',
      content: 'must support 1000 concurrent users',
      source: 'user',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing source', () => {
    const result = ExtractedItemSchema.safeParse({
      type: 'constraint',
      content: 'must support 1000 concurrent users',
      confidence: 'medium',
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid confidence value', () => {
    const result = ExtractedItemSchema.safeParse({
      type: 'constraint',
      content: 'must support 1000 concurrent users',
      confidence: 'extreme',
      source: 'user',
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid type value', () => {
    const result = ExtractedItemSchema.safeParse({
      type: 'wish',
      content: 'must support 1000 concurrent users',
      confidence: 'high',
      source: 'user',
    })
    expect(result.success).toBe(false)
  })
})

// --- generatePacketId tests ---

describe('generatePacketId', () => {
  test('combines session ID and sanitized feature hint', () => {
    const id = generatePacketId('ses_abc123', 'My Cool Feature')
    expect(id).toBe('ses_abc123-my-cool-feature')
  })

  test('sanitizes special characters in feature hint', () => {
    const id = generatePacketId('ses_xyz', 'Feature @#$ Name!')
    expect(id).toBe('ses_xyz-feature-name')
  })

  test('lowercases the feature hint', () => {
    const id = generatePacketId('ses_test', 'UPPERCASE')
    expect(id).toBe('ses_test-uppercase')
  })

  test('throws on empty feature hint', () => {
    expect(() => generatePacketId('ses_test', '')).toThrow()
  })
})

// --- isStale tests ---

describe('isStale', () => {
  test('returns false for a recent packet', () => {
    const packet = makePacket()
    expect(isStale(packet)).toBe(false)
  })

  test('returns true for a packet older than 7 days', () => {
    const oldDate = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString()
    const packet = makePacket({ updatedAt: oldDate })
    expect(isStale(packet)).toBe(true)
  })

  test('returns false for a packet exactly at the threshold', () => {
    // updatedAt equal to the threshold should NOT be stale (< threshold is stale)
    const originalNow = Date.now
    const fixedNow = new Date('2026-05-24T00:00:00.000Z').getTime()
    Date.now = () => fixedNow
    try {
      const thresholdDate = new Date(fixedNow - STALE_THRESHOLD_MS).toISOString()
      const packet = makePacket({ updatedAt: thresholdDate })
      expect(isStale(packet)).toBe(false)
    } finally {
      Date.now = originalNow
    }
  })

  test('returns true for a very old packet', () => {
    const veryOldDate = new Date('2020-01-01T00:00:00Z').toISOString()
    const packet = makePacket({ updatedAt: veryOldDate })
    expect(isStale(packet)).toBe(true)
  })
})

// --- readPacket tests ---

describe('readPacket', () => {
  test('reads a valid packet from disk', async () => {
    const packet = makePacket()
    await writePacket(tmpDir, packet)

    const result = await readPacket(tmpDir, packet.id)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.packet.id).toBe(packet.id)
      expect(result.packet.version).toBe(packet.version)
      expect(result.packet.featureHint).toBe(packet.featureHint)
      expect(result.packet.sourceSessionID).toBe(packet.sourceSessionID)
    }
  })

  test('returns skipped result for missing file', async () => {
    const result = await readPacket(tmpDir, 'nonexistent-id')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipped).toBe(true)
      expect(result.error).toBeTruthy()
    }
  })

  test('returns skipped result for malformed JSON', async () => {
    const dir = path.join(tmpDir, '.sisyphus', 'brainstorm', 'context-packets')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'bad.json'), 'not valid json{{{', 'utf-8')

    const result = await readPacket(tmpDir, 'bad')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipped).toBe(true)
    }
  })

  test('returns skipped result for invalid packet structure', async () => {
    const dir = path.join(tmpDir, '.sisyphus', 'brainstorm', 'context-packets')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'invalid.json'),
      JSON.stringify({ id: 'only-id' }),
      'utf-8'
    )

    const result = await readPacket(tmpDir, 'invalid')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.skipped).toBe(true)
      expect(result.error).toContain('Invalid packet format')
    }
  })
})

// --- writePacket tests ---

describe('writePacket', () => {
  test('writes a packet to disk and reads it back', async () => {
    const packet = makePacket()
    const writeResult = await writePacket(tmpDir, packet)
    expect(writeResult.ok).toBe(true)

    const readResult = await readPacket(tmpDir, packet.id)
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      expect(readResult.packet).toEqual(packet)
    }
  })

  test('creates directory structure if missing', async () => {
    const packet = makePacket()
    const writeResult = await writePacket(tmpDir, packet)
    expect(writeResult.ok).toBe(true)

    const packetPath = path.join(
      tmpDir,
      '.sisyphus',
      'brainstorm',
      'context-packets',
      `${packet.id}.json`
    )
    const stat = await fs.stat(packetPath)
    expect(stat.isFile()).toBe(true)
  })

  test('overwrites existing packet', async () => {
    const packet = makePacket()
    await writePacket(tmpDir, packet)

    const updated = makePacket({ ...packet, version: 2 })
    const writeResult = await writePacket(tmpDir, updated)
    expect(writeResult.ok).toBe(true)

    const readResult = await readPacket(tmpDir, packet.id)
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      expect(readResult.packet.version).toBe(2)
    }
  })

  test('returns failure for write errors', async () => {
    const packet = makePacket()
    // Use a non-existent drive on Windows or an impossible path
    const result = await writePacket('Z:\\nonexistent\\drive\\path', packet)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })
})

// --- listPackets tests ---

describe('listPackets', () => {
  test('returns empty list when no packets exist', async () => {
    const result = await listPackets(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.packets).toHaveLength(0)
      expect(result.errors).toHaveLength(0)
    }
  })

  test('lists all valid packets', async () => {
    const packet1 = makePacket({ id: 'ses_a-feature-a', featureHint: 'feature-a' })
    const packet2 = makePacket({ id: 'ses_b-feature-b', featureHint: 'feature-b' })
    await writePacket(tmpDir, packet1)
    await writePacket(tmpDir, packet2)

    const result = await listPackets(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.packets).toHaveLength(2)
      const ids = result.packets.map((p) => p.id)
      expect(ids).toContain('ses_a-feature-a')
      expect(ids).toContain('ses_b-feature-b')
    }
  })

  test('collects errors for malformed packets alongside valid ones', async () => {
    const validPacket = makePacket({ id: 'ses_valid-ok', featureHint: 'ok' })
    await writePacket(tmpDir, validPacket)

    const dir = path.join(tmpDir, '.sisyphus', 'brainstorm', 'context-packets')
    await fs.writeFile(
      path.join(dir, 'broken.json'),
      'not-json',
      'utf-8'
    )

    const result = await listPackets(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.packets).toHaveLength(1)
      expect(result.errors).toHaveLength(1)
    }
  })

  test('creates directory if missing', async () => {
    const result = await listPackets(tmpDir)
    expect(result.ok).toBe(true)

    const stat = await fs.stat(path.join(tmpDir, '.sisyphus', 'brainstorm', 'context-packets'))
    expect(stat.isDirectory()).toBe(true)
  })
})

// --- Type export verification ---

describe('type exports', () => {
  test('Confidence type narrows correctly', () => {
    const confidence: Confidence = 'high'
    const parsed = ConfidenceSchema.parse(confidence)
    expect(parsed).toBe('high')
  })

  test('BrainstormContextPacket type works as return type', () => {
    const packet: BrainstormContextPacket = makePacket()
    expect(typeof packet.id).toBe('string')
    expect(typeof packet.version).toBe('number')
    expect(typeof packet.featureHint).toBe('string')
    expect(typeof packet.sourceSessionID).toBe('string')
    expect(typeof packet.createdAt).toBe('string')
    expect(typeof packet.updatedAt).toBe('string')
  })
})
