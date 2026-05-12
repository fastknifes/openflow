import { describe, test, expect, afterAll, mock } from 'bun:test'
import { rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RepairResult } from '../../src/drift/repair-coordinator.js'
import type { DriftCheckResult } from '../../src/drift/diff-engine.js'

const TEMP_DIR = join(process.cwd(), '.test-repair-coordinator-concurrent')

afterAll(async () => {
  await rm(TEMP_DIR, { recursive: true, force: true })
})

async function setupProject(): Promise<string> {
  await rm(TEMP_DIR, { recursive: true, force: true })
  await mkdir(TEMP_DIR, { recursive: true })
  return TEMP_DIR
}

// ---- executeRepair: concurrent modification detection ----
// This test uses mock.module to simulate a concurrent writer that modifies the file
// between executeRepair's first readFile and its second (re-read) readFile.
// The mock is set up BEFORE dynamically importing repair-coordinator so it takes effect.

describe('executeRepair: concurrent modification', () => {
  test('detects concurrent modification between read and write via mock', async () => {
    const projectDir = await setupProject()
    const filePath = join(projectDir, 'src', 'concurrent.ts')
    await mkdir(join(projectDir, 'src'), { recursive: true })
    await writeFile(filePath, 'before-modification-here', 'utf-8')

    // Set up mock BEFORE any import of repair-coordinator
    let readCount = 0
    mock.module('node:fs/promises', () => ({
      readFile: async (fp: string | Buffer | URL, encoding?: BufferEncoding) => {
        readCount++
        // On second readFile call (the re-read check), return different content
        if (readCount === 2 && String(fp).includes('concurrent.ts')) {
          return 'CONCURRENTLY MODIFIED CONTENT'
        }
        // Fall through to real filesystem for all other reads
        const buffer = await require('node:fs').promises.readFile(fp as string, encoding)
        return buffer
      },
      writeFile: require('node:fs').promises.writeFile,
      access: require('node:fs').promises.access,
      mkdir: require('node:fs').promises.mkdir,
      readdir: require('node:fs').promises.readdir,
      appendFile: require('node:fs').promises.appendFile,
      rename: require('node:fs').promises.rename,
      unlink: require('node:fs').promises.unlink,
      stat: require('node:fs').promises.stat,
      rm: require('node:fs').promises.rm,
      constants: require('node:fs').constants,
    }))

    // Dynamic import — picks up the mock because no prior static import of repair-coordinator
    const mod = await import('../../src/drift/repair-coordinator.js')
    const mockedExecuteRepair: (result: DriftCheckResult, filePath: string, projectDir: string, feature: string, maxRetries?: number) => Promise<RepairResult> = mod.executeRepair

    const result = await mockedExecuteRepair(
      {
        item: 'modification',
        type: 'symbol',
        contractReference: 'test-ref',
        actualValue: 'modification',
        reason: 'test drift',
        suggestedFix: 'modification',
      },
      'src/concurrent.ts',
      projectDir,
      'concurrent-feature',
      1,
    )

    // Restore the mock
    mock.module('node:fs/promises', () => require('node:fs/promises'))

    expect(result.success).toBe(false)
    expect(result.reason).toContain('Concurrent modification')
  })

  test('retries on concurrent modification and succeeds on second attempt', async () => {
    const projectDir = await setupProject()
    const filePath = join(projectDir, 'src', 'retry-concurrent.ts')
    await mkdir(join(projectDir, 'src'), { recursive: true })
    await writeFile(filePath, 'hello world', 'utf-8')

    // Mock: first attempt sees concurrent modification (second read differs),
    // second attempt passes normally
    let readCount = 0
    mock.module('node:fs/promises', () => ({
      readFile: async (fp: string | Buffer | URL, encoding?: BufferEncoding) => {
        readCount++
        const pathStr = String(fp)
        // Attempt 0: read 1 = "hello world", read 2 = modified → concurrent conflict → retry
        // Attempt 1: read 3 = "hello world", read 4 = "hello world" → no conflict → success
        if (readCount === 2 && pathStr.includes('retry-concurrent.ts')) {
          return 'modified by concurrent'
        }
        if (readCount === 3 || readCount === 4) {
          const buffer = await require('node:fs').promises.readFile(fp as string, encoding)
          return buffer
        }
        const buffer = await require('node:fs').promises.readFile(fp as string, encoding)
        return buffer
      },
      writeFile: require('node:fs').promises.writeFile,
      access: require('node:fs').promises.access,
      mkdir: require('node:fs').promises.mkdir,
      readdir: require('node:fs').promises.readdir,
      appendFile: require('node:fs').promises.appendFile,
      rename: require('node:fs').promises.rename,
      unlink: require('node:fs').promises.unlink,
      stat: require('node:fs').promises.stat,
      rm: require('node:fs').promises.rm,
      constants: require('node:fs').constants,
    }))

    const mod = await import('../../src/drift/repair-coordinator.js')
    const mockedExecuteRepair: (result: DriftCheckResult, filePath: string, projectDir: string, feature: string, maxRetries?: number) => Promise<RepairResult> = mod.executeRepair

    const result = await mockedExecuteRepair(
      {
        item: 'hello',
        type: 'symbol',
        contractReference: 'test-ref',
        actualValue: 'hello',
        reason: 'test drift',
        suggestedFix: 'hello',
      },
      'src/retry-concurrent.ts',
      projectDir,
      'concurrent-feature',
      2,
    )

    mock.module('node:fs/promises', () => require('node:fs/promises'))

    expect(result.success).toBe(true)
    expect(result.reason).toContain('Repair applied on attempt 2')
  })
})
