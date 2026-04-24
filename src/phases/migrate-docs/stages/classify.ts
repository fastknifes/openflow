/**
 * Classify Stage
 *
 * 1) Run adapter.classify(state.inventory) to get initial classifications.
 * 2) Apply confidence threshold rules:
 *    - high (≥0.7) → auto-route to target
 *    - medium (0.4–0.7) → add to clarification queue
 *    - low (<0.4) → route to references/raw/ automatically
 * 3) Detect conflicts:
 *    - same target path from multiple source files
 *    - conflicting lifecycle (current vs archive for same topic)
 *    - conflicting ADR candidates
 * 4) Group conflicts by topic (not per-file).
 * 5) For existing docs/ content in target: check if same filename exists,
 *    if so add to overwrite-confirmation queue.
 * 6) Generate pending clarification questions batched by topic.
 * 7) Update state with classifications, conflicts, pending questions. Advance to 'clarify'.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { DocAdapter } from '../adapters/types.js'
import type {
  MigrationState,
  ClassificationResult,
  TargetCategory,
  ConfidenceLevel,
  PendingQuestion,
} from '../types.js'
import { CONFIDENCE_THRESHOLDS } from '../types.js'
import {
  markStageCompleted,
  addPendingQuestion,
  addConflict,
} from '../state-machine.js'

// ============================================================================
// Chinese to English Mapping Table
// ============================================================================

const CHINESE_NAME_MAP: Record<string, string> = {
  // Common business terms
  '用户管理': 'user-management',
  '用户': 'user',
  '管理': 'management',
  'API设计': 'api-design',
  'API': 'api',
  '设计': 'design',
  '需求': 'requirements',
  '规格': 'spec',
  '规范': 'specification',
  '架构': 'architecture',
  '流程': 'workflow',
  '工作流': 'workflow',
  '文档': 'docs',
  '说明': 'guide',
  '指南': 'guide',
  '配置': 'config',
  '设置': 'settings',
  '测试': 'testing',
  '部署': 'deployment',
  '发布': 'release',
  '版本': 'version',
  '变更': 'changes',
  '变更记录': 'changelog',
  '历史': 'history',
  '归档': 'archive',
  '参考': 'reference',
  '引用': 'reference',
  '笔记': 'notes',
  '研究': 'research',
  '调研': 'research',
  '决策': 'decisions',
  '旧版': 'legacy',
  '废弃': 'deprecated',
  '核心': 'core',
  '基础': 'core',
  '通用': 'common',
  '公共': 'common',
  '工具': 'utils',
  '辅助': 'helpers',
}

// ============================================================================
// Path Normalization Helpers
// ============================================================================

/**
 * Convert a string to kebab-case
 */
export function toKebabCase(str: string): string {
  const kebab = str
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return kebab || 'unknown'
}

/**
 * Convert Chinese characters in a path segment to English equivalents
 */
export function convertChineseSegment(segment: string): string {
  const hadChinese = /[\u4e00-\u9fa5]/.test(segment)
  let converted = segment

  // Apply mapping table (longest matches first)
  const sortedEntries = Object.entries(CHINESE_NAME_MAP).sort(
    (a, b) => b[0].length - a[0].length
  )
  for (const [cn, en] of sortedEntries) {
    converted = converted.replace(new RegExp(cn, 'g'), `-${en}-`)
  }

  // Replace any remaining Chinese chars with separators, then normalize
  converted = converted
    .replace(/[\u4e00-\u9fa5]/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!converted) return 'unknown-topic'

  return hadChinese ? toKebabCase(converted) : converted
}

/**
 * Normalize a path segment (convert Chinese + kebab-case)
 * Handles date-prefixed feature directories: 2026-04-22-feature-name
 */
export function normalizePathSegment(segment: string): string {
  const converted = convertChineseSegment(segment)

  // Handle date-prefixed feature directories
  const dateMatch = converted.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/)
  if (dateMatch) {
    const [, date, featureName] = dateMatch
    const normalizedFeature = toKebabCase(featureName ?? 'feature')
    return `${date}-${normalizedFeature || 'feature'}`
  }

  return toKebabCase(converted)
}

/**
 * Normalize a full target path
 * Preserves the docs/{category}/ prefix, normalizes the rest
 */
