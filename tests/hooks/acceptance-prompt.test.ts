import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { createAcceptancePromptHook } from '../../src/hooks/acceptance-prompt.js'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set(),
  }
}

describe('acceptance-prompt hook', () => {
  test('records doc update and returns sync prompt during acceptance', async () => {
    const root = join(process.cwd(), '.test-acceptance-prompt-record')
    await rm(root, { recursive: true, force: true })

    await saveAcceptanceState(root, {
      feature: 'demo-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    const hook = createAcceptancePromptHook(createContext(root))
    const prompt = await hook({ tool: 'write', args: { filePath: 'src/demo.ts' } })

    expect(prompt).toContain('验收阶段变更已记录')
    expect(prompt).toContain('src/demo.ts')

    const state = await loadAcceptanceState(root)
    expect(state?.pendingDocUpdates).toHaveLength(1)
    expect(state?.pendingDocUpdates[0]?.file).toBe('src/demo.ts')
    expect(state?.waitingForDocUpdateConfirm).toBe(true)
    expect(state?.lastChangedFile).toBe('src/demo.ts')

    await rm(root, { recursive: true, force: true })
  })

  test('ignores internal files during acceptance', async () => {
    const root = join(process.cwd(), '.test-acceptance-prompt-ignore')
    await rm(root, { recursive: true, force: true })

    await saveAcceptanceState(root, {
      feature: 'demo-feature',
      phase: 'acceptance',
      phaseStartedAt: new Date().toISOString(),
      pendingDocUpdates: [],
    })

    const hook = createAcceptancePromptHook(createContext(root))
    const prompt = await hook({ tool: 'write', args: { filePath: '.sisyphus/plans/demo.md' } })

    expect(prompt).toBeUndefined()

    const state = await loadAcceptanceState(root)
    expect(state?.pendingDocUpdates).toHaveLength(0)
    expect(state?.waitingForDocUpdateConfirm).toBeUndefined()

    await rm(root, { recursive: true, force: true })
  })
})
