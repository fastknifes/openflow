import { describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleChange } from '../../src/commands/change.js'
import { defaultConfig, type AcceptanceState, type OpenFlowContext } from '../../src/types.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'

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

async function createDesignWorkspace(root: string, feature: string): Promise<void> {
  const workspaceDir = join(root, 'docs', 'changes', feature)
  await mkdir(workspaceDir, { recursive: true })
  await writeFile(join(workspaceDir, 'design.md'), `# ${feature} Design\n\n## Problem\nInitial requirement.\n`, 'utf-8')
}

function createAcceptanceState(feature: string, overrides: Partial<AcceptanceState> = {}): AcceptanceState {
  return {
    feature,
    phase: 'implementation',
    phaseStartedAt: new Date().toISOString(),
    pendingDocUpdates: [],
    ...overrides,
  }
}

describe('openflow-change command', () => {
  test('guides to feature when workspace is missing', async () => {
    const root = join(process.cwd(), '.test-change-missing-workspace')
    await rm(root, { recursive: true, force: true })

    const result = await handleChange(createContext(root), 'missing-feature', 'change requirement')

    expect(result).toContain('Workspace Not Found')
    expect(result).toContain('/openflow-feature missing-feature')

    await rm(root, { recursive: true, force: true })
  })

  test('returns change packet and creates acceptance state when none exists', async () => {
    const root = join(process.cwd(), '.test-change-active-workspace')
    await rm(root, { recursive: true, force: true })
    await createDesignWorkspace(root, 'demo-feature')

    const result = await handleChange(createContext(root), 'demo-feature', 'add new validation')
    const state = await loadAcceptanceState(root)

    expect(result).toContain('## OpenFlow Change Packet')
    expect(result).toContain('add new validation')
    expect(result).toContain('/openflow-verify demo-feature')
    expect(state?.feature).toBe('demo-feature')
    expect(state?.phase).toBe('implementation')
    expect(state?.pendingDocUpdates).toHaveLength(1)
    expect(state?.pendingDocUpdates[0]?.file).toContain('docs/changes/demo-feature/design.md')
    expect(state?.pendingDocUpdates[0]?.reason).toContain('openflow-change requested: add new validation')

    await rm(root, { recursive: true, force: true })
  })

  test('preserves existing acceptance fields and warns when already ready', async () => {
    const root = join(process.cwd(), '.test-change-ready-workspace')
    await rm(root, { recursive: true, force: true })
    await createDesignWorkspace(root, 'ready-feature')
    await saveAcceptanceState(root, createAcceptanceState('ready-feature', {
      readiness: 'ready',
      sessionID: 'session-123',
      pendingDocUpdates: [{ file: 'existing.md', timestamp: '2026-01-01T00:00:00.000Z' }],
    }))

    const result = await handleChange(createContext(root), 'ready-feature', 'change after verify')
    const state = await loadAcceptanceState(root)

    expect(result).toContain('already been verified')
    expect(state?.sessionID).toBe('session-123')
    expect(state?.readiness).toBe('ready')
    expect(state?.pendingDocUpdates).toHaveLength(2)

    await rm(root, { recursive: true, force: true })
  })

  test('rejects archived features without appending updates', async () => {
    const root = join(process.cwd(), '.test-change-archived-workspace')
    await rm(root, { recursive: true, force: true })
    await createDesignWorkspace(root, 'archived-feature')
    await saveAcceptanceState(root, createAcceptanceState('archived-feature', { phase: 'archived' }))

    await expect(handleChange(createContext(root), 'archived-feature', 'change archived')).rejects.toThrow('has been archived')
    const state = await loadAcceptanceState(root)
    expect(state?.pendingDocUpdates).toHaveLength(0)

    await rm(root, { recursive: true, force: true })
  })
})
