import type { HarvestChoice } from './harvest-choice.js'
import type { ExtractedItem, BrainstormContextPacket } from './context-packet.js'
import type { FeatureSession } from './state-machine.js'
import type { AcceptanceCriterion, Constraint, RequirementModel, Risk } from './requirement-model.js'

// --- Types ---

export interface ContextHarvestState {
  awaitingPacketId?: string
  confirmedPacketId?: string
  ignoredPacketIds: string[]
}

// --- Session application ---

/**
 * Inject harvested context into the feature session.
 *
 * For raw-message packets: the full conversation is recorded as assumptions.
 * For legacy item-based packets: items become assumptions/pending confirmations.
 */
export function applyHarvestToSession(
  session: FeatureSession,
  choice: HarvestChoice,
): FeatureSession {
  if (choice.kind === 'ignore') {
    return session
  }

  const packet = choice.candidate.packet

  // Raw-message path (v2 packets): inject full conversation as assumptions
  if (packet.rawMessages && packet.rawMessages.length > 0) {
    const conversationSummary = packet.rawMessages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n')

    return {
      ...session,
      assumptions: uniqueStrings([
        ...session.assumptions,
        `Brainstorm context (from session ${packet.sourceSessionID}):`,
        conversationSummary,
      ]),
      pendingContextHarvest: {
        ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? [],
        confirmedPacketId: packet.id,
        confirmedItems: [],
      },
    }
  }

  // Legacy item-based path
  const items = choice.editedItems ?? choice.candidate.items
  const confirmedItems = confirmSelectedItems(items)

  const isCustomEdit =
    choice.kind === 'edit' &&
    choice.editedItems !== undefined &&
    choice.editedItems.length === choice.candidate.items.length

  if (isCustomEdit) {
    return {
      ...session,
      assumptions: uniqueStrings([
        ...session.assumptions,
        `Context harvest (edited): ${choice.editNote ?? choice.candidate.packet.featureHint}`,
      ]),
      pendingContextHarvest: {
        ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? [],
        confirmedPacketId: packet.id,
        confirmedItems,
      },
    }
  }

  const newAssumptions: string[] = []
  const newPending: string[] = []

  for (const item of confirmedItems) {
    if (item.type !== 'openQuestion') {
      const line = `[${item.confidence}] ${TYPE_LABELS[item.type] ?? item.type}: ${item.content}`
      newAssumptions.push(line)
    }

    if (item.type === 'openQuestion') {
      newPending.push(formatPendingConfirmation(item))
    }
  }

  return {
    ...session,
    assumptions: uniqueStrings([...session.assumptions, ...newAssumptions]),
    pendingConfirmations: uniqueStrings([...session.pendingConfirmations, ...newPending]),
    pendingContextHarvest: {
      ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? [],
      confirmedPacketId: packet.id,
      confirmedItems,
    },
  }
}

/**
 * Inject confirmed harvest context into the requirement model.
 *
 * For raw-message packets: the conversation is added as assumptions.
 * For legacy item-based packets: items are mapped to constraints/nonGoals/etc.
 */
export function applyConfirmedHarvestToRequirementModel(
  model: RequirementModel,
  items: ExtractedItem[] | undefined,
  packet?: BrainstormContextPacket,
): RequirementModel {
  // Raw-message path (v2 packets)
  if (packet?.rawMessages && packet.rawMessages.length > 0) {
    const conversationSummary = packet.rawMessages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n')

    return {
      ...model,
      assumptions: uniqueStrings([
        ...(model.assumptions ?? []),
        `Brainstorm context (from session ${packet.sourceSessionID}):`,
        conversationSummary,
      ]),
    }
  }

  // Legacy item-based path
  const confirmedItems = selectConfirmedItems(items ?? [])
  if (confirmedItems.length === 0) {
    return model
  }

  let problemStatement = model.problemStatement
  const constraints = [...model.constraints]
  let goals = [...model.goals]
  const nonGoals = [...model.nonGoals]
  const pendingConfirmations = [...(model.pendingConfirmations ?? [])]
  const assumptions = [...(model.assumptions ?? [])]
  const risks = [...(model.risks ?? [])]
  const acceptanceCriteria = [...model.acceptanceCriteria]

  for (const item of confirmedItems) {
    switch (item.type) {
      case 'problem':
        if (!problemStatement?.trim()) {
          problemStatement = withSourceReference(item)
          // Also fix placeholder goals that were generated before harvest
          goals = goals.map(g =>
            g === `Deliver ${model.feature}` ? withSourceReference(item) : g
          )
        }
        break
      case 'constraint':
        constraints.push(createHarvestConstraint(item, constraints.length + 1))
        break
      case 'decision':
        constraints.push(createHarvestConstraint(item, constraints.length + 1, 'Decision from brainstorm'))
        break
      case 'nonGoal':
        nonGoals.push(withSourceReference(item))
        break
      case 'openQuestion':
        pendingConfirmations.push(formatPendingConfirmation(item))
        break
      case 'risk':
        risks.push(createHarvestRisk(item))
        break
      case 'example':
        if (isObservableExample(item.content)) {
          acceptanceCriteria.push(createHarvestAcceptanceCriterion(item, acceptanceCriteria.length + 1))
        } else {
          assumptions.push(`Evidence note from brainstorm (${formatSource(item)}): ${item.content}`)
        }
        break
    }
  }

  return {
    ...model,
    problemStatement,
    constraints: uniqueConstraints(constraints),
    nonGoals: uniqueStrings(nonGoals),
    pendingConfirmations: uniqueStrings(pendingConfirmations),
    assumptions: uniqueStrings(assumptions),
    risks: uniqueRisks(risks),
    acceptanceCriteria: uniqueAcceptanceCriteria(acceptanceCriteria),
  }
}

