import { extractContextFromMessages, type MessageLike } from './context-extraction.js'
import {
  generatePacketId,
  writePacket,
  type BrainstormContextPacket,
} from './context-packet.js'

// --- Result types ---

export interface SavePacketSuccess {
  saved: true
  packetId: string
  itemCount: number
}

export interface SavePacketSkipped {
  saved: false
  reason: string
}

export type SaveBrainstormPacketResult = SavePacketSuccess | SavePacketSkipped

// --- Helper ---

/**
 * Extracts context from brainstorm messages and, if the conversation is
 * a candidate (i.e. has enough stable context), writes a
 * BrainstormContextPacket to disk.
 *
 * Packet write failure does NOT throw — it is reported as
 * `{ saved: false, reason: "..." }`.
 */
export async function saveBrainstormPacket(
  projectDir: string,
  messages: MessageLike[],
  featureHint: string,
  sourceSessionID: string,
): Promise<SaveBrainstormPacketResult> {
  const { items, isCandidate } = extractContextFromMessages(messages)

  if (!isCandidate) {
    return { saved: false, reason: 'Conversation does not meet stability threshold' }
  }

  const now = new Date().toISOString()
  const packet: BrainstormContextPacket = {
    id: generatePacketId(sourceSessionID, featureHint),
    version: 1,
    featureHint,
    sourceSessionID,
    createdAt: now,
    updatedAt: now,
    items,
  }

  const writeResult = await writePacket(projectDir, packet)

  if (!writeResult.ok) {
    return { saved: false, reason: `Packet write failed: ${writeResult.error}` }
  }

  return {
    saved: true,
    packetId: packet.id,
    itemCount: items.length,
  }
}
