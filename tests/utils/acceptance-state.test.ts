import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import {
  saveAcceptanceState,
  loadAcceptanceState,
  clearAcceptanceState,
  addPendingDocUpdate,
  setWaitingForDocUpdateConfirm,
  clearWaitingForDocUpdateConfirm,
  enterAcceptancePhase,
} from '../../src/utils/acceptance-state.js'
import type { AcceptanceState } from '../../src/types.js'

const TEST_ROOT = join(process.cwd(), '.test-acceptance-state')

describe('acceptance-state', () => {
  test('save and load round-trip', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    const state: AcceptanceState = {
      feature: 'demo',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      sessionID: 'session-xyz',
      verificationPromptedAt: new Date().toISOString(),
      verificationFailureCategory: 'quality',
      pendingDocUpdates: [{ file: 'docs/current/design/demo.md', timestamp: new Date().toISOString(), reason: 'sync' }],
      waitingForDocUpdateConfirm: true,
      lastChangedFile: 'src/demo.ts',
      promotionSuggestions: [
        {
          type: 'UPDATE',
          targetArea: 'design',
          sourcePath: 'docs/archive/demo/design',
          targetPath: 'docs/current/design/demo',
          reason: 'test',
        },
      ],
      promotionApplied: false,
    }

    await saveAcceptanceState(TEST_ROOT, state)
    const loaded = await loadAcceptanceState(TEST_ROOT)

    expect(loaded).not.toBeNull()
    expect(loaded?.feature).toBe('demo')
    expect(loaded?.phase).toBe('acceptance')
    expect(loaded?.sessionID).toBe('session-xyz')
    expect(loaded?.pendingDocUpdates.length).toBe(1)
    expect(loaded?.waitingForDocUpdateConfirm).toBe(true)
    expect(loaded?.lastChangedFile).toBe('src/demo.ts')
    expect(loaded?.verificationFailureCategory).toBe('quality')
    expect(loaded?.promotionSuggestions?.length).toBe(1)
    expect(loaded?.promotionApplied).toBe(false)

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('enterAcceptancePhase is idempotent for same feature', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    const first = await enterAcceptancePhase(TEST_ROOT, 'feature-a')
    const second = await enterAcceptancePhase(TEST_ROOT, 'feature-a')

    expect(second.feature).toBe(first.feature)
    expect(second.phaseStartedAt).toBe(first.phaseStartedAt)

    await rm(TEST_ROOT, { recursive: true, force: true })
  })

  test('pending update and waiting flags can be updated and cleared', async () => {
    await rm(TEST_ROOT, { recursive: true, force: true })

    await enterAcceptancePhase(TEST_ROOT, 'feature-b')
    await addPendingDocUpdate(TEST_ROOT, {
      file: 'docs/current/design/feature-b/design.md',
      timestamp: new Date().toISOString(),
      reason: 'post-acceptance change',
    })
    await setWaitingForDocUpdateConfirm(TEST_ROOT, 'src/feature-b/service.ts')

    let loaded = await loadAcceptanceState(TEST_ROOT)
    expect(loaded?.pendingDocUpdates.length).toBe(1)
    expect(loaded?.waitingForDocUpdateConfirm).toBe(true)
    expect(loaded?.lastChangedFile).toBe('src/feature-b/service.ts')

    await clearWaitingForDocUpdateConfirm(TEST_ROOT)
    loaded = await loadAcceptanceState(TEST_ROOT)
    expect(loaded?.waitingForDocUpdateConfirm).toBe(false)
    expect(loaded?.lastChangedFile).toBeUndefined()

    await clearAcceptanceState(TEST_ROOT)
    const cleared = await loadAcceptanceState(TEST_ROOT)
    expect(cleared).toBeNull()

    await rm(TEST_ROOT, { recursive: true, force: true })
  })
})
