import { describe, expect, test } from 'bun:test'
import { generateCodeMappingTable, generateApiEndpointsTable, generateDependenciesTable, type ApiEndpoint, type Dependency } from '../../src/phases/archive/code-mapper.js'
import type { FileChangeRecord } from '../../src/types.js'

describe('code-mapper', () => {
  test('generateCodeMappingTable should generate mapping entries', () => {
    const changes: FileChangeRecord[] = [
      { filePath: 'src/auth.ts', tool: 'write', timestamp: Date.now() },
      { filePath: 'src/user.ts', tool: 'edit', timestamp: Date.now() },
    ]
    const entries = generateCodeMappingTable('Auth', changes)
    expect(entries.length).toBe(2)
    expect(entries[0].feature).toBe('Auth')
    expect(entries[0].filePath).toBe('src/auth.ts')
  })

  test('generateCodeMappingTable should handle empty changes', () => {
    const entries = generateCodeMappingTable('Empty', [])
    expect(entries.length).toBe(0)
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
