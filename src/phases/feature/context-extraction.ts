/**
 * Conservative, rule-based extraction of brainstorm context from conversation messages.
 *
 * Design principles:
 * - Deterministic: same input → same output, no randomness or ML.
 * - Conservative: only extract what is clearly stated; never hallucinate.
 * - Confidence-classified: every extracted item carries a confidence level.
 */

// --- Types ---

export type ContextCategory =
  | 'problem'
  | 'decision'
  | 'constraint'
  | 'nonGoal'
  | 'openQuestion'
  | 'risk'
  | 'example'

export type Confidence = 'high' | 'medium' | 'low'

export type MessageRole = 'user' | 'assistant'

export interface MessageLike {
  role: MessageRole
  content: string
}

export interface ExtractedItem {
  type: ContextCategory
  content: string
  confidence: Confidence
  source: MessageRole
  confirmedBy?: string | undefined
}

export interface ExtractionResult {
  items: ExtractedItem[]
  isCandidate: boolean
}

// --- Acknowledgement patterns ---

const ACKNOWLEDGEMENT_PATTERNS: readonly RegExp[] = [
  /^(好|继续|同意|可以|没问题|确认|确定|对的|是的|ok|sure|yes|agreed?|go ahead|proceed|looks good|sounds good|that works|confirmed|correct|right|exactly|absolutely|definitely|我同意|就这样|按你说的|按这个方案)\s*[.!。！？?]*$/i,
]

function isAcknowledgement(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length > 30) return false
  return ACKNOWLEDGEMENT_PATTERNS.some((re) => re.test(trimmed))
}

// --- Category-specific extraction patterns ---

interface PatternRule {
  pattern: RegExp
  category: ContextCategory
  /** Base confidence when matched in user message. */
  userConfidence: Confidence
  /** Base confidence when matched in assistant message. */
  assistantConfidence: Confidence
}

const PATTERN_RULES: readonly PatternRule[] = [
  // Problem statements
  {
    pattern: /(?:we\s+(?:need|want|have)\s+to\s+(?:solve|address|handle|fix|support|build|add|implement))\s+(.+)/i,
    category: 'problem',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:the\s+problem\s+(?:is|that))\s*[:：]?\s*(.+)/i,
    category: 'problem',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:目前|当前|现在)?(?:存在|面临|遇到)?(?:的问题|痛点|难点)\s*(?:是|:|：)\s*(.+)/,
    category: 'problem',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:I\s+want\s+(?:to|a))\s+(.+)/i,
    category: 'problem',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },

  // Decisions
  {
    pattern: /(?:let'?s?\s+(?:go\s+with|use|choose|decide\s+on|adopt))\s+(.+)/i,
    category: 'decision',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:we\s+(?:will|should|shall|decided\s+to|agree\s+to))\s+(?:use|go\s+with|adopt|implement)\s+(.+)/i,
    category: 'decision',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:决定|方案是|选择|采用)\s*(.+?)(?:作为方案|，|$)/,
    category: 'decision',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:I\s+(?:suggest|recommend|propose))\s+(.+)/i,
    category: 'decision',
    userConfidence: 'medium',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:should\s+(?:we\s+)?(?:consider|use|try|go\s+with|adopt))\s+(.+)/i,
    category: 'decision',
    userConfidence: 'medium',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:我(?:建议|推荐|提议))\s*(.+?)(?:，|$)/,
    category: 'decision',
    userConfidence: 'medium',
    assistantConfidence: 'medium',
  },

  // Constraints
  {
    pattern: /(?:must|has\s+to|needs\s+to|is\s+required\s+to)\s+(.+)/i,
    category: 'constraint',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:cannot|can'?t|must\s+not|should\s+not)\s+(.+)/i,
    category: 'constraint',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:必须|不能|不可以|需要|要求)\s*(.+?)(?:，|$)/,
    category: 'constraint',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:constraint|limitation|requirement)\s*[:：]\s*(.+)/i,
    category: 'constraint',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:限制|约束|前提条件)\s*[:：]\s*(.+)/,
    category: 'constraint',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },

  // Non-goals
  {
    pattern: /(?:we\s+(?:do\s+not|don'?t)\s+(?:need|want|use|plan\s+to\s+use|intend\s+to\s+use)\s+(?:to\s+)?)\s*(.+)/i,
    category: 'nonGoal',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:out\s+of\s+scope|not\s+in\s+scope|won'?t\s+(?:do|cover|address|handle))\s*[:：]?\s*(.+)/i,
    category: 'nonGoal',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:不需要|不包括|不在范围内|不要)\s*(.+?)(?:，|$)/,
    category: 'nonGoal',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },

  // Open questions
  {
    pattern: /(?:should\s+we|do\s+we\s+(?:need|want)|how\s+(?:should|do|will|can)|what\s+(?:if|about|should|happens))\s+(.+)/i,
    category: 'openQuestion',
    userConfidence: 'medium',
    assistantConfidence: 'low',
  },
  {
    pattern: /(?:不确定|还没想好|需要确认|待定)\s*[:：]?\s*(.+)/,
    category: 'openQuestion',
    userConfidence: 'medium',
    assistantConfidence: 'low',
  },
  {
    pattern: /\?\s*$/,
    category: 'openQuestion',
    userConfidence: 'medium',
    assistantConfidence: 'low',
  },

  // Risks
  {
    pattern: /(?:risk|concern|worry|danger|downside)\s*[:：]\s*(.+)/i,
    category: 'risk',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:风险|隐患|担忧|问题)\s*[:：]\s*(.+)/,
    category: 'risk',
    userConfidence: 'high',
    assistantConfidence: 'medium',
  },
  {
    pattern: /(?:might\s+(?:break|fail|cause|lead\s+to)|could\s+(?:be\s+a\s+)?(?:problem|issue|risk))\s+(.+)/i,
    category: 'risk',
    userConfidence: 'medium',
    assistantConfidence: 'low',
  },

  // Examples
  {
    pattern: /(?:for\s+example|e\.?g\.?|such\s+as|like)\s*[:：]?\s*(.+)/i,
    category: 'example',
    userConfidence: 'medium',
    assistantConfidence: 'low',
  },
  {
    pattern: /(?:例如|比如|举例|如)\s*[:：]?\s*(.+)/,
    category: 'example',
    userConfidence: 'medium',
    assistantConfidence: 'low',
  },
]

