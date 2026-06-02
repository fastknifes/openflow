import {
  listPackets,
  isStale,
  type BrainstormContextPacket,
  type ExtractedItem,
} from './context-packet.js'

// --- Types ---

export interface HarvestCandidate {
  packet: BrainstormContextPacket
  matchType: 'sessionId' | 'exact' | 'similarity'
  items: ExtractedItem[]
}

// --- Discovery ---

/**
 * Discover matching context packets for the current feature session.
 *
 * Matching priority:
 * 1. Current session ID (exact sourceSessionID match)
 * 2. Exact featureHint / slug match
 * 3. Topic similarity (simple string overlap or substring match)
 */
export async function discoverContextPackets(
  projectDir: string,
  sessionID: string | undefined,
  featureSlug: string,
  ignoredPacketIds: string[],
): Promise<HarvestCandidate[]> {
  const listResult = await listPackets(projectDir)
  if (!listResult.ok) {
    return []
  }

  const candidates: HarvestCandidate[] = []

  for (const packet of listResult.packets) {
    if (ignoredPacketIds.includes(packet.id)) {
      continue
    }
    if (isStale(packet)) {
      continue
    }

    // v2 packets with raw messages — no items needed
    if (packet.rawMessages && packet.rawMessages.length > 0) {
      // Priority 1: session ID match
      if (sessionID && packet.sourceSessionID === sessionID) {
        candidates.push({ packet, matchType: 'sessionId', items: packet.items ?? [] })
        continue
      }

      // Priority 2: exact featureHint / slug match
      const normalizedHint = normalizeForMatch(packet.featureHint)
      const normalizedSlug = normalizeForMatch(featureSlug)
      if (normalizedHint === normalizedSlug) {
        candidates.push({ packet, matchType: 'exact', items: packet.items ?? [] })
        continue
      }

      // Priority 3: topic similarity
      if (computeTopicSimilarity(featureSlug, packet.featureHint)) {
        candidates.push({ packet, matchType: 'similarity', items: packet.items ?? [] })
      }
      continue
    }

    // Legacy v1 packets with extracted items only
    const items = packet.items ?? []
    if (items.length === 0) {
      continue
    }

    // Priority 1: session ID match
    if (sessionID && packet.sourceSessionID === sessionID) {
      candidates.push({ packet, matchType: 'sessionId', items })
      continue
    }

    // Priority 2: exact featureHint / slug match
    const normalizedHint = normalizeForMatch(packet.featureHint)
    const normalizedSlug = normalizeForMatch(featureSlug)
    if (normalizedHint === normalizedSlug) {
      candidates.push({ packet, matchType: 'exact', items })
      continue
    }

    // Priority 3: topic similarity
    if (computeTopicSimilarity(featureSlug, packet.featureHint)) {
      candidates.push({ packet, matchType: 'similarity', items })
    }
  }

  // Sort by priority: sessionId > exact > similarity
  const priority = { sessionId: 0, exact: 1, similarity: 2 }
  candidates.sort((a, b) => priority[a.matchType] - priority[b.matchType])

  return candidates
}

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/[-_\s]+/g, '')
}

function computeTopicSimilarity(featureSlug: string, featureHint: string): boolean {
  const a = featureSlug.toLowerCase()
  const b = featureHint.toLowerCase()

  // Substring match in either direction
  if (a.includes(b) || b.includes(a)) {
    return true
  }

  // Word overlap with threshold
  const wordsA = new Set(a.split(/[-_\s]+/).filter((w) => w.length > 2))
  const wordsB = new Set(b.split(/[-_\s]+/).filter((w) => w.length > 2))
  const intersection = [...wordsA].filter((w) => wordsB.has(w))

  // At least 2 shared words, or all words match if short
  return intersection.length >= 2 || (intersection.length >= 1 && wordsA.size <= 2 && wordsB.size <= 2)
}

// --- Summary rendering ---

const TYPE_LABELS: Record<string, string> = {
  problem: 'Problem',
  decision: 'Decisions',
  constraint: 'Constraints',
  nonGoal: 'Non-Goals',
  openQuestion: 'Open Questions',
  risk: 'Risks',
  example: 'Examples',
}

export function renderHarvestSummary(candidate: HarvestCandidate): string {
  const { packet, matchType } = candidate
  const matchLabel =
    matchType === 'sessionId'
      ? 'Current session'
      : matchType === 'exact'
        ? 'Exact match'
        : 'Topic similarity'

  // v2 packet with raw messages
  if (packet.rawMessages && packet.rawMessages.length > 0) {
    const preview = packet.rawMessages
      .slice(0, 10)
      .map((m) => `[${m.role}]: ${m.content.slice(0, 120)}`)
      .join('\n')
    const total = packet.rawMessages.length

    return `## Context Harvest

Found brainstorm context packet: \`${packet.id}\`
- Feature hint: ${packet.featureHint}
- Match type: ${matchLabel}
- Created: ${packet.createdAt}
- Messages: ${total}

### Conversation Preview
${preview}${total > 10 ? '\n... (truncated)' : ''}

Reply **use** to inject this conversation as design context, or **ignore** to skip.`
  }

  // Legacy v1 packet with extracted items
  const items = candidate.items
  const grouped = groupItemsByType(items)
  let summary = `## Context Harvest

Found brainstorm context packet: \`${packet.id}\`
- Feature hint: ${packet.featureHint}
- Match type: ${matchLabel}
- Created: ${packet.createdAt}

`

  for (const [type, typeItems] of Object.entries(grouped)) {
    const label = TYPE_LABELS[type] ?? type
    summary += `### ${label}\n`
    for (const item of typeItems) {
      const confirmed = item.confirmedBy ? ' (confirmed)' : ''
      summary += `- [${item.confidence}] ${item.content}${confirmed}\n`
    }
    summary += '\n'
  }

  return summary.trim()
}

function groupItemsByType(items: ExtractedItem[]): Record<string, ExtractedItem[]> {
  const grouped: Record<string, ExtractedItem[]> = {}
  for (const item of items) {
    if (!grouped[item.type]) {
      grouped[item.type] = []
    }
    grouped[item.type]!.push(item)
  }
  return grouped
}

// --- Multi-candidate non-interactive summary ---

export function renderMultiCandidateSummary(candidates: HarvestCandidate[]): string {
  let summary = '## Context Harvest\n\nMultiple brainstorm context packets were found:\n\n'
  for (const c of candidates) {
    const msgCount = c.packet.rawMessages?.length ?? 0
    const itemCount = c.items.length
    const sizeLabel = msgCount > 0 ? `${msgCount} messages` : `${itemCount} items`
    summary += `- \`${c.packet.id}\` (${c.matchType}): ${c.packet.featureHint} — ${sizeLabel}\n`
  }
  summary +=
    '\nPlease reply with **use &lt;number&gt;**, **edit &lt;number&gt;**, or **ignore** to proceed.'
  return summary
}
