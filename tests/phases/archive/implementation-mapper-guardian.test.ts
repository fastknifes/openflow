import { describe, expect, test, afterEach } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateImplementationMapper } from '../../../src/phases/archive/implementation-mapper.js'
import type { FileChangeRecord, GuardianEvidence } from '../../../src/types.js'

const testDir = join(process.cwd(), '.test-impl-mapper-guardian')

async function setupTestDir() {
  await rm(testDir, { recursive: true, force: true })
  await mkdir(join(testDir, 'docs', 'changes', 'test-feat'), { recursive: true })
  await mkdir(join(testDir, 'src'), { recursive: true })
  await writeFile(join(testDir, 'src', 'lib.ts'), 'export function doThing() {}', 'utf-8')
  await writeFile(join(testDir, 'docs', 'changes', 'test-feat', 'prd.md'), '# Requirements\n- Map code to requirements\n', 'utf-8')
}

const baseChanges: FileChangeRecord[] = [
  { filePath: 'src/lib.ts', tool: 'write', timestamp: Date.now() },
]

const baseOptions = {
  feature: 'test',
  projectDir: testDir,
  archiveDir: join(testDir, 'archive'),
  requirementsPath: join(testDir, 'docs', 'changes', 'test-feat', 'prd.md'),
  designExists: false,
  planExists: false,
  changes: baseChanges,
  acceptanceState: null,
}

function makeGuardianEvidence(overrides?: Partial<GuardianEvidence>): GuardianEvidence {
  return {
    autoRepairs: 0,
    pendingAmbiguities: 0,
    unresolvedViolations: 0,
    contractSource: 'docs/changes/*-test',
    repairRecords: [],
    pendingItems: [],
    ...overrides,
  }
}

describe('generateImplementationMapper with guardianEvidence', () => {
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('output contains Drift Guardian Evidence section when guardianEvidence is provided', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper({
      ...baseOptions,
      guardianEvidence: makeGuardianEvidence(),
    })
    expect(content).toContain('### Drift Guardian Evidence')
  })

  test('output contains autoRepairs count', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper({
      ...baseOptions,
      guardianEvidence: makeGuardianEvidence({ autoRepairs: 5 }),
    })
    expect(content).toContain('Auto-repairs: 5')
  })

  test('output contains pendingAmbiguities count', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper({
      ...baseOptions,
      guardianEvidence: makeGuardianEvidence({ pendingAmbiguities: 3 }),
    })
    expect(content).toContain('Pending ambiguities: 3')
  })

  test('output does NOT contain Guardian section when guardianEvidence is absent', async () => {
    await setupTestDir()
    const content = await generateImplementationMapper(baseOptions)
    expect(content).not.toContain('### Drift Guardian Evidence')
    expect(content).not.toContain('Auto-repairs')
  })
})
