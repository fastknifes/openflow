import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import { ContractExtractor } from '../../src/contracts/contract-extractor.js'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const tempDir = join(process.cwd(), '.test-contract-extractor')
const feature = 'test-feature'
const changeDir = '2026-01-01-test-feature'

beforeEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
  await mkdir(join(tempDir, '.sisyphus'), { recursive: true })
  await writeFile(
    join(tempDir, '.sisyphus', 'change-units.json'),
    JSON.stringify({ version: 1, byFeature: { [feature]: { changeDir } } }),
  )
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('ContractExtractor', () => {
  test('extract returns null for empty workspace', async () => {
    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).toBeNull()
  })

  test('extract returns contract with behavior scenarios from behavior.md', async () => {
    const behaviorContent = `---
{"scenarios": [{"id": "bs-1", "name": "Login", "given": ["user on page"], "when": ["clicks login"], "then": ["dashboard shown"], "criticality": "critical"}]}
---`

    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'behavior.md'), behaviorContent, 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.behaviorScenarios).toHaveLength(1)

    const scenario = result!.behaviorScenarios[0]
    expect(scenario.id).toBe('bs-1')
    expect(scenario.name).toBe('Login')
    expect(scenario.given).toEqual(['user on page'])
    expect(scenario.when).toEqual(['clicks login'])
    expect(scenario.then).toEqual(['dashboard shown'])
    expect(scenario.criticality).toBe('critical')
  })

  test('extract parses design.meta.json into alignment items', async () => {
    const metaContent = JSON.stringify({
      feature: 'test-feature',
      constraints: [
        {
          id: 'c-1',
          category: 'compatibility',
          severity: 'must',
          description: 'Must be backward compatible',
          rationale: 'Existing integrations depend on current API',
          verificationMethod: 'Existing tests pass without modification',
          sourceQuestionId: 'constraints',
        },
      ],
      scopeBoundary: { inScope: ['core logic'], outOfScope: ['unrelated modules'] },
      acceptanceCriteria: [{ id: 'ac-1', description: 'All existing tests pass' }],
      goals: ['Feature works correctly'],
      nonGoals: ['Breaking changes'],
      expectedModules: [{ path: 'src/auth.ts', purpose: 'Authentication module' }],
      expectedSymbols: [{ name: 'login', kind: 'function', module: 'src/auth.ts' }],
    })

    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'design.meta.json'), metaContent, 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.alignmentItems.length).toBeGreaterThan(0)

    const item = result!.alignmentItems[0]
    expect(item.behaviorId).toBe('design')
    expect(item.designResponse).toBe('Authentication module')
    expect(item.files).toEqual(['src/auth.ts'])
    expect(item.modules).toEqual(['src/auth.ts'])
    expect(item.expectedSymbols).toEqual(['login'])
  })

  test('extract parses current constraints from docs/current/', async () => {
    const currentContent = `## Constraints
src/auth.ts: @stable - must not change`

    await mkdir(join(tempDir, 'docs', 'current'), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'current', 'design.md'), currentContent, 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.currentConstraints.length).toBeGreaterThan(0)

    const constraint = result!.currentConstraints[0]
    expect(constraint.source).toBe('current')
    expect(constraint.file).toBe('docs/current/design.md')
    expect(constraint.rule).toContain('@stable')
    expect(constraint.severity).toBe('blocking')
  })

  test('extract parses decision constraints from docs/decisions/', async () => {
    const decisionContent = '1. Must use `src/db/postgres.ts` for database access'

    await mkdir(join(tempDir, 'docs', 'decisions'), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'decisions', 'ADR-001-test.md'), decisionContent, 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.decisionConstraints.length).toBeGreaterThan(0)

    const constraint = result!.decisionConstraints[0]
    expect(constraint.source).toBe('decision')
    expect(constraint.file).toContain('ADR')
    expect(constraint.severity).toBe('blocking')
  })

  test('extract populates sourceFiles field', async () => {
    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'design.md'), '', 'utf-8')
    await mkdir(join(tempDir, 'docs', 'decisions'), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'decisions', 'ADR-001-test.md'), '1. Must use `src/db/postgres.ts` for database access', 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.sourceFiles).toContain('design.md')
  })

  test('extract populates sourceHashes', async () => {
    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'design.md'), '', 'utf-8')
    await mkdir(join(tempDir, 'docs', 'decisions'), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'decisions', 'ADR-001-test.md'), '1. Must use `src/db/postgres.ts` for database access', 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(Object.keys(result!.sourceHashes).length).toBeGreaterThan(0)

    for (const file of result!.sourceFiles) {
      expect(result!.sourceHashes[file]).toBeDefined()
      expect(typeof result!.sourceHashes[file]).toBe('string')
      expect(result!.sourceHashes[file]).toHaveLength(64)
    }
  })

  test('sourceHashes change when source file content changes', async () => {
    const workspace = join(tempDir, 'docs', 'changes', changeDir)
    await mkdir(workspace, { recursive: true })
    const designPath = join(workspace, 'design.md')
    await writeFile(designPath, '# Design\nfirst', 'utf-8')
    await writeFile(join(workspace, 'behavior.md'), '### Scenario: cached behavior\nGiven:\n- a\nWhen:\n- b\nThen:\n- c\n', 'utf-8')

    const extractor = new ContractExtractor()
    const first = await extractor.extract(feature, tempDir)
    await writeFile(designPath, '# Design\nsecond', 'utf-8')
    const second = await extractor.extract(feature, tempDir)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first!.sourceHashes['design.md']).not.toBe(second!.sourceHashes['design.md'])
  })

  test('contract has extractedAt timestamp', async () => {
    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'design.md'), '', 'utf-8')
    await mkdir(join(tempDir, 'docs', 'decisions'), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'decisions', 'ADR-001-test.md'), '1. Must use `src/db/postgres.ts` for database access', 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.extractedAt).toBeDefined()

    const date = new Date(result!.extractedAt)
    expect(date.toISOString()).toBe(result!.extractedAt)
  })

  test('multiple scenarios parsed correctly', async () => {
    const behaviorContent = `---
{"scenarios": [
  {"id": "bs-1", "name": "Login", "given": ["a"], "when": ["b"], "then": ["c"], "criticality": "critical"},
  {"id": "bs-2", "name": "Logout", "given": ["d"], "when": ["e"], "then": ["f"], "criticality": "normal"},
  {"id": "bs-3", "name": "Register", "given": ["g"], "when": ["h"], "then": ["i"], "criticality": "optional"}
]}
---`

    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'behavior.md'), behaviorContent, 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.behaviorScenarios).toHaveLength(3)
  })

  test('behavior.md with markdown table fallback', async () => {
    const behaviorContent = `| id | scenario | given | when | then | criticality |
|----|----------|-------|------|------|-------------|
| bs-1 | Login | user exists | clicks login | dashboard | critical |`

    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'behavior.md'), behaviorContent, 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.behaviorScenarios.length).toBeGreaterThan(0)

    const scenario = result!.behaviorScenarios[0]
    expect(scenario.id).toBe('bs-1')
    expect(scenario.name).toBe('Login')
    expect(scenario.given).toEqual(['user exists'])
    expect(scenario.when).toEqual(['clicks login'])
    expect(scenario.then).toEqual(['dashboard'])
    expect(scenario.criticality).toBe('critical')
  })

  test('behavior.md with markdown heading scenarios and boundaries', async () => {
    const behaviorContent = `# Behavior Contract: Login

## Behavior Scenarios

### Scenario: Login succeeds

Given:
- user is on login page

When:
- user submits valid credentials

Then:
- dashboard is shown

## Boundary Scenarios

### Boundary: Invalid password

Given:
- user is on login page

When:
- user submits invalid password

Then:
- error is shown
`

    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'behavior.md'), behaviorContent, 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)

    expect(result).not.toBeNull()
    expect(result!.behaviorScenarios).toHaveLength(2)
    expect(result!.behaviorScenarios[0]).toMatchObject({
      id: 'scenario-0',
      name: 'Login succeeds',
      given: ['user is on login page'],
      when: ['user submits valid credentials'],
      then: ['dashboard is shown'],
      criticality: 'critical',
    })
    expect(result!.behaviorScenarios[1]).toMatchObject({
      id: 'boundary-1',
      name: 'Invalid password',
      given: ['user is on login page'],
      when: ['user submits invalid password'],
      then: ['error is shown'],
      criticality: 'optional',
    })
  })

  test('missing behavior.md does not crash - returns empty scenarios', async () => {
    await mkdir(join(tempDir, 'docs', 'changes', changeDir), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'changes', changeDir, 'design.md'), '', 'utf-8')
    await mkdir(join(tempDir, 'docs', 'decisions'), { recursive: true })
    await writeFile(join(tempDir, 'docs', 'decisions', 'ADR-001-test.md'), '1. Must use `src/db/postgres.ts` for database access', 'utf-8')

    const extractor = new ContractExtractor()
    const result = await extractor.extract(feature, tempDir)
    expect(result).not.toBeNull()
    expect(result!.behaviorScenarios).toEqual([])
  })
})