// --- Rejection / speculation patterns (lower confidence) ---

const SPECULATION_PATTERNS: readonly RegExp[] = [
  /(?:maybe|perhaps|might|could|possibly|I\s+guess|I\s+think|might\s+want)/i,
  /(?:也许|可能|或许|大概|猜测)/,
]

const REJECTION_PATTERNS: readonly RegExp[] = [
  /(?:no,\s*(?:we|I)|don'?t\s+(?:do|use|go|need)|rejected|not\s+that\s+one|skip\s+that)/i,
  /(?:不要|不用|排除|拒绝|不是这个)/,
]

// --- Helpers ---

function classifyConfidence(
  text: string,
  baseConfidence: Confidence,
  source: MessageRole,
  category: ContextCategory,
): Confidence {
  // Direct corrections from user override — always high regardless of wording
  if (source === 'user' && REJECTION_PATTERNS.some((p) => p.test(text))) {
    // But only for constraint-like categories; rejection of options stays low
    if (category === 'constraint' || category === 'nonGoal') {
      return 'high'
    }
  }

  // Speculation reduces confidence — but only for decision/openQuestion/risk,
  // not for explicit structural markers like "Risk:" or "约束："
  const hasStructuralMarker =
    category === 'risk' && /^(risk|concern|风险|隐患)\s*[:：]/i.test(text)
  if (!hasStructuralMarker && SPECULATION_PATTERNS.some((p) => p.test(text))) {
    return 'low'
  }

  return baseConfidence
}

/**
 * Truncates extracted content to a reasonable max length and strips trailing
 * punctuation that came from regex capture noise.
 */
function cleanContent(raw: string): string {
  let cleaned = raw.trim()
  // Remove trailing incomplete sentences
  const sentenceEnd = cleaned.search(/[.!。！？?]\s+\S/)
  if (sentenceEnd > 0) {
    cleaned = cleaned.slice(0, sentenceEnd + 1)
  }
  // Cap at 300 characters
  if (cleaned.length > 300) {
    cleaned = cleaned.slice(0, 300) + '…'
  }
  return cleaned
}

// --- Item extraction from a single message ---

function extractItemsFromMessage(message: MessageLike): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const lines = message.content.split(/\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Skip pure acknowledgements — they are handled at a higher level
    if (isAcknowledgement(trimmedLine)) continue

    for (const rule of PATTERN_RULES) {
      const match = rule.pattern.exec(trimmedLine)
      if (!match) continue

      // For the trailing-question pattern, only match if the line is a question
      if (rule.pattern.source === '\\?\\s*$') {
        if (!trimmedLine.endsWith('?') && !trimmedLine.endsWith('？')) continue
      }

      const rawContent = match[1] ?? trimmedLine
      const baseConfidence = message.role === 'user' ? rule.userConfidence : rule.assistantConfidence
      const confidence = classifyConfidence(trimmedLine, baseConfidence, message.role, rule.category)

      items.push({
        type: rule.category,
        content: cleanContent(rawContent),
        confidence,
        source: message.role,
      })
    }
  }

  return items
}

