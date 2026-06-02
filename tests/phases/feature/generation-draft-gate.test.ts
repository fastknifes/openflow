import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, test } from 'bun:test'
import { generateDesignDocument } from '../../../src/phases/feature/workflow/rules/generation.js'
import { assessRequirementClearance } from '../../../src/phases/feature/requirement-clearance.js'
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

function makeSparseSession(): FeatureSession {
  return {
    version: 4,
    feature: 'sparse-test',
    sourceIntent: 'sparse-test',
    workflowState: 'collecting',
    collectedFacts: {
      motivation: 'Optimize the archive workflow',
      mode1: 'Planned workflow archival',
      mode2: 'Ad-hoc issue fix archival',
    },
    assumptions: [],
    pendingConfirmations: [],
    draftStatus: 'final',
    generatedDocs: [],
    generationAttemptCount: 0,
    updatedAt: new Date().toISOString(),
  }
}

function makeRichSession(): FeatureSession {
  return {
    version: 4,
    feature: 'rich-test',
    sourceIntent: 'rich-test',
    workflowState: 'collecting',
    collectedFacts: {
      problem: 'Current handleArchive is 1284 lines with mixed responsibilities',
      'constraint-compat': 'Must maintain backward compatibility',
      'constraint-isolation': 'Staging directory must be atomic on failure',
      architecture: 'Split into 6 independent phases: resolve, validate, collect, promote, finalize, report',
      'scenario-planned': 'quality-gate confirms readiness → archive validates → collects artifacts',
      'scenario-adhoc': 'User calls archive without feature workflow → minimal validation',
    },
    assumptions: [],
    pendingConfirmations: [],
    draftStatus: 'final',
    generatedDocs: [],
    generationAttemptCount: 0,
    updatedAt: new Date().toISOString(),
  }
}

describe('Two-Gate workflow integration', () => {
  test('Gate 1 blocks generation for sparse facts', () => {
    const session = makeSparseSession()
    const clearance = assessRequirementClearance(session)

    expect(clearance.status).toBe('needs_clarification')
    expect(clearance.missingDimensions.length).toBeGreaterThan(0)
    expect(clearance.questions.length).toBeGreaterThan(0)
  })

  test('Gate 1 passes for rich facts', () => {
    const session = makeRichSession()
    const clearance = assessRequirementClearance(session)

    expect(clearance.status).toBe('ready_for_generation')
    expect(clearance.questions).toHaveLength(0)
  })

  test('Gate 2: generation produces formal docs when Gate 1 passed', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openflow-twogate-'))

    try {
      const result = await generateDesignDocument(makeContext(directory), makeRichSession())

      // Formal design.md and behavior.md should exist
      const designContent = await readFile(result.designPath, 'utf-8')
      const behaviorContent = await readFile(result.behaviorPath, 'utf-8')
      expect(designContent).toContain('## Design Sufficiency Review')
      expect(behaviorContent).toContain('## Design Sufficiency Review')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('Gate 2: sparse facts would still generate docs (Gate 1 prevents calling generate)', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openflow-twogate-'))

    try {
      // If someone bypasses Gate 1 and calls generate directly,
      // it still generates formal docs (Gate 2 review happens after)
      const result = await generateDesignDocument(makeContext(directory), makeSparseSession())

      const designContent = await readFile(result.designPath, 'utf-8')
      expect(designContent).toContain('## Design Sufficiency Review')
      expect(result.designReview.status).toBe('not_ready')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
