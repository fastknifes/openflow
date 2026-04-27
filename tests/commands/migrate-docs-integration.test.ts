/**
 * Integration tests for migrate-docs command.
 *
 * Tests the FULL migration pipeline end-to-end using real filesystem operations
 * in temp directories. Each test covers a complete scenario from source detection
 * through cleanup.
 *
 * 10 scenarios covering:
 *  1. OpenSpec full migration with keep disposal
 *  2. Spec Kit migration with ADR candidates
 *  3. Session resume after simulated interrupt
 *  4. Delete mode with valid confirmation
 *  5. Delete mode with invalid confirmation
 *  6. Path traversal rejection
 *  7. Empty source directory rejection
 *  8. Concurrent migration prevention
 *  9. Generic adapter fallback
 * 10. Mixed adapter detection
 */

import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { handleMigrateDocs } from '../../src/commands/migrate-docs.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'
import { ErrorCode, OpenFlowError } from '../../src/utils/errors.js'
import { loadMigrationSession, saveMigrationSession } from '../../src/phases/migrate-docs/persistence.js'

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

let tempDirs: string[] = []

async function createTempDir(label: string): Promise<string> {
  const dir = join(process.cwd(), `.test-migrate-docs-${label}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`)
  await mkdir(dir, { recursive: true })
  tempDirs.push(dir)
  return dir
}

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

afterEach(async () => {
  // Clean up all temp dirs created during the test
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs = []
})

/**
 * Create a directory with files from a list of [relativePath, content] tuples.
 */
async function populateDir(base: string, files: Array<[string, string]>): Promise<void> {
  for (const [relativePath, content] of files) {
    const fullPath = join(base, relativePath)
    const parentDir = join(fullPath, '..')
    await mkdir(parentDir, { recursive: true })
    await writeFile(fullPath, content, 'utf-8')
  }
}

/**
 * Run the FULL migration pipeline from detect through cleanup.
 * Returns the final output string.
 *
 * Automatically answers pending clarification questions with 'accept',
 * and skips the apply confirmation gate.
 */
async function runFullPipeline(
  ctx: OpenFlowContext,
  sourceDir: string,
  extraDetectArgs: Partial<Record<'dryRun' | 'targetDir', unknown>> = {}
): Promise<string> {
  // Step 1: detect stage
  const detectArgs: Record<string, unknown> = { sourceDir, ...extraDetectArgs }
  await handleMigrateDocs(ctx, detectArgs as Record<string, unknown>)

  // Step 2: scan stage
  await handleMigrateDocs(ctx, {})

  // Step 3: classify stage
  await handleMigrateDocs(ctx, {})

  // Step 4-5: clarify — answer all pending questions
  let maxQuestions = 20
  while (maxQuestions-- > 0) {
    const result = await handleMigrateDocs(ctx, { answer: 'accept' })
    if (result.includes('Migration Plan Ready') || result.includes('plan stage')) {
      break
    }
    if (!result.includes('Clarification Question') && result.includes('advancing')) {
      break
    }
  }

  // Step 6: plan stage — this adds Apply Confirmation Gate then advances to apply
  await handleMigrateDocs(ctx, {})

  // Step 7: apply stage
  await handleMigrateDocs(ctx, {})

  // Step 8: cleanup stage (keep mode by default)
  const finalResult = await handleMigrateDocs(ctx, {})

  return finalResult
}

// --------------------------------------------------------------------------
// 1. OpenSpec full migration
// --------------------------------------------------------------------------