// --- Acknowledgement handling ---

/**
 * When a message is a pure acknowledgement, confirm the most recent
 * explicit design choice from the preceding messages.
 */
function processAcknowledgement(
  ackText: string,
  precedingItems: ExtractedItem[],
): ExtractedItem | null {
  // Find the last high-confidence item that an acknowledgement can confirm
  for (let i = precedingItems.length - 1; i >= 0; i--) {
    const item = precedingItems[i]!
    // Only confirm decisions, constraints, and non-goals (design choices)
    if (
      (item.type === 'decision' || item.type === 'constraint' || item.type === 'nonGoal') &&
      item.confidence !== 'low'
    ) {
      return {
        ...item,
        confidence: 'high',
        source: 'user',
        confirmedBy: ackText.trim(),
      }
    }
  }
  return null
}

// --- Stability threshold ---

function meetsStabilityThreshold(items: ExtractedItem[]): boolean {
  return items.some(
    (item) =>
      item.type === 'problem' ||
      (item.confidence === 'high' && (item.type === 'decision' || item.type === 'constraint')) ||
      (item.type === 'openQuestion' && item.confidence !== 'low'),
  )
}

// --- Deduplication ---

function deduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>()
  const result: ExtractedItem[] = []

  for (const item of items) {
    // Dedupe key: type + normalized content (case-insensitive, whitespace-collapsed)
    const key = `${item.type}:${item.content.toLowerCase().replace(/\s+/g, ' ').trim()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

// --- Main function ---

/**
 * Extracts structured context items from an array of conversation messages.
 *
 * Uses deterministic, rule-based pattern matching. No ML or NLP.
 * Each extracted item includes a confidence classification based on
 * whether the statement was explicit (high), synthesized (medium),
 * or speculative (low).
 */
export function extractContextFromMessages(messages: MessageLike[]): ExtractionResult {
  const allItems: ExtractedItem[] = []
  const confirmedIndices = new Set<number>()

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!

    // Handle acknowledgement messages
    if (isAcknowledgement(message.content)) {
      if (message.role === 'user' && allItems.length > 0) {
        const confirmed = processAcknowledgement(message.content, allItems)
        if (confirmed) {
          // Find the original item and mark it as confirmed
          for (let j = allItems.length - 1; j >= 0; j--) {
            const existing = allItems[j]!
            if (
              existing.type === confirmed.type &&
              existing.content === confirmed.content
            ) {
              confirmedIndices.add(j)
              break
            }
          }
          allItems.push(confirmed)
        }
      }
      continue
    }

    const extracted = extractItemsFromMessage(message)
    allItems.push(...extracted)
  }

  // Build final list: confirmed items replace originals
  const finalItems: ExtractedItem[] = []
  for (let i = 0; i < allItems.length; i++) {
    if (confirmedIndices.has(i)) {
      // Skip the original — the confirmed version was added later
      continue
    }
    finalItems.push(allItems[i]!)
  }

  const deduped = deduplicateItems(finalItems)
  const isCandidate = meetsStabilityThreshold(deduped)

  return { items: deduped, isCandidate }
}
