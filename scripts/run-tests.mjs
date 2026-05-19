import { spawnSync } from 'node:child_process'
import { rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function removeFixture(path) {
  let lastError
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
      return
    } catch (error) {
      lastError = error
      sleep(100 * (attempt + 1))
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError)
  console.warn(`[run-tests] Failed to cleanup fixture ${path}: ${message}`)
}

function cleanupTestFixtures(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.test-')) {
      removeFixture(join(root, entry.name))
    }
  }
}

const root = process.cwd()
const result = spawnSync('bun', ['test', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

cleanupTestFixtures(root)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
