import { afterEach, describe, expect, it } from 'bun:test'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { AdapterCache } from '../../../src/adapters/cache.js'
import { DesignDriftAdapter } from '../../../src/adapters/consistency/design-drift.js'
import type { GuardianEvidence, OpenFlowContract } from '../../../src/types.js'

const cleanupDirs: string[] = []

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

function makeContract(): OpenFlowContract {
  return {
    feature: 'guardian-test',
    sourceFiles: [],
    behaviorScenarios: [],
    alignmentItems: [],
    currentConstraints: [],
    decisionConstraints: [],
    extractedAt: new Date().toISOString(),
    sourceHashes: {},
  }
}

function makeGuardianEvidence(overrides?: Partial<GuardianEvidence>): GuardianEvidence {
  return {
    autoRepairs: 0,
    pendingAmbiguities: 0,
    unresolvedViolations: 0,
    contractSource: 'docs/changes/*-guardian-test',
    repairRecords: [],
    pendingItems: [],
    ...overrides,
  }
}

async function createProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openflow-guardian-test-'))
  cleanupDirs.push(dir)
  return dir
}

describe('DesignDriftAdapter with guardianEvidence', () => {
  it('guardian_repairs passed=true when no violations and no pending ambiguities', async () => {
    const projectDir = await createProject()
    const adapter = new DesignDriftAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'guardian-test',
      config: {},
      cache: new AdapterCache(),
      contract: makeContract(),
      guardianEvidence: makeGuardianEvidence({ autoRepairs: 2 }),
    })

    const guardianResult = results.find(r => r.name === 'guardian_repairs')
    expect(guardianResult).toBeDefined()
    expect(guardianResult!.passed).toBe(true)
    expect(guardianResult!.category).toBe('consistency')
    expect(guardianResult!.detail).toContain('2 auto-repairs')
    expect(guardianResult!.detail).toContain('0 pending ambiguities')
    expect(guardianResult!.detail).toContain('0 violations')
  })

  it('guardian_repairs passed=false when unresolved violations > 0', async () => {
    const projectDir = await createProject()
    const adapter = new DesignDriftAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'guardian-test',
      config: {},
      cache: new AdapterCache(),
      contract: makeContract(),
      guardianEvidence: makeGuardianEvidence({ unresolvedViolations: 1 }),
    })

    const guardianResult = results.find(r => r.name === 'guardian_repairs')
    expect(guardianResult).toBeDefined()
    expect(guardianResult!.passed).toBe(false)
  })

  it('guardian_repairs passed=false when pending ambiguities > 0', async () => {
    const projectDir = await createProject()
    const adapter = new DesignDriftAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'guardian-test',
      config: {},
      cache: new AdapterCache(),
      contract: makeContract(),
      guardianEvidence: makeGuardianEvidence({ pendingAmbiguities: 1 }),
    })

    const guardianResult = results.find(r => r.name === 'guardian_repairs')
    expect(guardianResult).toBeDefined()
    expect(guardianResult!.passed).toBe(false)
  })

  it('does not include guardian_repairs when guardianEvidence is absent', async () => {
    const projectDir = await createProject()
    const adapter = new DesignDriftAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'guardian-test',
      config: {},
      cache: new AdapterCache(),
      contract: makeContract(),
    })

    const guardianResult = results.find(r => r.name === 'guardian_repairs')
    expect(guardianResult).toBeUndefined()
  })

  it('guardianEvidence detail string contains all counts', async () => {
    const projectDir = await createProject()
    const adapter = new DesignDriftAdapter()
    const results = await adapter.run({
      projectDir,
      feature: 'guardian-test',
      config: {},
      cache: new AdapterCache(),
      contract: makeContract(),
      guardianEvidence: makeGuardianEvidence({ autoRepairs: 3, pendingAmbiguities: 2, unresolvedViolations: 1 }),
    })

    const guardianResult = results.find(r => r.name === 'guardian_repairs')
    expect(guardianResult).toBeDefined()
    expect(guardianResult!.detail).toContain('3 auto-repairs')
    expect(guardianResult!.detail).toContain('2 pending ambiguities')
    expect(guardianResult!.detail).toContain('1 violations')
  })
})