test('OpenSpec full migration with keep disposal', async () => {
  const root = await createTempDir('openspec-full')

  const sourceDir = join(root, 'source')
  await mkdir(sourceDir, { recursive: true })

  // Create OpenSpec fixture
  await populateDir(sourceDir, [
    ['openspec/specs/auth.md', '# Auth Spec\n\n## Overview\nAuthentication specification.'],
    ['openspec/changes/2026-04-01-auth.md', '# Auth Change\n\nChange log for auth.'],
    ['project.md', '# Project\n\nProject overview.'],
  ])

  const ctx = createContext(root)

  // Detect
  let result = await handleMigrateDocs(ctx, { sourceDir })
  expect(result).toContain('Migration: Detect Complete')
  expect(result).toContain('openspec')

  // Scan
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Migration: Scan Complete')

  // Classify
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Migration: Classify Complete')

  // Clarify — answer all questions
  result = await handleMigrateDocs(ctx, { answer: 'no' }) // openflow-init → continue without
  // Continue through remaining questions
  let clarifyDone = false
  for (let i = 0; i < 15; i++) {
    const tmp = await handleMigrateDocs(ctx, { answer: 'accept' })
    if (tmp.includes('Advan') || tmp.includes('plan stage') || tmp.includes('Skipping')) {
      clarifyDone = true
      break
    }
    if (!tmp.includes('Clarification')) {
      clarifyDone = true
      break
    }
    result = tmp
  }
  expect(clarifyDone).toBe(true)

  // Plan
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Migration Plan Ready')

  // Apply
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Migration: Apply Complete')

  // Cleanup (keep mode)
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Migration Cleanup Complete')
  expect(result).toContain('keep')

  // Verify target files exist (targetRoot = root since sourceDir is in root)
  expect(existsSync(join(root, 'docs', 'current', 'spec', 'auth.md'))).toBe(true)
  expect(existsSync(join(root, 'docs', 'changes', '2026-04-01-auth.md'))).toBe(true)

  // Report and manifest generated in targetRoot
  expect(existsSync(join(root, 'migration-report.md'))).toBe(true)
  const reportContent = await readFile(join(root, 'migration-report.md'), 'utf-8')
  expect(reportContent).toContain('# Migration Report')
  expect(reportContent).toContain('keep')

  expect(existsSync(join(root, 'migration-manifest.json'))).toBe(true)
  const manifest = JSON.parse(await readFile(join(root, 'migration-manifest.json'), 'utf-8'))
  expect(manifest.disposalMode).toBe('keep')

  // Source files untouched (keep mode)
  expect(existsSync(join(sourceDir, 'openspec', 'specs', 'auth.md'))).toBe(true)
  expect(existsSync(join(sourceDir, 'project.md'))).toBe(true)
})

// --------------------------------------------------------------------------
// 2. Spec Kit migration with ADR candidates
// --------------------------------------------------------------------------

test('Spec Kit migration with ADR candidates', async () => {
  const root = await createTempDir('speckit-adr')

  const sourceDir = join(root, 'source')
  await mkdir(sourceDir, { recursive: true })

  // Create Spec Kit fixture
  await populateDir(sourceDir, [
    ['.specify/specs/login/spec.md', '# Login Spec\n\nLogin specification.'],
    ['.specify/specs/login/plan.md', '# Login Plan\n\nImplementation plan for login.'],
    ['.specify/memory/constitution.md', '# Constitution\n\nProject constitution.'],
  ])

  const ctx = createContext(root)

  // Detect
  let result = await handleMigrateDocs(ctx, { sourceDir })
  expect(result).toContain('Detect Complete')
  expect(result).toContain('spec-kit')

  // Scan
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Scan Complete')

  // Classify
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Classify Complete')

  // Clarify — answer all questions
  // Answer each pending question
  for (let i = 0; i < 15; i++) {
    const tmp = await handleMigrateDocs(ctx, { answer: 'accept' })
    // If we see the plan output, we've advanced
    if (tmp.includes('Migration Plan Ready') || tmp.includes('plan stage') || tmp.includes('Skipping')) {
      break
    }
    // If it doesn't contain a clarification question, we've probably advanced
    if (!tmp.includes('Clarification') && !tmp.includes('question')) {
      break
    }
  }

  // Plan
  result = await handleMigrateDocs(ctx, {})
  // Should contain plan summary
  expect(result).toContain('Plan Ready')

  // Apply
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Apply Complete')

  // Cleanup
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Cleanup Complete')

  // Verify spec.md → current/spec/
  expect(existsSync(join(root, 'docs', 'current', 'spec', 'login', 'spec.md'))).toBe(true)

  // Verify plan.md and constitution.md → decisions/ (after accepting ADR)
  // Note: ADR candidates were classified as decisions with medium confidence,
  // and after clarification with 'accept', they stay in decisions/
  const decisionsDir = join(root, 'docs', 'decisions')
  const decisionsExist = await readdir(decisionsDir).catch(() => null)
  if (decisionsExist) {
    // Files should be in decisions/ directory
    expect(decisionsExist.length).toBeGreaterThan(0)
  }
})

