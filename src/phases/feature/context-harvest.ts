import {
  listPackets,
  isStale,
  type BrainstormContextPacket,
  type ExtractedItem,
} from './context-packet.js'
import {
  askGuardedQuestion,
  hasAskQuestion,
  type QuestionToolContext,
} from '../../utils/question-guard.js'
import type { FeatureSession } from './state-machine.js'
import type { AcceptanceCriterion, Constraint, RequirementModel, Risk } from './requirement-model.js'

// --- Types ---

export interface HarvestCandidate {
  packet: BrainstormContextPacket
  matchType: 'sessionId' | 'exact' | 'similarity'
  items: ExtractedItem[]
}

export interface HarvestChoice {
  kind: 'use' | 'ignore' | 'edit'
  candidate: HarvestCandidate
  editedItems?: ExtractedItem[] | undefined
  editNote?: string | undefined
}

export interface ContextHarvestState {
  awaitingPacketId?: string
  confirmedPacketId?: string
  ignoredPacketIds: string[]
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
  const { packet, matchType, items } = candidate
  const matchLabel =
    matchType === 'sessionId'
      ? 'Current session'
      : matchType === 'exact'
        ? 'Exact match'
        : 'Topic similarity'

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

// --- Interactive choice ---

/**
 * Ask the user (via askGuardedQuestion) what to do with discovered packets.
 *
 * Returns a HarvestChoice on resolution, or `undefined` when the user
 * cancelled / the tool failed / non-interactive without confirmation.
 */
export async function resolveHarvestChoice(
  toolContext: unknown,
  candidates: HarvestCandidate[],
): Promise<HarvestChoice | undefined> {
  if (candidates.length === 0) {
    return undefined
  }

  if (!hasAskQuestion(toolContext)) {
    return undefined
  }

  const ctx = toolContext as QuestionToolContext

  // Step 1: if multiple candidates, ask which one
  let selected = candidates[0]!
  if (candidates.length > 1) {
    const selectResult = await askGuardedQuestion(
      ctx,
      {
        id: 'context-harvest-select',
        header: 'Multiple Context Packets Found',
        question: 'Which brainstorm context packet should be used?',
        options: [
          ...candidates.map((c, i) => ({
            label: `${i + 1}. ${c.packet.featureHint}`,
            description: `${c.matchType} — ${c.items.length} items`,
          })),
          { label: 'Ignore all', description: 'Do not use any packet this session' },
        ],
        multiple: false,
        custom: false,
      },
    )

    const answer = selectResult.answer
    if (answer === 'Ignore all') {
      return { kind: 'ignore', candidate: candidates[0]! }
    }

    const index = candidates.findIndex((c, i) => answer === `${i + 1}. ${c.packet.featureHint}`)
    if (index >= 0) {
      selected = candidates[index]!
    } else {
      // Unrecognised answer → treat as cancellation / fallback
      return undefined
    }
  }

  // Step 2: ask what to do with the selected packet
  const actionResult = await askGuardedQuestion(
    ctx,
    {
      id: 'context-harvest-action',
      header: 'Context Harvest',
      question: `How would you like to use the packet "${selected.packet.featureHint}"?`,
      options: [
        { label: 'Use as-is', description: 'Inject all extracted items into the design' },
        { label: 'Ignore', description: 'Skip this packet for this session' },
        { label: 'Edit', description: 'Modify before using (reply with changes in next step)' },
      ],
      multiple: false,
      custom: true,
    },
  )

  const action = actionResult.answer?.trim()
  if (!action) {
    return undefined
  }

  if (action === 'Ignore' || /^ignore|跳过|忽略|忽略所有|skip$/iu.test(action)) {
    return { kind: 'ignore', candidate: selected }
  }

  if (action === 'Use as-is' || /^use|采用|使用|yes|y$/iu.test(action)) {
    return { kind: 'use', candidate: selected }
  }

  if (action === 'Edit' || /^edit|编辑|修改|refine$/iu.test(action)) {
    // Ask for the edited content
    const editResult = await askGuardedQuestion(
      ctx,
      {
        id: 'context-harvest-edit',
        header: 'Edit Context Harvest',
        question: 'Please provide your edited version of the harvest (or reply with item numbers to keep, e.g. "1,3,5")',
        options: [],
        multiple: false,
        custom: true,
      },
    )

    const editText = editResult.answer?.trim()
    if (!editText) {
      return undefined
    }

    // Try to parse as item numbers first
    const editedItems = parseItemSelection(editText, selected.items)
    return { kind: 'edit', candidate: selected, editedItems }
  }

  // Custom text from custom=true → treat as edited use
  const editedItems = parseItemSelection(action, selected.items)
  return { kind: 'edit', candidate: selected, editedItems }
}

/**
 * Parse a user reply like "1,3,5" into a filtered item list.
 * If the reply does not look like a selection, return all items unchanged
 * (the user's free-text becomes an assumption instead).
 */
export function parseItemSelection(text: string, items: ExtractedItem[]): ExtractedItem[] {
  const normalized = text.replace(/\s/g, '')
  if (!/^\d+(,\d+)*$/.test(normalized)) {
    // Not a numeric selection → keep all items; caller will add text as assumption
    return items
  }

  const indices = normalized
    .split(',')
    .map((n) => Number.parseInt(n, 10) - 1)
    .filter((i) => i >= 0 && i < items.length)

  if (indices.length === 0) {
    return items
  }

  return indices.map((i) => items[i]!)
}

// --- Natural-language response parsing ---

/**
 * Parse a free-text answer for harvest directives.
 * Returns the choice, or `undefined` if the answer does not look like
 * a harvest response.
 */
export function parseHarvestResponse(answer: string): 'use' | 'edit' | 'ignore' | undefined {
  const normalized = answer.trim().toLowerCase()

  if (/^(use|采用|使用|yes|y|确认|确定|apply|inject)\b/iu.test(normalized)) {
    return 'use'
  }

  if (/^(ignore|忽略|跳过|skip|no|n|不用|不需要)\b/iu.test(normalized)) {
    return 'ignore'
  }

  if (/^(edit|编辑|修改|refine|change|调整)\b/iu.test(normalized)) {
    return 'edit'
  }

  return undefined
}

// --- Session application ---

/**
 * Inject harvested items into the feature session.
 *
 * Items become assumptions (and open questions become pending confirmations).
 * For "edit" choices where the user provided free text that is not a numeric
 * selection, the edited text itself is recorded as an assumption.
 */
export function applyHarvestToSession(
  session: FeatureSession,
  choice: HarvestChoice,
): FeatureSession {
  if (choice.kind === 'ignore') {
    return session
  }

  const items = choice.editedItems ?? choice.candidate.items
  const confirmedItems = confirmSelectedItems(items)

  // If editedItems is the full list (no numeric selection was parsed),
  // and the choice was 'edit', treat the edited text as a custom assumption.
  const isCustomEdit =
    choice.kind === 'edit' &&
    choice.editedItems !== undefined &&
    choice.editedItems.length === choice.candidate.items.length

  if (isCustomEdit) {
    // The user typed free text → record it as a structured assumption
    return {
      ...session,
      assumptions: uniqueStrings([
        ...session.assumptions,
        `Context harvest (edited): ${choice.editNote ?? choice.candidate.packet.featureHint}`,
      ]),
      pendingContextHarvest: {
        ignoredPacketIds: session.pendingContextHarvest?.ignoredPacketIds ?? [],
        confirmedPacketId: choice.candidate.packet.id,
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
      confirmedPacketId: choice.candidate.packet.id,
      confirmedItems,
    },
  }
}

export function applyConfirmedHarvestToRequirementModel(
  model: RequirementModel,
  items: ExtractedItem[] | undefined,
): RequirementModel {
  const confirmedItems = selectConfirmedItems(items ?? [])
  if (confirmedItems.length === 0) {
    return model
  }

  let problemStatement = model.problemStatement
  const constraints = [...model.constraints]
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

// --- Multi-candidate non-interactive summary ---

export function renderMultiCandidateSummary(candidates: HarvestCandidate[]): string {
  let summary = '## Context Harvest\n\nMultiple brainstorm context packets were found:\n\n'
  for (const c of candidates) {
    summary += `- \`${c.packet.id}\` (${c.matchType}): ${c.packet.featureHint} — ${c.items.length} items\n`
  }
  summary +=
    '\nPlease reply with **use &lt;number&gt;**, **edit &lt;number&gt;**, or **ignore** to proceed.'
  return summary
}
