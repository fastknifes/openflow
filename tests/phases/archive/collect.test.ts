import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectArchiveArtifacts } from '../../../src/phases/archive/collect.js'
import type { ArchiveContext, ValidationResult } from '../../../src/phases/archive/types.js'
import { defaultConfig, type OpenFlowContext } from '../../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return { directory, worktree: directory, client: {}, $: {}, config: defaultConfig, enhancedPlans: new Set<string>() }
}

function createArchiveContext(directory: string, overrides: Partial<ArchiveContext> = {}): ArchiveContext {
  return {
    feature: 'collect-feature',
    mode: 'planned',
    acceptanceState: null,
    rawAcceptanceState: null,
    implementationRun: null,
    issueMode: 'feature',
    sourcePaths: {
      design: null,
      plan: null,
      prd: null,
      behavior: null,
      changeWorkspace: join(directory, 'docs', 'changes', 'collect-feature'),
      implementationMapper: null,
      issueClarification: null,
      promotionCandidate: null,
      issueResolution: null,
      artifactRoot: join(directory, 'docs', 'changes', 'collect-feature'),
    },
    planPath: '',
    archiveDir: join(directory, 'docs', 'archive', 'collect-feature'),
    archiveRoot: join(directory, 'docs', 'archive'),
    stagingDir: join(directory, 'docs', 'archive', '.staging-collect-feature'),
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

const validation: ValidationResult = { allowed: true, blocked: false, blockers: [], warnings: [], skipQualityGateChecks: false, postHocIssueReady: false }

describe('collectArchiveArtifacts', () => {
  test('copies planned design and plan into staging', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-collect-'))
    const workspace = join(dir, 'docs', 'changes', 'collect-feature')
    await mkdir(workspace, { recursive: true })
    const design = join(workspace, 'design.md')
    const plan = join(workspace, 'plan.md')
    await writeFile(design, '# Design', 'utf-8')
    await writeFile(plan, '# Plan', 'utf-8')

    await collectArchiveArtifacts(createContext(dir), createArchiveContext(dir, {
      sourcePaths: { ...createArchiveContext(dir).sourcePaths, design, plan, changeWorkspace: workspace, artifactRoot: workspace },
      designExists: true,
      planExists: true,
    }), validation)

    expect(await readFile(join(dir, 'docs', 'archive', '.staging-collect-feature', 'design.md'), 'utf-8')).toContain('# Design')
    expect(await readFile(join(dir, 'docs', 'archive', '.staging-collect-feature', 'plan.md'), 'utf-8')).toContain('# Plan')

    await rm(dir, { recursive: true, force: true })
  })

  test('ad-hoc mode generates issue artifacts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-collect-'))

    await collectArchiveArtifacts(createContext(dir), createArchiveContext(dir, { mode: 'ad-hoc' }), validation)

    expect(await readFile(join(dir, 'docs', 'archive', '.staging-collect-feature', 'issue-resolution.md'), 'utf-8')).toContain('archive mode: ad-hoc')

    await rm(dir, { recursive: true, force: true })
  })

  test('planned collection without design leaves staging without design.md', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-collect-'))

    await collectArchiveArtifacts(createContext(dir), createArchiveContext(dir), validation)

    await expect(access(join(dir, 'docs', 'archive', '.staging-collect-feature', 'design.md'))).rejects.toBeDefined()

    await rm(dir, { recursive: true, force: true })
  })

  test('issue mode copies clarification and generates resolution', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'openflow-archive-collect-'))
    const workspace = join(dir, 'docs', 'changes', 'collect-feature')
    await mkdir(workspace, { recursive: true })
    const issueClarification = join(workspace, 'issue-clarification.md')
    await writeFile(issueClarification, '# Issue Clarification', 'utf-8')

    await collectArchiveArtifacts(createContext(dir), createArchiveContext(dir, {
      issueMode: 'issue',
      sourcePaths: { ...createArchiveContext(dir).sourcePaths, issueClarification, changeWorkspace: workspace, artifactRoot: workspace },
      issueClarificationExists: true,
    }), validation)

    const staging = join(dir, 'docs', 'archive', '.staging-collect-feature')
    expect(await readFile(join(staging, 'issue-clarification.md'), 'utf-8')).toContain('# Issue Clarification')
    expect(await readFile(join(staging, 'issue-resolution.md'), 'utf-8')).toContain('archive mode: issue')

    await rm(dir, { recursive: true, force: true })
  })
})
