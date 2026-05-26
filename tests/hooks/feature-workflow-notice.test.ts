import { describe, expect, test } from 'bun:test'
import {
  appendOpenFlowNotice,
  appendGuardMessage,
  removeOpenFlowNotices,
} from '../../src/hooks/feature-workflow.js'

function createOutput(text = 'original message') {
  return {
    message: {
      id: 'm1',
      sessionID: 's1',
      role: 'user' as const,
      time: { created: Date.now() },
      agent: 'test',
      model: { providerID: 'p', modelID: 'm' },
    },
    parts: [{ id: 'p1', sessionID: 's1', messageID: 'm1', type: 'text' as const, text }],
  }
}

describe('feature-workflow notice helpers', () => {
  test('deduplicates identical feature suggestion notice by kind and idempotency key', () => {
    const output = createOutput()

    appendOpenFlowNotice(output, {
      kind: 'feature-suggestion',
      text: '## OpenFlow: Feature Design Suggested',
      idempotencyKey: 'feature-suggestion:m1',
      ephemeral: true,
    })
    appendOpenFlowNotice(output, {
      kind: 'feature-suggestion',
      text: '## OpenFlow: Feature Design Suggested',
      idempotencyKey: 'feature-suggestion:m1',
      ephemeral: true,
    })

    const parts = output.parts as Array<{ text?: string }>
    expect(parts.filter(part => (part.text ?? '').includes('Feature Design Suggested'))).toHaveLength(1)
  })

  test('removes only matching ephemeral feature notices', () => {
    const output = createOutput()

    appendOpenFlowNotice(output, {
      kind: 'feature-suggestion',
      text: '## OpenFlow: Feature Design Suggested',
      idempotencyKey: 'feature-suggestion:m1',
      ephemeral: true,
    })
    appendGuardMessage(output, 'Durable command result')

    const removed = removeOpenFlowNotices(output, metadata => metadata.kind === 'feature-suggestion' && metadata.ephemeral === true)

    expect(removed).toBe(1)
    const allText = (output.parts as Array<{ text?: string }>).map(part => part.text ?? '').join('\n')
    expect(allText).not.toContain('Feature Design Suggested')
    expect(allText).toContain('Durable command result')
  })
})
