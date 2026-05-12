import { describe, expect, it, mock } from 'bun:test'
import type { AdapterContext } from '../../src/adapters/types.js'
import { AdapterCache } from '../../src/adapters/cache.js'
import { SecretScannerAdapter } from '../../src/adapters/security/secret-scanner.js'

// Mock command-runner module BEFORE importing the adapter
const mockRunCommand = mock(() => Promise.resolve({ status: 'pass', stdout: '', stderr: '', exitCode: 0 }))
mock.module('../../src/adapters/command-runner.js', () => ({
  runCommand: mockRunCommand,
}))

function makeContext(overrides: Partial<AdapterContext['config']> = {}): AdapterContext {
  return {
    projectDir: '/fake/project',
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

describe('SecretScannerAdapter', () => {
  it('returns skipped when tool missing and onMissing is skip', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'tool_missing',
      stdout: '',
      stderr: '',
      errorMessage: 'Command not found: gitleaks',
    })
    // Second call for fallback (detect-secrets) also missing
    mockRunCommand.mockResolvedValueOnce({
      status: 'tool_missing',
      stdout: '',
      stderr: '',
      errorMessage: 'Command not found: detect-secrets',
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext({ onMissing: 'skip' }))

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].category).toBe('security')
    expect(results[0].detail).toContain('skipped')
    expect(results[0].detail).toContain('gitleaks')
  })

  it('returns failed when tool missing and onMissing is fail', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'tool_missing',
      stdout: '',
      stderr: '',
      errorMessage: 'Command not found: gitleaks',
    })
    mockRunCommand.mockResolvedValueOnce({
      status: 'tool_missing',
      stdout: '',
      stderr: '',
      errorMessage: 'Command not found: detect-secrets',
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext({ onMissing: 'fail' }))

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
    expect(results[0].detail).toContain('failed')
  })

  it('parses valid gitleaks JSON and returns findings with redacted detail', async () => {
    const findings = [
      {
        ruleId: 'generic-api-key',
        description: 'Generic API Key',
        file: 'src/config.ts',
        startLine: 42,
        endLine: 42,
        secret: 'sk-abc123superSecretKey',
        match: 'sk-abc123superSecretKey',
      },
      {
        ruleId: 'aws-access-key',
        description: 'AWS Access Key',
        file: '.env',
        startLine: 7,
        endLine: 7,
        secret: 'AKIA1234567890ABCDEF',
      },
    ]

    mockRunCommand.mockResolvedValueOnce({
      status: 'findings',
      stdout: JSON.stringify(findings),
      stderr: '',
      exitCode: 1,
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext())

    expect(results).toHaveLength(2)

    // First finding
    expect(results[0].name).toBe('secret:generic-api-key')
    expect(results[0].passed).toBe(false)
    expect(results[0].category).toBe('security')
    expect(results[0].detail).toBe('Secret detected by rule generic-api-key in src/config.ts:42')
    // Must NOT contain the actual secret value
    expect(results[0].detail).not.toContain('sk-abc123')
    expect(results[0].detail).not.toContain('superSecretKey')

    // Second finding
    expect(results[1].name).toBe('secret:aws-access-key')
    expect(results[1].passed).toBe(false)
    expect(results[1].detail).toBe('Secret detected by rule aws-access-key in .env:7')
    expect(results[1].detail).not.toContain('AKIA1234567890ABCDEF')
  })

  it('returns passed:true when no findings', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'pass',
      stdout: '[]',
      stderr: '',
      exitCode: 0,
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext())

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].detail).toBe('No secrets detected')
  })

  it('returns failed on timeout', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'timeout',
      stdout: '',
      stderr: '',
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext())

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
    expect(results[0].detail).toContain('timed out')
  })

  it('returns failed when JSON cannot be parsed', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'pass',
      stdout: 'not valid json {{{',
      stderr: '',
      exitCode: 0,
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext())

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
    expect(results[0].detail).toContain('unable to parse')
  })

  it('returns failed on generic error', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'error',
      stdout: '',
      stderr: '',
      errorMessage: 'Something went wrong',
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext())

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(false)
    expect(results[0].detail).toContain('Something went wrong')
  })

  it('handles gitleaks findings wrapped in object format', async () => {
    const wrapped = {
      findings: [
        {
          ruleId: 'github-token',
          description: 'GitHub Token',
          file: 'src/gh.ts',
          startLine: 10,
          secret: 'ghp_secret123',
        },
      ],
    }

    mockRunCommand.mockResolvedValueOnce({
      status: 'findings',
      stdout: JSON.stringify(wrapped),
      stderr: '',
      exitCode: 1,
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext())

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('secret:github-token')
    expect(results[0].passed).toBe(false)
    expect(results[0].detail).toContain('src/gh.ts:10')
    expect(results[0].detail).not.toContain('ghp_secret123')
  })

  it('uses custom command and args from config', async () => {
    mockRunCommand.mockResolvedValueOnce({
      status: 'pass',
      stdout: '[]',
      stderr: '',
      exitCode: 0,
    })

    const adapter = new SecretScannerAdapter()
    await adapter.run(makeContext({
      command: 'custom-scanner',
      args: ['--scan', '--format', 'json'],
    }))

    // Verify the custom command was used
    const calls = mockRunCommand.mock.calls
    const firstCall = calls[calls.length - 1]
    expect(firstCall[0]).toBe('custom-scanner')
    expect(firstCall[1]).toEqual(['--scan', '--format', 'json'])
  })

  it('uses fallback detect-secrets when gitleaks is missing', async () => {
    // First call: gitleaks missing
    mockRunCommand.mockResolvedValueOnce({
      status: 'tool_missing',
      stdout: '',
      stderr: '',
      errorMessage: 'Command not found: gitleaks',
    })
    // Second call: detect-secrets succeeds
    mockRunCommand.mockResolvedValueOnce({
      status: 'pass',
      stdout: '[]',
      stderr: '',
      exitCode: 0,
    })

    const adapter = new SecretScannerAdapter()
    const results = await adapter.run(makeContext())

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].detail).toBe('No secrets detected')

    // Verify detect-secrets was called as fallback
    const calls = mockRunCommand.mock.calls
    const fallbackCall = calls[calls.length - 1]
    expect(fallbackCall[0]).toBe('detect-secrets')
  })
})
