import type {
  RequirementEvidence,
  EvidenceItem,
  EvidenceType,
  EvidenceConfidence,
} from './requirement-evidence.js'
import { nextEvidenceId } from './requirement-evidence.js'
import type { FeatureSession } from './state-machine.js'
import type { BrainstormContextPacket, ExtractedItem } from './context-packet.js'

/**
 * Normalize all sources of design information into structured evidence.
 *
 * Sources:
 * - FeatureSession.collectedFacts
 * - FeatureSession.assumptions (brainstorm harvest)
 * - BrainstormContextPacket.items (v1 legacy)
 * - BrainstormContextPacket.rawMessages (v2)
 * - AI-injected `_` prefixed facts
 */
export function normalizeEvidence(
  session: FeatureSession,
  packets: BrainstormContextPacket[] = [],
): RequirementEvidence {
  const evidence: RequirementEvidence = {
    feature: session.feature,
    sourceIntent: session.sourceIntent,
    problems: [],
    goals: [],
    decisions: [],
    constraints: [],
    nonGoals: [],
    examples: [],
    risks: [],
    openQuestions: [],
    architectureNotes: [],
    integrationNotes: [],
    dataContractNotes: [],
    rawSources: [],
  }

  // 1. Normalize collected facts
  normalizeFacts(session.collectedFacts, evidence)

  // 2. Normalize assumptions (harvested brainstorm items formatted as strings)
  for (const assumption of session.assumptions) {
    normalizeAssumption(assumption, evidence)
  }

  // 3. Normalize brainstorm packets
  for (const packet of packets) {
    normalizePacket(packet, evidence)
  }

  // 4. Normalize AI-injected `_` facts
  normalizeInjectedFacts(session.collectedFacts, evidence)

  return evidence
}

// --- Fact Normalization ---

function normalizeFacts(facts: Record<string, string>, evidence: RequirementEvidence): void {
  for (const [key, value] of Object.entries(facts)) {
    if (key.startsWith('_')) continue
    if (!value.trim()) continue

    const id = nextEvidenceId('fact')

    if (key === 'problem') {
      evidence.problems.push(createEvidenceItem(id, 'problem', value, 'feature-fact', 'high'))
      continue
    }

    if (key === 'goal' || key === 'goals') {
      evidence.goals.push(createEvidenceItem(id, 'goal', value, 'feature-fact', 'high'))
      continue
    }

    if (/non[-_]?goal/i.test(key)) {
      evidence.nonGoals.push(createEvidenceItem(id, 'nonGoal', value, 'feature-fact', 'high'))
      continue
    }

    if (/risk/i.test(key)) {
      evidence.risks.push(createEvidenceItem(id, 'risk', value, 'feature-fact', 'medium'))
      continue
    }

    if (/example|scenario|test/i.test(key)) {
      evidence.examples.push(createEvidenceItem(id, 'example', value, 'feature-fact', 'high'))
      continue
    }

    if (isIsolationOrSafetyFact(key, value)) {
      evidence.constraints.push(createEvidenceItem(id, 'constraint', value, 'feature-fact', 'high'))
      continue
    }

    if (isExecutionSafetyFact(key, value)) {
      evidence.constraints.push(createEvidenceItem(id, 'constraint', value, 'feature-fact', 'high'))
      continue
    }

    // Default: treat as constraint or decision
    if (value.length > 100) {
      evidence.decisions.push(createEvidenceItem(id, 'decision', value, 'feature-fact', 'high'))
    } else {
      evidence.constraints.push(createEvidenceItem(id, 'constraint', value, 'feature-fact', 'high'))
    }
  }
}

function isIsolationOrSafetyFact(key: string, value: string): boolean {
  const haystack = `${key} ${value}`
  return /(?:isolation|隔离|lock|锁|namespace|命名空间|dag\s*id|DAG ID|session.*state|状态.*隔离|互不可见|不跨|not.*shared|not.*cross)/iu.test(haystack)
}

function isExecutionSafetyFact(key: string, value: string): boolean {
  const haystack = `${key} ${value}`
  return /(?:safety|guard|guardrail|confirmation|确认|安全|dry[_-]?run|sandbox|风险评估|用户确认|主动触发|不会.*自动|not.*automatic|manual.*approval)/iu.test(haystack)
}

// --- Assumption Normalization ---

function normalizeAssumption(assumption: string, evidence: RequirementEvidence): void {
  const id = nextEvidenceId('asm')

  // Parse formatted assumptions like "[high] Decisions: ..." or "[high] Constraints: ..."
  const parsed = parseFormattedAssumption(assumption)
  if (parsed) {
    ;(evidence[parsed.category] as EvidenceItem[]).push(
      createEvidenceItem(id, parsed.type, parsed.content, 'brainstorm-packet-v1', parsed.confidence),
    )
    return
  }

  // Unformatted assumption — store as raw source
  evidence.rawSources.push({
    type: 'assumption',
    content: assumption,
  })
}