export function normalizeTargetPath(
  proposedPath: string,
  targetType: TargetCategory
): string {
  if (!proposedPath) {
    return `docs/${targetType}/untitled.md`
  }

  const targetPrefix = `docs/${targetType}`

  // Extract the path after the target type prefix
  let rest = ''
  if (proposedPath.startsWith('docs/')) {
    // Try to find where the category ends and the rest begins
    const parts = proposedPath.split('/')
    // parts[0] = 'docs', parts[1] = category or subcategory, etc.
    // Find how many parts belong to the targetType
    const targetParts = targetType.split('/')
    if (parts.length > 1 + targetParts.length) {
      rest = parts.slice(1 + targetParts.length).join('/')
    } else {
      // No extra path beyond target type
      rest = path.basename(proposedPath)
    }
  } else {
    rest = path.basename(proposedPath)
  }

  // Normalize each segment
  const segments = rest.split('/').filter(Boolean)
  const normalizedSegments = segments.map((seg, index) => {
    const isLast = index === segments.length - 1
    if (isLast && seg.toLowerCase().endsWith('.md')) {
      const name = seg.slice(0, -3)
      const ext = '.md'
      return normalizePathSegment(name) + ext
    }
    return normalizePathSegment(seg)
  })

  if (normalizedSegments.length === 0) {
    return `${targetPrefix}/untitled.md`
  }

  return `${targetPrefix}/${normalizedSegments.join('/')}`
}

// ============================================================================
// Confidence Threshold Application
// ============================================================================

/**
 * Get confidence level from numerical score
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH) return 'high'
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM_LOW) return 'medium'
  return 'low'
}

/**
 * Apply confidence threshold rules to classification
 * - low (<0.4) → route to references/raw/
 */
export function applyConfidenceThreshold(
  classification: ClassificationResult
): ClassificationResult {
  const score = classification.confidenceScore
  const level = getConfidenceLevel(score)

  if (score < CONFIDENCE_THRESHOLDS.MEDIUM_LOW) {
    // Low confidence - reroute to references/raw/
    const originalPath = classification.proposedTargetPath || ''
    const fileName = path.basename(originalPath) || 'untitled.md'
    const name = fileName.replace(/\.md$/i, '')
    const normalizedName = normalizePathSegment(name)
    const newPath = `docs/references/raw/${normalizedName}.md`

    return {
      ...classification,
      targetType: 'references/raw' as TargetCategory,
      confidence: 'low',
      confidenceScore: Math.min(score, 0.3),
      reasoning: `${classification.reasoning} (Low confidence ${score.toFixed(2)} - auto-routed to references/raw/)`,
      proposedTargetPath: newPath,
    }
  }

  // Medium or high confidence - keep adapter's target, normalize path
  const normalizedPath = normalizeTargetPath(
    classification.proposedTargetPath || '',
    classification.targetType
  )

  return {
    ...classification,
    confidence: level,
    proposedTargetPath: normalizedPath,
  }
}

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect target path collisions (multiple sources targeting same destination)
 */
export function detectTargetCollisions(
  classifications: ClassificationResult[]
): Array<{ targetPath: string; sources: ClassificationResult[] }> {
  const pathMap = new Map<string, ClassificationResult[]>()

  for (const c of classifications) {
    const targetPath = c.proposedTargetPath
    if (!targetPath) continue

    const existing = pathMap.get(targetPath) || []
    existing.push(c)
    pathMap.set(targetPath, existing)
  }

  const collisions: Array<{ targetPath: string; sources: ClassificationResult[] }> = []
  for (const [targetPath, sources] of pathMap.entries()) {
    if (sources.length > 1) {
      collisions.push({ targetPath, sources })
    }
  }

  return collisions
}

/**
 * Detect lifecycle conflicts (current vs archive for same topic)
 */
export function detectLifecycleConflicts(
  classifications: ClassificationResult[]
): Array<{ topic: string; current: ClassificationResult[]; archive: ClassificationResult[] }> {
  const currentItems = classifications.filter(c => c.targetType.startsWith('current/'))
  const archiveItems = classifications.filter(c => c.targetType === 'archive')

  // Group by base filename (without extension and without date prefix)
  const currentByTopic = groupByTopic(currentItems)
  const archiveByTopic = groupByTopic(archiveItems)

  const conflicts: Array<{ topic: string; current: ClassificationResult[]; archive: ClassificationResult[] }> = []

  for (const [topic, current] of currentByTopic.entries()) {
    const archive = archiveByTopic.get(topic)
    if (archive && archive.length > 0) {
      conflicts.push({ topic, current, archive })
    }
  }

  return conflicts
}

