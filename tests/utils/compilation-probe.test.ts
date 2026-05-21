import { describe, expect, test } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  detectProjectLanguage,
  getCompilationProbeCommand,
  runCompilationProbe,
} from '../../src/utils/compilation-probe.js'

describe('compilation-probe', () => {
  describe('detectProjectLanguage', () => {
    test('detects TypeScript project by tsconfig.json', async () => {
      const testDir = join(process.cwd(), '.test-cp-ts-detect')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: [] }), 'utf-8')

      const lang = await detectProjectLanguage(testDir)
      expect(lang).toBe('typescript')

      await rm(testDir, { recursive: true, force: true })
    })

    test('detects Go project by go.mod', async () => {
      const testDir = join(process.cwd(), '.test-cp-go-detect')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'go.mod'), 'module example.com/test\ngo 1.21\n', 'utf-8')

      const lang = await detectProjectLanguage(testDir)
      expect(lang).toBe('go')

      await rm(testDir, { recursive: true, force: true })
    })

    test('detects Rust project by Cargo.toml', async () => {
      const testDir = join(process.cwd(), '.test-cp-rust-detect')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'Cargo.toml'), '[package]\nname = "test"\nversion = "0.1.0"\n', 'utf-8')

      const lang = await detectProjectLanguage(testDir)
      expect(lang).toBe('rust')

      await rm(testDir, { recursive: true, force: true })
    })

    test('detects PHP project by composer.json', async () => {
      const testDir = join(process.cwd(), '.test-cp-php-detect')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'composer.json'), JSON.stringify({ name: 'test/app', require: {} }), 'utf-8')

      const lang = await detectProjectLanguage(testDir)
      expect(lang).toBe('php')

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns null when no language marker files exist', async () => {
      const testDir = join(process.cwd(), '.test-cp-no-lang')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })

      const lang = await detectProjectLanguage(testDir)
      expect(lang).toBeNull()

      await rm(testDir, { recursive: true, force: true })
    })

    test('prioritizes tsconfig.json over other markers', async () => {
      const testDir = join(process.cwd(), '.test-cp-priority')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'tsconfig.json'), '{}', 'utf-8')
      await writeFile(join(testDir, 'go.mod'), 'module test\n', 'utf-8')
      await writeFile(join(testDir, 'Cargo.toml'), '[package]\n', 'utf-8')

      const lang = await detectProjectLanguage(testDir)
      expect(lang).toBe('typescript')

      await rm(testDir, { recursive: true, force: true })
    })
  })

  describe('getCompilationProbeCommand', () => {
    test('returns tsc --noEmit for TypeScript without local tsc', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-ts')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })

      const cmd = await getCompilationProbeCommand('typescript', testDir)
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('tsc')
      expect(cmd!.args).toEqual(['--noEmit'])

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns npx tsc --noEmit for TypeScript with local node_modules/.bin/tsc', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-ts-local')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(join(testDir, 'node_modules', '.bin'), { recursive: true })
      await writeFile(join(testDir, 'node_modules', '.bin', 'tsc'), '', 'utf-8')

      const cmd = await getCompilationProbeCommand('typescript', testDir)
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('npx')
      expect(cmd!.args).toEqual(['tsc', '--noEmit'])

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns go build for Go', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-go')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })

      const cmd = await getCompilationProbeCommand('go', testDir)
      expect(cmd).toEqual({ command: 'go', args: ['build', './...'] })

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns cargo check for Rust', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-rust')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })

      const cmd = await getCompilationProbeCommand('rust', testDir)
      expect(cmd).toEqual({ command: 'cargo', args: ['check'] })

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns null for PHP without phpstan or psalm', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-php-none')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })

      const cmd = await getCompilationProbeCommand('php', testDir)
      expect(cmd).toBeNull()

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns phpstan command for PHP with vendor/bin/phpstan', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-php-phpstan')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(join(testDir, 'vendor', 'bin'), { recursive: true })
      await writeFile(join(testDir, 'vendor', 'bin', 'phpstan'), '', 'utf-8')

      const cmd = await getCompilationProbeCommand('php', testDir)
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('vendor/bin/phpstan')
      expect(cmd!.args).toEqual(['analyse', '--no-progress'])

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns psalm command for PHP with vendor/bin/psalm (no phpstan)', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-php-psalm')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(join(testDir, 'vendor', 'bin'), { recursive: true })
      await writeFile(join(testDir, 'vendor', 'bin', 'psalm'), '', 'utf-8')

      const cmd = await getCompilationProbeCommand('php', testDir)
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('vendor/bin/psalm')
      expect(cmd!.args).toEqual(['--no-progress'])

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns null for JavaScript without typecheck script', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-js-none')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test', scripts: { start: 'node .' } }), 'utf-8')

      const cmd = await getCompilationProbeCommand('javascript', testDir)
      expect(cmd).toBeNull()

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns npm run typecheck for JavaScript with typecheck script', async () => {
      const testDir = join(process.cwd(), '.test-cp-cmd-js-typecheck')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'package.json'), JSON.stringify({ name: 'test', scripts: { typecheck: 'tsc --noEmit' } }), 'utf-8')

      const cmd = await getCompilationProbeCommand('javascript', testDir)
      expect(cmd).not.toBeNull()
      expect(cmd!.command).toBe('npm')
      expect(cmd!.args).toEqual(['run', 'typecheck'])

      await rm(testDir, { recursive: true, force: true })
    })
  })

  describe('runCompilationProbe', () => {
    test('returns skipped when no project language is detected', async () => {
      const testDir = join(process.cwd(), '.test-cp-run-no-lang')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })

      const result = await runCompilationProbe(testDir)
      expect(result.status).toBe('skipped')
      expect(result.detail).toContain('No compilation probe available')

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns skipped when no compilation command is found (PHP without tools)', async () => {
      const testDir = join(process.cwd(), '.test-cp-run-php-no-tools')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'composer.json'), '{}', 'utf-8')

      const result = await runCompilationProbe(testDir)
      expect(result.status).toBe('skipped')
      expect(result.detail).toContain('No compilation probe command found')
      expect(result.detail).toContain('php')

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns skipped when toolchain is not found (tsc not available)', async () => {
      const testDir = join(process.cwd(), '.test-cp-run-ts-no-tsc')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: [] }), 'utf-8')

      const result = await runCompilationProbe(testDir)
      // Either the system has tsc (passed/failed) or doesn't (skipped)
      if (result.status === 'skipped') {
        expect(result.detail).toContain('Toolchain not found')
      } else {
        // tsc exists but may pass or fail on empty project
        expect(['passed', 'failed']).toContain(result.status)
        expect(result.command).toContain('tsc')
      }

      await rm(testDir, { recursive: true, force: true })
    })

    test('returns command field containing tsc for TypeScript project', async () => {
      const testDir = join(process.cwd(), '.test-cp-run-ts-command')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, include: [] }), 'utf-8')

      const result = await runCompilationProbe(testDir)
      if (result.status !== 'skipped' || result.command) {
        expect(result.command).toContain('tsc')
      }

      await rm(testDir, { recursive: true, force: true })
    })

    test('detects Go project and attempts go build', async () => {
      const testDir = join(process.cwd(), '.test-cp-run-go')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'go.mod'), 'module example.com/test\ngo 1.21\n', 'utf-8')

      const result = await runCompilationProbe(testDir)
      if (result.status === 'skipped') {
        expect(result.detail).toContain('Toolchain not found')
      } else {
        expect(['passed', 'failed']).toContain(result.status)
        expect(result.command).toContain('go build')
      }

      await rm(testDir, { recursive: true, force: true })
    })

    test('detects Rust project and attempts cargo check', async () => {
      const testDir = join(process.cwd(), '.test-cp-run-rust')
      await rm(testDir, { recursive: true, force: true })
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, 'Cargo.toml'), '[package]\nname = "test"\nversion = "0.1.0"\n', 'utf-8')

      const result = await runCompilationProbe(testDir)
      if (result.status === 'skipped') {
        expect(result.detail).toContain('Toolchain not found')
      } else {
        expect(['passed', 'failed']).toContain(result.status)
        expect(result.command).toContain('cargo check')
      }

      await rm(testDir, { recursive: true, force: true })
    })
  })
})