function parseFormattedAssumption(assumption: string): {
  type: EvidenceType
  category: keyof RequirementEvidence
  content: string
  confidence: EvidenceConfidence
} | null {
  const match = assumption.match(/^\[(\w+)\]\s+([^:]+):\s+(.+)$/u)
  if (!match || !match[1] || !match[2] || !match[3]) return null

  const confidence = (match[1].toLowerCase() as EvidenceConfidence)
  const label = match[2].toLowerCase()
  const content = match[3].trim()

  const typeMap: Record<string, { type: EvidenceType; category: keyof RequirementEvidence }> = {
    problem: { type: 'problem', category: 'problems' },
    decisions: { type: 'decision', category: 'decisions' },
    constraints: { type: 'constraint', category: 'constraints' },
    'non-goals': { type: 'nonGoal', category: 'nonGoals' },
    risks: { type: 'risk', category: 'risks' },
    examples: { type: 'example', category: 'examples' },
    'open questions': { type: 'openQuestion', category: 'openQuestions' },
  }

  const mapped = typeMap[label]
  if (!mapped) return null

  return {
    type: mapped.type,
    category: mapped.category,
    content,
    confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : 'medium',
  }
}

// --- Packet Normalization ---

function normalizePacket(packet: BrainstormContextPacket, evidence: RequirementEvidence): void {
  // V2 raw messages
  if (packet.rawMessages && packet.rawMessages.length > 0) {
    for (const msg of packet.rawMessages) {
      evidence.rawSources.push({
        type: 'raw-message',
        content: `[${msg.role}]: ${msg.content}`,
        timestamp: packet.createdAt,
      })
    }
  }

  // V1 extracted items
  if (packet.items) {
    for (const item of packet.items) {
      normalizeExtractedItem(item, evidence)
    }
  }
}

function normalizeExtractedItem(item: ExtractedItem, evidence: RequirementEvidence): void {
  const id = nextEvidenceId('pkt')
  const confidence = item.confidence
  const source = item.confirmedBy ? 'brainstorm-packet-v1' : 'brainstorm-packet-v1'

  const typeMap: Record<string, EvidenceType> = {
    problem: 'problem',
    decision: 'decision',
    constraint: 'constraint',
    nonGoal: 'nonGoal',
    openQuestion: 'openQuestion',
    risk: 'risk',
    example: 'example',
  }

  const type = typeMap[item.type]
  if (!type) return

  const categoryMap: Record<EvidenceType, keyof RequirementEvidence> = {
    problem: 'problems',
    goal: 'goals',
    decision: 'decisions',
    constraint: 'constraints',
    nonGoal: 'nonGoals',
    example: 'examples',
    risk: 'risks',
    openQuestion: 'openQuestions',
    architecture: 'architectureNotes',
    integration: 'integrationNotes',
    dataContract: 'dataContractNotes',
  }

  const category = categoryMap[type]
  const evidenceItem = createEvidenceItem(id, type, item.content, source, confidence)
  if (item.confirmedBy) {
    evidenceItem.confirmedBy = item.confirmedBy
  }

  ;(evidence[category] as EvidenceItem[]).push(evidenceItem)
}

// --- Injected Facts Normalization ---

function normalizeInjectedFacts(
  facts: Record<string, string>,
  evidence: RequirementEvidence,
): void {
  // _constraints, _goals, _nonGoals, _acceptanceCriteria
  if (facts._goals) {
    try {
      const goals: string[] = JSON.parse(facts._goals)
      for (const g of goals) {
        evidence.goals.push(createEvidenceItem(nextEvidenceId('inj'), 'goal', g, 'ai-injected', 'high'))
      }
    } catch { /* ignore invalid JSON */ }
  }

  if (facts._nonGoals) {
    try {
      const ngs: string[] = JSON.parse(facts._nonGoals)
      for (const ng of ngs) {
        evidence.nonGoals.push(createEvidenceItem(nextEvidenceId('inj'), 'nonGoal', ng, 'ai-injected', 'high'))
      }
    } catch { /* ignore invalid JSON */ }
  }
}

// --- Helpers ---

function createEvidenceItem(
  id: string,
  type: EvidenceType,
  content: string,
  source: EvidenceItem['source'],
  confidence: EvidenceConfidence,
): EvidenceItem {
  return {
    id,
    type,
    content: content.trim(),
    source,
    confidence,
  }
}
