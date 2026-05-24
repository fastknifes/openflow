import { describe, expect, test } from 'bun:test'
import {
  extractContextFromMessages,
  type ExtractedItem,
  type ExtractionResult,
  type MessageLike,
} from '../../../src/phases/feature/context-extraction.js'

describe('extractContextFromMessages', () => {
  test('returns empty items for empty messages', () => {
    const result = extractContextFromMessages([])
    expect(result.items).toHaveLength(0)
    expect(result.isCandidate).toBe(false)
  })

  test('returns empty items for acknowledgement-only messages', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '好' },
      { role: 'assistant', content: '继续' },
      { role: 'user', content: 'ok' },
    ])
    expect(result.items).toHaveLength(0)
    expect(result.isCandidate).toBe(false)
  })

  // --- Problem extraction ---

  test('extracts problem statement from user message with high confidence', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'We need to solve the authentication flow problem' },
    ])
    expect(result.items.length).toBeGreaterThanOrEqual(1)
    const problem = result.items.find((i) => i.type === 'problem')
    expect(problem).toBeDefined()
    expect(problem!.confidence).toBe('high')
    expect(problem!.source).toBe('user')
    expect(problem!.content).toContain('the authentication flow')
  })

  test('extracts problem from assistant with medium confidence', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: 'The problem is that users cannot reset their passwords' },
    ])
    const problem = result.items.find((i) => i.type === 'problem')
    expect(problem).toBeDefined()
    expect(problem!.confidence).toBe('medium')
    expect(problem!.source).toBe('assistant')
  })

  test('extracts Chinese problem statement', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '目前存在的痛点：用户登录流程太复杂' },
    ])
    const problem = result.items.find((i) => i.type === 'problem')
    expect(problem).toBeDefined()
    expect(problem!.content).toContain('用户登录流程太复杂')
    expect(problem!.confidence).toBe('high')
  })

  // --- Decision extraction ---

  test('extracts decision from user with high confidence', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: "Let's go with JWT for authentication" },
    ])
    const decision = result.items.find((i) => i.type === 'decision')
    expect(decision).toBeDefined()
    expect(decision!.confidence).toBe('high')
    expect(decision!.content).toContain('JWT')
  })

  test('extracts decision from assistant with medium confidence', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: 'We will use Redis for session storage' },
    ])
    const decision = result.items.find((i) => i.type === 'decision')
    expect(decision).toBeDefined()
    expect(decision!.confidence).toBe('medium')
  })

  test('extracts Chinese decision', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '决定采用微服务架构作为方案' },
    ])
    const decision = result.items.find((i) => i.type === 'decision')
    expect(decision).toBeDefined()
    expect(decision!.content).toContain('微服务架构')
    expect(decision!.confidence).toBe('high')
  })

  // --- Constraint extraction ---

  test('extracts constraint from user with high confidence', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'must support at least 1000 concurrent users' },
    ])
    const constraint = result.items.find((i) => i.type === 'constraint')
    expect(constraint).toBeDefined()
    expect(constraint!.confidence).toBe('high')
    expect(constraint!.content).toContain('support at least')
  })

  test('extracts negative constraint', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'cannot use external APIs for this feature' },
    ])
    const constraint = result.items.find((i) => i.type === 'constraint')
    expect(constraint).toBeDefined()
    expect(constraint!.confidence).toBe('high')
  })

  test('extracts Chinese constraint', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '必须兼容现有的数据库 schema' },
    ])
    const constraint = result.items.find((i) => i.type === 'constraint')
    expect(constraint).toBeDefined()
    expect(constraint!.confidence).toBe('high')
  })

  // --- Non-goal extraction ---

  test('extracts non-goal from user', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: "We do not need to support IE11 for this feature" },
    ])
    const nonGoal = result.items.find((i) => i.type === 'nonGoal')
    expect(nonGoal).toBeDefined()
    expect(nonGoal!.confidence).toBe('high')
    expect(nonGoal!.content).toContain('support IE11')
  })

  test('extracts out-of-scope as non-goal', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'Out of scope: mobile responsive design' },
    ])
    const nonGoal = result.items.find((i) => i.type === 'nonGoal')
    expect(nonGoal).toBeDefined()
    expect(nonGoal!.confidence).toBe('high')
  })

  test('extracts Chinese non-goal', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '不需要支持国际化功能' },
    ])
    const nonGoal = result.items.find((i) => i.type === 'nonGoal')
    expect(nonGoal).toBeDefined()
    expect(nonGoal!.confidence).toBe('high')
  })

  // --- Open question extraction ---

  test('extracts open question ending with ?', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'Should we use WebSocket or SSE for real-time updates?' },
    ])
    const question = result.items.find((i) => i.type === 'openQuestion')
    expect(question).toBeDefined()
    expect(question!.confidence).toBe('medium')
  })

  test('extracts "how should" as open question', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'How should we handle token refresh?' },
    ])
    const question = result.items.find((i) => i.type === 'openQuestion')
    expect(question).toBeDefined()
  })

  test('extracts Chinese open question', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '不确定：是否需要离线模式支持' },
    ])
    const question = result.items.find((i) => i.type === 'openQuestion')
    expect(question).toBeDefined()
    expect(question!.confidence).toBe('medium')
  })

  // --- Risk extraction ---

  test('extracts risk from user', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'Risk: migration could cause data loss for existing users' },
    ])
    const risk = result.items.find((i) => i.type === 'risk')
    expect(risk).toBeDefined()
    expect(risk!.confidence).toBe('high')
    expect(risk!.content).toContain('migration')
  })

  test('extracts Chinese risk', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '风险：并发写入可能导致数据不一致' },
    ])
    const risk = result.items.find((i) => i.type === 'risk')
    expect(risk).toBeDefined()
    expect(risk!.confidence).toBe('high')
  })

  // --- Example extraction ---

  test('extracts example', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: 'For example: the login endpoint should return a JWT token' },
    ])
    const example = result.items.find((i) => i.type === 'example')
    expect(example).toBeDefined()
    expect(example!.confidence).toBe('low')
  })

  // --- Speculation / rejection handling ---

  test('speculation patterns produce low confidence', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'Maybe we should use GraphQL instead of REST' },
    ])
    const decision = result.items.find((i) => i.type === 'decision')
    expect(decision).toBeDefined()
    expect(decision!.confidence).toBe('low')
  })

  test('rejection patterns still extract non-goal with high confidence from user', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: "No, we don't use MongoDB here" },
    ])
    const item = result.items.find(
      (i) => i.type === 'nonGoal' || i.type === 'constraint',
    )
    expect(item).toBeDefined()
    // User direct rejection → high confidence non-goal
    expect(item!.confidence).toBe('high')
  })

  test('direct correction with rejection is high confidence', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: "No, we must not store passwords in plain text" },
    ])
    const constraint = result.items.find((i) => i.type === 'constraint')
    expect(constraint).toBeDefined()
    // Rejection pattern ("No, we must not") → high because user direct correction
    expect(constraint!.confidence).toBe('high')
  })

  // --- Acknowledgement confirmation ---

  test('acknowledgement confirms preceding decision', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: "Let's go with option A for the database" },
      { role: 'user', content: '好' },
    ])
    const decisions = result.items.filter((i) => i.type === 'decision')
    expect(decisions.length).toBeGreaterThanOrEqual(1)
    const confirmed = decisions.find((i) => i.confirmedBy !== undefined)
    expect(confirmed).toBeDefined()
    expect(confirmed!.confidence).toBe('high')
    expect(confirmed!.confirmedBy).toBe('好')
  })

  test('acknowledgement confirms preceding constraint', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: 'We should require HTTPS for all API endpoints' },
      { role: 'user', content: 'ok' },
    ])
    // "should require" doesn't match constraint patterns directly,
    // but the acknowledgement confirms nothing if no matching item exists
    // Let's use a direct constraint from assistant
    const result2 = extractContextFromMessages([
      { role: 'assistant', content: 'constraint: all endpoints must use HTTPS' },
      { role: 'user', content: 'ok' },
    ])
    const confirmed = result2.items.find((i) => i.confirmedBy !== undefined)
    expect(confirmed).toBeDefined()
    expect(confirmed!.confidence).toBe('high')
  })

  test('generic acknowledgement without preceding design choice does nothing', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'ok' },
    ])
    expect(result.items).toHaveLength(0)
  })

  // --- Stability threshold ---

  test('isCandidate is true when problem exists', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'We need to solve the data consistency issue' },
    ])
    expect(result.isCandidate).toBe(true)
  })

  test('isCandidate is true when high-confidence decision exists', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: "Let's go with PostgreSQL for storage" },
    ])
    expect(result.isCandidate).toBe(true)
  })

  test('isCandidate is true when high-confidence constraint exists', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'must maintain backward compatibility' },
    ])
    expect(result.isCandidate).toBe(true)
  })

  test('isCandidate is true when medium-confidence open question exists', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'Should we use event sourcing?' },
    ])
    expect(result.isCandidate).toBe(true)
  })

  test('isCandidate is false when only examples exist', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: 'For example: the API returns JSON' },
    ])
    expect(result.isCandidate).toBe(false)
  })

  test('isCandidate is false when only low-confidence items exist', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: 'Maybe we should consider caching' },
    ])
    const decisions = result.items.filter((i) => i.type === 'decision')
    // If all items are low-confidence and none match threshold criteria
    const hasThresholdItem = result.items.some(
      (item) =>
        item.type === 'problem' ||
        (item.confidence === 'high' && (item.type === 'decision' || item.type === 'constraint')) ||
        (item.type === 'openQuestion' && item.confidence !== 'low'),
    )
    expect(hasThresholdItem).toBe(false)
    expect(result.isCandidate).toBe(false)
  })

  // --- Multi-message extraction ---

  test('extracts from multiple messages and deduplicates', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'We need to solve the login flow issue' },
      { role: 'assistant', content: "Let's go with OAuth2 for authentication" },
      { role: 'user', content: '好' },
      { role: 'user', content: 'must not store tokens in localStorage' },
    ])
    expect(result.items.length).toBeGreaterThanOrEqual(3)
    expect(result.isCandidate).toBe(true)

    const problem = result.items.find((i) => i.type === 'problem')
    const decision = result.items.find((i) => i.type === 'decision' && i.confirmedBy !== undefined)
    const constraint = result.items.find((i) => i.type === 'constraint')
    expect(problem).toBeDefined()
    expect(decision).toBeDefined()
    expect(constraint).toBeDefined()
  })

  test('does not store raw transcript as packet fields', () => {
    const longRawText = 'This is a very long message that should not appear as-is in the output ' + 'x'.repeat(500)
    const result = extractContextFromMessages([
      { role: 'user', content: longRawText },
    ])
    for (const item of result.items) {
      expect(item.content.length).toBeLessThanOrEqual(303) // 300 + '…'
    }
  })

  // --- Deduplication ---

  test('deduplicates identical items from repeated messages', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: 'We need to solve the performance issue' },
      { role: 'assistant', content: 'We need to solve the performance issue' },
    ])
    const problems = result.items.filter((i) => i.type === 'problem')
    expect(problems.length).toBe(1)
  })

  // --- Edge cases ---

  test('handles multiline messages', () => {
    const result = extractContextFromMessages([
      {
        role: 'user',
        content: 'Here are the requirements:\nmust support dark mode\nWe do not need to support IE11',
      },
    ])
    expect(result.items.length).toBeGreaterThanOrEqual(2)
    const types = result.items.map((i) => i.type)
    expect(types).toContain('constraint')
    expect(types).toContain('nonGoal')
  })

  test('handles empty messages gracefully', () => {
    const result = extractContextFromMessages([
      { role: 'user', content: '' },
      { role: 'assistant', content: '   ' },
    ])
    expect(result.items).toHaveLength(0)
    expect(result.isCandidate).toBe(false)
  })

  test('assistant speculation produces low confidence', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: 'Perhaps we should consider using a message queue' },
    ])
    const decision = result.items.find((i) => i.type === 'decision')
    expect(decision).toBeDefined()
    expect(decision!.confidence).toBe('low')
  })

  test('Chinese acknowledgement confirms preceding design choice', () => {
    const result = extractContextFromMessages([
      { role: 'assistant', content: "Let's go with Redis for caching" },
      { role: 'user', content: '同意' },
    ])
    const confirmed = result.items.find(
      (i) => i.type === 'decision' && i.confirmedBy !== undefined,
    )
    expect(confirmed).toBeDefined()
    expect(confirmed!.confidence).toBe('high')
    expect(confirmed!.confirmedBy).toBe('同意')
  })

  test('all acknowledgement patterns are recognized', () => {
    const acks = ['好', '继续', '同意', 'ok', 'sure', 'yes', 'agreed']
    for (const ack of acks) {
      const result = extractContextFromMessages([
        { role: 'assistant', content: "Let's go with option A" },
        { role: 'user', content: ack },
      ])
      const confirmed = result.items.find((i) => i.confirmedBy !== undefined)
      expect(confirmed).toBeDefined()
    }
  })
})
