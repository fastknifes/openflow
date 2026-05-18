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

let VulnerabilityScannerAdapter: typeof import('../../src/adapters/security/vuln-scanner.js').VulnerabilityScannerAdapter

async function getAdapter() {
  if (!VulnerabilityScannerAdapter) {
    const mod = await import('../../src/adapters/security/vuln-scanner.js')
    VulnerabilityScannerAdapter = mod.VulnerabilityScannerAdapter
  }
  return VulnerabilityScannerAdapter
}

function makeContext(overrides: Partial<AdapterContext['config']> = {}, projectDir: string = '/fake/project'): AdapterContext {
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
    cache: new AdapterCache(),
  }
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'openflow-vuln-test-'))
}

const MOCK_AUDIT_RESULT = {
  advisories: {
    '1001': {
      severity: 'critical',
      title: 'Prototype Pollution in lodash',
      module_name: 'lodash',
      cves: ['CVE-2021-23337'],
      findings: [{ paths: ['node_modules/lodash'] }],
    },
    '1002': {
      severity: 'high',
      title: 'Regular Expression Denial of Service',
      module_name: 'minimatch',
      findings: [{ paths: ['node_modules/minimatch'] }],
    },
    '1003': {
      severity: 'moderate',
      title: 'Inefficient Regular Expression',
      module_name: 'glob',
      findings: [{ paths: ['node_modules/glob'] }],
    },
  },
}

describe('VulnerabilityScannerAdapter', () => {
  it('detects package-lock.json and runs npm audit', async () => {
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
      const results = await adapter.run(makeContext({}, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].detail).toBe('No vulnerabilities found')

      const calls = mockRunCommand.mock.calls
      expect(calls[calls.length - 1][0]).toBe('npm')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('detects pnpm-lock.yaml when package-lock.json missing', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'pnpm-lock.yaml'), '')
      mockRunCommand.mockResolvedValueOnce({
        status: 'pass',
        stdout: JSON.stringify({ advisories: {} }),
        stderr: '',
        exitCode: 0,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      await adapter.run(makeContext({}, tmpDir))

      const calls = mockRunCommand.mock.calls
      expect(calls[calls.length - 1][0]).toBe('pnpm')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('detects yarn.lock when others are missing', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'yarn.lock'), '')
      mockRunCommand.mockResolvedValueOnce({
        status: 'pass',
        stdout: JSON.stringify({ advisories: {} }),
        stderr: '',
        exitCode: 0,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      await adapter.run(makeContext({}, tmpDir))

      const calls = mockRunCommand.mock.calls
      expect(calls[calls.length - 1][0]).toBe('yarn')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('maps critical advisory to passed:false', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'findings',
        stdout: JSON.stringify({
          advisories: { '1001': MOCK_AUDIT_RESULT.advisories['1001'] },
        }),
        stderr: '',
        exitCode: 1,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].name).toContain('lodash')
      expect(results[0].detail).toContain('critical')
      expect(results[0].detail).toContain('Prototype Pollution')
      expect(results[0].detail).toContain('CVE-2021-23337')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('maps high advisory to passed:false', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'findings',
        stdout: JSON.stringify({
          advisories: { '1002': MOCK_AUDIT_RESULT.advisories['1002'] },
        }),
        stderr: '',
        exitCode: 1,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].name).toContain('minimatch')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('maps moderate advisory to passed:true with non-blocking note', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'findings',
        stdout: JSON.stringify({
          advisories: { '1003': MOCK_AUDIT_RESULT.advisories['1003'] },
        }),
        stderr: '',
        exitCode: 1,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].detail).toContain('moderate')
      expect(results[0].detail).toContain('non-blocking')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('calls cache.getOrCompute to store audit data', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      const cache = new AdapterCache()
      let cacheCalled = false
      // Override getOrCompute to track calls and store data
      const origGetOrCompute = cache.getOrCompute.bind(cache)
      cache.getOrCompute = async <T>(key: string, compute: () => Promise<T>): Promise<T> => {
        if (key === 'npm-audit') cacheCalled = true
        return origGetOrCompute(key, compute)
      }
      mockRunCommand.mockResolvedValueOnce({
        status: 'findings',
        stdout: JSON.stringify(MOCK_AUDIT_RESULT),
        stderr: '',
        exitCode: 1,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      await adapter.run({ ...makeContext({}, tmpDir), cache })

      expect(cacheCalled).toBe(true)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns skipped when no lockfile found', async () => {
    const tmpDir = makeTempDir()
    try {
      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].detail).toContain('skipped')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns failed when no lockfile and onMissing is fail', async () => {
    const tmpDir = makeTempDir()
    try {
      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({ onMissing: 'fail' }, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].detail).toContain('failed')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns failed when tool missing and onMissing is fail', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'tool_missing',
        stdout: '',
        stderr: '',
        errorMessage: 'Command not found: npm',
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({ onMissing: 'fail' }, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].detail).toContain('failed')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns skipped when tool missing and onMissing is skip', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'tool_missing',
        stdout: '',
        stderr: '',
        errorMessage: 'Command not found: npm',
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({ onMissing: 'skip' }, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(true)
      expect(results[0].detail).toContain('skipped')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns failed on timeout', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'timeout',
        stdout: '',
        stderr: '',
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].detail).toContain('timed out')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns failed on parse error', async () => {
    const tmpDir = makeTempDir()
    try {
      writeFileSync(join(tmpDir, 'package-lock.json'), '{}')
      mockRunCommand.mockResolvedValueOnce({
        status: 'pass',
        stdout: 'not json',
        stderr: '',
        exitCode: 0,
      })

      const Adapter = await getAdapter()
      const adapter = new Adapter()
      const results = await adapter.run(makeContext({}, tmpDir))

      expect(results).toHaveLength(1)
      expect(results[0].passed).toBe(false)
      expect(results[0].detail).toContain('unable to parse')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('uses custom command from config', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'pass',
      stdout: JSON.stringify({ advisories: {} }),
      stderr: '',
      exitCode: 0,
    })

    const Adapter = await getAdapter()
    const adapter = new Adapter()
    await adapter.run(makeContext({
      command: 'custom-audit',
      args: ['check', '--json'],
    }))

    const calls = mockRunCommand.mock.calls
    expect(calls[calls.length - 1][0]).toBe('custom-audit')
  })
})