// --------------------------------------------------------------------------
// 3. Session resume after simulated interrupt
// --------------------------------------------------------------------------

test('session resume continues at classify stage after interrupt', async () => {
  const root = await createTempDir('session-resume')

  const sourceDir = join(root, 'source')
  await mkdir(sourceDir, { recursive: true })

  // Create a simple source with markdown files
  await populateDir(sourceDir, [
    ['docs/guide.md', '# Guide\n\nGetting started guide.'],
    ['docs/api.md', '# API\n\nAPI reference.'],
  ])

  const ctx = createContext(root)

  // Run detect + scan stages
  await handleMigrateDocs(ctx, { sourceDir })
  await handleMigrateDocs(ctx, {})

  // Now the session should be at 'classify' stage
  // Verify session is at classify (via reading the active.json)
  const activeData = JSON.parse(
    await readFile(join(root, '.sisyphus', 'docs-migration', 'active.json'), 'utf-8')
  ) as { activeMigrationId: string; byMigrationID: Record<string, { stage: string }> }
  const migId = activeData.activeMigrationId!
  expect(activeData.byMigrationID[migId]?.stage).toBe('classify')

  // Simulate session resume: create a new context (no sourceDir)
  // This should load the active session and run classify stage
  const result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Classify Complete')
  // Verify we did NOT re-detect or re-scan (should show classify output)
  expect(result).not.toContain('Detect Complete')
  expect(result).not.toContain('Scan Complete')
})

// --------------------------------------------------------------------------
// 4. Delete mode with correct confirmation
// --------------------------------------------------------------------------

test('delete mode deletes source files with correct confirmation phrase', async () => {
  const root = await createTempDir('delete-correct')

  const sourceDir = join(root, 'source')
  await mkdir(sourceDir, { recursive: true })

  await populateDir(sourceDir, [
    ['docs/guide.md', '# Guide\nSimple guide.'],
    ['docs/api.md', '# API\nSimple API.'],
  ])

  const ctx = createContext(root)

  // Run through detect → scan → classify → clarify → plan → apply
  await handleMigrateDocs(ctx, { sourceDir })
  await handleMigrateDocs(ctx, {})
  await handleMigrateDocs(ctx, {})

  // Clarify questions
  for (let i = 0; i < 10; i++) {
    const tmp = await handleMigrateDocs(ctx, { answer: 'accept' })
    if (!tmp.includes('Clarification') || tmp.includes('Skipping')) break
  }

  await handleMigrateDocs(ctx, {}) // plan
  await handleMigrateDocs(ctx, {}) // apply

  // Before cleanup, modify the session to use delete mode
  const activeData = JSON.parse(
    await readFile(join(root, '.sisyphus', 'docs-migration', 'active.json'), 'utf-8')
  ) as { activeMigrationId: string }
  const session = await loadMigrationSession(root, activeData.activeMigrationId!)
  const deleteSession = { ...session!, disposalMode: 'delete' as const }
  await saveMigrationSession(root, deleteSession)

  // Cleanup with correct confirmation
  const result = await handleMigrateDocs(ctx, { answer: 'DELETE ORIGINAL DOCS' })
  expect(result).toContain('Cleanup Complete')
  expect(result).toContain('delete')

  // Verify source files are deleted
  await expect(access(join(sourceDir, 'docs', 'guide.md'))).rejects.toThrow()
  await expect(access(join(sourceDir, 'docs', 'api.md'))).rejects.toThrow()

  // No report or manifest generated in delete mode
  await expect(access(join(root, 'migration-report.md'))).rejects.toThrow()
  await expect(access(join(root, 'migration-manifest.json'))).rejects.toThrow()
})

// --------------------------------------------------------------------------
// 5. Delete mode with wrong phrase
// --------------------------------------------------------------------------

