import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from '../../src/adapters/command-runner.js'

describe('runCommand', () => {
  it('returns pass for successful command with stdout', async () => {
    const result = await runCommand('node', ['-e', 'console.log("hello")'], {
      cwd: '.',
    })

    expect(result.status).toBe('pass')
    expect(result.stdout).toContain('hello')
    expect(result.exitCode).toBe(0)
  })

  it('returns findings for non-zero exit code', async () => {
    const result = await runCommand('node', ['-e', 'process.exit(1)'], {
      cwd: '.',
    })

    expect(result.status).toBe('findings')
    expect(result.exitCode).toBe(1)
  })

  it('returns tool_missing for ENOENT (command not found)', async () => {
    const result = await runCommand('definitely_not_installed_openflow_test_cmd_xyz', [], {
      cwd: '.',
    })

    expect(result.status).toBe('tool_missing')
    expect(result.errorMessage).toBeDefined()
    expect(result.errorMessage).toContain('Command not found')
  })

  it('returns timeout and kills child process', async () => {
    // Node script that hangs for 60s; runner times out after 500ms
    const result = await runCommand(
      'node',
      ['-e', 'setTimeout(() => {}, 60000)'],
      { cwd: '.', timeout: 500 },
    )

    expect(result.status).toBe('timeout')
  }, 10000)

  it('captures stderr separately from stdout', async () => {
    const result = await runCommand(
      'node',
      ['-e', 'console.log("out"); console.error("err")'],
      { cwd: '.' },
    )

    expect(result.status).toBe('pass')
    expect(result.stdout).toContain('out')
    expect(result.stderr).toContain('err')
  })

  it('returns error for non-ENOENT spawn failures', async () => {
    // Create a temp directory, then attempt to execute it — spawn will fail
    // with a non-ENOENT error (EISDIR on Unix, EACCES on Windows).
    const tmpDir = mkdtempSync(join(tmpdir(), 'openflow-cmd-test-'))
    try {
      const result = await runCommand(tmpDir, [], { cwd: '.' })
      // Either error or tool_missing depending on OS behavior;
      // on Unix it's EISDIR, on Windows CreateProcess may map differently.
      // We verify: NOT pass, NOT findings, NOT timeout.
      expect(result.status).not.toBe('pass')
      expect(result.status).not.toBe('findings')
      expect(result.status).not.toBe('timeout')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('passes custom environment variables to child', async () => {
    const result = await runCommand(
      'node',
      ['-e', 'console.log(process.env.OPENFLOW_TEST_FOO)'],
      { cwd: '.', env: { OPENFLOW_TEST_FOO: 'bar-42' } },
    )

    expect(result.status).toBe('pass')
    expect(result.stdout).toContain('bar-42')
  })

  it('caps stdout at 256KB', async () => {
    // Generate ~300KB of output, expect only 256KB captured
    const chunkSize = 64 * 1024 // 64KB per write
    const chunkCount = 5 // 320KB total
    const result = await runCommand(
      'node',
      [
        '-e',
        `var c='';for(var i=0;i<${chunkSize * chunkCount};i++)c+='x';process.stdout.write(c)`,
      ],
      { cwd: '.' },
    )

    expect(result.status).toBe('pass')
    expect(result.stdout.length).toBeLessThanOrEqual(256 * 1024)
  })

  it('sets non-interactive environment variables', async () => {
    const result = await runCommand(
      'node',
      ['-e', 'console.log([process.env.CI, process.env.DEBIAN_FRONTEND, process.env.GIT_TERMINAL_PROMPT].join(","))'],
      { cwd: '.' },
    )

    expect(result.status).toBe('pass')
    expect(result.stdout).toContain('true')
    expect(result.stdout).toContain('noninteractive')
    expect(result.stdout).toContain('0')
  })

  it('custom env overrides non-interactive defaults when matching keys', async () => {
    const result = await runCommand(
      'node',
      ['-e', 'console.log(process.env.CI)'],
      { cwd: '.', env: { CI: 'custom' } },
    )

    expect(result.status).toBe('pass')
    expect(result.stdout).toContain('custom')
  })
})
