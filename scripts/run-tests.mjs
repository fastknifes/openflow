import { spawnSync } from 'node:child_process'
import { rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function cleanupTestFixtures(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.test-')) {
      rmSync(join(root, entry.name), { recursive: true, force: true })
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
