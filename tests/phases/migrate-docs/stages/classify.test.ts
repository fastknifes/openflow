/**
 * Tests for classify stage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { runClassifyStage } from '../../../../src/phases/migrate-docs/stages/classify'
import {
  toKebabCase,
  convertChineseSegment,
  normalizePathSegment,
  normalizeTargetPath,
  getConfidenceLevel,
  applyConfidenceThreshold,
  detectTargetCollisions,
  detectLifecycleConflicts,
  detectAdrConflicts,
  checkExistingFiles,
  generateMediumConfidenceQuestions,
  generateCollisionQuestions,
  generateLifecycleQuestions,
  generateAdrQuestion,
  generateOverwriteQuestions,
} from '../../../../src/phases/migrate-docs/stages/classify'
import { createInitialMigrationState } from '../../../../src/phases/migrate-docs/state-machine'
import type { DocAdapter, FileInventory, ClassificationResult, TargetCategory } from '../../../../src/phases/migrate-docs/types'
import type { SourceType } from '../../../../src/phases/migrate-docs/types'
import { CONFIDENCE_THRESHOLDS } from '../../../../src/phases/migrate-docs/types'

function makeInventoryItem(relPath: string): FileInventory {
  return {
    sourcePath: path.join(process.cwd(), 'tests', 'fixtures', 'classify-shared', relPath),
    relativePath: relPath,
    size: 100,
    modifiedAt: new Date().toISOString(),
    extension: path.extname(relPath),
    directoryContext: path.dirname(relPath) === '.' ? '' : path.dirname(relPath),
  }
}

function makeClassification(
  item: FileInventory,
  targetType: TargetCategory,
  score: number,
  proposedPath?: string
): ClassificationResult {
  const level = score >= CONFIDENCE_THRESHOLDS.HIGH
    ? 'high'
    : score >= CONFIDENCE_THRESHOLDS.MEDIUM_LOW
      ? 'medium'
      : 'low'

  return {
    inventoryItem: item,
    targetType,
    confidence: level,
    confidenceScore: score,
    adapterUsed: 'generic',
    reasoning: `Test classification for ${item.relativePath}`,
    proposedTargetPath: proposedPath || `docs/${targetType}/${path.basename(item.relativePath)}`,
  }
}

describe('runClassifyStage', () => {
  let tempDir: string
  let sourceDir: string
  let targetRoot: string

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'classify-test-' + Date.now())
    sourceDir = path.join(tempDir, 'source')
    targetRoot = path.join(tempDir, 'target')
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.mkdir(targetRoot, { recursive: true })
  })

  afterEach(async () => {
    try {
      const entries = await fs.readdir(tempDir, { withFileTypes: true, recursive: true })
      const sorted = entries
        .map(e => ({
          path: path.join(tempDir, e.parentPath ? path.relative(tempDir, e.parentPath) : '', e.name),
          dirent: e,
        }))
        .sort((a, b) => b.path.split(path.sep).length - a.path.split(path.sep).length)

      for (const { path: p, dirent } of sorted) {
        if (dirent.isDirectory()) {
          await fs.rmdir(p).catch(() => {})
        } else {
          await fs.unlink(p).catch(() => {})
        }
      }
      await fs.rmdir(tempDir).catch(() => {})
    } catch {
      // Ignore cleanup errors
    }
  })

  function createMockAdapter(classifications: ClassificationResult[]): DocAdapter {
    return {
      name: 'generic' as SourceType,
      detect: async () => ({ adapter: 'generic', detected: true, confidence: 0.3 }),
      scan: async () => [],
      classify: async () => classifications,
    }
  }

  function makeInventoryItem(relPath: string): FileInventory {
    return {
      sourcePath: path.join(sourceDir, relPath),
      relativePath: relPath,
      size: 100,
      modifiedAt: new Date().toISOString(),
      extension: path.extname(relPath),
      directoryContext: path.dirname(relPath) === '.' ? '' : path.dirname(relPath),
    }
  }

  function makeClassification(
    item: FileInventory,
    targetType: TargetCategory,
    score: number,
    proposedPath?: string
  ): ClassificationResult {
    const level = score >= CONFIDENCE_THRESHOLDS.HIGH
      ? 'high'
      : score >= CONFIDENCE_THRESHOLDS.MEDIUM_LOW
        ? 'medium'
        : 'low'

    return {
      inventoryItem: item,
      targetType,
      confidence: level,
      confidenceScore: score,
      adapterUsed: 'generic',
      reasoning: `Test classification for ${item.relativePath}`,
      proposedTargetPath: proposedPath || `docs/${targetType}/${path.basename(item.relativePath)}`,
    }
  }

  function createClassifyState(inventory: FileInventory[]): ReturnType<typeof createInitialMigrationState> {
    const state = createInitialMigrationState(sourceDir, targetRoot, 'generic')
    // Manually advance to classify stage
    const s = { ...state, stage: 'classify' as const, inventory }
    return s
  }

  // ========================================================================
  // Confidence Threshold Tests
  // ========================================================================

  describe('confidence thresholds', () => {
    it('should auto-route high-confidence items (>=0.7) to target', async () => {
      const item = makeInventoryItem('api-spec.md')
      const classification = makeClassification(item, 'current/spec', 0.85, 'docs/current/spec/api-spec.md')
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      expect(result.stage).toBe('clarify')
      expect(result.classifications).toHaveLength(1)
      expect(result.classifications[0]!.targetType).toBe('current/spec')
      expect(result.classifications[0]!.confidenceScore).toBe(0.85)
      expect(result.classifications[0]!.confidence).toBe('high')
      // Should NOT add to pending questions for high confidence
      const mediumQuestions = result.pendingQuestions.filter(q => q.header.startsWith('Clarification:'))
      expect(mediumQuestions).toHaveLength(0)
    })

    it('should add medium-confidence items (0.4-0.7) to clarification queue', async () => {
      const item = makeInventoryItem('design-doc.md')
      const classification = makeClassification(item, 'current/design', 0.5, 'docs/current/design/design-doc.md')
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      expect(result.stage).toBe('clarify')
      expect(result.classifications).toHaveLength(1)
      expect(result.classifications[0]!.targetType).toBe('current/design')
      expect(result.classifications[0]!.confidenceScore).toBe(0.5)
      expect(result.classifications[0]!.confidence).toBe('medium')
      // Should add to pending questions
      const mediumQuestions = result.pendingQuestions.filter(q => q.header.startsWith('Clarification:'))
      expect(mediumQuestions).toHaveLength(1)
      expect(mediumQuestions[0]!.batchTopic).toBe('current/design')
      expect(mediumQuestions[0]!.affectedFiles).toContain('design-doc.md')
    })

    it('should auto-route low-confidence items (<0.4) to references/raw/', async () => {
      const item = makeInventoryItem('random-notes.md')
      const classification = makeClassification(item, 'current/spec', 0.3, 'docs/current/spec/random-notes.md')
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      expect(result.stage).toBe('clarify')
      expect(result.classifications).toHaveLength(1)
      expect(result.classifications[0]!.targetType).toBe('references/raw')
      expect(result.classifications[0]!.confidenceScore).toBe(0.3)
      expect(result.classifications[0]!.confidence).toBe('low')
      expect(result.classifications[0]!.proposedTargetPath).toMatch(/^docs\/references\/raw\//)
    })

    it('should correctly handle mixed confidence levels', async () => {
      const items = [
        makeInventoryItem('high.md'),
        makeInventoryItem('medium.md'),
        makeInventoryItem('low.md'),
      ]
      const classifications = [
        makeClassification(items[0]!, 'current/spec', 0.85),
        makeClassification(items[1]!, 'current/design', 0.55),
        makeClassification(items[2]!, 'changes', 0.25),
      ]
      const adapter = createMockAdapter(classifications)
      const state = createClassifyState(items)

      const result = await runClassifyStage(state, adapter)

      expect(result.classifications).toHaveLength(3)
      expect(result.classifications[0]!.confidence).toBe('high')
      expect(result.classifications[1]!.confidence).toBe('medium')
      expect(result.classifications[2]!.confidence).toBe('low')
      expect(result.classifications[2]!.targetType).toBe('references/raw')

      const stageResult = result.stageResults.find(r => r.stage === 'classify')
      expect(stageResult).toBeDefined()
      expect(stageResult!.metadata).toMatchObject({
        autoRoutedHigh: 1,
        clarificationQueue: 1,
        lowConfidenceRouted: 1,
      })
    })
  })

  // ========================================================================
  // Conflict Detection Tests
  // ========================================================================

  describe('conflict detection', () => {
    it('should detect target collisions and batch by topic', async () => {
      const items = [
        makeInventoryItem('doc-a.md'),
        makeInventoryItem('doc-b.md'),
      ]
      const classifications = [
        makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/same-target.md'),
        makeClassification(items[1]!, 'current/spec', 0.85, 'docs/current/spec/same-target.md'),
      ]
      const adapter = createMockAdapter(classifications)
      const state = createClassifyState(items)

      const result = await runClassifyStage(state, adapter)

      // Should have exactly one conflict question for the collision
      const collisionQuestions = result.pendingQuestions.filter(q =>
        q.header.includes('Conflict: Target Collision')
      )
      expect(collisionQuestions).toHaveLength(1)
      // Should list both affected files
      expect(collisionQuestions[0]!.affectedFiles).toHaveLength(2)
      expect(collisionQuestions[0]!.affectedFiles).toContain('doc-a.md')
      expect(collisionQuestions[0]!.affectedFiles).toContain('doc-b.md')

      // Should have one conflict record
      expect(result.conflicts.filter(c => c.type === 'target-collision')).toHaveLength(1)
    })

    it('should detect lifecycle conflicts (current vs archive for same topic)', async () => {
      const items = [
        makeInventoryItem('current/api.md'),
        makeInventoryItem('archive/api.md'),
      ]
      const classifications = [
        makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/api.md'),
        makeClassification(items[1]!, 'archive', 0.85, 'docs/archive/api.md'),
      ]
      const adapter = createMockAdapter(classifications)
      const state = createClassifyState(items)

      const result = await runClassifyStage(state, adapter)

      const lifecycleQuestions = result.pendingQuestions.filter(q =>
        q.header.includes('Conflict: Lifecycle Mismatch')
      )
      expect(lifecycleQuestions).toHaveLength(1)
      expect(lifecycleQuestions[0]!.batchTopic).toMatch(/^lifecycle-/)

      expect(result.conflicts.filter(c => c.type === 'lifecycle-conflict')).toHaveLength(1)
    })

    it('should detect conflicting ADR candidates', async () => {
      const items = [
        makeInventoryItem('adr-1.md'),
        makeInventoryItem('adr-2.md'),
        makeInventoryItem('adr-3.md'),
      ]
      const classifications = [
        makeClassification(items[0]!, 'decisions', 0.6, 'docs/decisions/adr-1.md'),
        makeClassification(items[1]!, 'decisions', 0.6, 'docs/decisions/adr-2.md'),
        makeClassification(items[2]!, 'decisions', 0.6, 'docs/decisions/adr-3.md'),
      ]
      const adapter = createMockAdapter(classifications)
      const state = createClassifyState(items)

      const result = await runClassifyStage(state, adapter)

      // Should have exactly ONE ADR question (batched)
      const adrQuestions = result.pendingQuestions.filter(q =>
        q.header.includes('Clarification: ADR Candidates')
      )
      expect(adrQuestions).toHaveLength(1)
      expect(adrQuestions[0]!.affectedFiles).toHaveLength(3)

      // Should have one conflict record for multiple ADR candidates
      expect(result.conflicts.filter(c => c.type === 'adr-candidate')).toHaveLength(1)
    })

    it('should not create ADR conflict for single ADR candidate', async () => {
      const items = [
        makeInventoryItem('adr-1.md'),
      ]
      const classifications = [
        makeClassification(items[0]!, 'decisions', 0.6, 'docs/decisions/adr-1.md'),
      ]
      const adapter = createMockAdapter(classifications)
      const state = createClassifyState(items)

      const result = await runClassifyStage(state, adapter)

      // Should have the ADR question but no conflict record
      const adrQuestions = result.pendingQuestions.filter(q =>
        q.header.includes('Clarification: ADR Candidates')
      )
      expect(adrQuestions).toHaveLength(1)
      expect(result.conflicts.filter(c => c.type === 'adr-candidate')).toHaveLength(0)
    })
  })

  // ========================================================================
  // Naming / Kebab-case Tests
  // ========================================================================

  describe('naming rules', () => {
    it('should convert Chinese directory names to English kebab-case', async () => {
      const item = makeInventoryItem('用户管理设计.md')
      const classification = makeClassification(
        item,
        'current/design',
        0.85,
        'docs/current/design/用户管理设计.md'
      )
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      const classified = result.classifications[0]!
      expect(classified.proposedTargetPath).toContain('user-management')
      expect(classified.proposedTargetPath).not.toMatch(/[\u4e00-\u9fa5]/)
    })

    it('should convert mixed Chinese-English names', async () => {
      const item = makeInventoryItem('API设计.md')
      const classification = makeClassification(
        item,
        'current/design',
        0.85,
        'docs/current/design/API设计.md'
      )
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      expect(result.classifications[0]!.proposedTargetPath).toBe('docs/current/design/api-design.md')
    })

    it('should apply kebab-case to camelCase filenames', async () => {
      const item = makeInventoryItem('APISpecifications.md')
      const classification = makeClassification(
        item,
        'current/spec',
        0.85,
        'docs/current/spec/APISpecifications.md'
      )
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      expect(result.classifications[0]!.proposedTargetPath).toBe('docs/current/spec/api-specifications.md')
    })

    it('should preserve date-prefixed feature directories', async () => {
      const item = makeInventoryItem('design.md')
      const classification = makeClassification(
        item,
        'changes',
        0.85,
        'docs/changes/2026-04-22-用户管理/design.md'
      )
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      expect(result.classifications[0]!.proposedTargetPath).toBe('docs/changes/2026-04-22-user-management/design.md')
    })

    it('should convert unmapped Chinese names to unknown-topic', async () => {
      const item = makeInventoryItem('未映射名称.md')
      const classification = makeClassification(
        item,
        'changes',
        0.85,
        'docs/changes/未映射名称/file.md'
      )
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      expect(result.classifications[0]!.proposedTargetPath).toContain('unknown-topic')
    })
  })

  // ========================================================================
  // Overwrite Confirmation Tests
  // ========================================================================

  describe('overwrite confirmation', () => {
    it('should detect existing target files and add overwrite-confirmation queue', async () => {
      const item = makeInventoryItem('api.md')
      const classification = makeClassification(item, 'current/spec', 0.85, 'docs/current/spec/api.md')
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      // Create existing file in target
      const existingDir = path.join(targetRoot, 'docs', 'current', 'spec')
      await fs.mkdir(existingDir, { recursive: true })
      await fs.writeFile(path.join(existingDir, 'api.md'), '# Existing')

      const result = await runClassifyStage(state, adapter)

      const overwriteQuestions = result.pendingQuestions.filter(q =>
        q.header.startsWith('Overwrite Confirmation')
      )
      expect(overwriteQuestions).toHaveLength(1)
      expect(overwriteQuestions[0]!.affectedFiles).toContain('api.md')
    })

    it('should batch overwrite questions by target category', async () => {
      const items = [
        makeInventoryItem('api.md'),
        makeInventoryItem('design.md'),
      ]
      const classifications = [
        makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/api.md'),
        makeClassification(items[1]!, 'current/design', 0.85, 'docs/current/design/design.md'),
      ]
      const adapter = createMockAdapter(classifications)
      const state = createClassifyState(items)

      // Create existing files in both categories
      await fs.mkdir(path.join(targetRoot, 'docs', 'current', 'spec'), { recursive: true })
      await fs.writeFile(path.join(targetRoot, 'docs', 'current', 'spec', 'api.md'), '# Existing')
      await fs.mkdir(path.join(targetRoot, 'docs', 'current', 'design'), { recursive: true })
      await fs.writeFile(path.join(targetRoot, 'docs', 'current', 'design', 'design.md'), '# Existing')

      const result = await runClassifyStage(state, adapter)

      // Should have two separate overwrite questions (one per category)
      const overwriteQuestions = result.pendingQuestions.filter(q =>
        q.header.startsWith('Overwrite Confirmation')
      )
      expect(overwriteQuestions).toHaveLength(2)
    })

    it('should not add overwrite question when target does not exist', async () => {
      const item = makeInventoryItem('new-file.md')
      const classification = makeClassification(item, 'current/spec', 0.85, 'docs/current/spec/new-file.md')
      const adapter = createMockAdapter([classification])
      const state = createClassifyState([item])

      const result = await runClassifyStage(state, adapter)

      const overwriteQuestions = result.pendingQuestions.filter(q =>
        q.header.startsWith('Overwrite Confirmation')
      )
      expect(overwriteQuestions).toHaveLength(0)
    })
  })
})

// ============================================================================
// Helper Function Unit Tests
// ============================================================================

describe('toKebabCase', () => {
  it('should convert camelCase to kebab-case', () => {
    expect(toKebabCase('APISpecifications')).toBe('api-specifications')
    expect(toKebabCase('userManagement')).toBe('user-management')
  })

  it('should convert spaces to hyphens', () => {
    expect(toKebabCase('API Specifications')).toBe('api-specifications')
  })

  it('should convert underscores to hyphens', () => {
    expect(toKebabCase('api_specifications')).toBe('api-specifications')
  })

  it('should lowercase everything', () => {
    expect(toKebabCase('UPPERCASE')).toBe('uppercase')
  })

  it('should collapse multiple hyphens', () => {
    expect(toKebabCase('api--specifications')).toBe('api-specifications')
  })

  it('should trim leading/trailing hyphens', () => {
    expect(toKebabCase('-api-')).toBe('api')
  })

  it('should return unknown for empty string', () => {
    expect(toKebabCase('')).toBe('unknown')
  })

  it('should remove special characters', () => {
    expect(toKebabCase('api@spec#1')).toBe('api-spec-1')
  })
})

describe('convertChineseSegment', () => {
  it('should convert known Chinese terms', () => {
    expect(convertChineseSegment('用户管理')).toBe('user-management')
    expect(convertChineseSegment('API设计')).toBe('api-design')
  })

  it('should handle partial Chinese matches', () => {
    expect(convertChineseSegment('用户管理设计')).toBe('user-management-design')
  })

  it('should return unknown-topic for unmapped Chinese', () => {
    expect(convertChineseSegment('未映射名称')).toBe('unknown-topic')
  })

  it('should preserve English parts of mixed strings', () => {
    expect(convertChineseSegment('API设计')).toBe('api-design')
  })
})

describe('normalizePathSegment', () => {
  it('should handle date-prefixed feature directories', () => {
    expect(normalizePathSegment('2026-04-22-用户管理')).toBe('2026-04-22-user-management')
  })

  it('should convert Chinese and kebab-case', () => {
    expect(normalizePathSegment('用户管理设计')).toBe('user-management-design')
  })

  it('should handle plain English', () => {
    expect(normalizePathSegment('apiDesign')).toBe('api-design')
  })
})

describe('normalizeTargetPath', () => {
  it('should normalize paths with Chinese segments', () => {
    const result = normalizeTargetPath('docs/current/design/用户管理设计.md', 'current/design')
    expect(result).toBe('docs/current/design/user-management-design.md')
  })

  it('should normalize paths with spaces', () => {
    const result = normalizeTargetPath('docs/current/spec/API Specifications.md', 'current/spec')
    expect(result).toBe('docs/current/spec/api-specifications.md')
  })

  it('should handle date-prefixed feature directories', () => {
    const result = normalizeTargetPath('docs/changes/2026-04-22-用户管理/design.md', 'changes')
    expect(result).toBe('docs/changes/2026-04-22-user-management/design.md')
  })

  it('should handle references/raw paths', () => {
    const result = normalizeTargetPath('docs/references/raw/Random Notes.md', 'references/raw')
    expect(result).toBe('docs/references/raw/random-notes.md')
  })
})

describe('getConfidenceLevel', () => {
  it('should return high for >= 0.7', () => {
    expect(getConfidenceLevel(0.7)).toBe('high')
    expect(getConfidenceLevel(0.9)).toBe('high')
  })

  it('should return medium for 0.4-0.7', () => {
    expect(getConfidenceLevel(0.4)).toBe('medium')
    expect(getConfidenceLevel(0.5)).toBe('medium')
    expect(getConfidenceLevel(0.69)).toBe('medium')
  })

  it('should return low for < 0.4', () => {
    expect(getConfidenceLevel(0.39)).toBe('low')
    expect(getConfidenceLevel(0.1)).toBe('low')
  })
})

describe('applyConfidenceThreshold', () => {
  it('should keep high-confidence classification unchanged', () => {
    const item = makeInventoryItem('test.md')
    const c = makeClassification(item, 'current/spec', 0.85)
    const result = applyConfidenceThreshold(c)

    expect(result.targetType).toBe('current/spec')
    expect(result.confidenceScore).toBe(0.85)
    expect(result.confidence).toBe('high')
  })

  it('should keep medium-confidence classification but normalize path', () => {
    const item = makeInventoryItem('test.md')
    const c = makeClassification(item, 'current/design', 0.5, 'docs/current/design/test doc.md')
    const result = applyConfidenceThreshold(c)

    expect(result.targetType).toBe('current/design')
    expect(result.confidenceScore).toBe(0.5)
    expect(result.confidence).toBe('medium')
    expect(result.proposedTargetPath).toBe('docs/current/design/test-doc.md')
  })

  it('should reroute low-confidence to references/raw/', () => {
    const item = makeInventoryItem('test.md')
    const c = makeClassification(item, 'current/spec', 0.3, 'docs/current/spec/test.md')
    const result = applyConfidenceThreshold(c)

    expect(result.targetType).toBe('references/raw')
    expect(result.confidenceScore).toBe(0.3)
    expect(result.confidence).toBe('low')
    expect(result.proposedTargetPath).toBe('docs/references/raw/test.md')
  })
})

describe('detectTargetCollisions', () => {
  it('should detect multiple files targeting same path', () => {
    const items = [
      makeInventoryItem('a.md'),
      makeInventoryItem('b.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/target.md'),
      makeClassification(items[1]!, 'current/spec', 0.85, 'docs/current/spec/target.md'),
    ]

    const collisions = detectTargetCollisions(classifications)
    expect(collisions).toHaveLength(1)
    expect(collisions[0]!.targetPath).toBe('docs/current/spec/target.md')
    expect(collisions[0]!.sources).toHaveLength(2)
  })

  it('should not flag unique targets', () => {
    const items = [
      makeInventoryItem('a.md'),
      makeInventoryItem('b.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/a.md'),
      makeClassification(items[1]!, 'current/spec', 0.85, 'docs/current/spec/b.md'),
    ]

    const collisions = detectTargetCollisions(classifications)
    expect(collisions).toHaveLength(0)
  })
})

describe('detectLifecycleConflicts', () => {
  it('should detect current vs archive for same topic', () => {
    const items = [
      makeInventoryItem('current/api.md'),
      makeInventoryItem('archive/api.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/api.md'),
      makeClassification(items[1]!, 'archive', 0.85, 'docs/archive/api.md'),
    ]

    const conflicts = detectLifecycleConflicts(classifications)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]!.topic).toBe('api')
  })

  it('should not flag when only current exists', () => {
    const items = [makeInventoryItem('current/api.md')]
    const classifications = [
      makeClassification(items[0]!, 'current/spec', 0.85),
    ]

    const conflicts = detectLifecycleConflicts(classifications)
    expect(conflicts).toHaveLength(0)
  })
})

describe('detectAdrConflicts', () => {
  it('should return items when multiple ADR candidates exist', () => {
    const items = [
      makeInventoryItem('adr1.md'),
      makeInventoryItem('adr2.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'decisions', 0.6),
      makeClassification(items[1]!, 'decisions', 0.6),
    ]

    const result = detectAdrConflicts(classifications)
    expect(result).toHaveLength(2)
  })

  it('should return empty array for single ADR candidate', () => {
    const items = [makeInventoryItem('adr1.md')]
    const classifications = [makeClassification(items[0]!, 'decisions', 0.6)]

    const result = detectAdrConflicts(classifications)
    expect(result).toHaveLength(0)
  })
})

describe('checkExistingFiles', () => {
  let tempDir: string
  let targetRoot: string

  beforeEach(async () => {
    tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'classify-overwrite-' + Date.now())
    targetRoot = path.join(tempDir, 'target')
    await fs.mkdir(targetRoot, { recursive: true })
  })

  afterEach(async () => {
    try {
      const entries = await fs.readdir(tempDir, { withFileTypes: true, recursive: true })
      const sorted = entries
        .map(e => ({
          path: path.join(tempDir, e.parentPath ? path.relative(tempDir, e.parentPath) : '', e.name),
          dirent: e,
        }))
        .sort((a, b) => b.path.split(path.sep).length - a.path.split(path.sep).length)

      for (const { path: p, dirent } of sorted) {
        if (dirent.isDirectory()) {
          await fs.rmdir(p).catch(() => {})
        } else {
          await fs.unlink(p).catch(() => {})
        }
      }
      await fs.rmdir(tempDir).catch(() => {})
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should detect existing files', async () => {
    const existingPath = path.join(targetRoot, 'docs', 'current', 'spec')
    await fs.mkdir(existingPath, { recursive: true })
    await fs.writeFile(path.join(existingPath, 'api.md'), '# Existing')

    const state = createInitialMigrationState('/source', targetRoot)
    const item = makeInventoryItem('api.md')
    const classification = makeClassification(item, 'current/spec', 0.85, 'docs/current/spec/api.md')

    const result = await checkExistingFiles(state, [classification])
    expect(result).toHaveLength(1)
    expect(result[0]!.existingPath).toBe(path.join(targetRoot, 'docs', 'current', 'spec', 'api.md'))
  })

  it('should return empty when no files exist', async () => {
    const state = createInitialMigrationState('/source', targetRoot)
    const item = makeInventoryItem('new.md')
    const classification = makeClassification(item, 'current/spec', 0.85, 'docs/current/spec/new.md')

    const result = await checkExistingFiles(state, [classification])
    expect(result).toHaveLength(0)
  })
})

describe('question generators', () => {
  it('generateMediumConfidenceQuestions should group by category', () => {
    const items = [
      makeInventoryItem('a.md'),
      makeInventoryItem('b.md'),
      makeInventoryItem('c.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'current/spec', 0.5),
      makeClassification(items[1]!, 'current/spec', 0.55),
      makeClassification(items[2]!, 'current/design', 0.6),
    ]

    const questions = generateMediumConfidenceQuestions(classifications)
    expect(questions).toHaveLength(2)
    // One for current/spec with 2 files
    const specQuestion = questions.find(q => q.batchTopic === 'current/spec')
    expect(specQuestion).toBeDefined()
    expect(specQuestion!.affectedFiles).toHaveLength(2)
    // One for current/design with 1 file
    const designQuestion = questions.find(q => q.batchTopic === 'current/design')
    expect(designQuestion).toBeDefined()
    expect(designQuestion!.affectedFiles).toHaveLength(1)
  })

  it('generateCollisionQuestions should create one question per collision', () => {
    const items = [
      makeInventoryItem('a.md'),
      makeInventoryItem('b.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/collision.md'),
      makeClassification(items[1]!, 'current/spec', 0.85, 'docs/current/spec/collision.md'),
    ]

    const collisions = detectTargetCollisions(classifications)
    const questions = generateCollisionQuestions(collisions)
    expect(questions).toHaveLength(1)
    expect(questions[0]!.batchTopic).toBe('collision-docs/current/spec/collision.md')
  })

  it('generateAdrQuestion should batch all ADR candidates', () => {
    const items = [
      makeInventoryItem('adr1.md'),
      makeInventoryItem('adr2.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'decisions', 0.6),
      makeClassification(items[1]!, 'decisions', 0.6),
    ]

    const question = generateAdrQuestion(classifications)
    expect(question).not.toBeNull()
    expect(question!.affectedFiles).toHaveLength(2)
    expect(question!.batchTopic).toBe('adr-candidates')
  })

  it('generateAdrQuestion should return null for empty array', () => {
    const question = generateAdrQuestion([])
    expect(question).toBeNull()
  })

  it('generateOverwriteQuestions should batch by category', () => {
    const items = [
      makeInventoryItem('a.md'),
      makeInventoryItem('b.md'),
    ]
    const classifications = [
      makeClassification(items[0]!, 'current/spec', 0.85, 'docs/current/spec/a.md'),
      makeClassification(items[1]!, 'current/design', 0.85, 'docs/current/design/b.md'),
    ]

    const overwrites = [
      { classification: classifications[0]!, existingPath: '/target/docs/current/spec/a.md' },
      { classification: classifications[1]!, existingPath: '/target/docs/current/design/b.md' },
    ]

    const questions = generateOverwriteQuestions(overwrites)
    expect(questions).toHaveLength(2)
    expect(questions[0]!.batchTopic).toMatch(/^overwrite-/)
  })
})
