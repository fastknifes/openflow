import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getActiveBrainstormFeature,
  getBrainstormLifecycleState,
  getRecentCompletedBrainstormFeature,
} from '../../src/hooks/brainstorm-workflow.js'

describe('brainstorm workflow lifecycle', () => {
  test('returns active brainstorm feature for a live session binding', async () => {
    const root = join(process.cwd(), '.test-brainstorm-lifecycle-active')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'active.json'),
      JSON.stringify({
        bySessionID: {
          'session-live': {
            feature: 'user-login',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'user-login.json'),
      JSON.stringify({
        version: 2,
        feature: 'user-login',
        workflowState: 'collecting',
        pendingQuestionId: 'problem',
        askedQuestionIds: [],
        answers: {},
        generatedDocs: [],
        generationAttemptCount: 0,
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    )

    await expect(getActiveBrainstormFeature(root, 'session-live')).resolves.toBe('user-login')

    await rm(root, { recursive: true, force: true })
  })

  test('prunes completed sessions from active index', async () => {
    const root = join(process.cwd(), '.test-brainstorm-lifecycle-prune')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'active.json'),
      JSON.stringify({
        bySessionID: {
          'session-done': {
            feature: 'user-login',
            updatedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'user-login.json'),
      JSON.stringify({
        version: 2,
        feature: 'user-login',
        workflowState: 'completed',
        pendingQuestionId: null,
        askedQuestionIds: ['problem'],
        answers: { problem: 'done' },
        generatedDocs: ['docs/changes/user-login/design/20260414-design.md'],
        generationAttemptCount: 1,
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    )

    await expect(getActiveBrainstormFeature(root, 'session-done')).resolves.toBeUndefined()
    const content = JSON.parse(await readFile(join(root, '.sisyphus', 'brainstorm', 'active.json'), 'utf-8')) as {
      bySessionID: Record<string, unknown>
    }
    expect(content.bySessionID['session-done']).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('returns recent completion feature inside short handoff window', async () => {
    const root = join(process.cwd(), '.test-brainstorm-lifecycle-recent')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'brainstorm'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'brainstorm', 'recent-completed.json'),
      JSON.stringify({
        bySessionID: {
          'session-recent': {
            feature: 'user-login',
            completedAt: new Date().toISOString(),
          },
        },
      }),
      'utf-8'
    )

    await expect(getRecentCompletedBrainstormFeature(root, 'session-recent')).resolves.toBe('user-login')
    await expect(getBrainstormLifecycleState(root, 'session-recent')).resolves.toEqual({
      activeFeature: undefined,
      recentCompletedFeature: 'user-login',
    })

    await rm(root, { recursive: true, force: true })
  })
})
