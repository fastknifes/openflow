import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  saveBrainstormPacket,
  type SaveBrainstormPacketResult,
} from '../../../src/phases/feature/brainstorm-packet-save.js'
import { readPacket } from '../../../src/phases/feature/context-packet.js'
import type { MessageLike } from '../../../src/phases/feature/context-extraction.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), '.test-brainstorm-save-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// --- Helpers ---

function userMsg(content: string): MessageLike {
  return { role: 'user', content }
}

function assistantMsg(content: string): MessageLike {
  return { role: 'assistant', content }
}

// A conversation that meets the stability threshold:
// includes at least one problem statement.
function stableConversation(): MessageLike[] {
  return [
    userMsg('We need to solve the user authentication bottleneck'),
    assistantMsg('The problem is that the current auth flow takes 5 seconds for each request'),
    userMsg("Let's go with JWT tokens for the solution"),
    assistantMsg('I recommend using JWT with RS256 signing'),
    userMsg('ok'),
    userMsg('Must support at least 1000 concurrent logins'),
  ]
}

// A conversation that does NOT meet the stability threshold:
// only acknowledgements or speculative remarks.
function insufficientConversation(): MessageLike[] {
  return [
    userMsg('ok'),
    assistantMsg('sure'),
  ]
}

// --- Tests ---

describe('saveBrainstormPacket', () => {
  test('saves a packet when conversation meets stability threshold', async () => {
    const messages = stableConversation()
    const result = await saveBrainstormPacket(
      tmpDir,
      messages,
      'auth-perf',
      'ses_test123',
    )

    expect(result.saved).toBe(true)
    if (result.saved) {
      expect(result.packetId).toBe('ses_test123-auth-perf')
      expect(result.itemCount).toBeGreaterThan(0)
    }
  })

  test('written packet is readable and contains extracted items', async () => {
    const messages = stableConversation()
    const result = await saveBrainstormPacket(
      tmpDir,
      messages,
      'auth-perf',
      'ses_readback',
    )

    expect(result.saved).toBe(true)

    const readResult = await readPacket(tmpDir, 'ses_readback-auth-perf')
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      expect(readResult.packet.featureHint).toBe('auth-perf')
      expect(readResult.packet.sourceSessionID).toBe('ses_readback')
      expect(readResult.packet.items).toBeDefined()
      expect(readResult.packet.items!.length).toBeGreaterThan(0)
    }
  })

  test('returns skipped result when conversation does not meet stability threshold', async () => {
    const messages = insufficientConversation()
    const result = await saveBrainstormPacket(
      tmpDir,
      messages,
      'no-context',
      'ses_skip',
    )

    expect(result.saved).toBe(false)
    if (!result.saved) {
      expect(result.reason).toContain('stability threshold')
    }
  })

  test('returns skipped result for empty messages array', async () => {
    const result = await saveBrainstormPacket(
      tmpDir,
      [],
      'empty',
      'ses_empty',
    )

    expect(result.saved).toBe(false)
    if (!result.saved) {
      expect(result.reason).toContain('stability threshold')
    }
  })

  test('packet write failure does not throw, returns skipped result', async () => {
    const messages = stableConversation()
    // Use an impossible path to force a write failure
    const result = await saveBrainstormPacket(
      'Z:\\nonexistent\\impossible\\path',
      messages,
      'fail-test',
      'ses_fail',
    )

    // Should not throw — must return a skipped result
    expect(result.saved).toBe(false)
    if (!result.saved) {
      expect(result.reason).toContain('Packet write failed')
    }
  })

  test('returns correct packet ID format', async () => {
    const messages = stableConversation()
    const result = await saveBrainstormPacket(
      tmpDir,
      messages,
      'My Cool Feature',
      'ses_format',
    )

    expect(result.saved).toBe(true)
    if (result.saved) {
      expect(result.packetId).toBe('ses_format-my-cool-feature')
    }
  })

  test('packet has createdAt and updatedAt timestamps', async () => {
    const messages = stableConversation()
    const before = new Date()

    const result = await saveBrainstormPacket(
      tmpDir,
      messages,
      'timestamps',
      'ses_ts',
    )

    expect(result.saved).toBe(true)

    const readResult = await readPacket(tmpDir, 'ses_ts-timestamps')
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      const createdAt = new Date(readResult.packet.createdAt)
      const updatedAt = new Date(readResult.packet.updatedAt)
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    }
  })
})
