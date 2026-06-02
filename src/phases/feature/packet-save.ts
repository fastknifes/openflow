import type { MessageLike } from './context-extraction.js'
import {
  generatePacketId,
  writePacket,
  type BrainstormContextPacket,
} from './context-packet.js'

// --- Result types ---

export interface SavePacketSuccess {
  saved: true
  packetId: string
  messageCount: number
}

export interface SavePacketSkipped {
  saved: false
  reason: string
}

export type SaveBrainstormPacketResult = SavePacketSuccess | SavePacketSkipped

// --- Helper ---

/**
 * Saves raw brainstorm messages as a context packet.
 *
 * No extraction or stability gating — the full conversation is preserved
 * so the AI can understand the complete context during feature design.
 */
export async function saveBrainstormPacket(
  projectDir: string,
  messages: MessageLike[],
  featureHint: string,
  sourceSessionID: string,
): Promise<SaveBrainstormPacketResult> {
  const nonEmptyMessages = messages.filter((m) => m.content.trim().length > 0)
  if (nonEmptyMessages.length === 0) {
    return { saved: false, reason: 'No messages to save' }
  }

  const now = new Date().toISOString()
  const packet: BrainstormContextPacket = {
    id: generatePacketId(sourceSessionID, featureHint),
    version: 2,
    featureHint,
    sourceSessionID,
    createdAt: now,
    updatedAt: now,
    rawMessages: nonEmptyMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  }

  const writeResult = await writePacket(projectDir, packet)

  if (!writeResult.ok) {
    return { saved: false, reason: `Packet write failed: ${writeResult.error}` }
  }

  return {
    saved: true,
    packetId: packet.id,
    messageCount: nonEmptyMessages.length,
  }
}
