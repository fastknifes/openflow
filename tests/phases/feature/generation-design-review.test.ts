import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, test } from 'bun:test'
import { generateDesignDocument } from '../../../src/phases/feature/workflow/rules/generation.js'
import type { FeatureSession } from '../../../src/phases/feature/state-machine.js'
import { defaultConfig } from '../../../src/types.js'
import type { OpenFlowContext } from '../../../src/types.js'

function makeContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: defaultConfig,
    enhancedPlans: new Set<string>(),
  }
}

function makeSession(overrides: Partial<FeatureSession> = {}): FeatureSession {
  return {
    version: 4,
    feature: 'generation-review-test',
    sourceIntent: 'Generate a design with post-generation review',
    workflowState: 'collecting',
    collectedFacts: {
      problem: 'Need a feature design that is structurally generated but still reviewed for implementation sufficiency.',
      constraint: 'quality-gate must confirm output format compatibility and shows the release result before release',
    },
    assumptions: [],
    pendingConfirmations: [],
    draftStatus: 'final',
    generatedDocs: [],
    generationAttemptCount: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('generateDesignDocument — design sufficiency review integration', () => {
  test('writes Design Sufficiency Review summary to generated documents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openflow-generation-review-'))

    try {
      const result = await generateDesignDocument(makeContext(directory), makeSession())
      const design = await readFile(result.designPath, 'utf-8')
      const behavior = await readFile(result.behaviorPath, 'utf-8')

      expect(result.designReview.status).toBe('not_ready')
      expect(design).toContain('## Design Sufficiency Review')
      expect(behavior).toContain('## Design Sufficiency Review')
      expect(design).toContain('OPENFLOW:DESIGN_REVIEW_SUMMARY:BEGIN')
      expect(design).toContain('Design Readiness')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