/**
 * Detect ADR candidate conflicts (multiple files targeting decisions/)
 */
export function detectAdrConflicts(
  classifications: ClassificationResult[]
): ClassificationResult[] {
  const adrItems = classifications.filter(c => c.targetType === 'decisions')
  return adrItems.length > 1 ? adrItems : []
}

function getAdrCandidates(classifications: ClassificationResult[]): ClassificationResult[] {
  return classifications.filter(c => c.targetType === 'decisions')
}

/**
 * Extract topic from classification for grouping
 */
function groupByTopic(
  classifications: ClassificationResult[]
): Map<string, ClassificationResult[]> {
  const groups = new Map<string, ClassificationResult[]>()

  for (const c of classifications) {
    const topic = extractTopic(c)
    const existing = groups.get(topic) || []
    existing.push(c)
    groups.set(topic, existing)
  }

  return groups
}

/**
 * Extract a topic key from a classification for conflict grouping
 */
function extractTopic(c: ClassificationResult): string {
  const fileName = path.basename(c.inventoryItem.relativePath)
  // Remove extension
  const name = fileName.replace(/\.md$/i, '')
  // Remove date prefix
  const withoutDate = name.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  // Convert to kebab-case for normalization
  return toKebabCase(withoutDate)
}

// ============================================================================
// Existing File Check
// ============================================================================

/**
 * Check which classifications would overwrite existing files
 */
export async function checkExistingFiles(
  state: MigrationState,
  classifications: ClassificationResult[]
): Promise<Array<{ classification: ClassificationResult; existingPath: string }>> {
  const overwrites: Array<{ classification: ClassificationResult; existingPath: string }> = []

  for (const c of classifications) {
    if (!c.proposedTargetPath) continue

    const fullPath = path.join(state.targetRoot, c.proposedTargetPath)

    try {
      const stats = await fs.stat(fullPath)
      if (stats.isFile()) {
        overwrites.push({ classification: c, existingPath: fullPath })
      }
    } catch {
      // File doesn't exist - no conflict
    }
  }

  return overwrites
}

// ============================================================================
// Question Generation
// ============================================================================

/**
 * Generate questions for medium-confidence items (batched by target category)
 */
