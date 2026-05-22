import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { applyPromotionSuggestions, buildPromotionSuggestions } from '../../src/phases/archive/current-promotion.js'

const testRoots = new Set<string>()

afterEach(async () => {
  await Promise.all([...testRoots].map(root => rm(root, { recursive: true, force: true })))
  testRoots.clear()
})

function createRoot(name: string): string {
  const root = join(process.cwd(), name)
  testRoots.add(root)
  return root
}

describe('current promotion', () => {
  test('builds synthesized refresh suggestion when a reliable historical current doc matches', async () => {
    const root = createRoot('.test-current-promotion-suggestions')
    const feature = 'archive-improvements'
    const archiveDir = join(root, 'docs', 'archive', feature)
    const historicalCurrentPath = join(root, 'docs', 'current', 'archive-authority', 'design.md')

    await mkdir(archiveDir, { recursive: true })
    await mkdir(join(root, 'docs', 'current', 'archive-authority'), { recursive: true })
    await writeFile(
      join(archiveDir, 'design.md'),
      '# Archive Command Improvements\n\n## Problem Statement\nArchive cleanup must keep current docs aligned.\n\n## Current Promotion\nRefresh current docs by merging archive sections with history.\n',
      'utf-8'
    )
    await writeFile(
      historicalCurrentPath,
      '# Archive Workflow\n\n## Problem Statement\nCurrent docs drift when archive cleanup is skipped.\n\n## Current Promotion\nHistorical promotion logic should be refreshed deterministically.\n\n## Historical Notes\nKeep this section.\n',
      'utf-8'
    )

    const suggestions = await buildPromotionSuggestions({
      projectDir: root,
      archiveDir,
      feature,
    })

    expect(suggestions).toHaveLength(6)
    expect(suggestions).toContainEqual(expect.objectContaining({
      type: 'UPDATE',
      targetArea: 'design',
      targetPath: historicalCurrentPath,
      strategy: 'synthesized_refresh',
    }))
    expect(suggestions.find(suggestion => suggestion.targetPath === historicalCurrentPath)?.reason).toContain('reliable historical design match')
  })

  test('falls back to direct migration when no reliable historical current doc exists', async () => {
    const root = createRoot('.test-current-promotion-fallback')
    const feature = 'archive-improvements'
    const archiveDir = join(root, 'docs', 'archive', feature)

    await mkdir(archiveDir, { recursive: true })
    await mkdir(join(root, 'docs', 'current', 'archive-authority'), { recursive: true })
    await writeFile(
      join(archiveDir, 'design.md'),
      '# Archive Command Improvements\n\n## Promotion Flow\nRefresh archive aligned current docs.\n',
      'utf-8'
    )
    await writeFile(
      join(root, 'docs', 'current', 'archive-authority', 'design.md'),
      '# Brainstorm Workflow\n\n## Question Flow\nPrompt the user for missing details.\n',
      'utf-8'
    )

    const suggestions = await buildPromotionSuggestions({
      projectDir: root,
      archiveDir,
      feature,
    })

    expect(suggestions).toHaveLength(6)
    expect(suggestions).toContainEqual(expect.objectContaining({
      type: 'UPDATE',
      targetArea: 'design',
      targetPath: join(root, 'docs', 'current', 'archive-authority', 'design.md'),
      strategy: 'direct_migration',
    }))
    expect(suggestions).toContainEqual(expect.objectContaining({
      type: 'ADD',
      targetArea: 'design',
      targetPath: join(root, 'docs', 'current', 'feature-lifecycle', 'design.md'),
      strategy: 'direct_migration',
    }))
    expect(suggestions[0]?.reason).toContain('no reliable historical design match')
  })

  test('synthesizes current docs by refreshing matched sections and preserving unrelated history', async () => {
    const root = createRoot('.test-current-promotion-apply')
    const source = join(root, 'docs', 'archive', 'promo-b', 'design.md')
    const target = join(root, 'docs', 'current', 'archive-authority', 'design.md')

    await mkdir(join(root, 'docs', 'archive', 'promo-b'), { recursive: true })
    await mkdir(join(root, 'docs', 'current', 'archive-authority'), { recursive: true })
    await writeFile(
      source,
      '# Archive Command Improvements\n\n## Problem Statement\nArchive cleanup must keep current docs aligned.\n\n## Current Promotion\nRefresh current docs by merging archive sections with history.\n\n## New Section\nPromote archive results by default.\n',
      'utf-8'
    )
    await writeFile(
      target,
      '# Archive Workflow\n\n## Problem Statement\nOld description that should be replaced.\n\n## Historical Notes\nKeep this section from history.\n\n## Current Promotion\nOld promotion text that should be refreshed.\n',
      'utf-8'
    )

    const result = await applyPromotionSuggestions({
      projectDir: root,
      suggestions: [
        {
          type: 'UPDATE',
          targetArea: 'design',
          sourcePath: source,
          targetPath: target,
          strategy: 'synthesized_refresh',
          reason: 'test synthesized refresh',
        },
      ],
    })

    expect(result.applied).toHaveLength(1)
    const content = await readFile(target, 'utf-8')
    expect(content).toContain('Archive cleanup must keep current docs aligned.')
    expect(content).toContain('Refresh current docs by merging archive sections with history.')
    expect(content).toContain('Keep this section from history.')
    expect(content).toContain('Promote archive results by default.')
    expect(content).not.toContain('Old description that should be replaced.')
  })
})
