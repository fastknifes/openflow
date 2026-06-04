import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveArchiveContext } from '../../../src/phases/archive/resolve.js'
import { saveAcceptanceState } from '../../../src/utils/acceptance-state.js'
import { defaultConfig, type OpenFlowContext, VerifyReadinessStatus } from '../../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: defaultConfig,
    enhancedPlans: new Set<string>(),
  }
}

describe('resolveArchiveContext', () => {
  test('uses ad-hoc mode when acceptance state belongs to another feature', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-resolve-'))
    await saveAcceptanceState(dir, {
      feature: 'stale-feature',
      phase: 'acceptance',
      phaseStartedAt: '2026-01-01T00:00:00.000Z',
      readiness: VerifyReadinessStatus.Ready,
      pendingDocUpdates: [],
    })
    await mkdir(join(dir, 'docs', 'changes', 'target-feature'), { recursive: true })
    await writeFile(join(dir, 'docs', 'changes', 'target-feature', 'design.md'), '# Design', 'utf-8')

    const ac = await resolveArchiveContext(createContext(dir), 'target-feature')

    expect(ac.feature).toBe('target-feature')
    expect(ac.mode).toBe('ad-hoc')
    expect(ac.acceptanceState).toBeNull()
    expect(ac.rawAcceptanceState?.feature).toBe('stale-feature')

    await rm(dir, { recursive: true, force: true })
  })
})
