import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { applyPromotionSuggestions, buildPromotionSuggestions } from '../../src/phases/archive/current-promotion.js'

describe('current promotion', () => {
  test('builds ADD and REMOVE suggestions from archive/current diffs', async () => {
    const root = join(process.cwd(), '.test-current-promotion-suggestions')
    await rm(root, { recursive: true, force: true })

    const feature = 'promo-a'
    const archiveDir = join(root, 'docs', 'archive', feature)

    await mkdir(join(archiveDir, 'design'), { recursive: true })
    await writeFile(join(archiveDir, 'design', '20260325-design.md'), '# Design', 'utf-8')

    await mkdir(join(root, 'docs', 'current', 'requirements', feature), { recursive: true })
    await writeFile(join(root, 'docs', 'current', 'requirements', feature, '20260320-prd.md'), '# Old PRD', 'utf-8')

    const suggestions = await buildPromotionSuggestions({
      projectDir: root,
      archiveDir,
      feature,
    })

    expect(suggestions.some(s => s.type === 'ADD' && s.targetArea === 'design')).toBe(true)
    expect(suggestions.some(s => s.type === 'REMOVE' && s.targetArea === 'requirements')).toBe(true)

    await rm(root, { recursive: true, force: true })
  })

  test('applies UPDATE suggestion to current docs', async () => {
    const root = join(process.cwd(), '.test-current-promotion-apply')
    await rm(root, { recursive: true, force: true })

    const source = join(root, 'docs', 'archive', 'promo-b', 'design')
    const target = join(root, 'docs', 'current', 'design', 'promo-b')

    await mkdir(source, { recursive: true })
    await mkdir(target, { recursive: true })
    await writeFile(join(source, '20260325-design.md'), '# New Design', 'utf-8')
    await writeFile(join(target, '20260320-design.md'), '# Old Design', 'utf-8')

    const result = await applyPromotionSuggestions({
      projectDir: root,
      suggestions: [
        {
          type: 'UPDATE',
          targetArea: 'design',
          sourcePath: source,
          targetPath: target,
          reason: 'test update',
        },
      ],
    })

    expect(result.applied).toHaveLength(1)
    const content = await readFile(join(target, '20260325-design.md'), 'utf-8')
    expect(content).toContain('New Design')

    await rm(root, { recursive: true, force: true })
  })
})
