import { describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateCodeMappingTable, generateApiEndpointsTable, generateDependenciesTable, type ApiEndpoint, type Dependency } from '../../src/phases/archive/code-mapper.js'
import type { FileChangeRecord } from '../../src/types.js'
import { collectTraceabilityItems } from '../../src/phases/archive/traceability.js'

describe('code-mapper', () => {
  test('generateCodeMappingTable should generate traceability-first entries with real symbols', async () => {
    const testDir = join(process.cwd(), '.test-code-mapper-traceability')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'src'), { recursive: true })
    await mkdir(join(testDir, 'docs', 'changes', 'auth'), { recursive: true })

    await writeFile(
      join(testDir, 'src', 'auth.ts'),
      'export function archiveTraceability() {}\nexport const mapRequirements = () => true\n',
      'utf-8'
    )
    await writeFile(
      join(testDir, 'docs', 'changes', 'auth', 'prd.md'),
      '# Acceptance Criteria\n- Archive command traces requirements to code\n',
      'utf-8'
    )

    const changes: FileChangeRecord[] = [
      { filePath: 'src/auth.ts', tool: 'write', timestamp: Date.now() },
    ]

    const traceability = await collectTraceabilityItems(
      testDir,
      join(testDir, 'docs', 'changes', 'auth', 'prd.md'),
      undefined
    )
    const entries = await generateCodeMappingTable('Auth', changes, {
      projectDir: testDir,
      traceabilityItems: traceability.items,
    })

    expect(entries.length).toBe(1)
    expect(entries[0].feature).toBe('Auth')
    expect(entries[0].filePath).toBe('src/auth.ts')
    expect(entries[0].source).toContain('requirement: docs/changes/auth/prd.md')
    expect(entries[0].step).toBe('Archive command traces requirements to code')
    expect(entries[0].symbol).toContain('archiveTraceability')
    expect(entries[0].symbol).toContain('mapRequirements')
    expect(entries[0].verificationEvidence).toBe('archived file-change evidence recorded')

    await rm(testDir, { recursive: true, force: true })
  })

  test('generateCodeMappingTable should handle empty changes', async () => {
    const entries = await generateCodeMappingTable('Empty', [])
    expect(entries.length).toBe(0)
  })

  test('collectTraceabilityItems should fall back to design when requirements and proposal are missing', async () => {
    const testDir = join(process.cwd(), '.test-code-mapper-design-fallback')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'fallback'), { recursive: true })
    await writeFile(
      join(testDir, 'docs', 'changes', 'fallback', 'design.md'),
      '# Design\n- Use design doc fallback for archive traceability\n',
      'utf-8'
    )

    const traceability = await collectTraceabilityItems(
      testDir,
      undefined,
      join(testDir, 'docs', 'changes', 'fallback', 'design.md')
    )

    expect(traceability.usedDesignFallback).toBe(true)
    expect(traceability.items[0]?.item).toBe('Use design doc fallback for archive traceability')

    await rm(testDir, { recursive: true, force: true })
  })

  test('collectTraceabilityItems should prefer design.meta.json when present', async () => {
    const testDir = join(process.cwd(), '.test-code-mapper-sidecar-traceability')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(join(testDir, 'docs', 'changes', 'sidecar'), { recursive: true })

    await writeFile(
      join(testDir, 'docs', 'changes', 'sidecar', 'prd.md'),
      '# Requirements\n## Acceptance Criteria\n- Markdown fallback item that should not be used first\n',
      'utf-8'
    )
    await writeFile(
      join(testDir, 'docs', 'changes', 'sidecar', 'design.meta.json'),
      JSON.stringify({
        feature: 'sidecar',
        constraints: [
          {
            id: 'c-auth-1',
            category: 'security',
            severity: 'must',
            description: 'Validate archive traceability against structured requirements',
            rationale: 'Archive output should stay linked to approved intent',
            verificationMethod: 'Mapper tests cover structured requirement extraction',
            sourceQuestionId: 'constraints',
          },
        ],
        scopeBoundary: {
          inScope: ['archive traceability'],
          outOfScope: ['runtime auth changes'],
        },
        acceptanceCriteria: [
          {
            id: 'ac-auth-1',
            description: 'Traceability maps sidecar acceptance criteria to code evidence',
          },
        ],
        goals: ['Prefer structured sidecar requirements over markdown bullets'],
        nonGoals: ['Changing archive filenames'],
      }),
      'utf-8'
    )

    const traceability = await collectTraceabilityItems(
      testDir,
      join(testDir, 'docs', 'changes', 'sidecar', 'prd.md'),
      undefined
    )

    expect(traceability.usedDesignFallback).toBe(false)
    expect(traceability.items).toHaveLength(3)
    expect(traceability.items.map(item => item.source)).toEqual([
      'requirement-model',
      'requirement-model',
      'requirement-model',
    ])
    expect(traceability.items.map(item => item.id)).toEqual(['goal-1', 'c-auth-1', 'ac-auth-1'])
    expect(traceability.items.map(item => item.item)).toEqual([
      'Prefer structured sidecar requirements over markdown bullets',
      'Validate archive traceability against structured requirements',
      'Traceability maps sidecar acceptance criteria to code evidence',
    ])
    expect(traceability.items[0]?.sourceLabel).toContain('prd.md → Goals (goal-1)')

    await rm(testDir, { recursive: true, force: true })
  })

  test('generateApiEndpointsTable should generate markdown table', () => {
    const endpoints: ApiEndpoint[] = [
      { path: '/api/auth', method: 'POST', handler: 'authController.login', description: 'Login endpoint' },
      { path: '/api/user', method: 'GET', handler: 'userController.get', description: 'Get user' },
    ]
    const table = generateApiEndpointsTable(endpoints)
    expect(table).toContain('| Endpoint | Method | Handler |')
    expect(table).toContain('/api/auth')
    expect(table).toContain('POST')
  })

  test('generateApiEndpointsTable should handle empty endpoints', () => {
    const table = generateApiEndpointsTable([])
    expect(table).toContain('No API endpoints')
  })

  test('generateDependenciesTable should generate markdown table', () => {
    const deps: Dependency[] = [
      { name: 'express', version: '4.18.0', purpose: 'Web framework' },
      { name: 'zod', version: '3.22.0', purpose: 'Validation' },
    ]
    const table = generateDependenciesTable(deps)
    expect(table).toContain('| Package | Version | Purpose |')
    expect(table).toContain('express')
    expect(table).toContain('4.18.0')
  })

  test('generateDependenciesTable should handle empty dependencies', () => {
    const table = generateDependenciesTable([])
    expect(table).toContain('No dependencies')
  })
})