export function selectConfirmedItems(items: ExtractedItem[]): ExtractedItem[] {
  return items.filter(isConfirmedHarvestItem)
}

// --- Private helpers ---

const TYPE_LABELS: Record<string, string> = {
  problem: 'Problem',
  decision: 'Decisions',
  constraint: 'Constraints',
  nonGoal: 'Non-Goals',
  openQuestion: 'Open Questions',
  risk: 'Risks',
  example: 'Examples',
}

function confirmSelectedItems(items: ExtractedItem[]): ExtractedItem[] {
  return items.map((item) => {
    if (isConfirmedHarvestItem(item)) {
      return item
    }

    return {
      ...item,
      confirmedBy: 'context-harvest',
    }
  })
}

function isConfirmedHarvestItem(item: ExtractedItem): boolean {
  return item.confidence === 'high' || Boolean(item.confirmedBy?.trim())
}

function createHarvestConstraint(item: ExtractedItem, index: number, prefix?: string): Constraint {
  const description = prefix ? `${prefix}: ${item.content}` : item.content
  return {
    id: `harvest-c-${String(index).padStart(4, '0')}`,
    category: 'scope',
    severity: item.confidence === 'high' ? 'must' : 'should',
    description: withSourceReference({ ...item, content: description }),
    rationale: `Preserved from confirmed brainstorm context (${formatSource(item)})`,
    verificationMethod: 'Review generated design and implementation plan against the original brainstorm context',
    sourceQuestionId: 'constraints',
  }
}

function createHarvestRisk(item: ExtractedItem): Risk {
  return {
    description: withSourceReference(item),
    mitigation: 'Confirm mitigation during design review and verify with targeted implementation evidence',
  }
}

function createHarvestAcceptanceCriterion(item: ExtractedItem, index: number): AcceptanceCriterion {
  return {
    id: `harvest-ac-${String(index).padStart(4, '0')}`,
    description: withSourceReference(item),
    category: 'example',
  }
}

function formatPendingConfirmation(item: ExtractedItem): string {
  return `Open question from brainstorm (${formatSource(item)}): ${item.content}`
}

function withSourceReference(item: ExtractedItem): string {
  return `${item.content} (source: ${formatSource(item)})`
}

function formatSource(item: ExtractedItem): string {
  const confirmed = item.confirmedBy ? `, confirmed by ${item.confirmedBy}` : ''
  return `${item.source}, ${item.confidence} confidence${confirmed}`
}

function isObservableExample(content: string): boolean {
  return /\b(user|caller|system|assistant|command|request|response|shows?|returns?|generates?|creates?|updates?|fails?|blocks?|prevents?|displays?|observes?)\b/iu.test(content)
}

function uniqueConstraints(constraints: Constraint[]): Constraint[] {
  const seen = new Set<string>()
  return constraints.filter((constraint) => {
    const key = constraint.description.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniqueRisks(risks: Risk[]): Risk[] {
  const seen = new Set<string>()
  return risks.filter((risk) => {
    const key = risk.description.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniqueAcceptanceCriteria(criteria: AcceptanceCriterion[]): AcceptanceCriterion[] {
  const seen = new Set<string>()
  return criteria.filter((criterion) => {
    const key = criterion.description.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
}