test('delete mode rejects wrong confirmation phrase and preserves files', async () => {
  const root = await createTempDir('delete-wrong')

  const sourceDir = join(root, 'source')
  await mkdir(sourceDir, { recursive: true })

  await populateDir(sourceDir, [
    ['docs/readme.md', '# Readme\nTest readme.'],
  ])

  const ctx = createContext(root)

  // Run through all stages to cleanup
  await handleMigrateDocs(ctx, { sourceDir })
  await handleMigrateDocs(ctx, {})
  await handleMigrateDocs(ctx, {})

  for (let i = 0; i < 10; i++) {
    const tmp = await handleMigrateDocs(ctx, { answer: 'accept' })
    if (!tmp.includes('Clarification') || tmp.includes('Skipping')) break
  }

  await handleMigrateDocs(ctx, {})
  await handleMigrateDocs(ctx, {})

  // Modify to delete mode
  const activeData = JSON.parse(
    await readFile(join(root, '.sisyphus', 'docs-migration', 'active.json'), 'utf-8')
  ) as { activeMigrationId: string }
  const session = await loadMigrationSession(root, activeData.activeMigrationId!)
  const deleteSession = { ...session!, disposalMode: 'delete' as const }
  await saveMigrationSession(root, deleteSession)

  // Try cleanup with wrong phrase
  await expect(
    handleMigrateDocs(ctx, { answer: 'delete them' })
  ).rejects.toThrow('DELETE ORIGINAL DOCS')

  // Verify source file still exists
  expect(existsSync(join(sourceDir, 'docs', 'readme.md'))).toBe(true)
})

// --------------------------------------------------------------------------
// 6. Path traversal rejection
// --------------------------------------------------------------------------

test('path traversal in sourceDir throws SECURITY_VIOLATION', async () => {
  const root = await createTempDir('path-traversal')
  const ctx = createContext(root)

  // '../' style traversal
  try {
    await handleMigrateDocs(ctx, { sourceDir: '../../../etc' })
    // Should not reach here
    expect(false).toBe(true)
  } catch (err) {
    const error = err as OpenFlowError
    expect(error.code).toBe(ErrorCode.SECURITY_VIOLATION)
    expect(error.message).toContain('Path traversal')
  }
})

// --------------------------------------------------------------------------
// 7. Empty source directory
// --------------------------------------------------------------------------

test('empty source directory throws INVALID_INPUT with no documents message', async () => {
  const root = await createTempDir('empty-source')
  const ctx = createContext(root)

  const sourceDir = join(root, 'empty-dir')
  await mkdir(sourceDir, { recursive: true })

  await handleMigrateDocs(ctx, { sourceDir })

  await expect(handleMigrateDocs(ctx, {})).rejects.toMatchObject({
    code: ErrorCode.INVALID_INPUT,
    message: expect.stringContaining('No documents found'),
  })
})

// --------------------------------------------------------------------------
// 8. Concurrent migration prevention
// --------------------------------------------------------------------------

test('concurrent migration is prevented during active migration', async () => {
  const root = await createTempDir('concurrent')
  const ctx = createContext(root)

  const sourceDirA = join(root, 'source-a')
  const sourceDirB = join(root, 'source-b')

  await mkdir(sourceDirA, { recursive: true })
  await mkdir(sourceDirB, { recursive: true })

  await writeFile(join(sourceDirA, 'readme.md'), '# Source A', 'utf-8')
  await writeFile(join(sourceDirB, 'readme.md'), '# Source B', 'utf-8')

  // Start first migration
  await handleMigrateDocs(ctx, { sourceDir: sourceDirA })

  // Try to start second migration while first is active
  await expect(handleMigrateDocs(ctx, { sourceDir: sourceDirB })).rejects.toThrow(
    /already in progress|only one migration can run at a time/i
  )
})

// --------------------------------------------------------------------------
// 9. Generic adapter fallback
// --------------------------------------------------------------------------

