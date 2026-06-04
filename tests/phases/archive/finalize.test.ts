import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupStaging, finalizeArchive } from '../../../src/phases/archive/finalize.js'
import type { ArchiveContext } from '../../../src/phases/archive/types.js'
import { defaultConfig, type OpenFlowContext } from '../../../src/types.js'

function createContext(directory: string, autoPromoteCurrent = false): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig, archive: { ...defaultConfig.archive, auto_promote_current: autoPromoteCurrent } },
    enhancedPlans: new Set<string>(),
  }
}

function createArchiveContext(directory: string, overrides: Partial<ArchiveContext> = {}): ArchiveContext {
  return {
    feature: 'finalize-feature',
    mode: 'ad-hoc',
    acceptanceState: null,
    rawAcceptanceState: null,
    implementationRun: null,
    issueMode: 'feature',
    sourcePaths: {
      design: null,
      plan: null,
      prd: null,
      behavior: null,
      changeWorkspace: join(directory, 'docs', 'changes', 'finalize-feature'),
      implementationMapper: null,
      issueClarification: null,
      promotionCandidate: null,
      issueResolution: null,
      artifactRoot: join(directory, 'docs', 'changes', 'finalize-feature'),
    },
    planPath: '',
    archiveDir: join(directory, 'docs', 'archive', 'finalize-feature'),
    archiveRoot: join(directory, 'docs', 'archive'),
    stagingDir: join(directory, 'docs', 'archive', '.staging-finalize-feature'),
    designExists: false,
    planExists: false,
    requirementsExists: false,
    hasImplementationMapper: false,
    issueClarificationExists: false,
    promotionCandidateExists: false,
    hasAcceptanceChanges: false,
    hasAcceptedKnownIssues: false,
    readiness: undefined,
    useLegacyReadinessFallback: false,
    isPostHocIssue: false,
    postHocIssueReady: false,
    skipQualityGateChecks: false,
    ...overrides,
  }
}

describe('finalizeArchive', () => {
  test('renames staging directory into final archive directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-finalize-'))
    const ac = createArchiveContext(dir)
    await mkdir(ac.stagingDir, { recursive: true })
    await writeFile(join(ac.stagingDir, 'issue-resolution.md'), '# Issue Resolution', 'utf-8')

    const result = await finalizeArchive(createContext(dir), ac, new Set())

    expect(result.archiveDir).toBe(ac.archiveDir)
    const accessResult = await access(join(ac.archiveDir, 'issue-resolution.md')).catch(() => 'failed')
    expect(accessResult).not.toBe('failed')
    expect(result.autoPromoteCurrent).toBe(false)

    await rm(dir, { recursive: true, force: true })
  })

  test('staging failure cleans staging and leaves final absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-finalize-'))
    const stagingDir = join(dir, 'staging-outside-archive')
    const archiveRoot = join(dir, 'docs', 'archive')
    await mkdir(stagingDir, { recursive: true })
    await mkdir(join(dir, 'docs'), { recursive: true })
    await writeFile(archiveRoot, 'not a directory', 'utf-8')
    await writeFile(join(stagingDir, 'issue-resolution.md'), '# Issue Resolution', 'utf-8')
    const ac = createArchiveContext(dir, {
      archiveRoot,
      archiveDir: join(archiveRoot, 'finalize-feature'),
      stagingDir,
    })

    await expect(finalizeArchive(createContext(dir), ac, new Set())).rejects.toBeDefined()
    await expect(access(stagingDir)).rejects.toBeDefined()
    await expect(access(ac.archiveDir)).rejects.toBeDefined()

    await rm(dir, { recursive: true, force: true })
  })

  test('auto_promote_current=false suggests but does not apply current promotion', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-finalize-'))
    const ac = createArchiveContext(dir, { designExists: true })
    await mkdir(ac.stagingDir, { recursive: true })
    await writeFile(join(ac.stagingDir, 'design.md'), '# Design', 'utf-8')

    const result = await finalizeArchive(createContext(dir, false), ac, new Set())

    expect(result.autoPromoteCurrent).toBe(false)
    expect(result.promotionSuggestions.length).toBeGreaterThan(0)
    expect(result.promotionAppliedCount).toBe(0)
    await expect(access(join(dir, 'docs', 'current', 'feature-lifecycle', 'design.md'))).rejects.toBeDefined()

    await rm(dir, { recursive: true, force: true })
  })

  test('auto_promote_current=true applies current promotion with sync fallback', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-finalize-'))
    const ac = createArchiveContext(dir, { designExists: true })
    await mkdir(ac.stagingDir, { recursive: true })
    await writeFile(join(ac.stagingDir, 'design.md'), '# Design', 'utf-8')

    const result = await finalizeArchive(createContext(dir, true), ac, new Set())

    expect(result.autoPromoteCurrent).toBe(true)
    expect(result.promotionSuggestions.length).toBeGreaterThan(0)
    expect(result.promotionAppliedCount).toBeGreaterThan(0)
    const promoted = await access(join(dir, 'docs', 'current', 'feature-lifecycle', 'design.md')).catch(() => 'failed')
    expect(promoted).not.toBe('failed')

    await rm(dir, { recursive: true, force: true })
  })

  test('cleanupStaging removes failed staging directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-finalize-'))
    const stagingDir = join(dir, 'docs', 'archive', '.staging-finalize-feature')
    await mkdir(stagingDir, { recursive: true })

    await cleanupStaging(stagingDir)

    await expect(access(stagingDir)).rejects.toBeDefined()

    await rm(dir, { recursive: true, force: true })
  })
})
