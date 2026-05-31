import { createHash } from 'node:crypto'

import {
  type MessageLike,
} from './context-extraction.js'
import { saveBrainstormPacket } from './packet-save.js'

export interface BrainstormAutoSaveInput {
  projectDir: string
  sourceSessionID: string
  featureHint: string
  messages: MessageLike[]
  trigger: 'assistant-turn' | 'transition-to-feature' | 'manual'
  isBrainstormSession: boolean
  previousFingerprint?: string
  lastSaveTimestamp?: number
}

export type BrainstormAutoSaveResult =
  | { status: 'saved'; packetId: string; messageCount: number; fingerprint: string }
  | { status: 'skipped'; reason: 'not-brainstorm' | 'unchanged' | 'throttled' | 'empty' }
  | { status: 'failed'; reason: string }

const AUTO_SAVE_THROTTLE_MS = 30_000

function computeFingerprint(messages: MessageLike[]): string {
  const payload = messages
    .map((m) => `${m.role}:${m.content}`)
    .join('\n---\n')
  return createHash('sha256').update(payload).digest('hex')
}

function shouldThrottle(input: BrainstormAutoSaveInput): boolean {
  if (input.trigger !== 'assistant-turn') {
    return false
  }

  if (input.lastSaveTimestamp == null) {
    return false
  }

  return Date.now() - input.lastSaveTimestamp < AUTO_SAVE_THROTTLE_MS
}

export async function tryAutoSaveBrainstormPacket(
  input: BrainstormAutoSaveInput,
): Promise<BrainstormAutoSaveResult> {
  if (!input.isBrainstormSession) {
    return { status: 'skipped', reason: 'not-brainstorm' }
  }

  const nonEmptyMessages = input.messages.filter((m) => m.content.trim().length > 0)
  if (nonEmptyMessages.length === 0) {
    return { status: 'skipped', reason: 'empty' }
  }

  const fingerprint = computeFingerprint(nonEmptyMessages)
  if (input.previousFingerprint === fingerprint) {
    return { status: 'skipped', reason: 'unchanged' }
  }

  if (shouldThrottle(input)) {
    return { status: 'skipped', reason: 'throttled' }
  }

  const result = await saveBrainstormPacket(
    input.projectDir,
    input.messages,
    input.featureHint,
    input.sourceSessionID,
  )

  if (!result.saved) {
    return { status: 'failed', reason: result.reason }
  }

  return {
    status: 'saved',
    packetId: result.packetId,
    messageCount: result.messageCount,
    fingerprint,
  }
}