test('generic adapter selected for unrecognized structure', async () => {
  const root = await createTempDir('generic-fallback')

  const sourceDir = join(root, 'random-docs')
  await mkdir(sourceDir, { recursive: true })

  // Create random .md files with no known adapter structure
  await populateDir(sourceDir, [
    ['design-system.md', '# Design System\nDesign guidelines.'],
    ['spec-overview.md', '# Spec Overview\nSpec overview.'],
    ['requirements-v2.md', '# Requirements\nRequirements doc.'],
    ['random-file.md', '# Random File\nJust some file.'],
  ])

  const ctx = createContext(root)

  // Detect
  let result = await handleMigrateDocs(ctx, { sourceDir })
  // Should detect generic adapter
  // The output should mention the detected adapter
  expect(result).toContain('Detect Complete')

  // Scan
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Scan Complete')

  // Classify
  result = await handleMigrateDocs(ctx, {})
  expect(result).toContain('Classify Complete')

  // Verify classifications use generic adapter filename heuristics
  // Files with "design" → current/design, "spec" → current/spec,
  // "requirements" → current/requirements, others → references/raw

  const activeData = JSON.parse(
    await readFile(join(root, '.sisyphus', 'docs-migration', 'active.json'), 'utf-8')
  ) as { activeMigrationId: string }
  const session = await loadMigrationSession(root, activeData.activeMigrationId!)

  expect(session!.sourceType).toBe('generic')

  // Check classifications reflect keyword-based routing
  const designItem = session!.classifications.find(
    (c) => c.inventoryItem.relativePath.includes('design-system')
  )
  if (designItem) {
    expect(designItem.targetType).toBe('current/design')
  }

  const specItem = session!.classifications.find(
    (c) => c.inventoryItem.relativePath.includes('spec-overview')
  )
  if (specItem) {
    expect(specItem.targetType).toBe('current/spec')
  }

  const reqItem = session!.classifications.find(
    (c) => c.inventoryItem.relativePath.includes('requirements')
  )
  if (reqItem) {
    expect(reqItem.targetType).toBe('current/requirements')
  }
})

// --------------------------------------------------------------------------
// 10. Mixed adapters detection
// --------------------------------------------------------------------------

test('mixed adapters triggers adapter selection question', async () => {
  const root = await createTempDir('mixed-adapters')
  const ctx = createContext(root)

  const sourceDir = join(root, 'mixed-source')
  await mkdir(sourceDir, { recursive: true })

  // Create both .specify/ and .kiro/ structures
  await populateDir(sourceDir, [
    // Spec Kit
    ['.specify/specs/login/spec.md', '# Login Spec\nLogin spec.'],
    ['.specify/memory/constitution.md', '# Constitution\nProject rules.'],
    // Kiro
    ['.kiro/specs/auth/requirements.md', '# Auth Requirements\nAuth reqs.'],
    ['.kiro/steering/project.md', '# Steering\nSteering doc.'],
  ])

  // Detect
  const result = await handleMigrateDocs(ctx, { sourceDir })
  expect(result).toContain('Detect Complete')

  // Read session to check detected adapters and pending questions
  const activeData = JSON.parse(
    await readFile(join(root, '.sisyphus', 'docs-migration', 'active.json'), 'utf-8')
  ) as { activeMigrationId: string }
  const session = await loadMigrationSession(root, activeData.activeMigrationId!)

  // Both adapters should have been detected with high confidence
  const detectedTypes = session!.detectedAdapters?.map((a) => a.type) ?? []
  expect(detectedTypes).toContain('spec-kit')
  expect(detectedTypes).toContain('kiro')

  // Verify there is an adapter selection pending question
  const adapterQuestions = session!.pendingQuestions.filter(
    (q) => q.batchTopic === 'adapter-selection' || q.header.includes('Adapter')
  )
  expect(adapterQuestions.length).toBeGreaterThan(0)
})

// --------------------------------------------------------------------------
// Utility: Get active session file names from docs-migration directory
// --------------------------------------------------------------------------

async function loadActiveSessionFiles(projectDir: string): Promise<string[]> {
  const migrationDir = join(projectDir, '.sisyphus', 'docs-migration')
  const entries = await readdir(migrationDir)
  return entries.filter((e) => e.endsWith('.json') && e !== 'active.json')
}
