import { describe, expect, test, afterEach } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildPromotionSuggestions } from '../../../src/phases/archive/current-promotion.js'

describe('buildPromotionSuggestions', () => {
  const testDir = join(process.cwd(), '.test-current-promotion')

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  test('should NOT generate REMOVE suggestions when archive sources are missing but current docs exist', async () => {
    await rm(testDir, { recursive: true, force: true })

    const archiveDir = join(testDir, 'docs', 'archive', '.staging-test-feature')
    await mkdir(archiveDir, { recursive: true })
    // Only design.md exists in the archive — prd.md and behavior.md are missing
    await writeFile(join(archiveDir, 'design.md'), '# Test Design\n\nSample design content for testing', 'utf-8')

    // Existing current docs for all three areas — only design should have a matching archive source
    const currentDesignDir = join(testDir, 'docs', 'current', 'design', 'test-feature')
    await mkdir(currentDesignDir, { recursive: true })
    await writeFile(join(currentDesignDir, 'design.md'), '# Old Design\n\nPre-existing current design', 'utf-8')

    const currentReqDir = join(testDir, 'docs', 'current', 'requirements', 'test-feature')
    await mkdir(currentReqDir, { recursive: true })
    await writeFile(join(currentReqDir, 'prd.md'), '# Old PRD\n\nPre-existing requirements doc', 'utf-8')

    const currentSpecDir = join(testDir, 'docs', 'current', 'spec', 'test-feature')
    await mkdir(currentSpecDir, { recursive: true })
    await writeFile(join(currentSpecDir, 'behavior.md'), '# Old Behavior\n\nPre-existing behavior spec', 'utf-8')

    const suggestions = await buildPromotionSuggestions({
      projectDir: testDir,
      archiveDir,
      feature: 'test-feature',
    })

    // P0-A: The archive has NO prd.md and NO behavior.md, but current docs exist.
    // The system should NOT generate REMOVE suggestions for those — the current docs
    // are still valid and should not be deleted just because this archive
    // didn't include those artifact types.
    const removeSuggestions = suggestions.filter(s => s.type === 'REMOVE')
    expect(removeSuggestions.length).toBe(0)

    // Only design should be suggested (ADD or UPDATE) since only design.md exists in the archive
    const addOrUpdateSuggestions = suggestions.filter(s => s.type === 'ADD' || s.type === 'UPDATE')
    expect(addOrUpdateSuggestions.length).toBeGreaterThanOrEqual(1)

    // All suggestions should target the design area only
    const nonDesignSuggestions = suggestions.filter(s => s.targetArea !== 'design')
    expect(nonDesignSuggestions.length).toBe(0)
  })
})
