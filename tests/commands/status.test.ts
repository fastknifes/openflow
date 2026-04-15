import { describe, expect, test } from 'bun:test'
import { handleStatus } from '../../src/commands/status.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

describe('status command', () => {
  test('shows brainstorm trigger settings with soft guidance behavior', () => {
    const ctx: OpenFlowContext = {
      directory: '/test/project',
      worktree: '/test/project',
      client: {},
      $: {},
      config: { ...defaultConfig },
      enhancedPlans: new Set(['feature-a']),
    }

    const output = handleStatus(ctx)

    expect(output).toContain('Brainstorm Trigger')
    expect(output).toContain('mode: smart')
    expect(output).toContain('behavior: standalone command with one-question workflow')
    expect(output).toContain('feature-a')
  })
})
