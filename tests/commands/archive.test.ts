import { describe, expect, test } from 'bun:test'
import { handleArchive } from '../../src/commands/archive.js'
import { defaultConfig, type OpenFlowContext, VerifyReadinessStatus } from '../../src/types.js'
import { join } from 'node:path'
import { mkdir, rm, writeFile, access, readFile, readdir } from 'node:fs/promises'
import { loadAcceptanceState, saveAcceptanceState } from '../../src/utils/acceptance-state.js'

function createContext(configOverride?: Partial<typeof defaultConfig>): OpenFlowContext {
  return {
    directory: process.cwd(),
    worktree: process.cwd(),
    client: {},
    $: {},
    config: {
      ...defaultConfig,
      ...configOverride,
    },
    enhancedPlans: new Set<string>(),
  }
}

async function resolveArchiveDir(testDir: string, feature: string): Promise<string> {
  const archiveRoot = join(testDir, 'docs', 'archive')
  const entries = await readdir(archiveRoot, { withFileTypes: true })
  const matched = entries.find(entry => entry.isDirectory() && (entry.name === feature || entry.name.endsWith(`-${feature}`)))
  if (!matched) {
    throw new Error(`Archive directory not found for feature: ${feature}`)
  }
  return join(archiveRoot, matched.name)
}

async function resolveChangeDir(testDir: string, feature: string): Promise<string> {
  const changeRoot = join(testDir, 'docs', 'changes')
  const entries = await readdir(changeRoot, { withFileTypes: true })
  const matched = entries.find(entry => entry.isDirectory() && (entry.name === feature || entry.name.endsWith(`-${feature}`)))
  if (!matched) {
    throw new Error(`Change directory not found for feature: ${feature}`)
  }
  return join(changeRoot, matched.name)
}

async function setupReadinessArchiveFixture(
  testDir: string,
  feature: string,
  options?: {
    readiness?: VerifyReadinessStatus
    pendingDocUpdates?: Array<{ file: string; timestamp: string; reason?: string }>
  }
): Promise<OpenFlowContext> {
  await rm(testDir, { recursive: true, force: true })

  await mkdir(join(testDir, 'docs', 'changes', feature), { recursive: true })
  await writeFile(join(testDir, 'docs', 'changes', feature, 'design.md'), '# Design\n\nArchive readiness fixture', 'utf-8')

  await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
  await writeFile(join(testDir, '.sisyphus', 'plans', `${feature}.md`), '# Plan', 'utf-8')

  await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260421-000001'), { recursive: true })
  await writeFile(
    join(testDir, '.sisyphus', 'builds', 'build-20260421-000001', 'changes.json'),
    JSON.stringify([{ filePath: `src/${feature}.ts`, tool: 'edit', timestamp: Date.now() }]),
    'utf-8'
  )

  await saveAcceptanceState(testDir, {
    feature,
    phase: 'acceptance',
    phaseStartedAt: '2026-04-21T00:00:00.000Z',
    pendingDocUpdates: options?.pendingDocUpdates ?? [],
    ...(options?.readiness ? { readiness: options.readiness } : {}),
  })

  return {
    ...createContext(),
    directory: testDir,
    worktree: testDir,
    config: {
      ...defaultConfig,
      archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: true },
    },
  }
}

