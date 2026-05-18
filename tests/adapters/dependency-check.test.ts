import { describe, expect, it, mock } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AdapterContext } from '../../src/adapters/types.js'
import { AdapterCache } from '../../src/adapters/cache.js'

const mockRunCommand = mock(() => Promise.resolve({ status: 'pass', stdout: '', stderr: '', exitCode: 0 }))
mock.module('../../src/adapters/command-runner.js', () => ({
  runCommand: mockRunCommand,
}))

let DependencyCheckAdapter: typeof import('../../src/adapters/security/dependency-check.js').DependencyCheckAdapter

async function getAdapter() {
  if (!DependencyCheckAdapter) {
    const mod = await import('../../src/adapters/security/dependency-check.js')
    DependencyCheckAdapter = mod.DependencyCheckAdapter
  }
  return DependencyCheckAdapter
}

function makeContext(overrides: Partial<AdapterContext['config']> = {}, cache?: AdapterCache, projectDir: string = '/fake/project'): AdapterContext {
  return {
    projectDir,
    feature: 'test-feature',
    config: {
      command: undefined,
      args: undefined,
      timeout: undefined,
      onMissing: undefined,
      ...overrides,
    },
    cache: cache ?? new AdapterCache(),
  }
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'openflow-dep-test-'))
}

const AUDIT_WITH_DEPRECATED = {
  advisories: {
    '2001': {
      severity: 'low',
      title: 'Deprecated package',
      module_name: 'request',
      deprecated: true,
      deprecation_info: 'request has been deprecated, use node-fetch instead',
    },
    '2002': {
      severity: 'high',
      title: 'Another deprecated package',
      module_name: 'left-pad',
      deprecated: true,
      deprecation_info: '',
    },
    '2003': {
      severity: 'moderate',
      title: 'Active advisory',
      module_name: 'express',
      deprecated: false,
    },
  },
}

describe('DependencyCheckAdapter', () => {
  it('reuses cached audit data instead of running new audit', async () => {
    const cache = new AdapterCache()
    cache.getOrCompute('npm-audit', async () => ({ advisories: {} }))

    const tmpDir = makeTempDir()
    try {
      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, cache, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].detail).toContain('No dep')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('reports deprecated packages from cached audit', async () => {
    const cache = new AdapterCache()
    cache.getOrCompute('npm-audit', async () => AUDIT_WITH_DEPRECATED)

    const tmpDir = makeTempDir()
    try {
      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, cache, tmpDir))

      const depResults = results.filter(r => r.name.startsWith('dep:'))
      expect(depResults).toHaveLength(2)
      expect(depResults[0].passed).toBe(true)
      expect(depResults[0].detail).toContain('request')
      expect(depResults[0].detail).toContain('deprecated')
      expect(depResults[0].detail).toContain('node-fetch')

      expect(depResults[1].detail).toContain('left-pad')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns no issues when no deprecated packages', async () => {
    const cache = new AdapterCache()
    cache.getOrCompute('npm-audit', async () => ({
      advisories: {
        '3001': { severity: 'low', module_name: 'active-pkg', deprecated: false },
      },
    }))

    const tmpDir = makeTempDir()
    try {
      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, cache, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].name).toBe('dependency')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('reports engine version mismatch from package.json', async () => {
    const cache = new AdapterCache()
    cache.getOrCompute('npm-audit', async () => ({ advisories: {} }))

    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
        engines: { node: '>=999.0.0' },
      }))

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, cache, tmpDir))

      const engineResult = results.find(r => r.name === 'engine:node')
      expect(engineResult).toBeDefined()
      expect(engineResult!.passed).toBe(true)
      expect(engineResult!.detail).toContain('version mismatch')
      expect(engineResult!.detail).toContain('>=999.0.0')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('no engine result when package.json has no engines field', async () => {
    const cache = new AdapterCache()
    cache.getOrCompute('npm-audit', async () => ({ advisories: {} }))

    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test' }))

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, cache, tmpDir))

      const engineResult = results.find(r => r.name === 'engine:node')
      expect(engineResult).toBeUndefined()
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('falls back to running audit when cache is empty', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'pass',
        stdout: JSON.stringify({ advisories: {} }),
        stderr: '',
        exitCode: 0,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, undefined, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns skipped detail when cache audit has error', async () => {
    const cache = new AdapterCache()
    cache.getOrCompute('npm-audit', async () => ({
      error: { code: 'EAUDITNOLOCK', summary: 'No lockfile found' },
    }))

    const tmpDir = makeTempDir()
    try {
      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, cache, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].detail).toContain('skipped')
      expect(results[0].detail).toContain('No lockfile found')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('handles missing package.json gracefully', async () => {
    const cache = new AdapterCache()
    cache.getOrCompute('npm-audit', async () => ({ advisories: {} }))

    const tmpDir = makeTempDir()
    try {
      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, cache, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
