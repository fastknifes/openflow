import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  getActiveFeatureSession,
  getFeatureLifecycleState,
  getRecentCompletedFeature,
  hasDesignDoc,
} from '../../src/hooks/feature-workflow.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createCtx(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

describe('feature workflow lifecycle', () => {
  test('returns active feature session for a live session binding', async () => {
    const root = join(process.cwd(), '.test-feature-lifecycle-active')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'feature', 'active.json'),
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
      join(root, '.sisyphus', 'feature', 'user-login.json'),
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

    await expect(getActiveFeatureSession(root, 'session-live')).resolves.toBe('user-login')

    await rm(root, { recursive: true, force: true })
  })

  test('keeps complete sessions in active index for same-session inspection', async () => {
    const root = join(process.cwd(), '.test-feature-lifecycle-prune')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'feature', 'active.json'),
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
      join(root, '.sisyphus', 'feature', 'user-login.json'),
      JSON.stringify({
        version: 2,
        feature: 'user-login',
        workflowState: 'complete',
        pendingQuestionId: null,
        askedQuestionIds: ['problem'],
        answers: { problem: 'done' },
        generatedDocs: ['docs/changes/user-login/design.md'],
        generationAttemptCount: 1,
        updatedAt: new Date().toISOString(),
      }),
      'utf-8'
    )

    await expect(getActiveFeatureSession(root, 'session-done')).resolves.toBe('user-login')
    const content = JSON.parse(await readFile(join(root, '.sisyphus', 'feature', 'active.json'), 'utf-8')) as {
      bySessionID: Record<string, unknown>
    }
    expect(content.bySessionID['session-done']).toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('returns recent completion feature inside short handoff window', async () => {
    const root = join(process.cwd(), '.test-feature-lifecycle-recent')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'feature'), { recursive: true })

    await writeFile(
      join(root, '.sisyphus', 'feature', 'recent-completed.json'),
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

    await expect(getRecentCompletedFeature(root, 'session-recent')).resolves.toBe('user-login')
    await expect(getFeatureLifecycleState(root, 'session-recent')).resolves.toEqual({
      activeFeature: undefined,
      recentCompletedFeature: 'user-login',
    })

    await rm(root, { recursive: true, force: true })
  })

  test('requires both design.md and behavior.md before design docs are considered complete', async () => {
    const root = join(process.cwd(), '.test-feature-lifecycle-design-behavior')
    await rm(root, { recursive: true, force: true })
    const designDir = join(root, 'docs', 'changes', '2026-05-25-user-login')
    await mkdir(designDir, { recursive: true })

    await writeFile(join(designDir, 'design.md'), '# Design\n', 'utf-8')
    await expect(hasDesignDoc(createCtx(root), 'user-login')).resolves.toBe(false)

    await writeFile(join(designDir, 'behavior.md'), '# Behavior\n', 'utf-8')
    await expect(hasDesignDoc(createCtx(root), 'user-login')).resolves.toBe(true)

    await rm(root, { recursive: true, force: true })
  })
})
