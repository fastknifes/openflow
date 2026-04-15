import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, rm, writeFile, utimes } from 'node:fs/promises'
import { createAcceptanceHook } from '../../src/hooks/acceptance.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

describe('acceptance hook', () => {
  test('enters acceptance phase when trigger is detected and plan exists', async () => {
    const root = join(process.cwd(), '.test-acceptance-hook-enter')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'plans', 'demo-feature.md'), '# demo', 'utf-8')

    const ctx = createContext(root)
    const hook = createAcceptanceHook(ctx)

    await hook({ sessionID: 'session-enter-1', message: '测试发现这个功能还有问题，需要调整' })

    const state = await loadAcceptanceState(root)
    expect(state).not.toBeNull()
    expect(state?.phase).toBe('acceptance')
    expect(state?.feature).toBe('demo-feature')
    expect(state?.sessionID).toBe('session-enter-1')

    await rm(root, { recursive: true, force: true })
  })

  test('does nothing when no trigger is detected', async () => {
    const root = join(process.cwd(), '.test-acceptance-hook-no-trigger')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(root, '.sisyphus', 'plans', 'demo-feature.md'), '# demo', 'utf-8')

    const ctx = createContext(root)
    const hook = createAcceptanceHook(ctx)

    await hook({ message: 'normal conversation message' })

    const state = await loadAcceptanceState(root)
    expect(state).toBeNull()

    await rm(root, { recursive: true, force: true })
  })

  test('uses latest modified plan as active feature', async () => {
    const root = join(process.cwd(), '.test-acceptance-hook-latest')
    await rm(root, { recursive: true, force: true })
    await mkdir(join(root, '.sisyphus', 'plans'), { recursive: true })

    const older = join(root, '.sisyphus', 'plans', 'older-feature.md')
    const newer = join(root, '.sisyphus', 'plans', 'newer-feature.md')
    await writeFile(older, '# older', 'utf-8')
    await writeFile(newer, '# newer', 'utf-8')

    const olderTime = new Date('2026-01-01T00:00:00.000Z')
    const newerTime = new Date('2026-01-02T00:00:00.000Z')
    await utimes(older, olderTime, olderTime)
    await utimes(newer, newerTime, newerTime)

    const ctx = createContext(root)
    const hook = createAcceptanceHook(ctx)

    await hook({ message: '需要fix，这里有问题' })

    const state = await loadAcceptanceState(root)
    expect(state?.feature).toBe('newer-feature')

    await rm(root, { recursive: true, force: true })
  })

  test('clears waiting confirmation state when user replies', async () => {
    const root = join(process.cwd(), '.test-acceptance-hook-confirm')
    await rm(root, { recursive: true, force: true })

    await saveAcceptanceState(root, {
      feature: 'confirm-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
      waitingForDocUpdateConfirm: true,
      lastChangedFile: 'src/confirm.ts',
    })

    const ctx = createContext(root)
    const hook = createAcceptanceHook(ctx)
    await hook({ message: '不用更新设计文档' })

    const state = await loadAcceptanceState(root)
    expect(state?.waitingForDocUpdateConfirm).toBe(false)
    expect(state?.lastChangedFile).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })

  test('marks verification pending on completion message', async () => {
    const root = join(process.cwd(), '.test-acceptance-hook-completion')
    await rm(root, { recursive: true, force: true })

    await saveAcceptanceState(root, {
      feature: 'completion-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    const ctx = createContext(root)
    const hook = createAcceptanceHook(ctx)
    await hook({ sessionID: 'session-completion-1', message: '这个功能完成了，可以收尾' })

    const state = await loadAcceptanceState(root)
    expect(state?.phase).toBe('verification_pending')
    expect(state?.verificationPromptedAt).toBeDefined()

    await rm(root, { recursive: true, force: true })
  })
})
