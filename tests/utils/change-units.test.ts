import { describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveChangeUnitDir } from '../../src/utils/change-units.js'

describe('change unit resolution', () => {
  test('falls back to existing dated change directory when index is absent', async () => {
    const directory = join(process.cwd(), '.test-change-unit-dated-fallback')
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    await mkdir(join(directory, 'docs', 'changes', '2026-05-17-quality-gate-scope-contamination'), { recursive: true })

    const resolved = await resolveChangeUnitDir(directory, 'quality-gate-scope-contamination')

    expect(resolved).toBe('2026-05-17-quality-gate-scope-contamination')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  })

  test('falls back to existing undated change directory when indexed mapping is stale', async () => {
    const directory = join(process.cwd(), '.test-change-unit-stale-index-fallback')
    await rm(directory, { recursive: true, force: true }).catch(() => {})
    await mkdir(join(directory, '.sisyphus'), { recursive: true })
    await mkdir(join(directory, 'docs', 'changes', 'workflow'), { recursive: true })
    await Bun.write(join(directory, '.sisyphus', 'change-units.json'), JSON.stringify({
      version: 1,
      byFeature: {
        workflow: { changeDir: '2026-05-18-workflow' },
      },
    }, null, 2))

    const resolved = await resolveChangeUnitDir(directory, 'workflow')

    expect(resolved).toBe('workflow')

    await rm(directory, { recursive: true, force: true }).catch(() => {})
  })
})
