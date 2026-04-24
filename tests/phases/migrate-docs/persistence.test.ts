/**
 * Tests for migration persistence layer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  saveMigrationSession,
  loadMigrationSession,
  migrationSessionExists,
  deleteMigrationSession,
  listMigrationSessions,
  loadMigrationSessionIndex,
  saveMigrationSessionIndex,
  updateMigrationSessionIndex,
  removeFromMigrationSessionIndex,
  acquireMigrationLock,
  releaseMigrationLock,
  isMigrationLocked,
  getActiveMigrationId,
  ConcurrentMigrationError,
} from '../../../src/phases/migrate-docs/persistence'
import { createInitialMigrationState } from '../../../src/phases/migrate-docs/state-machine'
import type { MigrationState, MigrationSessionIndex } from '../../../src/phases/migrate-docs/types'

describe('Persistence', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'migration-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('Session Persistence', () => {
    it('should save and load a migration session', async () => {
      const state = createInitialMigrationState('/source', '/target', 'openspec', {
        migrationId: 'migration-test-001',
      })

      await saveMigrationSession(tempDir, state)
      const loaded = await loadMigrationSession(tempDir, 'migration-test-001')

      expect(loaded).not.toBeNull()
      expect(loaded?.migrationId).toBe('migration-test-001')
      expect(loaded?.sourcePath).toBe('/source')
      expect(loaded?.targetRoot).toBe('/target')
      expect(loaded?.sourceType).toBe('openspec')
      expect(loaded?.stage).toBe('detect')
    })

    it('should return null for non-existent session', async () => {
      const loaded = await loadMigrationSession(tempDir, 'migration-nonexistent')
      expect(loaded).toBeNull()
    })

    it('should update timestamp on save', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-test-002',
      })
      const originalUpdatedAt = state.updatedAt

      // Wait a bit to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10))
      await saveMigrationSession(tempDir, state)

      const loaded = await loadMigrationSession(tempDir, 'migration-test-002')
      expect(loaded?.updatedAt).not.toBe(originalUpdatedAt)
    })

    it('should check if session exists', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-test-003',
      })

      expect(await migrationSessionExists(tempDir, 'migration-test-003')).toBe(false)
      await saveMigrationSession(tempDir, state)
      expect(await migrationSessionExists(tempDir, 'migration-test-003')).toBe(true)
    })

    it('should delete a session', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-test-004',
      })

      await saveMigrationSession(tempDir, state)
      expect(await migrationSessionExists(tempDir, 'migration-test-004')).toBe(true)

      await deleteMigrationSession(tempDir, 'migration-test-004')
      expect(await migrationSessionExists(tempDir, 'migration-test-004')).toBe(false)
    })

    it('should not throw when deleting non-existent session', async () => {
      await deleteMigrationSession(tempDir, 'migration-nonexistent')
      // Should not throw
    })

    it('should list all migration sessions', async () => {
      const state1 = createInitialMigrationState('/source1', '/target1', null, {
        migrationId: 'migration-test-a',
      })
      const state2 = createInitialMigrationState('/source2', '/target2', null, {
        migrationId: 'migration-test-b',
      })

      await saveMigrationSession(tempDir, state1)
      await saveMigrationSession(tempDir, state2)

      const sessions = await listMigrationSessions(tempDir)
      expect(sessions).toHaveLength(2)
      expect(sessions).toContain('migration-test-a')
      expect(sessions).toContain('migration-test-b')
    })

    it('should return empty array when no sessions exist', async () => {
      const sessions = await listMigrationSessions(tempDir)
      expect(sessions).toEqual([])
    })

    it('should save complex state with all fields', async () => {
      const state: MigrationState = {
        version: 1,
        migrationId: 'migration-complex',
        stage: 'classify',
        sourcePath: '/docs/source',
        targetRoot: '/project',
        sourceType: 'openspec',
        disposalMode: 'move-to-references',
        dryRun: true,
        stageResults: [
          { stage: 'detect', completedAt: '2024-01-15T10:00:00Z', metadata: { adapter: 'openspec' } },
          { stage: 'scan', completedAt: '2024-01-15T10:01:00Z', metadata: { filesScanned: 42 } },
        ],
        startedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:02:00Z',
        inventory: [
          {
            sourcePath: '/docs/source/readme.md',
            relativePath: 'readme.md',
            size: 1024,
            modifiedAt: '2024-01-14T00:00:00Z',
            extension: '.md',
            directoryContext: '/docs/source',
          },
        ],
        classifications: [],
        conflicts: [
          {
            id: 'conflict-1',
            type: 'target-collision',
            sourceA: '/a.md',
            sourceB: '/b.md',
            description: 'Both target same file',
            resolution: 'accepted',
            timestamp: '2024-01-15T10:03:00Z',
          },
        ],
        pendingQuestions: [
          {
            id: 'q-1',
            header: 'Test',
            question: 'Test?',
            options: [{ label: 'Yes', description: 'Yes option' }],
            batchTopic: 'test-topic',
          },
        ],
        resolvedQuestions: [
          { questionId: 'q-0', answer: 'answer', timestamp: '2024-01-15T10:01:00Z' },
        ],
        detectedAdapters: [{ type: 'openspec', confidence: 0.95, metadata: { hasSpecs: 'true' } }],
        selectedAdapter: 'openspec',
        needsOpenFlowInit: true,
        openFlowInitConfirmed: false,
      }

      await saveMigrationSession(tempDir, state)
      const loaded = await loadMigrationSession(tempDir, 'migration-complex')

      expect(loaded).not.toBeNull()
      expect(loaded?.version).toBe(1)
      expect(loaded?.stage).toBe('classify')
      expect(loaded?.disposalMode).toBe('move-to-references')
      expect(loaded?.dryRun).toBe(true)
      expect(loaded?.stageResults).toHaveLength(2)
      expect(loaded?.inventory).toHaveLength(1)
      expect(loaded?.conflicts).toHaveLength(1)
      expect(loaded?.pendingQuestions).toHaveLength(1)
      expect(loaded?.resolvedQuestions).toHaveLength(1)
      expect(loaded?.detectedAdapters).toHaveLength(1)
      expect(loaded?.selectedAdapter).toBe('openspec')
      expect(loaded?.needsOpenFlowInit).toBe(true)
      expect(loaded?.openFlowInitConfirmed).toBe(false)
    })
  })

  describe('Session Index Management', () => {
    it('should load empty index when none exists', async () => {
      const index = await loadMigrationSessionIndex(tempDir)
      expect(index).toEqual({ byMigrationID: {} })
    })

    it('should save and load session index', async () => {
      const index: MigrationSessionIndex = {
        byMigrationID: {
          'migration-1': {
            migrationId: 'migration-1',
            sourcePath: '/source1',
            targetRoot: '/target1',
            stage: 'scan',
            updatedAt: '2024-01-15T10:00:00Z',
          },
        },
        activeMigrationId: 'migration-1',
      }

      await saveMigrationSessionIndex(tempDir, index)
      const loaded = await loadMigrationSessionIndex(tempDir)

      expect(loaded.byMigrationID['migration-1']).toBeDefined()
      expect(loaded.byMigrationID['migration-1'].sourcePath).toBe('/source1')
      expect(loaded.activeMigrationId).toBe('migration-1')
    })

    it('should update session index', async () => {
      const state = createInitialMigrationState('/source', '/target', 'openspec', {
        migrationId: 'migration-update-test',
      })

      await updateMigrationSessionIndex(tempDir, state)
      const index = await loadMigrationSessionIndex(tempDir)

      expect(index.byMigrationID['migration-update-test']).toBeDefined()
      expect(index.byMigrationID['migration-update-test'].sourcePath).toBe('/source')
      expect(index.byMigrationID['migration-update-test'].targetRoot).toBe('/target')
      expect(index.byMigrationID['migration-update-test'].stage).toBe('detect')
    })

    it('should remove from session index', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-remove-test',
      })

      await updateMigrationSessionIndex(tempDir, state)
      expect((await loadMigrationSessionIndex(tempDir)).byMigrationID['migration-remove-test']).toBeDefined()

      await removeFromMigrationSessionIndex(tempDir, 'migration-remove-test')
      expect((await loadMigrationSessionIndex(tempDir)).byMigrationID['migration-remove-test']).toBeUndefined()
    })

    it('should also clear activeMigrationId when removing active migration', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-active-test',
      })

      await updateMigrationSessionIndex(tempDir, state)
      await acquireMigrationLock(tempDir, 'migration-active-test')

      let index = await loadMigrationSessionIndex(tempDir)
      expect(index.activeMigrationId).toBe('migration-active-test')

      await removeFromMigrationSessionIndex(tempDir, 'migration-active-test')
      index = await loadMigrationSessionIndex(tempDir)
      expect(index.activeMigrationId).toBeUndefined()
    })
  })

  describe('Lock Management', () => {
    it('should acquire lock successfully when no lock exists', async () => {
      await acquireMigrationLock(tempDir, 'migration-lock-1')

      const index = await loadMigrationSessionIndex(tempDir)
      expect(index.activeMigrationId).toBe('migration-lock-1')
    })

    it('should throw when trying to acquire lock while another is active', async () => {
      const state1 = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-active-1',
      })
      await saveMigrationSession(tempDir, state1)
      await updateMigrationSessionIndex(tempDir, state1)
      await acquireMigrationLock(tempDir, 'migration-active-1')

      await expect(acquireMigrationLock(tempDir, 'migration-active-2')).rejects.toThrow(ConcurrentMigrationError)
    })

    it('should allow acquiring lock for same migration', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-same',
      })
      await saveMigrationSession(tempDir, state)
      await updateMigrationSessionIndex(tempDir, state)

      await acquireMigrationLock(tempDir, 'migration-same')
      await acquireMigrationLock(tempDir, 'migration-same')
    })

    it('should allow new lock when active migration is completed', async () => {
      const state1 = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-completed',
      })
      await saveMigrationSession(tempDir, state1)
      await updateMigrationSessionIndex(tempDir, { ...state1, stage: 'completed' })
      await acquireMigrationLock(tempDir, 'migration-completed')

      // Should not throw because first migration is completed
      await acquireMigrationLock(tempDir, 'migration-new')
    })

    it('should allow new lock when active migration is failed', async () => {
      const state1 = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-failed',
      })
      await saveMigrationSession(tempDir, state1)
      await updateMigrationSessionIndex(tempDir, { ...state1, stage: 'failed' })
      await acquireMigrationLock(tempDir, 'migration-failed')

      // Should not throw because first migration is failed
      await acquireMigrationLock(tempDir, 'migration-new-2')
    })

    it('should release lock', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-release',
      })
      await saveMigrationSession(tempDir, state)
      await updateMigrationSessionIndex(tempDir, state)
      await acquireMigrationLock(tempDir, 'migration-release')

      let index = await loadMigrationSessionIndex(tempDir)
      expect(index.activeMigrationId).toBe('migration-release')

      await releaseMigrationLock(tempDir, 'migration-release')

      index = await loadMigrationSessionIndex(tempDir)
      expect(index.activeMigrationId).toBeUndefined()
    })

    it('should not throw when releasing lock for non-active migration', async () => {
      await releaseMigrationLock(tempDir, 'migration-nonactive')
      // Should not throw
    })

    it('should check if migration is locked', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-check',
      })
      await saveMigrationSession(tempDir, state)
      await updateMigrationSessionIndex(tempDir, state)

      expect(await isMigrationLocked(tempDir)).toBe(false)

      await acquireMigrationLock(tempDir, 'migration-check')
      expect(await isMigrationLocked(tempDir)).toBe(true)

      await releaseMigrationLock(tempDir, 'migration-check')
      expect(await isMigrationLocked(tempDir)).toBe(false)
    })

    it('should return false for locked check when active migration is completed', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-check-completed',
      })
      await saveMigrationSession(tempDir, state)
      await updateMigrationSessionIndex(tempDir, { ...state, stage: 'completed' })
      await acquireMigrationLock(tempDir, 'migration-check-completed')

      expect(await isMigrationLocked(tempDir)).toBe(false)
    })

    it('should get active migration ID', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-get-active',
      })
      await saveMigrationSession(tempDir, state)
      await updateMigrationSessionIndex(tempDir, state)

      expect(await getActiveMigrationId(tempDir)).toBeNull()

      await acquireMigrationLock(tempDir, 'migration-get-active')
      expect(await getActiveMigrationId(tempDir)).toBe('migration-get-active')

      await releaseMigrationLock(tempDir, 'migration-get-active')
      expect(await getActiveMigrationId(tempDir)).toBeNull()
    })

    it('should return null for getActiveMigrationId when active is completed', async () => {
      const state = createInitialMigrationState('/source', '/target', null, {
        migrationId: 'migration-get-completed',
      })
      await saveMigrationSession(tempDir, state)
      await updateMigrationSessionIndex(tempDir, { ...state, stage: 'completed' })
      await acquireMigrationLock(tempDir, 'migration-get-completed')

      expect(await getActiveMigrationId(tempDir)).toBeNull()
    })
  })

  describe('Save/Load Round-trip', () => {
    it('should preserve state through save/load cycle', async () => {
      const originalState = createInitialMigrationState('/source/path', '/target/path', 'kiro', {
        migrationId: 'migration-roundtrip',
        disposalMode: 'delete',
        dryRun: true,
      })

      // Add some data
      const stateWithData = {
        ...originalState,
        inventory: [
          {
            sourcePath: '/source/path/doc.md',
            relativePath: 'doc.md',
            size: 2048,
            modifiedAt: '2024-01-10T00:00:00Z',
            extension: '.md',
            directoryContext: '/source/path',
          },
        ],
        stageResults: [{ stage: 'detect', completedAt: '2024-01-15T10:00:00Z' }],
      }

      await saveMigrationSession(tempDir, stateWithData)
      const loaded = await loadMigrationSession(tempDir, 'migration-roundtrip')

      expect(loaded).not.toBeNull()
      expect(loaded?.migrationId).toBe(stateWithData.migrationId)
      expect(loaded?.sourcePath).toBe(stateWithData.sourcePath)
      expect(loaded?.targetRoot).toBe(stateWithData.targetRoot)
      expect(loaded?.sourceType).toBe(stateWithData.sourceType)
      expect(loaded?.disposalMode).toBe(stateWithData.disposalMode)
      expect(loaded?.dryRun).toBe(stateWithData.dryRun)
      expect(loaded?.inventory).toHaveLength(1)
      expect(loaded?.inventory[0].sourcePath).toBe('/source/path/doc.md')
      expect(loaded?.stageResults).toHaveLength(1)
    })

    it('should handle state with all optional fields', async () => {
      const state: MigrationState = {
        version: 1,
        migrationId: 'migration-full',
        stage: 'cleanup',
        sourcePath: '/docs',
        targetRoot: '/project',
        sourceType: 'spec-kit',
        disposalMode: 'keep',
        dryRun: false,
        stageResults: [
          { stage: 'detect', completedAt: '2024-01-15T10:00:00Z' },
          { stage: 'scan', completedAt: '2024-01-15T10:01:00Z' },
          { stage: 'classify', completedAt: '2024-01-15T10:02:00Z' },
          { stage: 'clarify', completedAt: '2024-01-15T10:03:00Z' },
          { stage: 'plan', completedAt: '2024-01-15T10:04:00Z' },
          { stage: 'apply', completedAt: '2024-01-15T10:05:00Z' },
        ],
        startedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:05:00Z',
        completedAt: '2024-01-15T10:06:00Z',
        inventory: [],
        classifications: [],
        conflicts: [],
        pendingQuestions: [],
        resolvedQuestions: [],
        plan: {
          operations: [],
          directoryCreations: [],
          conflictResolutions: [],
          summary: {
            totalFiles: 0,
            byCategory: {},
            confidenceDistribution: { high: 0, medium: 0, low: 0 },
            wouldOverwrite: [],
          },
        },
        applyResult: {
          createdFiles: [],
          modifiedFiles: [],
          deletedFiles: [],
          skippedFiles: [],
          failedOps: [],
        },
        lastError: undefined,
        detectedAdapters: [{ type: 'spec-kit', confidence: 0.85 }],
        selectedAdapter: 'spec-kit',
        needsOpenFlowInit: false,
        openFlowInitConfirmed: true,
      }

      await saveMigrationSession(tempDir, state)
      const loaded = await loadMigrationSession(tempDir, 'migration-full')

      expect(loaded).not.toBeNull()
      expect(loaded?.stage).toBe('cleanup')
      expect(loaded?.stageResults).toHaveLength(6)
      expect(loaded?.completedAt).toBe('2024-01-15T10:06:00Z')
      expect(loaded?.plan).toBeDefined()
      expect(loaded?.applyResult).toBeDefined()
      expect(loaded?.detectedAdapters).toHaveLength(1)
      expect(loaded?.selectedAdapter).toBe('spec-kit')
      expect(loaded?.needsOpenFlowInit).toBe(false)
      expect(loaded?.openFlowInitConfirmed).toBe(true)
    })
  })
})
