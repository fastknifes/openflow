import type { HarvestCandidate } from './harvest-discovery.js'
import type { ExtractedItem } from './context-packet.js'
import {
  askGuardedQuestion,
  hasAskQuestion,
  type QuestionToolContext,
} from '../../utils/question-guard.js'

// --- Types ---

export interface HarvestChoice {
  kind: 'use' | 'ignore' | 'edit'
  candidate: HarvestCandidate
  editedItems?: ExtractedItem[] | undefined
  editNote?: string | undefined
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
  const isRawMessagePacket = Boolean(selected.packet.rawMessages?.length)
  const useLabel = isRawMessagePacket
    ? 'Use as-is (inject full conversation)'
    : 'Use as-is (inject all extracted items)'

  const actionResult = await askGuardedQuestion(
    ctx,
    {
      id: 'context-harvest-action',
      header: 'Context Harvest',
      question: `How would you like to use the packet "${selected.packet.featureHint}"?`,
      options: [
        { label: useLabel, description: 'Inject brainstorm context into the design' },
        { label: 'Ignore', description: 'Skip this packet for this session' },
        ...(!isRawMessagePacket ? [{ label: 'Edit', description: 'Modify before using (reply with changes in next step)' }] : []),
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
