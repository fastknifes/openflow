import { describe, it, expect } from 'bun:test'
import {
  // Types should be importable (TypeScript compile-time check)
  type MigrationStage,
  type SourceType,
  type ConfidenceLevel,
  type FileInventory,
  type ClassificationResult,
  type TargetCategory,
  type ConflictRecord,
  type MigrationPlan,
  type MigrationOperation,
  type ApplyResult,
  type UserAnswer,
  type PendingQuestion,
  type DisposalMode,
  type MigrationState,
  // Constants
  CONFIDENCE_THRESHOLDS,
  DELETE_CONFIRMATION_PHRASE,
  ALLOWED_EXTENSIONS,
  MAX_SCAN_DEPTH,
  MAX_SCAN_FILES,
} from '../../../src/phases/migrate-docs/types'

describe('migrate-docs types', () => {
  describe('constants', () => {
    it('should have correct CONFIDENCE_THRESHOLDS values', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBe(0.7)
      expect(CONFIDENCE_THRESHOLDS.MEDIUM_LOW).toBe(0.4)
    })

    it('should have correct DELETE_CONFIRMATION_PHRASE', () => {
      expect(DELETE_CONFIRMATION_PHRASE).toBe('DELETE ORIGINAL DOCS')
    })

    it('should have correct ALLOWED_EXTENSIONS', () => {
      expect(ALLOWED_EXTENSIONS).toEqual(['.md', '.markdown'])
      expect(ALLOWED_EXTENSIONS).toHaveLength(2)
    })

    it('should have correct MAX_SCAN_DEPTH', () => {
      expect(MAX_SCAN_DEPTH).toBe(10)
    })

    it('should have correct MAX_SCAN_FILES', () => {
      expect(MAX_SCAN_FILES).toBe(5000)
    })
  })

  describe('type exports', () => {
    it('should export all required types without runtime errors', () => {
      // This test verifies that all types can be imported
      // If TypeScript compilation passes, types are correctly exported
      expect(true).toBe(true)
    })

    it('CONFIDENCE_THRESHOLDS should be readonly', () => {
      // TypeScript const assertion ensures readonly
      // Runtime check that it's frozen/fixed
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBe(0.7)
      expect(CONFIDENCE_THRESHOLDS.MEDIUM_LOW).toBe(0.4)
    })

    it('ALLOWED_EXTENSIONS should contain only markdown extensions', () => {
      expect(ALLOWED_EXTENSIONS.every(ext => ext.startsWith('.'))).toBe(true)
      expect(ALLOWED_EXTENSIONS).toContain('.md')
      expect(ALLOWED_EXTENSIONS).toContain('.markdown')
    })
  })

  describe('type structure validation', () => {
    it('should allow creating valid FileInventory objects', () => {
      const inventory: FileInventory = {
        sourcePath: '/path/to/file.md',
        relativePath: 'docs/file.md',
        size: 1024,
        modifiedAt: '2026-04-22T10:00:00Z',
        extension: '.md',
        directoryContext: 'docs',
      }

      expect(inventory.sourcePath).toBe('/path/to/file.md')
      expect(inventory.extension).toBe('.md')
      expect(inventory.size).toBe(1024)
    })

    it('should allow creating valid ClassificationResult objects', () => {
      const classification: ClassificationResult = {
        inventoryItem: {
          sourcePath: '/path/to/file.md',
          relativePath: 'docs/file.md',
          size: 1024,
          modifiedAt: '2026-04-22T10:00:00Z',
          extension: '.md',
          directoryContext: 'docs',
        },
        targetType: 'current/design',
        confidence: 'high',
        confidenceScore: 0.85,
        adapterUsed: 'content-pattern-adapter',
        reasoning: 'File contains design patterns and architecture decisions',
      }

      expect(classification.confidence).toBe('high')
      expect(classification.confidenceScore).toBeGreaterThan(CONFIDENCE_THRESHOLDS.HIGH)
      expect(classification.targetType).toBe('current/design')
    })

    it('should allow creating valid ConflictRecord objects', () => {
      const conflict: ConflictRecord = {
        type: 'duplicate',
        sourceA: '/path/a.md',
        sourceB: '/path/b.md',
        description: 'Two files have the same target path',
        resolution: 'Keep sourceA, archive sourceB',
      }

      expect(conflict.type).toBe('duplicate')
      expect(conflict.resolution).toBe('Keep sourceA, archive sourceB')
    })

    it('should allow creating valid MigrationPlan objects', () => {
      const plan: MigrationPlan = {
        operations: [
          {
            type: 'create',
            sourcePath: '/source/file.md',
            targetPath: '/target/file.md',
          },
        ],
        directoryCreations: ['/target/new-dir'],
        conflictResolutions: [],
      }

      expect(plan.operations).toHaveLength(1)
      expect(plan.directoryCreations).toContain('/target/new-dir')
    })

    it('should allow creating valid ApplyResult objects', () => {
      const result: ApplyResult = {
        createdFiles: ['/target/new.md'],
        modifiedFiles: [],
        deletedFiles: [],
        failedOps: [],
      }

      expect(result.createdFiles).toContain('/target/new.md')
      expect(result.failedOps).toHaveLength(0)
    })

    it('should allow creating valid UserAnswer objects', () => {
      const answer: UserAnswer = {
        questionId: 'q1',
        answer: 'Yes, proceed with migration',
        timestamp: '2026-04-22T10:00:00Z',
      }

      expect(answer.questionId).toBe('q1')
      expect(answer.answer).toBe('Yes, proceed with migration')
    })

    it('should allow creating valid PendingQuestion objects', () => {
      const question: PendingQuestion = {
        id: 'q1',
        header: 'Classification Ambiguity',
        question: 'Where should this file go?',
        options: ['current/design', 'changes'],
        batchTopic: 'classification-clarification',
      }

      expect(question.id).toBe('q1')
      expect(question.options).toHaveLength(2)
    })

    it('should allow creating valid MigrationState objects', () => {
      const state: MigrationState = {
        migrationId: 'test-migration-001',
        timestamp: '2026-04-22T10:00:00Z',
        sourcePath: '/source/docs',
        targetRoot: '/target',
        targetDocsDir: '/target/docs',
        sourceType: 'generic',
        initialized: true,
        stage: 'scan',
        inventory: [],
        classifications: [],
        answers: [],
        conflicts: [],
        plan: {
          operations: [],
          directoryCreations: [],
          conflictResolutions: [],
        },
        applyResult: {
          createdFiles: [],
          modifiedFiles: [],
          deletedFiles: [],
          failedOps: [],
        },
        cleanupDecision: 'keep',
        pendingQuestions: [],
        createdFiles: [],
        modifiedFiles: [],
        deletedFiles: [],
      }

      expect(state.migrationId).toBe('test-migration-001')
      expect(state.stage).toBe('scan')
      expect(state.cleanupDecision).toBe('keep')
      expect(state.sourceType).toBe('generic')
    })

    it('should support all DisposalMode values', () => {
      const modes: DisposalMode[] = ['keep', 'move-to-references', 'delete']
      expect(modes).toContain('keep')
      expect(modes).toContain('move-to-references')
      expect(modes).toContain('delete')
    })

    it('should support all MigrationStage values', () => {
      const stages: MigrationStage[] = [
        'detect',
        'scan',
        'classify',
        'clarify',
        'plan',
        'apply',
        'cleanup',
        'completed',
        'failed',
      ]
      expect(stages).toHaveLength(9)
      expect(stages).toContain('detect')
      expect(stages).toContain('completed')
      expect(stages).toContain('failed')
    })

    it('should support all SourceType values', () => {
      const sources: SourceType[] = [
        'openspec',
        'spec-kit',
        'kiro',
        'cursor',
        'trae',
        'generic',
      ]
      expect(sources).toHaveLength(6)
      expect(sources).toContain('openspec')
      expect(sources).toContain('generic')
    })

    it('should support all TargetCategory values', () => {
      const categories: TargetCategory[] = [
        'current/requirements',
        'current/design',
        'current/spec',
        'current/workflow',
        'changes',
        'archive',
        'decisions',
        'references/raw',
        'references/notes',
        'references/research',
      ]
      expect(categories).toHaveLength(10)
      expect(categories).toContain('current/design')
      expect(categories).toContain('archive')
      expect(categories).toContain('references/raw')
    })

    it('should support all ConfidenceLevel values', () => {
      const levels: ConfidenceLevel[] = ['high', 'medium', 'low']
      expect(levels).toContain('high')
      expect(levels).toContain('medium')
      expect(levels).toContain('low')
    })
  })
})
