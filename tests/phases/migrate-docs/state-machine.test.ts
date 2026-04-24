/**
 * Tests for migration state machine
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createInitialMigrationState,
  advanceStage,
  markStageCompleted,
  markFailed,
  isValidStageTransition,
  wouldSkipStages,
  getExpectedNextStage,
  getPendingQuestions,
  getNextPendingQuestion,
  hasPendingQuestions,
  addPendingQuestion,
  resolvePendingQuestion,
  removePendingQuestion,
  addConflict,
  resolveConflict,
  getUnresolvedConflicts,
  normalizeMigrationState,
  StageTransitionError,
  StateError,
} from '../../../src/phases/migrate-docs/state-machine'
import { type MigrationState, type PendingQuestion, STAGE_ORDER } from '../../../src/phases/migrate-docs/types'

describe('State Machine', () => {
  describe('createInitialMigrationState', () => {
    it('should create initial state with correct defaults', () => {
      const state = createInitialMigrationState('/source', '/target', 'openspec')

      expect(state.version).toBe(1)
      expect(state.stage).toBe('detect')
      expect(state.sourcePath).toBe('/source')
      expect(state.targetRoot).toBe('/target')
      expect(state.sourceType).toBe('openspec')
      expect(state.disposalMode).toBe('keep')
      expect(state.dryRun).toBe(false)
      expect(state.inventory).toEqual([])
      expect(state.classifications).toEqual([])
      expect(state.conflicts).toEqual([])
      expect(state.pendingQuestions).toEqual([])
      expect(state.resolvedQuestions).toEqual([])
      expect(state.stageResults).toEqual([])
      expect(state.migrationId).toMatch(/^migration-/)
    })

    it('should accept custom options', () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-custom-123',
        disposalMode: 'delete',
        dryRun: true,
      })

      expect(state.migrationId).toBe('migration-custom-123')
      expect(state.disposalMode).toBe('delete')
      expect(state.dryRun).toBe(true)
      expect(state.sourceType).toBeNull()
    })

    it('should generate unique migration IDs', () => {
      const state1 = createInitialMigrationState('/source1', '/target1')
      const state2 = createInitialMigrationState('/source2', '/target2')

      expect(state1.migrationId).not.toBe(state2.migrationId)
    })
  })

  describe('Stage Transitions', () => {
    let state: MigrationState

    beforeEach(() => {
      state = createInitialMigrationState('/source', '/target', 'openspec')
    })

    describe('isValidStageTransition', () => {
      it('should allow same stage transitions', () => {
        expect(isValidStageTransition('detect', 'detect')).toBe(true)
        expect(isValidStageTransition('scan', 'scan')).toBe(true)
      })

      it('should allow valid forward transitions', () => {
        expect(isValidStageTransition('detect', 'scan')).toBe(true)
        expect(isValidStageTransition('scan', 'classify')).toBe(true)
        expect(isValidStageTransition('classify', 'clarify')).toBe(true)
        expect(isValidStageTransition('clarify', 'plan')).toBe(true)
        expect(isValidStageTransition('plan', 'apply')).toBe(true)
        expect(isValidStageTransition('apply', 'cleanup')).toBe(true)
        expect(isValidStageTransition('cleanup', 'completed')).toBe(true)
      })

      it('should allow transition to failed from any stage', () => {
        expect(isValidStageTransition('detect', 'failed')).toBe(true)
        expect(isValidStageTransition('scan', 'failed')).toBe(true)
        expect(isValidStageTransition('apply', 'failed')).toBe(true)
        expect(isValidStageTransition('completed', 'failed')).toBe(false) // completed is terminal
      })

      it('should disallow backward transitions', () => {
        expect(isValidStageTransition('scan', 'detect')).toBe(false)
        expect(isValidStageTransition('classify', 'scan')).toBe(false)
        expect(isValidStageTransition('completed', 'cleanup')).toBe(false)
      })

      it('should disallow invalid stage names', () => {
        expect(isValidStageTransition('detect', 'invalid' as any)).toBe(false)
      })
    })

    describe('wouldSkipStages', () => {
      it('should return false for same stage', () => {
        expect(wouldSkipStages('detect', 'detect')).toBe(false)
      })

      it('should return false for sequential transitions', () => {
        expect(wouldSkipStages('detect', 'scan')).toBe(false)
        expect(wouldSkipStages('scan', 'classify')).toBe(false)
      })

      it('should return true for skipped stages', () => {
        expect(wouldSkipStages('detect', 'classify')).toBe(true)
        expect(wouldSkipStages('detect', 'completed')).toBe(true)
      })

      it('should return false for transition to failed', () => {
        expect(wouldSkipStages('detect', 'failed')).toBe(false)
      })
    })

    describe('getExpectedNextStage', () => {
      it('should return the next stage in sequence', () => {
        expect(getExpectedNextStage('detect')).toBe('scan')
        expect(getExpectedNextStage('scan')).toBe('classify')
        expect(getExpectedNextStage('cleanup')).toBe('completed')
      })

      it('should return null for terminal stages', () => {
        expect(getExpectedNextStage('completed')).toBeNull()
        expect(getExpectedNextStage('failed')).toBeNull()
      })
    })

    describe('advanceStage', () => {
      it('should advance to the next stage', () => {
        const newState = advanceStage(state, 'scan')
        expect(newState.stage).toBe('scan')
        // Timestamp should be a valid ISO string
        expect(newState.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })

      it('should throw for invalid transitions', () => {
        state = { ...state, stage: 'scan' }
        expect(() => advanceStage(state, 'detect')).toThrow(StageTransitionError)
      })

      it('should throw for skipped stages', () => {
        expect(() => advanceStage(state, 'classify')).toThrow(StageTransitionError)
        expect(() => advanceStage(state, 'completed')).toThrow(StageTransitionError)
      })

      it('should allow transition to failed', () => {
        state = { ...state, stage: 'scan' }
        const newState = advanceStage(state, 'failed')
        expect(newState.stage).toBe('failed')
      })
    })

    describe('markStageCompleted', () => {
      it('should mark stage as completed and advance', () => {
        const newState = markStageCompleted(state, 'detect')
        expect(newState.stage).toBe('scan')
        expect(newState.stageResults).toHaveLength(1)
        expect(newState.stageResults[0].stage).toBe('detect')
        expect(newState.stageResults[0].completedAt).toBeDefined()
      })

      it('should include optional metadata', () => {
        const newState = markStageCompleted(state, 'detect', {
          metadata: { filesScanned: 42 },
        })
        expect(newState.stageResults[0].metadata).toEqual({ filesScanned: 42 })
      })

      it('should throw if trying to complete wrong stage', () => {
        expect(() => markStageCompleted(state, 'scan')).toThrow(StageTransitionError)
      })

      it('should throw if no next stage', () => {
        state = { ...state, stage: 'completed' }
        expect(() => markStageCompleted(state, 'completed')).toThrow(StageTransitionError)
      })
    })

    describe('markFailed', () => {
      it('should mark migration as failed with error message', () => {
        const errorMsg = 'Something went wrong'
        const newState = markFailed(state, errorMsg)
        expect(newState.stage).toBe('failed')
        expect(newState.lastError).toBe(errorMsg)
      })

      it('should update timestamp', () => {
        const newState = markFailed(state, 'error')
        // Timestamp should be a valid ISO string
        expect(newState.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })
  })

  describe('Full Stage Sequence', () => {
    it('should progress through all stages in order', () => {
      let state = createInitialMigrationState('/source', '/target')

      // Progress through all stages
      state = markStageCompleted(state, 'detect')
      expect(state.stage).toBe('scan')

      state = markStageCompleted(state, 'scan')
      expect(state.stage).toBe('classify')

      state = markStageCompleted(state, 'classify')
      expect(state.stage).toBe('clarify')

      state = markStageCompleted(state, 'clarify')
      expect(state.stage).toBe('plan')

      state = markStageCompleted(state, 'plan')
      expect(state.stage).toBe('apply')

      state = markStageCompleted(state, 'apply')
      expect(state.stage).toBe('cleanup')

      state = markStageCompleted(state, 'cleanup')
      expect(state.stage).toBe('completed')

      // Should have all stage results
      expect(state.stageResults).toHaveLength(7)
      expect(state.stageResults.map(r => r.stage)).toEqual([
        'detect', 'scan', 'classify', 'clarify', 'plan', 'apply', 'cleanup'
      ])
    })
  })

  describe('Pending Questions', () => {
    let state: MigrationState

    beforeEach(() => {
      state = createInitialMigrationState('/source', '/target')
    })

    describe('addPendingQuestion', () => {
      it('should add a pending question', () => {
        const newState = addPendingQuestion(state, {
          header: 'Test Header',
          question: 'Test Question?',
          options: [{ label: 'Option 1', description: 'Desc 1' }],
          batchTopic: 'test-topic',
        })

        expect(newState.pendingQuestions).toHaveLength(1)
        expect(newState.pendingQuestions[0].header).toBe('Test Header')
        expect(newState.pendingQuestions[0].question).toBe('Test Question?')
        expect(newState.pendingQuestions[0].id).toBeDefined()
      })

      it('should generate unique IDs', () => {
        const state1 = addPendingQuestion(state, {
          header: 'Q1',
          question: 'Question 1?',
          options: [],
          batchTopic: 'topic1',
        })
        const state2 = addPendingQuestion(state1, {
          header: 'Q2',
          question: 'Question 2?',
          options: [],
          batchTopic: 'topic2',
        })

        expect(state2.pendingQuestions[0].id).not.toBe(state2.pendingQuestions[1].id)
      })

      it('should update timestamp', () => {
        const newState = addPendingQuestion(state, {
          header: 'Test',
          question: 'Test?',
          options: [],
          batchTopic: 'test',
        })
        // Timestamp should be a valid ISO string
        expect(newState.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })

    describe('getPendingQuestions', () => {
      it('should return unresolved questions', () => {
        state = addPendingQuestion(state, {
          header: 'Q1',
          question: 'Q1?',
          options: [],
          batchTopic: 'topic',
        })
        const q1 = state.pendingQuestions[0]

        expect(getPendingQuestions(state)).toHaveLength(1)

        state = resolvePendingQuestion(state, q1.id, 'answer1')
        expect(getPendingQuestions(state)).toHaveLength(0)
      })

      it('should filter out resolved questions', () => {
        state = addPendingQuestion(state, {
          header: 'Q1',
          question: 'Q1?',
          options: [],
          batchTopic: 'topic',
        })
        state = addPendingQuestion(state, {
          header: 'Q2',
          question: 'Q2?',
          options: [],
          batchTopic: 'topic',
        })

        const q1 = state.pendingQuestions[0]
        state = resolvePendingQuestion(state, q1.id, 'answer1')

        const pending = getPendingQuestions(state)
        expect(pending).toHaveLength(1)
        expect(pending[0].header).toBe('Q2')
      })
    })

    describe('getNextPendingQuestion', () => {
      it('should return the first pending question', () => {
        state = addPendingQuestion(state, {
          header: 'First',
          question: 'First?',
          options: [],
          batchTopic: 'topic',
        })

        const next = getNextPendingQuestion(state)
        expect(next?.header).toBe('First')
      })

      it('should return undefined when no pending questions', () => {
        expect(getNextPendingQuestion(state)).toBeUndefined()
      })
    })

    describe('hasPendingQuestions', () => {
      it('should return true when there are pending questions', () => {
        state = addPendingQuestion(state, {
          header: 'Test',
          question: 'Test?',
          options: [],
          batchTopic: 'topic',
        })
        expect(hasPendingQuestions(state)).toBe(true)
      })

      it('should return false when all questions are resolved', () => {
        state = addPendingQuestion(state, {
          header: 'Test',
          question: 'Test?',
          options: [],
          batchTopic: 'topic',
        })
        state = resolvePendingQuestion(state, state.pendingQuestions[0].id, 'answer')
        expect(hasPendingQuestions(state)).toBe(false)
      })
    })

    describe('resolvePendingQuestion', () => {
      it('should record the answer', () => {
        state = addPendingQuestion(state, {
          header: 'Test',
          question: 'Test?',
          options: [],
          batchTopic: 'topic',
        })
        const qid = state.pendingQuestions[0].id

        const newState = resolvePendingQuestion(state, qid, 'my-answer')

        expect(newState.resolvedQuestions).toHaveLength(1)
        expect(newState.resolvedQuestions[0].questionId).toBe(qid)
        expect(newState.resolvedQuestions[0].answer).toBe('my-answer')
        expect(newState.resolvedQuestions[0].timestamp).toBeDefined()
      })

      it('should throw if question not found', () => {
        expect(() => resolvePendingQuestion(state, 'nonexistent', 'answer')).toThrow(StateError)
      })

      it('should throw if question already resolved', () => {
        state = addPendingQuestion(state, {
          header: 'Test',
          question: 'Test?',
          options: [],
          batchTopic: 'topic',
        })
        const qid = state.pendingQuestions[0].id
        state = resolvePendingQuestion(state, qid, 'answer1')

        expect(() => resolvePendingQuestion(state, qid, 'answer2')).toThrow(StateError)
      })
    })

    describe('removePendingQuestion', () => {
      it('should remove the question without resolving it', () => {
        state = addPendingQuestion(state, {
          header: 'Test',
          question: 'Test?',
          options: [],
          batchTopic: 'topic',
        })
        const qid = state.pendingQuestions[0].id

        const newState = removePendingQuestion(state, qid)

        expect(newState.pendingQuestions).toHaveLength(0)
        expect(newState.resolvedQuestions).toHaveLength(0)
      })
    })
  })

  describe('Conflict Management', () => {
    let state: MigrationState

    beforeEach(() => {
      state = createInitialMigrationState('/source', '/target')
    })

    describe('addConflict', () => {
      it('should add a conflict record', () => {
        const newState = addConflict(state, {
          type: 'target-collision',
          sourceA: '/path/a.md',
          sourceB: '/path/b.md',
          description: 'Both files target the same destination',
        })

        expect(newState.conflicts).toHaveLength(1)
        expect(newState.conflicts[0].type).toBe('target-collision')
        expect(newState.conflicts[0].sourceA).toBe('/path/a.md')
        expect(newState.conflicts[0].id).toBeDefined()
      })

      it('should generate unique conflict IDs', () => {
        const state1 = addConflict(state, {
          type: 'target-collision',
          sourceA: '/a.md',
          sourceB: '/b.md',
          description: 'Conflict 1',
        })
        const state2 = addConflict(state1, {
          type: 'lifecycle-conflict',
          sourceA: '/c.md',
          sourceB: '/d.md',
          description: 'Conflict 2',
        })

        expect(state2.conflicts[0].id).not.toBe(state2.conflicts[1].id)
      })
    })

    describe('resolveConflict', () => {
      it('should mark conflict as resolved', () => {
        state = addConflict(state, {
          type: 'target-collision',
          sourceA: '/a.md',
          sourceB: '/b.md',
          description: 'Conflict',
        })
        const cid = state.conflicts[0].id

        const newState = resolveConflict(state, cid, 'accepted')

        expect(newState.conflicts[0].resolution).toBe('accepted')
        expect(newState.conflicts[0].timestamp).toBeDefined()
      })

      it('should support alternative resolution with target', () => {
        state = addConflict(state, {
          type: 'target-collision',
          sourceA: '/a.md',
          sourceB: '/b.md',
          description: 'Conflict',
        })
        const cid = state.conflicts[0].id

        const newState = resolveConflict(state, cid, 'alternative', 'references/raw')

        expect(newState.conflicts[0].resolution).toBe('alternative')
        expect(newState.conflicts[0].resolutionTarget).toBe('references/raw')
      })

      it('should throw if conflict not found', () => {
        expect(() => resolveConflict(state, 'nonexistent', 'accepted')).toThrow(StateError)
      })
    })

    describe('getUnresolvedConflicts', () => {
      it('should return only unresolved conflicts', () => {
        state = addConflict(state, {
          type: 'target-collision',
          sourceA: '/a.md',
          sourceB: '/b.md',
          description: 'Conflict 1',
        })
        state = addConflict(state, {
          type: 'lifecycle-conflict',
          sourceA: '/c.md',
          sourceB: '/d.md',
          description: 'Conflict 2',
        })

        const cid1 = state.conflicts[0].id
        state = resolveConflict(state, cid1, 'accepted')

        const unresolved = getUnresolvedConflicts(state)
        expect(unresolved).toHaveLength(1)
        expect(unresolved[0].description).toBe('Conflict 2')
      })
    })
  })

  describe('State Normalization', () => {
    it('should normalize valid state', () => {
      const raw = {
        version: 1,
        migrationId: 'migration-test-123',
        stage: 'scan',
        sourcePath: '/source',
        targetRoot: '/target',
        sourceType: 'openspec',
        disposalMode: 'keep',
        dryRun: false,
        stageResults: [{ stage: 'detect', completedAt: '2024-01-01T00:00:00Z' }],
        startedAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        inventory: [],
        classifications: [],
        conflicts: [],
        pendingQuestions: [],
        resolvedQuestions: [],
      }

      const state = normalizeMigrationState(raw)
      expect(state.migrationId).toBe('migration-test-123')
      expect(state.stage).toBe('scan')
    })

    it('should throw for invalid state (missing migrationId)', () => {
      expect(() => normalizeMigrationState({ sourcePath: '/s', targetRoot: '/t' })).toThrow(StateError)
    })

    it('should throw for invalid state (missing sourcePath)', () => {
      expect(() => normalizeMigrationState({ migrationId: 'test', targetRoot: '/t' })).toThrow(StateError)
    })

    it('should throw for invalid state (missing targetRoot)', () => {
      expect(() => normalizeMigrationState({ migrationId: 'test', sourcePath: '/s' })).toThrow(StateError)
    })

    it('should normalize invalid stage to detect', () => {
      const raw = {
        migrationId: 'test',
        sourcePath: '/s',
        targetRoot: '/t',
        stage: 'invalid-stage',
      }

      const state = normalizeMigrationState(raw)
      expect(state.stage).toBe('detect')
    })

    it('should normalize invalid disposalMode to keep', () => {
      const raw = {
        migrationId: 'test',
        sourcePath: '/s',
        targetRoot: '/t',
        disposalMode: 'invalid-mode',
      }

      const state = normalizeMigrationState(raw)
      expect(state.disposalMode).toBe('keep')
    })

    it('should normalize arrays to empty arrays if not valid', () => {
      const raw = {
        migrationId: 'test',
        sourcePath: '/s',
        targetRoot: '/t',
        inventory: null,
        conflicts: 'not-an-array',
      }

      const state = normalizeMigrationState(raw)
      expect(state.inventory).toEqual([])
      expect(state.conflicts).toEqual([])
    })

    it('should preserve optional fields', () => {
      const raw = {
        migrationId: 'test',
        sourcePath: '/s',
        targetRoot: '/t',
        lastError: 'Something failed',
        needsOpenFlowInit: true,
        openFlowInitConfirmed: false,
      }

      const state = normalizeMigrationState(raw)
      expect(state.lastError).toBe('Something failed')
      expect(state.needsOpenFlowInit).toBe(true)
      expect(state.openFlowInitConfirmed).toBe(false)
    })
  })

  describe('Stage Order Constants', () => {
    it('should have correct stage order', () => {
      expect(STAGE_ORDER).toEqual([
        'detect', 'scan', 'classify', 'clarify', 'plan', 'apply', 'cleanup', 'completed'
      ])
    })
  })
})