describe('archive command', () => {
  test('returns disabled message when archive is disabled', async () => {
    const ctx = createContext({
      archive: {
        ...defaultConfig.archive,
        enabled: false,
      },
    })

    const result = await handleArchive(ctx, 'demo-feature')
    expect(result).toBe('Archive phase is disabled in configuration')
  })

  test('throws when feature is missing', async () => {
    const testDir = join(process.cwd(), '.test-archive-no-feature')
    await rm(testDir, { recursive: true, force: true })
    await mkdir(testDir, { recursive: true })
    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
    }
    await expect(handleArchive(ctx, undefined)).rejects.toThrow('Feature name is required')
  })

  test('archives requirements documents when they exist', async () => {
    const testDir = join(process.cwd(), '.test-archive-requirements')
    await rm(testDir, { recursive: true, force: true })

    // Create requirements documents
    const reqDir = join(testDir, 'docs', 'current', 'requirements', 'req-feature')
    await mkdir(reqDir, { recursive: true })
    await writeFile(join(reqDir, '20260322-prd.md'), '# Requirements\n\nTest requirements document', 'utf-8')

    // Create design documents
    const designDir = join(testDir, 'docs', 'current', 'design', 'req-feature')
    await mkdir(designDir, { recursive: true })
    await writeFile(join(designDir, '20260322-design.md'), '# Design', 'utf-8')

    // Create plan
    const plansRoot = join(testDir, '.sisyphus', 'plans')
    await mkdir(plansRoot, { recursive: true })
    await writeFile(join(plansRoot, 'req-feature.md'), '# Plan', 'utf-8')

    // Create builds for file tracking
    const buildsRoot = join(testDir, '.sisyphus', 'builds')
    await mkdir(buildsRoot, { recursive: true })
    const buildDir = join(buildsRoot, 'build-20260322-000001')
    await mkdir(buildDir, { recursive: true })
    await writeFile(join(buildDir, 'changes.json'), JSON.stringify([{ filePath: 'src/req.ts', tool: 'write', timestamp: Date.now() }]), 'utf-8')

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive' },
        feature: { 
          ...defaultConfig.feature, 
          output_dir: 'docs/current/design',
          prd_output_dir: 'docs/current/requirements',
        },
      },
    }

    const result = await handleArchive(ctx, 'req-feature')
    expect(result).toContain('Requirements documents: ✅')

    // Verify requirements were archived
    const archiveDir = await resolveArchiveDir(testDir, 'req-feature')
    const archivedReqPath = join(archiveDir, 'prd.md')
    const archivedReq = await readFile(archivedReqPath, 'utf-8')
    expect(archivedReq).toContain('Test requirements document')

    await rm(testDir, { recursive: true, force: true })
  })

  test('deduplicates file changes across recent builds', async () => {
    const testDir = join(process.cwd(), '.test-archive-dedupe')
    await rm(testDir, { recursive: true, force: true })

    const buildsRoot = join(testDir, '.sisyphus', 'builds')
    const plansRoot = join(testDir, '.sisyphus', 'plans')
    await mkdir(buildsRoot, { recursive: true })
    await mkdir(plansRoot, { recursive: true })

    const buildA = join(buildsRoot, 'build-20260312-000001')
    const buildB = join(buildsRoot, 'build-20260312-000002')
    await mkdir(buildA, { recursive: true })
    await mkdir(buildB, { recursive: true })

    await writeFile(
      join(buildA, 'changes.json'),
      JSON.stringify([{ filePath: 'src/shared.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )
    await writeFile(
      join(buildB, 'changes.json'),
      JSON.stringify([
        { filePath: 'src/shared.ts', tool: 'write', timestamp: Date.now() },
        { filePath: 'src/extra.ts', tool: 'edit', timestamp: Date.now() },
      ]),
      'utf-8'
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive' },
        feature: { ...defaultConfig.feature, output_dir: 'docs/current/design' },
      },
    }

    const result = await handleArchive(ctx, 'demo-feature')
    expect(result).toContain('**Files Changed**: 2')

    await rm(testDir, { recursive: true, force: true })
  })

  test('cleans builds older than keep window', async () => {
    const testDir = join(process.cwd(), '.test-archive-cleanup')
    await rm(testDir, { recursive: true, force: true })

    const buildsRoot = join(testDir, '.sisyphus', 'builds')
    await mkdir(buildsRoot, { recursive: true })

    const buildIds = [
      'build-20260312-000001',
      'build-20260312-000002',
      'build-20260312-000003',
      'build-20260312-000004',
      'build-20260312-000005',
      'build-20260312-000006',
      'build-20260312-000007',
    ]

    for (const buildId of buildIds) {
      const buildDir = join(buildsRoot, buildId)
      await mkdir(buildDir, { recursive: true })
      await writeFile(join(buildDir, 'changes.json'), JSON.stringify([{ filePath: `src/${buildId}.ts`, tool: 'edit' }]), 'utf-8')
    }

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive' },
        feature: { ...defaultConfig.feature, output_dir: 'docs/current/design' },
      },
    }

    await handleArchive(ctx, 'cleanup-feature')

    await expect(access(join(buildsRoot, 'build-20260312-000007'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000006'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000005'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000004'))).resolves.toBeNull()
    await expect(access(join(buildsRoot, 'build-20260312-000003'))).resolves.toBeNull()

    await expect(access(join(buildsRoot, 'build-20260312-000002'))).rejects.toBeDefined()
    await expect(access(join(buildsRoot, 'build-20260312-000001'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('uses session phase split and writes drift section when enabled', async () => {
    const testDir = join(process.cwd(), '.test-archive-session-drift')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'current', 'design', 'session-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'current', 'design', 'session-feature', '20260312-design.md'), '# Design\n\n`OldApi`', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'session-feature.md'), '# plan', 'utf-8')

    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(join(testDir, 'src', 'session-feature.ts'), 'export function NewApiFeature() {}', 'utf-8')

    await saveAcceptanceState(testDir, {
      feature: 'session-feature',
      phase: 'acceptance',
      phaseStartedAt: '2026-01-02T00:00:00.000Z',
      sessionID: 's-1',
      pendingDocUpdates: [],
    })

    const client = {
      session: {
        messages: async () => ({
          data: [
            {
              info: { role: 'assistant', id: 'm1', createdAt: '2026-01-03T00:00:00.000Z' },
              parts: [
                {
                  type: 'tool',
                  tool: 'write',
                  callID: 'c1',
                  state: { status: 'done', input: { filePath: 'src/session-feature.ts' } },
                },
              ],
            },
          ],
        }),
      },
    }

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      client,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
        acceptance: { ...defaultConfig.acceptance, drift_detection: true },
        feature: { ...defaultConfig.feature, output_dir: 'docs/current/design' },
      },
    }

    await handleArchive(ctx, 'session-feature')

    const archiveDir = await resolveArchiveDir(testDir, 'session-feature')
    const mapperPath = join(archiveDir, 'implementation-mapper.md')
    const mapper = await readFile(mapperPath, 'utf-8')
    expect(mapper).toContain('src/session-feature.ts')

    const stateAfter = await loadAcceptanceState(testDir)
    expect(stateAfter?.phase).toBe('promoted')
    expect(stateAfter?.promotionSuggestions).toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('writes requirement-first implementation traceability with real symbols', async () => {
    const testDir = join(process.cwd(), '.test-archive-traceability')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'changes', 'trace-feature'), { recursive: true })
    await writeFile(
      join(testDir, 'docs', 'changes', 'trace-feature', 'prd.md'),
      '# Requirements\n## Acceptance Criteria\n- Generated archive traceability links requirement items to code\n',
      'utf-8'
    )

    await writeFile(
      join(testDir, 'docs', 'changes', 'trace-feature', 'design.md'),
      '# Design\n- This design fallback should not be primary when requirements exist\n',
      'utf-8'
    )

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'trace-feature.md'), '# plan', 'utf-8')

    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260417-000001'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260417-000001', 'changes.json'),
      JSON.stringify([{ filePath: 'src/trace-feature.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )

    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(
      join(testDir, 'src', 'trace-feature.ts'),
      'export function generateArchiveTraceability() {}\nexport const extractRequirementEvidence = () => true\n',
      'utf-8'
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
        feature: {
          ...defaultConfig.feature,
          output_dir: 'docs/current/design',
          prd_output_dir: 'docs/current/requirements',
        },
      },
    }

    await handleArchive(ctx, 'trace-feature')

    const archiveDir = await resolveArchiveDir(testDir, 'trace-feature')
    const mapperPath = join(archiveDir, 'implementation-mapper.md')
    const mapper = await readFile(mapperPath, 'utf-8')
    expect(mapper).toContain('Generated archive traceability links requirement items to code')
    expect(mapper).toContain('prd.md → Acceptance Criteria')
    expect(mapper).toContain('src/trace-feature.ts')
    expect(mapper).toContain('generateArchiveTraceability')
    expect(mapper).toContain('extractRequirementEvidence')
    expect(mapper).not.toContain('Step 1')
    expect(mapper).not.toContain('*auto-detect*')
    expect(mapper).not.toContain('This design fallback should not be primary when requirements exist')

    await rm(testDir, { recursive: true, force: true })
  })

  test('removes archived docs/changes workspace content after successful archive', async () => {
    const testDir = join(process.cwd(), '.test-archive-removes-change-workspace')
    await rm(testDir, { recursive: true, force: true })

    const changeWorkspace = join(testDir, 'docs', 'changes', 'cleanup-feature')
    await mkdir(changeWorkspace, { recursive: true })
    await writeFile(join(changeWorkspace, 'design.md'), '# Design\n\nCleanup after archive', 'utf-8')
    await writeFile(join(changeWorkspace, 'prd.md'), '# Requirements\n\nCleanup after archive', 'utf-8')
    await writeFile(join(changeWorkspace, 'proposal.md'), '# Proposal', 'utf-8')
    await writeFile(join(changeWorkspace, 'decisions.md'), '# Decisions', 'utf-8')
    await writeFile(join(changeWorkspace, 'plan.md'), '# Plan', 'utf-8')

    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260418-000001'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260418-000001', 'changes.json'),
      JSON.stringify([{ filePath: 'src/cleanup-feature.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    const resolvedChangeWorkspace = await resolveChangeDir(testDir, 'cleanup-feature')

    await handleArchive(ctx, 'cleanup-feature')

    const archiveDir = await resolveArchiveDir(testDir, 'cleanup-feature')
    await expect(access(join(archiveDir, 'design.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'prd.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'proposal.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'decisions.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'plan.md'))).resolves.toBeNull()

    await expect(access(join(resolvedChangeWorkspace, 'design.md'))).rejects.toBeDefined()
    await expect(access(join(resolvedChangeWorkspace, 'prd.md'))).rejects.toBeDefined()
    await expect(access(join(resolvedChangeWorkspace, 'proposal.md'))).rejects.toBeDefined()
    await expect(access(join(resolvedChangeWorkspace, 'decisions.md'))).rejects.toBeDefined()
    await expect(access(join(resolvedChangeWorkspace, 'plan.md'))).rejects.toBeDefined()
    await expect(access(resolvedChangeWorkspace)).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('preserves docs/changes workspace when archive is blocked before completion', async () => {
    const testDir = join(process.cwd(), '.test-archive-preserves-blocked-workspace')
    await rm(testDir, { recursive: true, force: true })

    const changeWorkspace = join(testDir, 'docs', 'changes', 'blocked-feature')
    await mkdir(changeWorkspace, { recursive: true })
    await writeFile(join(changeWorkspace, 'design.md'), '# Design\n\nBlocked archive should preserve source', 'utf-8')

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'blocked-feature.md'), '# fallback plan', 'utf-8')

    await saveAcceptanceState(testDir, {
      feature: 'blocked-feature',
      phase: 'verification_failed',
      phaseStartedAt: '2026-04-18T00:00:00.000Z',
      verificationFailureCategory: 'security',
      pendingDocUpdates: [],
    })

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    const result = await handleArchive(ctx, 'blocked-feature')
    expect(result).toContain('Archive Blocked')

    const resolvedBlockedWorkspace = await resolveChangeDir(testDir, 'blocked-feature')
    await expect(access(join(resolvedBlockedWorkspace, 'design.md'))).resolves.toBeNull()
    await expect(access(join(testDir, 'docs', 'archive', 'blocked-feature'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('rejects archive when readiness is not_ready', async () => {
    const feature = 'readiness-not-ready'
    const testDir = join(process.cwd(), '.test-archive-readiness-not-ready')
    const ctx = await setupReadinessArchiveFixture(testDir, feature, { readiness: VerifyReadinessStatus.NotReady })

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Blocked')
    expect(result).toContain('not ready')
    await expect(access(join(testDir, 'docs', 'archive', feature))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('rejects archive when readiness needs_decision', async () => {
    const feature = 'readiness-needs-decision'
    const testDir = join(process.cwd(), '.test-archive-readiness-needs-decision')
    const ctx = await setupReadinessArchiveFixture(testDir, feature, { readiness: VerifyReadinessStatus.NeedsDecision })

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Blocked')
    expect(result).toContain('needs decision')
    await expect(access(join(testDir, 'docs', 'archive', feature))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('accepts archive when readiness is ready', async () => {
    const feature = 'readiness-ready'
    const testDir = join(process.cwd(), '.test-archive-readiness-ready')
    const ctx = await setupReadinessArchiveFixture(testDir, feature, { readiness: VerifyReadinessStatus.Ready })

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Complete')
    expect(result).not.toContain('acceptance readiness is missing')

    const archiveDir = await resolveArchiveDir(testDir, feature)
    await expect(access(join(archiveDir, 'implementation-mapper.md'))).resolves.toBeNull()

    await rm(testDir, { recursive: true, force: true })
  })

  test('accepts archive when readiness is ready_with_doc_updates', async () => {
    const feature = 'readiness-doc-updates'
    const testDir = join(process.cwd(), '.test-archive-readiness-doc-updates')
    const ctx = await setupReadinessArchiveFixture(testDir, feature, {
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      pendingDocUpdates: [{ file: 'docs/current/design/readiness-doc-updates/design.md', timestamp: '2026-04-21T00:00:00.000Z' }],
    })

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Confirmation Required')
    expect(result).toContain('Pending Document Updates')

    const stateAfterFirstRun = await loadAcceptanceState(testDir)
    expect(stateAfterFirstRun?.waitingForDocUpdateConfirm).toBe(true)
    expect(stateAfterFirstRun?.archiveUsedDocUpdateConfirmPath).toBe(true)

    await saveAcceptanceState(testDir, {
      ...stateAfterFirstRun!,
      waitingForDocUpdateConfirm: false,
      archiveDocUpdateConfirmationStatus: 'confirmed',
      archiveDocUpdateConfirmedAt: '2026-04-22T00:00:00.000Z',
    })

    const secondResult = await handleArchive(ctx, feature)
    expect(secondResult).toContain('Archive Complete')
    expect(secondResult).toContain('Acceptance changes: ✅')
    expect(secondResult).toContain('confirmed doc-update reconciliation path')

    const archiveDir = await resolveArchiveDir(testDir, feature)
    await expect(access(join(archiveDir, 'implementation-mapper.md'))).resolves.toBeNull()

    await rm(testDir, { recursive: true, force: true })
  })

  test('blocks archive when ready_with_doc_updates confirmation is declined', async () => {
    const feature = 'readiness-doc-updates-declined'
    const testDir = join(process.cwd(), '.test-archive-readiness-doc-updates-declined')
    const ctx = await setupReadinessArchiveFixture(testDir, feature, {
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      pendingDocUpdates: [{ file: 'docs/current/design/readiness-doc-updates-declined/design.md', timestamp: '2026-04-21T00:00:00.000Z' }],
    })

    await saveAcceptanceState(testDir, {
      feature,
      phase: 'acceptance',
      phaseStartedAt: '2026-04-21T00:00:00.000Z',
      readiness: VerifyReadinessStatus.ReadyWithDocUpdates,
      pendingDocUpdates: [{ file: 'docs/current/design/readiness-doc-updates-declined/design.md', timestamp: '2026-04-21T00:00:00.000Z' }],
      archiveUsedDocUpdateConfirmPath: true,
      archiveDocUpdateConfirmationStatus: 'declined',
      waitingForDocUpdateConfirm: false,
    })

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Blocked')
    expect(result).toContain('explicitly declined')
    await expect(access(join(testDir, 'docs', 'archive', feature))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('proceeds with warning when readiness is undefined for legacy acceptance state', async () => {
    const feature = 'readiness-legacy'
    const testDir = join(process.cwd(), '.test-archive-readiness-legacy')
    const ctx = await setupReadinessArchiveFixture(testDir, feature)

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Complete')
    expect(result).toContain('acceptance readiness is missing')

    const archiveDir = await resolveArchiveDir(testDir, feature)
    await expect(access(join(archiveDir, 'implementation-mapper.md'))).resolves.toBeNull()

    await rm(testDir, { recursive: true, force: true })
  })

  test('does not delete docs/current source documents after archive', async () => {
    const testDir = join(process.cwd(), '.test-archive-preserves-current-docs')
    await rm(testDir, { recursive: true, force: true })

    const designDir = join(testDir, 'docs', 'current', 'design', 'current-feature')
    const requirementsDir = join(testDir, 'docs', 'current', 'requirements', 'current-feature')
    await mkdir(designDir, { recursive: true })
    await mkdir(requirementsDir, { recursive: true })
    await writeFile(join(designDir, '20260418-design.md'), '# Current Design', 'utf-8')
    await writeFile(join(requirementsDir, '20260418-prd.md'), '# Current Requirements', 'utf-8')

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'current-feature.md'), '# Plan', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260418-000002'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260418-000002', 'changes.json'),
      JSON.stringify([{ filePath: 'src/current-feature.ts', tool: 'write', timestamp: Date.now() }]),
      'utf-8'
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
        feature: {
          ...defaultConfig.feature,
          output_dir: 'docs/current/design',
          prd_output_dir: 'docs/current/requirements',
        },
      },
    }

    await handleArchive(ctx, 'current-feature')

    await expect(access(join(designDir, '20260418-design.md'))).resolves.toBeNull()
    await expect(access(join(requirementsDir, '20260418-prd.md'))).resolves.toBeNull()

    await rm(testDir, { recursive: true, force: true })
  })

  test('applies current promotion by default and falls back to direct migration when no match exists', async () => {
    const testDir = join(process.cwd(), '.test-archive-current-promotion')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'current', 'design', 'other-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'current', 'design', 'other-feature', '20260301-design.md'), '# Old Design', 'utf-8')

    await mkdir(join(testDir, 'docs', 'changes', 'promo-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', 'promo-feature', 'design.md'), '# New Design', 'utf-8')
    await writeFile(join(testDir, 'docs', 'changes', 'promo-feature', 'prd.md'), '# New PRD', 'utf-8')

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'promo-feature.md'), '# plan', 'utf-8')

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive' },
        feature: { ...defaultConfig.feature, output_dir: 'docs/current/design' },
      },
    }

    const result = await handleArchive(ctx, 'promo-feature')
    expect(result).toContain('Current Promotion')
    expect(result).toContain('applied: 2')
    expect(result).toContain('no reliable historical design match')

    const promotedDesign = await readFile(join(testDir, 'docs', 'current', 'design', 'promo-feature', 'design.md'), 'utf-8')
    expect(promotedDesign).toContain('New Design')

    await rm(testDir, { recursive: true, force: true })
  })

  test('synthesizes a matching historical current design doc during archive promotion', async () => {
    const testDir = join(process.cwd(), '.test-archive-current-synthesis')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'current', 'design', 'archive-history'), { recursive: true })
    await writeFile(
      join(testDir, 'docs', 'current', 'design', 'archive-history', '20260401-design.md'),
      '# Historical Archive Flow\n\n## Problem Statement\nOlder wording for archive evidence.\n\n## Legacy Notes\nKeep this note.\n',
      'utf-8'
    )

    await mkdir(join(testDir, 'docs', 'changes', 'synth-feature'), { recursive: true })
    await writeFile(
      join(testDir, 'docs', 'changes', 'synth-feature', 'design.md'),
      '# Archive Sync\n\n## Problem Statement\nRefresh current docs from archive evidence.\n\n## Verification\nRun archive QA checks.\n',
      'utf-8'
    )

    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'synth-feature.md'), '# plan', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260420-000003'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260420-000003', 'changes.json'),
      JSON.stringify([{ filePath: 'src/synth-feature.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false, auto_promote_current: true },
      },
    }

    const result = await handleArchive(ctx, 'synth-feature')
    expect(result).toContain('Current Promotion')
    expect(result).toContain('applied: 1')
    expect(result).toContain('reliable historical design match')

    const promotedDesign = await readFile(join(testDir, 'docs', 'current', 'design', 'archive-history', '20260401-design.md'), 'utf-8')
    expect(promotedDesign).toContain('Refresh current docs from archive evidence.')
    expect(promotedDesign).toContain('## Verification')
    expect(promotedDesign).toContain('Run archive QA checks.')
    expect(promotedDesign).toContain('## Legacy Notes')
    expect(promotedDesign).toContain('Keep this note.')

    await expect(access(join(testDir, 'docs', 'current', 'design', 'synth-feature', 'design.md'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('archives issue-only workspace with issue-resolution and keeps unconfirmed governance candidate pending', async () => {
    const testDir = join(process.cwd(), '.test-archive-issue-mode')
    await rm(testDir, { recursive: true, force: true })

    const feature = 'issue-only-fix'
    const changeDir = join(testDir, 'docs', 'changes', feature)
    await mkdir(changeDir, { recursive: true })
    await writeFile(
      join(changeDir, 'issue-clarification.md'),
      `# Issue Clarification

### 1. Issue Intake
Invited users fail login after a stale state restore.

### 2. Requirement Clarification
Invited users must complete login using the latest invite state.

### 3. Constraint Clarification
Do not change the visible login flow for existing users.

### 4. Evidence Investigation
Reproduced with a stale invite token cached in memory.

### 5. Semantic Alignment
The semantic contract requires invite validation before session restore.

### 6. Classification
bugfix

### 7. Next Action Gate
Invalidate stale invite state before restoring a session.

### 8. Governance Promotion
Capture the invite-validation rule as a pending governance candidate.
`,
      'utf-8'
    )
    await writeFile(
      join(changeDir, 'promotion-candidate.md'),
      `# Promotion Candidate

## Source Issue
invite-state

## Clarified Requirement
Invite validation must happen before restoring session state.

## Clarified Constraints
Preserve current user-visible login behavior.

## Proposed Current Update
docs/current/spec/invite.md

## Proposed Decision
Always validate invite state freshness before session restore.

## Approval Needed
User approval required before global adoption.

## Rationale
Prevents stale state from bypassing semantic checks.
`,
      'utf-8'
    )

    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260509-000001'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260509-000001', 'changes.json'),
      JSON.stringify([{ filePath: 'src/invite-session.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )

    await saveAcceptanceState(testDir, {
      feature,
      phase: 'acceptance',
      phaseStartedAt: '2026-05-09T00:00:00.000Z',
      readiness: VerifyReadinessStatus.Ready,
      pendingDocUpdates: [{ file: 'docs/current/spec/invite.md', timestamp: '2026-05-09T00:00:00.000Z', reason: 'invite semantic rule confirmed' }],
      mode: 'issue',
      issueSlug: feature,
      rawIssue: 'Invited users fail login after stale session restore',
      primaryClassification: 'bugfix',
      classifications: ['bugfix'],
      governancePromotionStatus: 'candidate_created',
      issueClarificationPath: join(changeDir, 'issue-clarification.md'),
      promotionCandidatePath: join(changeDir, 'promotion-candidate.md'),
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: [],
        evidenceSummary: 'test, lint, and semantic verification all passed for the invite fix.',
        constraintsChecked: ['test', 'lint', 'semantic-contract'],
        verifiedAt: '2026-05-09T01:00:00.000Z',
      },
    })

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Complete')
    expect(result).toContain('Archive mode: issue')

    const archiveDir = await resolveArchiveDir(testDir, feature)
    await expect(access(join(archiveDir, 'issue-clarification.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'promotion-candidate.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'issue-resolution.md'))).resolves.toBeNull()

    const resolution = await readFile(join(archiveDir, 'issue-resolution.md'), 'utf-8')
    expect(resolution).toContain('## Symptom')
    expect(resolution).toContain('## Evidence')
    expect(resolution).toContain('## Semantic Contract')
    expect(resolution).toContain('## Root Cause')
    expect(resolution).toContain('## Fix Decision')
    expect(resolution).toContain('## Implementation Summary')
    expect(resolution).toContain('## Verification Evidence')
    expect(resolution).toContain('## Governance Promotion')
    expect(resolution).toContain('## Residual Risk')
    expect(resolution).toContain('candidate remains pending and was not written to `docs/decisions/*`')

    await expect(access(join(testDir, 'docs', 'decisions', `${feature}.md`))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('archives issue-only workspace without design or plan and preserves preexisting issue-resolution', async () => {
    const testDir = join(process.cwd(), '.test-archive-issue-no-design')
    await rm(testDir, { recursive: true, force: true })

    const feature = 'issue-no-design'
    const changeDir = join(testDir, 'docs', 'changes', feature)
    await mkdir(changeDir, { recursive: true })
    await writeFile(
      join(changeDir, 'issue-clarification.md'),
      `# Issue Clarification

### 1. Issue Intake
Cache invalidation misses stale entries under concurrent writes.

### 2. Requirement Clarification
Cache must return fresh data after any write completes.

### 3. Constraint Clarification
Do not add external dependencies.

### 4. Evidence Investigation
Reproduced stale read under concurrent write load.

### 5. Semantic Alignment
Write-through cache semantics required.

### 6. Classification
bugfix

### 7. Next Action Gate
Fix cache invalidation race condition.

### 8. Governance Promotion
Capture write-through cache rule as governance candidate.
`,
      'utf-8'
    )
    const preexistingResolutionContent = `# Issue Resolution

## Symptom
Cache invalidation misses stale entries under concurrent writes.

## Root Cause
Race condition between write completion and cache invalidation signal.

## Fix Summary
Added synchronous invalidation barrier after write commit.
`
    await writeFile(
      join(changeDir, 'issue-resolution.md'),
      preexistingResolutionContent,
      'utf-8'
    )
    await writeFile(
      join(changeDir, 'promotion-candidate.md'),
      `# Promotion Candidate

## Proposed Decision
Enforce synchronous cache invalidation barrier after write commit.
`,
      'utf-8'
    )

    // No design.md, no .sisyphus/plans/<feature>.md 鈥?issue mode must succeed without them.
    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260513-000001'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260513-000001', 'changes.json'),
      JSON.stringify([{ filePath: 'src/cache.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )

    await saveAcceptanceState(testDir, {
      feature,
      phase: 'acceptance',
      phaseStartedAt: '2026-05-13T00:00:00.000Z',
      readiness: VerifyReadinessStatus.Ready,
      pendingDocUpdates: [],
      mode: 'issue',
      issueSlug: feature,
      rawIssue: 'Cache invalidation misses stale entries',
      primaryClassification: 'bugfix',
      classifications: ['bugfix'],
      governancePromotionStatus: 'candidate_created',
      issueClarificationPath: join(changeDir, 'issue-clarification.md'),
      promotionCandidatePath: join(changeDir, 'promotion-candidate.md'),
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: [],
        evidenceSummary: 'All cache tests pass.',
        constraintsChecked: ['test', 'lint'],
        verifiedAt: '2026-05-13T01:00:00.000Z',
      },
    })

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    const result = await handleArchive(ctx, feature)
    expect(result).toContain('Archive Complete')
    expect(result).toContain('Archive mode: issue')
    expect(result).toContain('Design documents: ❌')
    expect(result).toContain('Plan: ❌')

    const archiveDir = await resolveArchiveDir(testDir, feature)
    await expect(access(join(archiveDir, 'issue-clarification.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'promotion-candidate.md'))).resolves.toBeNull()
    await expect(access(join(archiveDir, 'issue-resolution.md'))).resolves.toBeNull()

    const archivedResolution = await readFile(join(archiveDir, 'issue-resolution.md'), 'utf-8')
    expect(archivedResolution).toBe(preexistingResolutionContent)
    expect(archivedResolution).toContain('Race condition between write completion and cache invalidation signal.')
    expect(archivedResolution).toContain('Added synchronous invalidation barrier after write commit.')

    await rm(testDir, { recursive: true, force: true })
  })

  test('promotes confirmed issue governance candidate into docs/decisions', async () => {
    const testDir = join(process.cwd(), '.test-archive-issue-governance-confirmed')
    await rm(testDir, { recursive: true, force: true })

    const feature = 'issue-governance-confirmed'
    const changeDir = join(testDir, 'docs', 'changes', feature)
    await mkdir(changeDir, { recursive: true })
    await writeFile(
      join(changeDir, 'issue-clarification.md'),
      '# Issue Clarification\n\n### 1. Issue Intake\nSemantic drift in invite validation.\n\n### 7. Next Action Gate\nRestore invite freshness checks.\n',
      'utf-8'
    )
    await writeFile(
      join(changeDir, 'promotion-candidate.md'),
      '# Promotion Candidate\n\n## Proposed Decision\nInvite freshness must be validated before session restore.\n',
      'utf-8'
    )

    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260509-000002'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260509-000002', 'changes.json'),
      JSON.stringify([{ filePath: 'src/invite-validation.ts', tool: 'edit', timestamp: Date.now() }]),
      'utf-8'
    )

    await saveAcceptanceState(testDir, {
      feature,
      phase: 'acceptance',
      phaseStartedAt: '2026-05-09T00:00:00.000Z',
      readiness: VerifyReadinessStatus.Ready,
      pendingDocUpdates: [],
      mode: 'issue',
      issueSlug: feature,
      rawIssue: 'Semantic drift in invite validation',
      primaryClassification: 'bugfix',
      classifications: ['bugfix'],
      governancePromotionStatus: 'confirmed',
      issueClarificationPath: join(changeDir, 'issue-clarification.md'),
      promotionCandidatePath: join(changeDir, 'promotion-candidate.md'),
      verifyResult: {
        readiness: VerifyReadinessStatus.Ready,
        reasonCodes: [],
        evidenceSummary: 'verification passed',
        constraintsChecked: ['test'],
        verifiedAt: '2026-05-09T01:00:00.000Z',
      },
    })

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    await handleArchive(ctx, feature)

    const promotedDecision = await readFile(join(testDir, 'docs', 'decisions', `${feature}.md`), 'utf-8')
    expect(promotedDecision).toContain('Invite freshness must be validated before session restore.')

    await rm(testDir, { recursive: true, force: true })
  })

  test('pauses archive when drift is detected and drift_check is enabled', async () => {
    const testDir = join(process.cwd(), '.test-archive-drift-pause')
    await rm(testDir, { recursive: true, force: true })

    await mkdir(join(testDir, 'docs', 'current', 'design', 'pause-feature'), { recursive: true })
    await writeFile(join(testDir, 'docs', 'current', 'design', 'pause-feature', '20260312-design.md'), '# Design\n\n`OldApi`', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', 'pause-feature.md'), '# plan', 'utf-8')

    await mkdir(join(testDir, 'src'), { recursive: true })
    await writeFile(join(testDir, 'src', 'pause-feature.ts'), 'export function NewDriftApi() {}', 'utf-8')

    await saveAcceptanceState(testDir, {
      feature: 'pause-feature',
      phase: 'acceptance',
      phaseStartedAt: '2026-01-02T00:00:00.000Z',
      sessionID: 's-2',
      pendingDocUpdates: [],
    })

    const client = {
      session: {
        messages: async () => ({
          data: [
            {
              info: { role: 'assistant', id: 'm1', createdAt: '2026-01-03T00:00:00.000Z' },
              parts: [
                {
                  type: 'tool',
                  tool: 'write',
                  callID: 'c1',
                  state: { status: 'done', input: { filePath: 'src/pause-feature.ts' } },
                },
              ],
            },
          ],
        }),
      },
    }

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      client,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: true },
        acceptance: { ...defaultConfig.acceptance, drift_detection: true },
        feature: { ...defaultConfig.feature, output_dir: 'docs/current/design' },
      },
    }

    const result = await handleArchive(ctx, 'pause-feature')
    expect(result).toContain('Drift Detected')
    expect(result).toContain('Archive was paused')

    await expect(access(join(testDir, 'docs', 'archive', 'pause-feature', 'implementation-mapper.md'))).rejects.toBeDefined()

    await rm(testDir, { recursive: true, force: true })
  })

  test('stale not_ready from a different feature does not block archive of the requested feature', async () => {
    const staleFeature = 'stale-feature'
    const targetFeature = 'target-feature'
    const testDir = join(process.cwd(), '.test-archive-stale-not-ready-no-block')

    await rm(testDir, { recursive: true, force: true })

    // Create acceptance state for the STALE feature with NotReady readiness
    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await saveAcceptanceState(testDir, {
      feature: staleFeature,
      phase: 'acceptance',
      phaseStartedAt: '2026-04-21T00:00:00.000Z',
      readiness: VerifyReadinessStatus.NotReady,
      pendingDocUpdates: [],
    })

    // Set up workspace for the TARGET feature
    await mkdir(join(testDir, 'docs', 'changes', targetFeature), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', targetFeature, 'design.md'), '# Target Design\n\nTarget feature archive test', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', `${targetFeature}.md`), '# Target Plan', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260421-000002'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260421-000002', 'changes.json'),
      JSON.stringify([{ filePath: `src/${targetFeature}.ts`, tool: 'edit', timestamp: Date.now() }]),
      'utf-8',
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    const result = await handleArchive(ctx, targetFeature)

    // The archive should NOT be blocked by stale-feature's not_ready message
    expect(result).not.toContain('not ready')
    // But archive SHOULD be blocked because no matching readiness exists for target
    expect(result).toContain('Archive Blocked')
    expect(result).toContain('no verification readiness was found')
    expect(result).toContain(`**${targetFeature}**`)
    // The message must reference the stale feature
    expect(result).toContain(`**${staleFeature}**`)
    // The stale-feature state should still exist (we don't overwrite it)
    expect(result).toContain('/openflow-verify')

    const acceptanceStateAfter = await loadAcceptanceState(testDir)
    expect(acceptanceStateAfter?.feature).toBe(staleFeature)

    await rm(testDir, { recursive: true, force: true })
  })

  test('stale ready from a different feature does not auto-allow archive of the requested feature', async () => {
    const staleFeature = 'stale-ready-feature'
    const targetFeature = 'target-no-verify'
    const testDir = join(process.cwd(), '.test-archive-stale-ready-no-allow')

    await rm(testDir, { recursive: true, force: true })

    // Create acceptance state for the STALE feature with Ready readiness
    await mkdir(join(testDir, '.sisyphus'), { recursive: true })
    await saveAcceptanceState(testDir, {
      feature: staleFeature,
      phase: 'acceptance',
      phaseStartedAt: '2026-04-21T00:00:00.000Z',
      readiness: VerifyReadinessStatus.Ready,
      pendingDocUpdates: [],
    })

    // Set up workspace for the TARGET feature (no acceptance state for it)
    await mkdir(join(testDir, 'docs', 'changes', targetFeature), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', targetFeature, 'design.md'), '# Target Design\n\nNo verify ready for target', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', `${targetFeature}.md`), '# Target Plan', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260421-000003'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260421-000003', 'changes.json'),
      JSON.stringify([{ filePath: `src/${targetFeature}.ts`, tool: 'edit', timestamp: Date.now() }]),
      'utf-8',
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    const result = await handleArchive(ctx, targetFeature)

    // The archive should NOT auto-allow based on stale-feature's ready
    expect(result).not.toContain('Archive Complete')
    // Archive should be blocked because no matching readiness exists for target
    expect(result).toContain('Archive Blocked')
    expect(result).toContain('no verification readiness was found')
    expect(result).toContain(`**${targetFeature}**`)
    // The message must reference the stale feature
    expect(result).toContain(`**${staleFeature}**`)
    // The stale acceptance state should remain unchanged (still belongs to stale-feature)
    expect(result).toContain('/openflow-verify')

    const acceptanceStateAfter = await loadAcceptanceState(testDir)
    expect(acceptanceStateAfter?.feature).toBe(staleFeature)
    expect(acceptanceStateAfter?.readiness).toBe(VerifyReadinessStatus.Ready)

    await rm(testDir, { recursive: true, force: true })
  })

  test('strips OpenFlow command tokens from archive feature parameter', async () => {
    const targetFeature = 'my-real-feature'
    const testDir = join(process.cwd(), '.test-archive-strip-tokens')

    await rm(testDir, { recursive: true, force: true })

    // Set up workspace for the real feature
    await mkdir(join(testDir, 'docs', 'changes', targetFeature), { recursive: true })
    await writeFile(join(testDir, 'docs', 'changes', targetFeature, 'design.md'), '# Design', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'plans'), { recursive: true })
    await writeFile(join(testDir, '.sisyphus', 'plans', `${targetFeature}.md`), '# Plan', 'utf-8')
    await mkdir(join(testDir, '.sisyphus', 'builds', 'build-20260421-000004'), { recursive: true })
    await writeFile(
      join(testDir, '.sisyphus', 'builds', 'build-20260421-000004', 'changes.json'),
      JSON.stringify([{ filePath: `src/${targetFeature}.ts`, tool: 'edit', timestamp: Date.now() }]),
      'utf-8',
    )

    const ctx: OpenFlowContext = {
      ...createContext(),
      directory: testDir,
      worktree: testDir,
      config: {
        ...defaultConfig,
        archive: { ...defaultConfig.archive, output_dir: 'docs/archive', drift_check: false },
      },
    }

    // Pass a mangled feature name with command tokens — should resolve to the real feature
    const result = await handleArchive(ctx, 'openflow-archive-my-real-feature')

    expect(result).toContain('Archive Complete')
    expect(result).toContain(`**Feature**: ${targetFeature}`)

    await rm(testDir, { recursive: true, force: true })
  })
})
