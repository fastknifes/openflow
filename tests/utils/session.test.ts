import { describe, expect, test } from 'bun:test'
import { getSessionFileChanges, getPhasedFileChanges } from '../../src/utils/session.js'

function createMockClient(messages: unknown[]) {
  return {
    session: {
      messages: async () => ({ data: messages as never[] }),
    },
  }
}

describe('session utils', () => {
  test('getSessionFileChanges deduplicates write/edit file paths', async () => {
    const messages = [
      {
        info: { role: 'assistant', id: 'm1' },
        parts: [
          { type: 'tool', tool: 'write', callID: '1', state: { status: 'done', input: { filePath: 'src/a.ts' } } },
          { type: 'tool', tool: 'edit', callID: '2', state: { status: 'done', input: { filePath: 'src/a.ts' } } },
          { type: 'tool', tool: 'edit', callID: '3', state: { status: 'done', input: { filePath: 'src/b.ts' } } },
          { type: 'tool', tool: 'read', callID: '4', state: { status: 'done', input: { filePath: 'src/c.ts' } } },
        ],
      },
    ]

    const client = createMockClient(messages)
    const changes = await getSessionFileChanges(client as never, 'session-1')

    expect(changes.length).toBe(2)
    expect(changes[0]?.filePath).toBe('src/a.ts')
    expect(changes[1]?.filePath).toBe('src/b.ts')
  })

  test('getPhasedFileChanges splits into implementation with future cutoff', async () => {
    const messages = [
      {
        info: { role: 'assistant', id: 'm1' },
        parts: [
          { type: 'tool', tool: 'write', callID: '1', state: { status: 'done', input: { filePath: 'src/a.ts' } } },
          { type: 'tool', tool: 'edit', callID: '2', state: { status: 'done', input: { filePath: 'src/b.ts' } } },
          { type: 'tool', tool: 'write', callID: '3', state: { status: 'done', input: { filePath: '.sisyphus/plans/x.md' } } },
        ],
      },
    ]

    const client = createMockClient(messages)
    const phased = await getPhasedFileChanges(client as never, 'session-2', '2999-01-01T00:00:00.000Z')

    expect(phased.implementation.length).toBe(2)
    expect(phased.acceptance.length).toBe(0)
  })

  test('getPhasedFileChanges splits into acceptance with past cutoff', async () => {
    const messages = [
      {
        info: { role: 'assistant', id: 'm1' },
        parts: [
          { type: 'tool', tool: 'write', callID: '1', state: { status: 'done', input: { filePath: 'src/c.ts' } } },
          { type: 'tool', tool: 'edit', callID: '2', state: { status: 'done', input: { filePath: 'node_modules/skip.ts' } } },
        ],
      },
    ]

    const client = createMockClient(messages)
    const phased = await getPhasedFileChanges(client as never, 'session-3', '2000-01-01T00:00:00.000Z')

    expect(phased.implementation.length).toBe(0)
    expect(phased.acceptance.length).toBe(1)
    expect(phased.acceptance[0]?.filePath).toBe('src/c.ts')
  })

  test('getPhasedFileChanges uses message timestamps for mixed split', async () => {
    const messages = [
      {
        info: { role: 'assistant', id: 'm1', createdAt: '2026-01-01T00:00:00.000Z' },
        parts: [
          { type: 'tool', tool: 'write', callID: '1', state: { status: 'done', input: { filePath: 'src/impl.ts' } } },
        ],
      },
      {
        info: { role: 'assistant', id: 'm2', createdAt: '2026-01-03T00:00:00.000Z' },
        parts: [
          { type: 'tool', tool: 'edit', callID: '2', state: { status: 'done', input: { filePath: 'src/acc.ts' } } },
        ],
      },
    ]

    const client = createMockClient(messages)
    const phased = await getPhasedFileChanges(client as never, 'session-4', '2026-01-02T00:00:00.000Z')

    expect(phased.implementation.length).toBe(1)
    expect(phased.acceptance.length).toBe(1)
    expect(phased.implementation[0]?.filePath).toBe('src/impl.ts')
    expect(phased.acceptance[0]?.filePath).toBe('src/acc.ts')
  })
})