export function generateMediumConfidenceQuestions(
  items: ClassificationResult[]
): Array<Omit<PendingQuestion, 'id'>> {
  // Group by target category
  const byCategory = new Map<string, ClassificationResult[]>()

  for (const item of items) {
    const key = item.targetType
    const existing = byCategory.get(key) || []
    existing.push(item)
    byCategory.set(key, existing)
  }

  const questions: Array<Omit<PendingQuestion, 'id'>> = []

  for (const [category, groupItems] of byCategory.entries()) {
    const displayCategory = category.replace(/\//g, ' / ')

    questions.push({
      header: `Clarification: ${displayCategory}`,
      question: `${groupItems.length} file(s) have medium confidence for '${displayCategory}'. Please review and choose how to proceed.`,
      options: [
        { label: 'Accept proposal', description: `Route to ${displayCategory}`, value: 'accept' },
        { label: 'Route to alternative', description: 'Move to references/raw/', value: 'alternative' },
        { label: 'Skip', description: 'Do not migrate these files', value: 'skip' },
      ],
      batchTopic: category,
      affectedFiles: groupItems.map(i => i.inventoryItem.relativePath),
      classificationProposal: groupItems,
    })
  }

  return questions
}

/**
 * Generate questions for target collisions
 */
export function generateCollisionQuestions(
  collisions: Array<{ targetPath: string; sources: ClassificationResult[] }>
): Array<Omit<PendingQuestion, 'id'>> {
  return collisions.map(collision => {
    const fileNames = collision.sources.map(s => path.basename(s.inventoryItem.relativePath))

    return {
      header: `Conflict: Target Collision`,
      question: `Multiple files target the same path: ${collision.targetPath}\n\nAffected files:\n${fileNames.map(f => `  - ${f}`).join('\n')}`,
      options: [
        { label: 'Use first file', description: `Use ${fileNames[0]}`, value: 'accept-first' },
        { label: 'Route all to alternative', description: 'Move all to references/raw/', value: 'alternative' },
        { label: 'Skip all', description: 'Do not migrate these files', value: 'skip' },
      ],
      batchTopic: `collision-${collision.targetPath}`,
      affectedFiles: collision.sources.map(s => s.inventoryItem.relativePath),
      conflictDescription: `Target collision: ${collision.targetPath}`,
    }
  })
}

/**
 * Generate questions for lifecycle conflicts
 */
export function generateLifecycleQuestions(
  conflicts: Array<{ topic: string; current: ClassificationResult[]; archive: ClassificationResult[] }>
): Array<Omit<PendingQuestion, 'id'>> {
  return conflicts.map(conflict => {
    const currentFiles = conflict.current.map(c => path.basename(c.inventoryItem.relativePath))
    const archiveFiles = conflict.archive.map(c => path.basename(c.inventoryItem.relativePath))

    return {
      header: `Conflict: Lifecycle Mismatch`,
      question: `Files for topic '${conflict.topic}' appear in both current/ and archive/ categories.\n\nCurrent: ${currentFiles.join(', ')}\nArchive: ${archiveFiles.join(', ')}`,
      options: [
        { label: 'Prefer current', description: 'Keep current versions, skip archive', value: 'prefer-current' },
        { label: 'Prefer archive', description: 'Keep archive versions, skip current', value: 'prefer-archive' },
        { label: 'Route all to references', description: 'Move all to references/raw/', value: 'alternative' },
      ],
      batchTopic: `lifecycle-${conflict.topic}`,
      affectedFiles: [
        ...conflict.current.map(c => c.inventoryItem.relativePath),
        ...conflict.archive.map(c => c.inventoryItem.relativePath),
      ],
      conflictDescription: `Lifecycle conflict for topic: ${conflict.topic}`,
    }
  })
}

/**
 * Generate question for ADR candidates
 */
export function generateAdrQuestion(
  adrItems: ClassificationResult[]
): Omit<PendingQuestion, 'id'> | null {
  if (adrItems.length === 0) return null

  const fileNames = adrItems.map(c => path.basename(c.inventoryItem.relativePath))

  return {
    header: `Clarification: ADR Candidates`,
    question: `${adrItems.length} file(s) are candidates for decisions/ (ADR). These require explicit confirmation.\n\nCandidates:\n${fileNames.map(f => `  - ${f}`).join('\n')}`,
    options: [
      { label: 'Confirm as ADRs', description: 'Route to docs/decisions/', value: 'accept' },
      { label: 'Route to references', description: 'Move to references/notes/', value: 'alternative' },
      { label: 'Skip', description: 'Do not migrate these files', value: 'skip' },
    ],
    batchTopic: 'adr-candidates',
    affectedFiles: adrItems.map(i => i.inventoryItem.relativePath),
    classificationProposal: adrItems,
  }
}

/**
 * Generate questions for overwrites (batched by category)
 */
export function generateOverwriteQuestions(
  overwrites: Array<{ classification: ClassificationResult; existingPath: string }>
): Array<Omit<PendingQuestion, 'id'>> {
  // Group by target category
  const byCategory = new Map<string, Array<{ classification: ClassificationResult; existingPath: string }>>()

  for (const overwrite of overwrites) {
    const category = overwrite.classification.targetType
    const existing = byCategory.get(category) || []
    existing.push(overwrite)
    byCategory.set(category, existing)
  }

  const questions: Array<Omit<PendingQuestion, 'id'>> = []

  for (const [category, groupItems] of byCategory.entries()) {
    const displayCategory = category.replace(/\//g, ' / ')
    const fileNames = groupItems.map(o => path.basename(o.classification.proposedTargetPath || ''))

    questions.push({
      header: `Overwrite Confirmation: ${displayCategory}`,
      question: `${groupItems.length} file(s) would overwrite existing content in ${displayCategory}.\n\nFiles:\n${fileNames.map(f => `  - ${f}`).join('\n')}`,
      options: [
        { label: 'Overwrite', description: 'Replace existing files', value: 'overwrite' },
        { label: 'Skip', description: 'Keep existing files, skip migration', value: 'skip' },
      ],
      batchTopic: `overwrite-${category}`,
      affectedFiles: groupItems.map(o => o.classification.inventoryItem.relativePath),
    })
  }

  return questions
}

// ============================================================================
// Main Classify Stage
// ============================================================================

/**
 * Run the classify stage
 */
export async function runClassifyStage(
  state: MigrationState,
  adapter: DocAdapter
): Promise<MigrationState> {
  // 1. Get initial classifications from adapter
  const rawClassifications = await adapter.classify(state.inventory)

  // 2. Apply confidence thresholds and normalize paths
  let classifications = rawClassifications.map(applyConfidenceThreshold)

  // 3. Detect conflicts
  const targetCollisions = detectTargetCollisions(classifications)
  const lifecycleConflicts = detectLifecycleConflicts(classifications)
  const adrConflicts = detectAdrConflicts(classifications)
  const adrCandidates = getAdrCandidates(classifications)

  // 4. Check for existing files that would be overwritten
  const overwrites = await checkExistingFiles(state, classifications)

  // 5. Build updated state
  let updatedState: MigrationState = {
    ...state,
    classifications,
  }

  // 6. Add conflict records
  // Target collisions
  for (const collision of targetCollisions) {
    updatedState = addConflict(updatedState, {
      type: 'target-collision',
      sourceA: collision.sources[0]!.inventoryItem.relativePath,
      sourceB: collision.sources[1]?.inventoryItem.relativePath || collision.sources[0]!.inventoryItem.relativePath,
      description: `Multiple files target the same path: ${collision.targetPath}`,
    })
  }

  // Lifecycle conflicts
  for (const conflict of lifecycleConflicts) {
    updatedState = addConflict(updatedState, {
      type: 'lifecycle-conflict',
      sourceA: conflict.current[0]!.inventoryItem.relativePath,
      sourceB: conflict.archive[0]!.inventoryItem.relativePath,
      description: `Lifecycle conflict for topic '${conflict.topic}': present in both current and archive`,
    })
  }

  // ADR conflicts (multiple ADR candidates)
  if (adrConflicts.length > 1) {
    updatedState = addConflict(updatedState, {
      type: 'adr-candidate',
      sourceA: adrConflicts[0]!.inventoryItem.relativePath,
      sourceB: adrConflicts[1]!.inventoryItem.relativePath,
      description: `Multiple ADR candidates detected (${adrConflicts.length} files)`,
    })
  }

  // 7. Generate clarification questions
  // Medium confidence items
  const mediumConfidenceItems = classifications.filter(
    c => c.confidenceScore >= CONFIDENCE_THRESHOLDS.MEDIUM_LOW &&
         c.confidenceScore < CONFIDENCE_THRESHOLDS.HIGH
  )

  const mediumConfidenceQuestions = generateMediumConfidenceQuestions(mediumConfidenceItems)
  for (const question of mediumConfidenceQuestions) {
    updatedState = addPendingQuestion(updatedState, question)
  }

  // Target collision questions
  const collisionQuestions = generateCollisionQuestions(targetCollisions)
  for (const question of collisionQuestions) {
    updatedState = addPendingQuestion(updatedState, question)
  }

  // Lifecycle conflict questions
  const lifecycleQuestions = generateLifecycleQuestions(lifecycleConflicts)
  for (const question of lifecycleQuestions) {
    updatedState = addPendingQuestion(updatedState, question)
  }

  // ADR candidate question
  const adrQuestion = generateAdrQuestion(adrCandidates)
  if (adrQuestion) {
    updatedState = addPendingQuestion(updatedState, adrQuestion)
  }

  // Overwrite confirmation questions
  const overwriteQuestions = generateOverwriteQuestions(overwrites)
  for (const question of overwriteQuestions) {
    updatedState = addPendingQuestion(updatedState, question)
  }

  // 8. Calculate statistics for stage result
  const stats = {
    totalClassified: classifications.length,
    autoRoutedHigh: classifications.filter(c => c.confidenceScore >= CONFIDENCE_THRESHOLDS.HIGH).length,
    clarificationQueue: mediumConfidenceItems.length,
    lowConfidenceRouted: classifications.filter(c => c.confidenceScore < CONFIDENCE_THRESHOLDS.MEDIUM_LOW).length,
    conflictsDetected: targetCollisions.length + lifecycleConflicts.length + (adrConflicts.length > 1 ? 1 : 0),
    overwritesDetected: overwrites.length,
    pendingQuestions: updatedState.pendingQuestions.length,
  }

  // 9. Mark classify stage as completed and advance to clarify
  return markStageCompleted(updatedState, 'classify', {
    metadata: stats,
  })
}
